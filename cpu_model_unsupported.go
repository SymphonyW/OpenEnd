//go:build !windows

package main

import (
	"log"
	"strings"

	"github.com/shirou/gopsutil/v3/cpu"
)

func collectCPUResourceInfo() cpuResourceInfo {
	var info cpuResourceInfo
	cpuStats, err := cpu.Info()
	if err != nil {
		log.Printf("collect CPU information: %v", err)
	}
	for _, stat := range cpuStats {
		if info.Name == "" {
			info.Name = strings.TrimSpace(stat.ModelName)
		}
		if stat.Mhz > info.MaxMHz {
			info.MaxMHz = stat.Mhz
		}
	}
	if count, err := cpu.Counts(false); err == nil {
		info.PhysicalCores = count
	}
	if count, err := cpu.Counts(true); err == nil {
		info.LogicalProcessors = count
	}
	return info
}
