package main

import (
	"errors"
	"sync/atomic"
	"testing"
	"time"

	processscanner "openend/internal/process"
	"openend/internal/resource"
)

func TestResourceCollectorDistinguishesPendingZeroFailureAndRecovery(t *testing.T) {
	release := make(chan struct{})
	var calls atomic.Int32
	collector := newResourceCollector(func() (int, error) { calls.Add(1); <-release; return 0, nil }, time.Hour, true)
	value, status := collector.Get()
	if value != 0 || status.State != "collecting" || status.UpdatedAt != 0 {
		t.Fatalf("pending: %d %+v", value, status)
	}
	waitForAppTestCondition(t, func() bool { return calls.Load() > 0 }, "collection start")
	for i := 0; i < 10; i++ {
		collector.Get()
	}
	if calls.Load() != 1 {
		t.Fatal("overlapping collection")
	}
	close(release)
	waitForAppTestCondition(t, func() bool { _, status := collector.Get(); return status.State == "ready" }, "first sample")
	value, status = collector.Get()
	if value != 0 || status.State != "ready" || status.UpdatedAt == 0 {
		t.Fatalf("real zero: %d %+v", value, status)
	}
	timestamp := status.UpdatedAt
	collector.mu.Lock()
	collector.async = false
	collector.interval = 0
	collector.collect = func() (int, error) { return 99, errors.New("permission denied") }
	collector.mu.Unlock()
	value, status = collector.Get()
	if value != 0 || status.State != "stale" || status.UpdatedAt != timestamp || status.Error == "" {
		t.Fatalf("stale: %d %+v", value, status)
	}
	collector.collect = func() (int, error) { return 7, nil }
	value, status = collector.Get()
	if value != 7 || status.State != "ready" || status.Error != "" {
		t.Fatalf("recovery: %d %+v", value, status)
	}
	unavailable := newResourceCollector(func() (int, error) { panic("driver error") }, 0, false)
	_, status = unavailable.Get()
	if status.State != "unavailable" || status.UpdatedAt != 0 || status.Error == "" {
		t.Fatalf("first failure: %+v", status)
	}
}

func TestGPUResourceReaderRetainsIndependentLastGoodReadings(t *testing.T) {
	value := resource.GPUInfo{GPUPercent: 12, TotalVRAMBytes: 100, UsedVRAMBytes: 40, FreeVRAMBytes: 60}
	read := newGPUResourceReader(func() resource.GPUInfo { return value })
	first, _ := read()
	value = resource.GPUInfo{GPUPercent: 24, Errors: map[string]string{"vram": "driver unavailable"}}
	next, _ := read()
	if next.Info.GPUPercent != 24 || next.GPU.State != "ready" || next.Info.UsedVRAMBytes != 40 || next.VRAM.State != "stale" || next.VRAM.UpdatedAt != first.VRAM.UpdatedAt {
		t.Fatalf("independent values: %+v", next)
	}
	value = resource.GPUInfo{Errors: map[string]string{"gpu": "denied", "vram": "denied"}}
	next, _ = read()
	if next.Info.GPUPercent != 24 || next.GPU.State != "stale" || next.Info.UsedVRAMBytes != 40 {
		t.Fatalf("last values: %+v", next)
	}
}

func TestLogFailureMarksOnlySuccessfulOperationsAsPartial(t *testing.T) {
	for _, success := range []bool{true, false} {
		result := appendOperationLogError(processscanner.OperationResult{Success: success, Message: "operation result"}, errors.New("disk full"))
		if result.Success != success || result.Partial != success {
			t.Fatalf("log failure changed outcome incorrectly: %+v", result)
		}
	}
}
