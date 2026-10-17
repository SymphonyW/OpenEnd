//go:build windows

package main

import (
	"log"
	"strings"

	"github.com/yusufpapurcu/wmi"
	"golang.org/x/sys/windows/registry"
)

const processorNameRegistryPath = `HARDWARE\DESCRIPTION\System\CentralProcessor\0`

// Query only the required fields so unrelated WMI property errors cannot discard them.
func collectCPUResourceInfoFallback() cpuResourceInfo {
	var processors []struct {
		MaxClockSpeed uint32
		NumberOfCores uint32
	}
	err := wmi.QueryNamespace(
		"SELECT MaxClockSpeed, NumberOfCores FROM Win32_Processor",
		&processors,
		`ROOT\CIMV2`,
	)
	if err != nil {
		log.Printf("collect fallback CPU information: %v", err)
		return cpuResourceInfo{}
	}
	var info cpuResourceInfo
	for _, processor := range processors {
		info.PhysicalCores += int(processor.NumberOfCores)
		if mhz := float64(processor.MaxClockSpeed); mhz > info.MaxMHz {
			info.MaxMHz = mhz
		}
	}
	return info
}

func collectCPUModelNameFallback() string {
	key, err := registry.OpenKey(registry.LOCAL_MACHINE, processorNameRegistryPath, registry.QUERY_VALUE)
	if err != nil {
		return ""
	}
	defer key.Close()

	modelName, _, err := key.GetStringValue("ProcessorNameString")
	if err != nil {
		return ""
	}

	return strings.TrimSpace(modelName)
}
