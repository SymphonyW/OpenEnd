package main

import (
	"fmt"
	"sync"
	"time"

	"openend/internal/resource"
)

type ResourceStatus struct {
	State     string `json:"state"`
	UpdatedAt int64  `json:"updatedAt"`
	Error     string `json:"error"`
}

type gpuResourceReading struct {
	Info resource.GPUInfo
	GPU  ResourceStatus
	VRAM ResourceStatus
}

var defaultAsyncSystemResourceCollectors = newAsyncSystemResourceCollectors()

func newAsyncSystemResourceCollectors() systemResourceCollectors {
	cpu := newResourceCollector(collectCPUPercent, 0, false)
	cpuInfo := newResourceCollector(func() (cpuResourceInfo, error) {
		value := collectCPUResourceInfo()
		if value.Name == "" {
			return value, fmt.Errorf("CPU information unavailable")
		}
		return value, nil
	}, 5*time.Second, false)
	cpuInfo.cacheValid = func(info cpuResourceInfo) bool {
		return info.Name != "" && info.MaxMHz > 0 && info.PhysicalCores > 0 && info.LogicalProcessors > 0
	}
	memory := newResourceCollector(collectMemoryResourceInfo, 0, false)
	gpu := newResourceCollector(newGPUResourceReader(resource.GetGPUInfo), 5*time.Second, true)
	processes := newResourceCollector(collectProcessCount, 0, false)
	threads := newResourceCollector(collectThreadCount, 5*time.Second, true)
	ports := newResourceCollector(collectPortCount, 10*time.Second, true)
	uptime := newResourceCollector(collectUptimeSeconds, 0, false)
	return systemResourceCollectors{
		CPUPercent: cpu.Get, CPUInfo: cpuInfo.Get, Memory: memory.Get, GPU: gpu.Get,
		ProcessCount: processes.Get, ThreadCount: threads.Get, PortCount: ports.Get, Uptime: uptime.Get,
	}
}

// GPU usage and VRAM counters may fail independently. Keep each last good reading.
func newGPUResourceReader(read func() resource.GPUInfo) func() (gpuResourceReading, error) {
	var previous gpuResourceReading
	return func() (gpuResourceReading, error) {
		next := read()
		gpuStatus := nextResourceStatus(previous.GPU, next.Errors["gpu"])
		vramStatus := nextResourceStatus(previous.VRAM, next.Errors["vram"])
		if gpuStatus.State != "ready" {
			next.GPUPercent = previous.Info.GPUPercent
			if len(next.Names) == 0 {
				next.Names = previous.Info.Names
			}
		}
		if vramStatus.State != "ready" {
			next.TotalVRAMBytes = previous.Info.TotalVRAMBytes
			next.UsedVRAMBytes = previous.Info.UsedVRAMBytes
			next.FreeVRAMBytes = previous.Info.FreeVRAMBytes
		}
		previous = gpuResourceReading{Info: next, GPU: gpuStatus, VRAM: vramStatus}
		return previous, nil
	}
}

func nextResourceStatus(previous ResourceStatus, message string) ResourceStatus {
	if message == "" {
		return ResourceStatus{State: "ready", UpdatedAt: time.Now().UnixMilli()}
	}
	previous.State = "unavailable"
	if previous.UpdatedAt > 0 {
		previous.State = "stale"
	}
	previous.Error = message
	return previous
}

// One collector owns its value and freshness. Failed reads never replace a good value.
type resourceCollector[T any] struct {
	mu          sync.Mutex
	collect     func() (T, error)
	cacheValid  func(T) bool
	interval    time.Duration
	async       bool
	value       T
	status      ResourceStatus
	inFlight    bool
	lastStarted time.Time
}

func newResourceCollector[T any](collect func() (T, error), interval time.Duration, async bool) *resourceCollector[T] {
	return &resourceCollector[T]{collect: collect, interval: interval, async: async, status: ResourceStatus{State: "collecting"}}
}

func (c *resourceCollector[T]) Get() (T, ResourceStatus) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if !c.inFlight && (c.cacheValid == nil || !c.cacheValid(c.value)) && (c.lastStarted.IsZero() || time.Since(c.lastStarted) >= c.interval) {
		c.lastStarted = time.Now()
		c.inFlight = true
		if c.async {
			go c.refresh()
		} else {
			c.update()
		}
	}
	return c.value, c.status
}

func (c *resourceCollector[T]) refresh() {
	value, err := safeCollect(c.collect)
	c.mu.Lock()
	defer c.mu.Unlock()
	c.save(value, err)
}

func (c *resourceCollector[T]) update() { value, err := safeCollect(c.collect); c.save(value, err) }
func (c *resourceCollector[T]) save(value T, err error) {
	c.inFlight = false
	if err != nil {
		c.status.State = "unavailable"
		if c.status.UpdatedAt > 0 {
			c.status.State = "stale"
		}
		c.status.Error = err.Error()
		return
	}
	c.value = value
	c.status = ResourceStatus{State: "ready", UpdatedAt: time.Now().UnixMilli()}
}

func safeCollect[T any](collect func() (T, error)) (value T, err error) {
	defer func() {
		if failure := recover(); failure != nil {
			err = fmt.Errorf("resource collection failed: %v", failure)
		}
	}()
	return collect()
}
