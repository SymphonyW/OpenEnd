//go:build windows && (amd64 || arm64)

package network

import (
	"encoding/binary"
	"fmt"
	"net/netip"
	"os"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unicode/utf16"
	"unsafe"

	"golang.org/x/sys/windows"
)

// Win64 layouts from evntrace.h and evntcons.h. No ETL file or packet payload
// is retained. Only TCP/UDP Send/Recv events contribute to the counters.
type traceProperties struct {
	Wnode struct {
		BufferSize, ProviderID uint32
		HistoricalContext      uint64
		TimeStamp              int64
		GUID                   windows.GUID
		ClientContext, Flags   uint32
	}
	BufferSize, MinimumBuffers, MaximumBuffers, MaximumFileSize uint32
	LogFileMode, FlushTimer, EnableFlags, AgeLimit              uint32
	NumberOfBuffers, FreeBuffers, EventsLost, BuffersWritten    uint32
	LogBuffersLost, RealTimeBuffersLost                         uint32
	LoggerThreadID                                              uintptr
	LogFileNameOffset, LoggerNameOffset                         uint32
}

type traceConfig struct {
	Properties traceProperties
	Name       [1024]uint16
}

type eventRecord struct {
	Header struct {
		Size, HeaderType, Flags, EventProperty uint16
		ThreadID, ProcessID                    uint32
		TimeStamp                              int64
		ProviderID                             windows.GUID
		Descriptor                             struct {
			ID                              uint16
			Version, Channel, Level, Opcode uint8
			Task                            uint16
			Keyword                         uint64
		}
		ProcessorTime uint64
		ActivityID    windows.GUID
	}
	BufferContext                     uint32
	ExtendedDataCount, UserDataLength uint16
	ExtendedData, UserData            unsafe.Pointer
	UserContext                       uintptr
}

type traceLogfile struct {
	LogFileName, LoggerName        *uint16
	CurrentTime                    int64
	BuffersRead, ProcessTraceMode  uint32
	CurrentEvent                   [88]byte
	LogfileHeader                  [280]byte
	BufferCallback                 uintptr
	BufferSize, Filled, EventsLost uint32
	EventRecordCallback            uintptr
	IsKernelTrace                  uint32
	Context                        uintptr
}

var (
	advapi          = windows.NewLazySystemDLL("advapi32.dll")
	startTraceW     = advapi.NewProc("StartTraceW")
	controlTraceW   = advapi.NewProc("ControlTraceW")
	openTraceW      = advapi.NewProc("OpenTraceW")
	processTrace    = advapi.NewProc("ProcessTrace")
	closeTrace      = advapi.NewProc("CloseTrace")
	queryAllTracesW = advapi.NewProc("QueryAllTracesW")
	tdh             = windows.NewLazySystemDLL("tdh.dll")
	getPropertySize = tdh.NewProc("TdhGetPropertySize")
	getProperty     = tdh.NewProc("TdhGetProperty")
	tcpGUID         = windows.GUID{Data1: 0x9a280ac0, Data2: 0xc8e0, Data3: 0x11d1, Data4: [8]byte{0x84, 0xe2, 0, 0xc0, 0x4f, 0xb9, 0x98, 0xa2}}
	udpGUID         = windows.GUID{Data1: 0xbf3a50c5, Data2: 0xa9c9, Data3: 0x4988, Data4: [8]byte{0xa0, 0x05, 0x2d, 0xf0, 0xb7, 0xc8, 0x0f, 0x80}}
	processGUID     = windows.GUID{Data1: 0x3d6fa8d0, Data2: 0xfe05, Data3: 0x11d0, Data4: [8]byte{0x9d, 0xda, 0, 0xc0, 0x4f, 0xd7, 0xba, 0x7c}}
	traceMonitors   sync.Map
	traceID         atomic.Uint64
	eventCallback   = windows.NewCallback(onEvent)
)

