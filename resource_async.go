package main

import (
	"sync"
	"time"

	"openend/internal/resource"
)

const (
	gpuResourceRefreshInterval    = 5 * time.Second
	threadResourceRefreshInterval = 5 * time.Second
	portResourceRefreshInterval   = 10 * time.Second
)

type asyncSystemResourceCollectors struct {
	CPUInfo     func() cpuResourceInfo
	GPU         func() resource.GPUInfo
	ThreadCount func() int
	PortCount   func() int
}

var defaultAsyncSystemResourceCollectors = newAsyncSystemResourceCollectors()

func newAsyncSystemResourceCollectors() asyncSystemResourceCollectors {
	cpuInfo := newCachedResourceCollector(collectCPUResourceInfo)
	cpuInfo.valid = func(info cpuResourceInfo) bool {
		return info.Name != "" && info.MaxMHz > 0 && info.PhysicalCores > 0 && info.LogicalProcessors > 0
	}
	gpu := newAsyncCachedCollector(resource.GetGPUInfo, gpuResourceRefreshInterval)
	threadCount := newAsyncCachedCollector(collectThreadCount, threadResourceRefreshInterval)
	portCount := newAsyncCachedCollector(collectPortCount, portResourceRefreshInterval)

	return asyncSystemResourceCollectors{
		CPUInfo:     cpuInfo.Get,
		GPU:         gpu.Get,
		ThreadCount: threadCount.Get,
		PortCount:   portCount.Get,
	}
}

type cachedResourceCollector[T any] struct {
	mu       sync.Mutex
	collect  func() T
	valid    func(T) bool
	value    T
	hasValue bool
}

func newCachedResourceCollector[T any](collect func() T) *cachedResourceCollector[T] {
	return &cachedResourceCollector[T]{
		collect: collect,
	}
}

func (collector *cachedResourceCollector[T]) Get() T {
	var zero T
	if collector == nil || collector.collect == nil {
		return zero
	}

	collector.mu.Lock()
	defer collector.mu.Unlock()

	if collector.hasValue {
		return collector.value
	}

	next, didCollect := runResourceCollector(collector.collect)
	if !didCollect {
		return zero
	}

	collector.value = next
	collector.hasValue = collector.valid == nil || collector.valid(next)
	return next
}

type asyncCachedCollector[T any] struct {
	mu                 sync.Mutex
	collect            func() T
	minRefreshInterval time.Duration
	value              T
	hasValue           bool
	inFlight           bool
	lastStarted        time.Time
}

func newAsyncCachedCollector[T any](collect func() T, minRefreshInterval time.Duration) *asyncCachedCollector[T] {
	return &asyncCachedCollector[T]{
		collect:            collect,
		minRefreshInterval: minRefreshInterval,
	}
}

func (collector *asyncCachedCollector[T]) Get() T {
	var zero T
	if collector == nil || collector.collect == nil {
		return zero
	}

	now := time.Now()
	collector.mu.Lock()
	cached := collector.value
	hasCached := collector.hasValue
	shouldRefresh := !collector.inFlight && (collector.lastStarted.IsZero() || now.Sub(collector.lastStarted) >= collector.minRefreshInterval)
	if shouldRefresh {
		collector.inFlight = true
		collector.lastStarted = now
		collect := collector.collect
		go collector.refresh(collect)
	}
	collector.mu.Unlock()

	if hasCached {
		return cached
	}

	return zero
}

func (collector *asyncCachedCollector[T]) refresh(collect func() T) {
	next, didCollect := runResourceCollector(collect)
	collector.mu.Lock()
	defer collector.mu.Unlock()

	if didCollect {
		collector.value = next
		collector.hasValue = true
	}
	collector.inFlight = false
}

func runResourceCollector[T any](collect func() T) (value T, didCollect bool) {
	defer func() {
		if recover() != nil {
			didCollect = false
		}
	}()

	value = collect()
	return value, true
}
