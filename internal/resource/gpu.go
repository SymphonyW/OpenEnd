package resource

import (
	"math"
	"strings"
	"sync"
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
	UtilizationPercentage uint64
}

type gpuMemoryCounter struct {
	Name           string
	DedicatedUsage uint64
	SharedUsage    uint64
	TotalCommitted uint64
}

type gpuController struct {
	Name       string
	AdapterRAM *uint64
}

type totalVRAMReadFunc func() (uint64, error)

type cachedTotalVRAMReader struct {
	mu      sync.Mutex
	read    totalVRAMReadFunc
	cached  uint64
	hasRead bool
}

func newCachedTotalVRAMReader(read totalVRAMReadFunc) *cachedTotalVRAMReader {
	return &cachedTotalVRAMReader{read: read}
}

func (reader *cachedTotalVRAMReader) Read() (uint64, error) {
	if reader == nil || reader.read == nil {
		return 0, nil
	}

	reader.mu.Lock()
	defer reader.mu.Unlock()

	if reader.hasRead {
		return reader.cached, nil
	}

	totalVRAMBytes, err := reader.read()
	if err != nil {
		return 0, err
	}
	if totalVRAMBytes > 0 {
		reader.cached = totalVRAMBytes
		reader.hasRead = true
	}

	return totalVRAMBytes, nil
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