func newTraceConfig(name string) *traceConfig {
	c := &traceConfig{}
	c.Properties.Wnode.BufferSize = uint32(unsafe.Sizeof(*c))
	c.Properties.Wnode.Flags = 0x20000   // WNODE_FLAG_TRACED_GUID
	c.Properties.Wnode.ClientContext = 1 // QPC; ProcessTrace converts to FILETIME.
	c.Properties.LoggerNameOffset = uint32(unsafe.Offsetof(c.Name))
	copy(c.Name[:], windows.StringToUTF16(name))
	return c
}

func startTrace(m *Monitor) (func(), error) {
	var created, exited, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(windows.CurrentProcess(), &created, &exited, &kernel, &user); err != nil {
		return nil, err
	}
	name := fmt.Sprintf("OpenEnd.Network.%d.%d", os.Getpid(), created.Nanoseconds()/1e6)
	c := newTraceConfig(name)
	guid, err := windows.GenerateGUID()
	if err != nil {
		return nil, err
	}
	c.Properties.Wnode.GUID = guid
	c.Properties.BufferSize = 64
	c.Properties.MinimumBuffers = 16
	c.Properties.MaximumBuffers = 64
	c.Properties.LogFileMode = 0x02000100 // SYSTEM_LOGGER_MODE | REAL_TIME_MODE
	c.Properties.FlushTimer = 1
	c.Properties.EnableFlags = 0x10001 // NETWORK_TCPIP | PROCESS
	var session uint64
	restore := enableProfilePrivilege()
	cleanupOrphanTraces()
	code, _, _ := startTraceW.Call(uintptr(unsafe.Pointer(&session)), uintptr(unsafe.Pointer(&c.Name[0])), uintptr(unsafe.Pointer(c)))
	if code != 0 {
		restore()
		if code == uintptr(windows.ERROR_ACCESS_DENIED) || code == uintptr(windows.ERROR_PRIVILEGE_NOT_HELD) {
			return nil, fmt.Errorf("network.permission: %w", windows.Errno(code))
		}
		return nil, fmt.Errorf("network.startError: %w", windows.Errno(code))
	}
	var stopOnce sync.Once
	stopSession := func() {
		stopOnce.Do(func() {
			defer restore()
			config := newTraceConfig(name)
			code, _, _ := controlTraceW.Call(uintptr(session), 0, uintptr(unsafe.Pointer(config)), 1) // STOP; our session only.
			if code != 0 && code != uintptr(windows.ERROR_WMI_INSTANCE_NOT_FOUND) {
				m.fail(fmt.Errorf("network.traceStopped: %w", windows.Errno(code)))
			}
		})
	}
	id := uintptr(traceID.Add(1))
	traceMonitors.Store(id, m)
	logfile := &traceLogfile{LoggerName: &c.Name[0], ProcessTraceMode: 0x10000100, EventRecordCallback: eventCallback, Context: id}
	handle, _, openErr := openTraceW.Call(uintptr(unsafe.Pointer(logfile)))
	if handle == ^uintptr(0) {
		traceMonitors.Delete(id)
		stopSession()
		return nil, fmt.Errorf("network.startError: %w", openErr)
	}
	done := make(chan struct{})
	var closing atomic.Bool
	go func() {
		defer close(done)
		consumer := uint64(handle)
		code, _, _ := processTrace.Call(uintptr(unsafe.Pointer(&consumer)), 1, 0, 0)
		if !closing.Load() {
			m.fail(fmt.Errorf("network.traceStopped: %w", windows.Errno(code)))
			stopSession()
		}
		runtime.KeepAlive(logfile)
		runtime.KeepAlive(c)
	}()
	queryDone := make(chan struct{})
	go func() {
		defer close(queryDone)
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ticker.C:
				config := newTraceConfig(name)
				code, _, _ := controlTraceW.Call(uintptr(session), 0, uintptr(unsafe.Pointer(config)), 0) // QUERY
				if closing.Load() {
					return
				}
				if code != 0 {
					m.fail(fmt.Errorf("network.traceStopped: %w", windows.Errno(code)))
					return
				}
				m.mu.Lock()
				m.snapshot.EventsLost = config.Properties.EventsLost
				m.snapshot.BuffersLost = config.Properties.RealTimeBuffersLost + config.Properties.LogBuffersLost
				m.mu.Unlock()
			}
		}
	}()
	var once sync.Once
	return func() {
		once.Do(func() {
			closing.Store(true)
			stopSession()
			closeTrace.Call(handle)
			<-done
			<-queryDone
			traceMonitors.Delete(id)
		})
	}, nil
}

