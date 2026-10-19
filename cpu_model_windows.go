//go:build windows

package main

import (
	"encoding/binary"
	"fmt"
	"log"
	"strings"
	"unsafe"

	"golang.org/x/sys/windows"
	"golang.org/x/sys/windows/registry"
)

const processorNameRegistryPath = `HARDWARE\DESCRIPTION\System\CentralProcessor\0`

// Hardware metadata must not depend on WMI, which may be unavailable even while
// CPU usage and the rest of the operating system are working normally.
func collectCPUResourceInfo() cpuResourceInfo {
	info := cpuResourceInfo{LogicalProcessors: int(windows.GetActiveProcessorCount(windows.ALL_PROCESSOR_GROUPS))}
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, processorNameRegistryPath, registry.QUERY_VALUE)
	if err == nil {
		name, _, _ := key.GetStringValue("ProcessorNameString")
		info.Name = strings.TrimSpace(name)
		mhz, _, _ := key.GetIntegerValue("~MHz")
		info.MaxMHz = float64(mhz)
		key.Close()
	} else {
		log.Printf("read CPU registry information: %v", err)
	}
	info.PhysicalCores, err = readPhysicalCoreCount()
	if err != nil {
		log.Printf("read CPU topology: %v", err)
	}
	// ProcessorInformation (11) is a read-only power information request.
	if info.LogicalProcessors > 0 {
		type processorPowerInfo struct{ Number, MaxMHz, CurrentMHz, MHzLimit, MaxIdleState, CurrentIdleState uint32 }
		powerInfo := make([]processorPowerInfo, info.LogicalProcessors)
		status, _, _ := windows.NewLazySystemDLL("powrprof.dll").NewProc("CallNtPowerInformation").Call(
			11, 0, 0, uintptr(unsafe.Pointer(&powerInfo[0])), uintptr(len(powerInfo))*unsafe.Sizeof(powerInfo[0]),
		)
		if status == 0 {
			var maxMHz uint32
			for _, processor := range powerInfo {
				if processor.MaxMHz > maxMHz {
					maxMHz = processor.MaxMHz
				}
			}
			if maxMHz > 0 {
				info.MaxMHz = float64(maxMHz)
			}
		} else {
			log.Printf("read CPU nominal frequency: NTSTATUS 0x%08x", uint32(status))
		}
	}
	return info
}

func readPhysicalCoreCount() (int, error) {
	query := windows.NewLazySystemDLL("kernel32.dll").NewProc("GetLogicalProcessorInformationEx")
	var size uint32
	_, _, err := query.Call(0, 0, uintptr(unsafe.Pointer(&size))) // RelationProcessorCore
	if err != windows.ERROR_INSUFFICIENT_BUFFER || size < 8 {
		return 0, fmt.Errorf("query CPU topology size: %w", err)
	}
	buffer := make([]byte, size)
	ok, _, err := query.Call(0, uintptr(unsafe.Pointer(&buffer[0])), uintptr(unsafe.Pointer(&size)))
	if ok == 0 {
		return 0, fmt.Errorf("query CPU topology: %w", err)
	}
	return countPhysicalCoreRecords(buffer[:size])
}

func countPhysicalCoreRecords(buffer []byte) (int, error) {
	count := 0
	for len(buffer) > 0 {
		if len(buffer) < 8 {
			return 0, fmt.Errorf("truncated CPU topology header")
		}
		size := binary.LittleEndian.Uint32(buffer[4:8])
		if size < 8 || uint64(size) > uint64(len(buffer)) {
			return 0, fmt.Errorf("invalid CPU topology record size %d", size)
		}
		if binary.LittleEndian.Uint32(buffer[:4]) == 0 {
			count++
		}
		buffer = buffer[size:]
	}
	return count, nil
}
