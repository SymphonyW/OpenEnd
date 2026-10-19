//go:build windows

package main

import (
	"encoding/binary"
	"os"
	"testing"
	"time"
)

func TestCountPhysicalCoreRecords(t *testing.T) {
	buffer := make([]byte, 24)
	for offset := 0; offset < len(buffer); offset += 8 {
		binary.LittleEndian.PutUint32(buffer[offset+4:], 8)
	}
	binary.LittleEndian.PutUint32(buffer[8:], 3) // A package record is not a core.
	if count, err := countPhysicalCoreRecords(buffer); err != nil || count != 2 {
		t.Fatalf("expected two cores: %d, %v", count, err)
	}
	for _, invalid := range [][]byte{buffer[:7], make([]byte, 8), append(buffer, 0)} {
		if _, err := countPhysicalCoreRecords(invalid); err == nil {
			t.Fatal("expected malformed topology to fail")
		}
	}
}

// Opt in on a Windows machine with GPU counters; CI machines may have no GPU.
// This checks real data, including when Win32_Processor/VideoController time out.
func TestNativeHardwareSnapshot(t *testing.T) {
	if os.Getenv("OPENEND_HARDWARE_SMOKE") != "1" {
		t.Skip("set OPENEND_HARDWARE_SMOKE=1 to verify real CPU/GPU hardware")
	}
	collectors := newAsyncSystemResourceCollectors()
	start := time.Now()
	var lastGPUUpdate int64
	samples := 0
	for time.Since(start) < 20*time.Second {
		info := collectSystemResourceInfo(collectors)
		if info.Metrics["cpuInfo"].State == "ready" && info.Metrics["gpu"].State == "ready" && info.Metrics["vram"].State == "ready" {
			if info.CPUName == "" || info.CPUPhysicalCores <= 0 || info.CPULogicalProcessors < info.CPUPhysicalCores || info.CPUMaxMHz <= 0 {
				t.Fatalf("missing CPU metadata: %+v", info)
			}
			if len(info.GPUNames) == 0 || info.TotalVRAMBytes == 0 || info.UsedVRAMBytes > info.TotalVRAMBytes {
				t.Fatalf("missing or inconsistent GPU metadata: %+v", info)
			}
			if updatedAt := info.Metrics["gpu"].UpdatedAt; updatedAt != lastGPUUpdate {
				lastGPUUpdate = updatedAt
				samples++
				t.Logf("CPU: %s; cores=%d logical=%d MHz=%.0f", info.CPUName, info.CPUPhysicalCores, info.CPULogicalProcessors, info.CPUMaxMHz)
				t.Logf("GPU sample %d: %v; usage=%.1f%% VRAM=%d/%d; elapsed %s", samples, info.GPUNames, info.GPUPercent, info.UsedVRAMBytes, info.TotalVRAMBytes, time.Since(start))
				if samples == 3 {
					return
				}
			}
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("native hardware never became ready: %+v", collectSystemResourceInfo(collectors))
}