func enableProfilePrivilege() func() {
	var token windows.Token
	if windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_ADJUST_PRIVILEGES|windows.TOKEN_QUERY, &token) != nil {
		return func() {}
	}
	var luid windows.LUID
	if windows.LookupPrivilegeValue(nil, windows.StringToUTF16Ptr("SeSystemProfilePrivilege"), &luid) != nil {
		token.Close()
		return func() {}
	}
	requested := windows.Tokenprivileges{PrivilegeCount: 1}
	requested.Privileges[0] = windows.LUIDAndAttributes{Luid: luid, Attributes: windows.SE_PRIVILEGE_ENABLED}
	var previous windows.Tokenprivileges
	var size uint32
	err := windows.AdjustTokenPrivileges(token, false, &requested, uint32(unsafe.Sizeof(previous)), &previous, &size)
	return func() {
		if err == nil {
			windows.AdjustTokenPrivileges(token, false, &previous, 0, nil, nil)
		}
		token.Close()
	}
}

func onEvent(record *eventRecord) uintptr {
	value, ok := traceMonitors.Load(record.UserContext)
	if !ok || record.UserData == nil {
		return 0
	}
	m := value.(*Monitor)
	at := record.Header.TimeStamp/10000 - 11644473600000
	op := record.Header.Descriptor.Opcode
	data := unsafe.Slice((*byte)(record.UserData), int(record.UserDataLength))
	switch record.Header.ProviderID {
	case tcpGUID, udpGUID:
		pid, size, upload, local, ok := decodeTraffic(data, op, record.Header.Descriptor.Version)
		if ok {
			m.traffic(pid, at, size, upload, local)
		} else if op == 10 || op == 11 || op == 26 || op == 27 {
			m.mu.Lock()
			m.snapshot.UnparsedEvents++
			m.mu.Unlock()
		}
	case processGUID:
		if op != 1 && op != 2 && op != 3 {
			return 0
		}
		pid, parent, valid := decodeProcessIdentity(data, record.Header.Descriptor.Version, record.Header.Flags)
		if !valid {
			pidData := eventProperty(record, "ProcessId")
			if len(pidData) < 4 {
				return 0
			}
			pid = int32(binary.LittleEndian.Uint32(pidData))
			if data := eventProperty(record, "ParentId"); len(data) >= 4 {
				parent = int32(binary.LittleEndian.Uint32(data))
			}
		}
		var name, command string
		if op != 2 {
			name = strings.TrimRight(string(eventProperty(record, "ImageFileName")), "\x00")
			data := eventProperty(record, "CommandLine")
			if len(data) >= 2 {
				words := make([]uint16, len(data)/2)
				for i := range words {
					words[i] = binary.LittleEndian.Uint16(data[i*2:])
				}
				command = strings.TrimRight(string(utf16.Decode(words)), "\x00")
			}
		}
		m.processEvent(pid, parent, at, op != 2, op == 3, name, command)
	}
	return 0
}

func decodeProcessIdentity(data []byte, version uint8, flags uint16) (pid, parent int32, ok bool) {
	if version < 2 {
		return
	}
	offset := 8 // UniqueProcessKey is pointer-sized in the MOF schema.
	if flags&0x20 != 0 {
		offset = 4
	} // EVENT_HEADER_FLAG_32_BIT_HEADER
	if len(data) < offset+8 {
		return
	}
	return int32(binary.LittleEndian.Uint32(data[offset:])), int32(binary.LittleEndian.Uint32(data[offset+4:])), true
}

