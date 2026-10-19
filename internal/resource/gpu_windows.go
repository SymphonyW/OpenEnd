//go:build windows

package resource

import (
	"fmt"
	"strings"

	"golang.org/x/sys/windows/registry"
)

const displayAdapterClassRegistryPath = `SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}`

var defaultGPUCounters = &gpuPerformanceReader{}

// GetGPUInfo uses native counters and registry metadata, without WMI.
func GetGPUInfo() GPUInfo {
	names, totalVRAMBytes := readGPUAdapters()
	engineCounters, memoryCounters, errors := defaultGPUCounters.Read()
	if totalVRAMBytes == 0 {
		errors["vram"] = strings.TrimSpace(errors["vram"] + " 无法读取显卡的专用显存总量。")
	}
	info := buildGPUInfo(engineCounters, memoryCounters, names, totalVRAMBytes)
	info.Errors = errors
	return info
}

func readGPUAdapters() ([]string, uint64) {
	var names []string
	var totalVRAMBytes uint64
	for index := 0; index < 100; index += 1 {
		keyPath := fmt.Sprintf(`%s\%04d`, displayAdapterClassRegistryPath, index)
		key, err := registry.OpenKey(registry.LOCAL_MACHINE, keyPath, registry.QUERY_VALUE)
		if err != nil {
			continue
		}

		name, _, _ := key.GetStringValue("DriverDesc")
		device, _, _ := key.GetStringValue("MatchingDeviceId")
		memorySize, _, _ := key.GetIntegerValue("HardwareInformation.qwMemorySize")
		if memorySize == 0 {
			memorySize, _, _ = key.GetIntegerValue("HardwareInformation.MemorySize")
		}
		_ = key.Close()
		// Remote display drivers do not describe physical GPUs or their VRAM.
		if strings.HasPrefix(strings.ToLower(device), `root\`) && memorySize == 0 {
			continue
		}
		names = append(names, name)
		totalVRAMBytes += memorySize
	}

	return uniqueNonEmptyStrings(names), totalVRAMBytes
}
