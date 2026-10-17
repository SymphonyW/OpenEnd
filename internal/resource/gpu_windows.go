//go:build windows

package resource

import (
	"fmt"

	"github.com/yusufpapurcu/wmi"
	"golang.org/x/sys/windows/registry"
)

const displayAdapterClassRegistryPath = `SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}`

var defaultTotalVRAMReader = newCachedTotalVRAMReader(readTotalVRAMBytes)

// GetGPUInfo returns a Windows GPU usage snapshot from WMI performance counters.
func GetGPUInfo() GPUInfo {
	errors := map[string]string{}
	engineCounters, err := queryGPUEngineCounters()
	if err != nil || len(engineCounters) == 0 {
		errors["gpu"] = fmt.Sprintf("GPU counters unavailable: %v", err)
	}
	memoryCounters, err := queryGPUMemoryCounters()
	if err != nil || len(memoryCounters) == 0 {
		errors["vram"] = fmt.Sprintf("VRAM counters unavailable: %v", err)
	}
	controllers, err := queryGPUControllers()
	names := make([]string, 0, len(controllers))
	for _, controller := range controllers {
		names = append(names, controller.Name)
	}
	totalVRAMBytes, err := defaultTotalVRAMReader.Read()
	if err != nil || totalVRAMBytes == 0 {
		errors["vram"] = fmt.Sprintf("VRAM total unavailable: %v", err)
	}
	info := buildGPUInfo(engineCounters, memoryCounters, names, totalVRAMBytes)
	info.Errors = errors
	return info
}

func queryGPUEngineCounters() ([]gpuEngineCounter, error) {
	var counters []gpuEngineCounter
	err := wmi.QueryNamespace(
		"SELECT Name, UtilizationPercentage FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine",
		&counters,
		"ROOT\\CIMV2",
	)
	if err != nil {
		return nil, fmt.Errorf("query GPU engine counters: %w", err)
	}

	return counters, nil
}

func queryGPUMemoryCounters() ([]gpuMemoryCounter, error) {
	var counters []gpuMemoryCounter
	err := wmi.QueryNamespace(
		"SELECT Name, DedicatedUsage, SharedUsage, TotalCommitted FROM Win32_PerfFormattedData_GPUPerformanceCounters_GPUAdapterMemory",
		&counters,
		"ROOT\\CIMV2",
	)
	if err != nil {
		return nil, fmt.Errorf("query GPU memory counters: %w", err)
	}

	return counters, nil
}

func readTotalVRAMBytes() (uint64, error) {
	totalVRAMBytes := readTotalVRAMBytesFromRegistry()
	if totalVRAMBytes > 0 {
		return totalVRAMBytes, nil
	}

	totalVRAMBytes, err := readTotalVRAMBytesFromWMI()
	if err != nil {
		return 0, err
	}
	if totalVRAMBytes == 0 {
		return 0, fmt.Errorf("no GPU VRAM total found")
	}

	return totalVRAMBytes, nil
}

func readTotalVRAMBytesFromRegistry() uint64 {
	var totalVRAMBytes uint64
	for index := 0; index < 100; index += 1 {
		keyPath := fmt.Sprintf(`%s\%04d`, displayAdapterClassRegistryPath, index)
		key, err := registry.OpenKey(registry.LOCAL_MACHINE, keyPath, registry.QUERY_VALUE)
		if err != nil {
			continue
		}

		memorySize, _, err := key.GetIntegerValue("HardwareInformation.qwMemorySize")
		_ = key.Close()
		if err == nil && memorySize > 0 {
			totalVRAMBytes += memorySize
		}
	}

	return totalVRAMBytes
}

func queryGPUControllers() ([]gpuController, error) {
	var controllers []gpuController
	err := wmi.QueryNamespace(
		"SELECT Name, AdapterRAM FROM Win32_VideoController",
		&controllers,
		"ROOT\\CIMV2",
	)
	if err != nil {
		return nil, fmt.Errorf("query video controllers: %w", err)
	}

	return controllers, nil
}

func readTotalVRAMBytesFromWMI() (uint64, error) {
	controllers, err := queryGPUControllers()
	if err != nil {
		return 0, err
	}

	var totalVRAMBytes uint64
	for _, controller := range controllers {
		if controller.AdapterRAM != nil {
			totalVRAMBytes += *controller.AdapterRAM
		}
	}

	return totalVRAMBytes, nil
}