// A forced process exit cannot run OnShutdown. Reclaim only OpenEnd sessions
// whose recorded owner no longer exists, including PID reuse, on the next run.
func cleanupOrphanTraces() {
	configs := make([]*traceConfig, 256)
	for i := range configs {
		configs[i] = newTraceConfig("")
	}
	var count uint32
	code, _, _ := queryAllTracesW.Call(uintptr(unsafe.Pointer(&configs[0])), uintptr(len(configs)), uintptr(unsafe.Pointer(&count)))
	if code != 0 {
		return
	}
	for _, config := range configs[:min(int(count), len(configs))] {
		name := windows.UTF16ToString(config.Name[:])
		owner, ok := strings.CutPrefix(name, "OpenEnd.Network.")
		if !ok {
			continue
		}
		parts := strings.Split(owner, ".")
		if len(parts) != 2 {
			continue
		}
		pid, err := strconv.ParseUint(parts[0], 10, 32)
		if err != nil || pid == 0 {
			continue
		}
		started, err := strconv.ParseInt(parts[1], 10, 64)
		if err != nil || started <= 0 {
			continue
		}
		handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION, false, uint32(pid))
		orphan := err == windows.ERROR_INVALID_PARAMETER
		if err == nil {
			var created, exited, kernel, user windows.Filetime
			if windows.GetProcessTimes(handle, &created, &exited, &kernel, &user) == nil {
				orphan = created.Nanoseconds()/1e6 != started
			}
			windows.CloseHandle(handle)
		}
		if orphan {
			controlTraceW.Call(0, uintptr(unsafe.Pointer(&config.Name[0])), uintptr(unsafe.Pointer(config)), 1)
		}
	}
}

func eventProperty(record *eventRecord, name string) []byte {
	propertyName := windows.StringToUTF16(name)
	descriptor := struct {
		Name            uint64
		Index, Reserved uint32
	}{Name: uint64(uintptr(unsafe.Pointer(&propertyName[0]))), Index: ^uint32(0)}
	var size uint32
	code, _, _ := getPropertySize.Call(uintptr(unsafe.Pointer(record)), 0, 0, 1, uintptr(unsafe.Pointer(&descriptor)), uintptr(unsafe.Pointer(&size)))
	if code != 0 || size == 0 || size > 65536 {
		return nil
	}
	data := make([]byte, size)
	code, _, _ = getProperty.Call(uintptr(unsafe.Pointer(record)), 0, 0, 1, uintptr(unsafe.Pointer(&descriptor)), uintptr(size), uintptr(unsafe.Pointer(&data[0])))
	runtime.KeepAlive(propertyName)
	if code != 0 {
		return nil
	}
	return data
}

func decodeTraffic(data []byte, opcode, version uint8) (pid int32, size uint32, upload, local, ok bool) {
	// Windows 10/11 emit the documented v2 TCP/UDP schemas. Other versions
	// must not silently be interpreted using incompatible offsets.
	if version != 2 || (opcode != 10 && opcode != 11 && opcode != 26 && opcode != 27) {
		return
	}
	ipv6 := opcode == 26 || opcode == 27
	minimum := 20
	if ipv6 {
		minimum = 44
	}
	if len(data) < minimum {
		return
	}
	pid = int32(binary.LittleEndian.Uint32(data))
	size = binary.LittleEndian.Uint32(data[4:])
	upload = opcode == 10 || opcode == 26
	var source, destination netip.Addr
	if ipv6 {
		destination = netip.AddrFrom16([16]byte(data[8:24])).Unmap()
		source = netip.AddrFrom16([16]byte(data[24:40])).Unmap()
	} else {
		destination = netip.AddrFrom4([4]byte(data[8:12]))
		source = netip.AddrFrom4([4]byte(data[12:16]))
	}
	local = source.IsLoopback() || destination.IsLoopback()
	ok = true
	return
}
