package resource

import (
	"math"
	"strings"
)

// GPUInfo is a best-effort snapshot of GPU engine and dedicated VRAM usage.
type GPUInfo struct {
	Errors         map[string]string
	GPUPercent     float64
	Names          []string
	TotalVRAMBytes uint64
	UsedVRAMBytes  uint64
	FreeVRAMBytes  uint64
}

type gpuEngineCounter struct {
	Name                  string
	UtilizationPercentage float64
}

type gpuMemoryCounter struct {
	Name           string
	DedicatedUsage uint64
	SharedUsage    uint64
	TotalCommitted uint64
}

func buildGPUInfo(engineCounters []gpuEngineCounter, memoryCounters []gpuMemoryCounter, names []string, totalVRAMBytes uint64) GPUInfo {
	var gpuPercent float64
	for _, counter := range engineCounters {
		gpuPercent += float64(counter.UtilizationPercentage)
	}

	var usedVRAMBytes uint64
	for _, counter := range memoryCounters {
		usedVRAMBytes += counter.DedicatedUsage
	}

	var freeVRAMBytes uint64
	if totalVRAMBytes > usedVRAMBytes {
		freeVRAMBytes = totalVRAMBytes - usedVRAMBytes
	}

	return GPUInfo{
		GPUPercent:     roundOneDecimal(clampPercent(gpuPercent)),
		Names:          uniqueNonEmptyStrings(names),
		TotalVRAMBytes: totalVRAMBytes,
		UsedVRAMBytes:  usedVRAMBytes,
		FreeVRAMBytes:  freeVRAMBytes,
	}
}

func uniqueNonEmptyStrings(values []string) []string {
	seen := make(map[string]struct{})
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}

		seen[value] = struct{}{}
		result = append(result, value)
	}

	return result
}

func roundOneDecimal(value float64) float64 {
	return math.Round(value*10) / 10
}

func clampPercent(value float64) float64 {
	if !isFinite(value) {
		return 0
	}

	return math.Min(100, math.Max(0, value))
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
