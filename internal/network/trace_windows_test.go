//go:build windows && (amd64 || arm64)

package network

import (
	"context"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

func TestWin64ETWLayouts(t *testing.T) {
	var record eventRecord
	var logfile traceLogfile
	if unsafe.Sizeof(traceProperties{}) != 120 || unsafe.Sizeof(record) != 112 || unsafe.Offsetof(record.UserData) != 96 || unsafe.Sizeof(logfile) != 448 || unsafe.Offsetof(logfile.EventRecordCallback) != 424 || unsafe.Offsetof(logfile.Context) != 440 {
		t.Fatalf("ETW ABI mismatch: properties=%d event=%d logfile=%d", unsafe.Sizeof(traceProperties{}), unsafe.Sizeof(record), unsafe.Sizeof(logfile))
	}
	config := newTraceConfig("OpenEnd.test")
	if config.Properties.LoggerNameOffset != 120 || config.Properties.LogFileNameOffset != 0 || windows.UTF16ToString(config.Name[:]) != "OpenEnd.test" {
		t.Fatal("invalid realtime-only session configuration")
	}
}

func TestNetworkDecoderUsesPayloadPIDAndSeparatesLocalhost(t *testing.T) {
	for _, opcode := range []uint8{10, 11, 26, 27} {
		data := make([]byte, 64)
		binary.LittleEndian.PutUint32(data, 42)
		binary.LittleEndian.PutUint32(data[4:], 1234)
		if opcode < 26 {
			copy(data[8:], []byte{127, 0, 0, 1})
			copy(data[12:], []byte{127, 0, 0, 1})
		} else {
			data[23], data[39] = 1, 1
		}
		pid, size, upload, local, ok := decodeTraffic(data, opcode, 2)
		if !ok || pid != 42 || size != 1234 || !local || upload != (opcode == 10 || opcode == 26) {
			t.Fatalf("bad opcode %d: %d %d %v %v %v", opcode, pid, size, upload, local, ok)
		}
		if opcode < 26 {
			copy(data[8:], []byte{192, 168, 1, 2})
			copy(data[12:], []byte{192, 168, 1, 3})
		} else {
			data[8], data[24] = 0x20, 0x20
		}
		_, _, _, local, ok = decodeTraffic(data, opcode, 2)
		if !ok || local {
			t.Fatal("LAN/IPv6 traffic classified as localhost")
		}
	}
	for _, opcode := range []uint8{12, 13, 14, 18, 28, 30, 34} {
		if _, _, _, _, ok := decodeTraffic(make([]byte, 64), opcode, 2); ok {
			t.Fatalf("counted non-transfer/retransmit event %d", opcode)
		}
	}
	if _, _, _, _, ok := decodeTraffic([]byte{0}, 10, 2); ok {
		t.Fatal("accepted truncated event")
	}
	if _, _, _, _, ok := decodeTraffic(make([]byte, 64), 10, 0); ok {
		t.Fatal("accepted unsupported schema")
	}
	if _, _, _, _, ok := decodeTraffic(make([]byte, 64), 10, 99); ok {
		t.Fatal("accepted an unknown future schema")
	}
}

func TestProcessIdentityDecoderHandlesBothPointerSizes(t *testing.T) {
	for _, pointerSize := range []int{4, 8} {
		data := make([]byte, 32)
		binary.LittleEndian.PutUint32(data[pointerSize:], 1234)
		binary.LittleEndian.PutUint32(data[pointerSize+4:], 5678)
		var flags uint16 = 0x40
		if pointerSize == 4 {
			flags = 0x20
		}
		pid, parent, ok := decodeProcessIdentity(data, 4, flags)
		if !ok || pid != 1234 || parent != 5678 {
			t.Fatalf("wrong process identity for %d-byte pointers: %d %d", pointerSize, pid, parent)
		}
	}
}

func TestTrafficCallbackNeverUsesTheLoggingThreadsPID(t *testing.T) {
	m := New()
	id := uintptr(traceID.Add(1))
	traceMonitors.Store(id, m)
	defer traceMonitors.Delete(id)
	data := make([]byte, 32)
	binary.LittleEndian.PutUint32(data, 42)
	binary.LittleEndian.PutUint32(data[4:], 1234)
	copy(data[8:], []byte{192, 168, 1, 2})
	copy(data[12:], []byte{192, 168, 1, 3})
	var record eventRecord
	record.Header.ProviderID = udpGUID
	record.Header.ProcessID = 999 // Kernel logging thread, not the socket owner.
	record.Header.TimeStamp = (11644473600000 + 1000) * 10000
	record.Header.Descriptor.Opcode = 11
	record.Header.Descriptor.Version = 2
	record.UserContext = id
	record.UserDataLength = uint16(len(data))
	record.UserData = unsafe.Pointer(&data[0])
	onEvent(&record)
	s := m.Snapshot()
	if s.DownloadBytes != 1234 || len(s.Processes) != 1 || s.Processes[0].PID != 42 {
		t.Fatalf("callback attributed traffic to logging thread: %+v", s)
	}
	record.Header.Descriptor.Version = 99
	onEvent(&record)
	if m.Snapshot().UnparsedEvents != 1 || m.Snapshot().DownloadBytes != 1234 {
		t.Fatal("unsupported event was silently counted")
	}
}

func TestTraceWithoutAdministratorReportsPermission(t *testing.T) {
	if windows.GetCurrentProcessToken().IsElevated() {
		t.Skip("requires a non-elevated process")
	}
	m := New()
	m.Start(context.Background(), nil)
	defer m.Close()
	s := m.Snapshot()
	if s.State != "unavailable" || !strings.HasPrefix(s.Error, "network.permission:") || s.StartedAt != 0 || len(s.History) != 0 {
		t.Fatalf("permission failure appeared as valid zero traffic: %+v", s)
	}
}

// Run from an elevated terminal with OPENEND_NETWORK_SMOKE=1. All traffic is
// generated locally; no external server or privileged service is installed.
func TestNativeNetworkSmoke(t *testing.T) {
	if os.Getenv("OPENEND_NETWORK_SMOKE") != "1" {
		t.Skip("set OPENEND_NETWORK_SMOKE=1 in an administrator terminal")
	}
	m := New()
	m.Start(context.Background(), nil)
	defer m.Close()
	if s := m.Snapshot(); s.State != "ready" {
		t.Fatalf("cannot start native trace: %s", s.Error)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, strings.Repeat("x", 1024*1024)) }))
	defer server.Close()
	client := &http.Client{Transport: &http.Transport{Proxy: nil}, Timeout: 5 * time.Second}
	defer client.CloseIdleConnections()
	response, err := client.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	_, err = io.Copy(io.Discard, response.Body)
	response.Body.Close()
	if err != nil {
		t.Fatal(err)
	}
	waitTraffic := func(before uint64, minimum uint64) {
		t.Helper()
		deadline := time.Now().Add(8 * time.Second)
		for time.Now().Before(deadline) {
			s := m.Snapshot()
			if s.State != "ready" {
				t.Fatalf("trace stopped: %+v", s)
			}
			if s.LocalDownloadBytes >= before+minimum {
				return
			}
			time.Sleep(100 * time.Millisecond)
		}
		t.Fatalf("native localhost traffic was not observed: %+v", m.Snapshot())
	}
	waitTraffic(0, 1024*1024)
	before := m.Snapshot().LocalDownloadBytes
	listener, err := net.ListenPacket("udp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	sender, err := net.Dial("udp4", listener.LocalAddr().String())
	if err != nil {
		t.Fatal(err)
	}
	defer sender.Close()
	if _, err = sender.Write(make([]byte, 512)); err != nil {
		t.Fatal(err)
	}
	listener.SetReadDeadline(time.Now().Add(time.Second))
	if _, _, err = listener.ReadFrom(make([]byte, 1024)); err != nil {
		t.Fatal(err)
	}
	waitTraffic(before, 512)
	s := m.Snapshot()
	found := false
	for _, row := range s.Processes {
		if row.PID == int32(os.Getpid()) && row.LocalDownloadBytes > 0 {
			found = true
		}
	}
	if !found {
		t.Fatal("native traffic was attributed to a different PID")
	}
	m.Close()
	if s := New().Snapshot(); s.DownloadBytes != 0 || s.LocalDownloadBytes != 0 {
		t.Fatal("new monitor retained session traffic")
	}
}
