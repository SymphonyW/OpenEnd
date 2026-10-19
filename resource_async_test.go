package main

import (
	"errors"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	processscanner "openend/internal/process"
	"openend/internal/resource"
)

func TestResourceSnapshotReturnsWhileCPUHardwareInfoIsBlocked(t *testing.T) {
	release := make(chan struct{})
	defer close(release)
	var calls atomic.Int32
	cpuInfo := newResourceCollector(func() (cpuResourceInfo, error) {
		calls.Add(1)
		<-release
		return cpuResourceInfo{Name: "Test CPU"}, nil
	}, time.Hour)
	collectors := systemResourceCollectors{
		CPUInfo: cpuInfo.Get,
		Memory: func() (memoryResourceInfo, ResourceStatus) {
			return memoryResourceInfo{TotalBytes: 100, UsedBytes: 60}, ResourceStatus{State: "ready"}
		},
	}
	for i := 0; i < 3; i++ {
		result := make(chan SystemResourceInfo, 1)
		go func() { result <- collectSystemResourceInfo(collectors) }()
		select {
		case info := <-result:
			if info.Metrics["cpuInfo"].State != "collecting" || info.Metrics["memory"].State != "ready" || info.UsedMemoryBytes != 60 {
				t.Fatalf("slow CPU information must not hide ready memory data: %+v", info)
			}
		case <-time.After(500 * time.Millisecond):
			t.Fatal("CPU hardware query blocked the entire resource snapshot")
		}
	}
	waitForAppTestCondition(t, func() bool { return calls.Load() == 1 }, "one hardware query in flight")
}

func TestResourceCollectorDistinguishesPendingZeroFailureAndRecovery(t *testing.T) {
	release := make(chan struct{})
	var calls atomic.Int32
	collector := newResourceCollector(func() (int, error) { calls.Add(1); <-release; return 0, nil }, time.Hour)
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
	collector.lastStarted = time.Time{}
	collector.collect = func() (int, error) { return 99, errors.New("permission denied") }
	collector.mu.Unlock()
	waitForAppTestCondition(t, func() bool { _, status := collector.Get(); return status.State == "stale" }, "failed sample")
	value, status = collector.Get()
	if value != 0 || status.State != "stale" || status.UpdatedAt != timestamp || status.Error == "" {
		t.Fatalf("stale: %d %+v", value, status)
	}
	collector.mu.Lock()
	collector.collect = func() (int, error) { return 7, nil }
	collector.lastStarted = time.Time{}
	collector.mu.Unlock()
	waitForAppTestCondition(t, func() bool { _, status := collector.Get(); return status.State == "ready" }, "recovered sample")
	value, status = collector.Get()
	if value != 7 || status.State != "ready" || status.Error != "" {
		t.Fatalf("recovery: %d %+v", value, status)
	}
	unavailable := newResourceCollector(func() (int, error) { panic("driver error") }, time.Hour)
	waitForAppTestCondition(t, func() bool { _, status := unavailable.Get(); return status.State == "unavailable" }, "first failed sample")
	_, status = unavailable.Get()
	if status.State != "unavailable" || status.UpdatedAt != 0 || status.Error == "" {
		t.Fatalf("first failure: %+v", status)
	}
}

func TestResourceCollectorReportsTimeoutWithoutOverlappingQueries(t *testing.T) {
	for _, previousValue := range []bool{false, true} {
		t.Run(fmt.Sprint("previousValue=", previousValue), func(t *testing.T) {
			release := make(chan struct{})
			defer close(release)
			var calls atomic.Int32
			collector := newResourceCollector(func() (int, error) {
				calls.Add(1)
				<-release
				return 9, nil
			}, time.Hour)
			if previousValue {
				collector.value = 7
				collector.status = ResourceStatus{State: "ready", UpdatedAt: 1000}
			}
			collector.Get()
			waitForAppTestCondition(t, func() bool { return calls.Load() == 1 }, "query start")
			collector.mu.Lock()
			collector.lastStarted = time.Now().Add(-resourceCollectionTimeout)
			collector.mu.Unlock()
			for i := 0; i < 10; i++ {
				value, status := collector.Get()
				if status.Error == "" || status.State == "collecting" {
					t.Fatalf("expected explicit timeout: %d %+v", value, status)
				}
				if previousValue && (value != 7 || status.State != "stale" || status.UpdatedAt != 1000) {
					t.Fatalf("timeout must preserve last good value: %d %+v", value, status)
				}
				if !previousValue && (status.State != "unavailable" || status.UpdatedAt != 0) {
					t.Fatalf("first timeout must be unavailable: %+v", status)
				}
			}
			if calls.Load() != 1 {
				t.Fatal("timeout started overlapping native queries")
			}
			// A native query may finish after its timeout. Its result should recover.
			release <- struct{}{}
			waitForAppTestCondition(t, func() bool {
				value, status := collector.Get()
				return value == 9 && status.State == "ready" && status.Error == ""
			}, "late recovery")
		})
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

func TestGPUResourceReaderKeepsMetadataWhenCountersAreUnavailable(t *testing.T) {
	read := newGPUResourceReader(func() resource.GPUInfo {
		return resource.GPUInfo{Names: []string{"Physical GPU"}, TotalVRAMBytes: 8 << 30,
			Errors: map[string]string{"gpu": "counter unavailable", "vram": "counter unavailable"}}
	})
	value, err := read()
	if err != nil || value.GPU.State != "unavailable" || value.VRAM.State != "unavailable" || len(value.Info.Names) != 1 || value.Info.TotalVRAMBytes != 8<<30 {
		t.Fatalf("counter failures must not discard hardware metadata: %+v, %v", value, err)
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
