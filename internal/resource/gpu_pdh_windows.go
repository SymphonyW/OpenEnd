//go:build windows

package resource

import (
	"fmt"
	"runtime"
	"sync"
	"time"
	"unsafe"

	"golang.org/x/sys/windows"
)

var (
	pdhDLL     = windows.NewLazySystemDLL("pdh.dll")
	pdhOpen    = pdhDLL.NewProc("PdhOpenQueryW")
	pdhAdd     = pdhDLL.NewProc("PdhAddEnglishCounterW")
	pdhCollect = pdhDLL.NewProc("PdhCollectQueryData")
	pdhArray   = pdhDLL.NewProc("PdhGetFormattedCounterArrayW")
	pdhClose   = pdhDLL.NewProc("PdhCloseQuery")
)

type gpuPerformanceReader struct {
	mu                    sync.Mutex
	query, engine, memory uintptr
}

func (r *gpuPerformanceReader) Read() ([]gpuEngineCounter, []gpuMemoryCounter, map[string]string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	errors := map[string]string{}
	if r.query == 0 {
		if status, _, _ := pdhOpen.Call(0, 0, uintptr(unsafe.Pointer(&r.query))); status != 0 {
			message := fmt.Sprintf("无法打开 GPU 性能计数器（0x%08x）。", uint32(status))
			errors["gpu"], errors["vram"] = message, message
			return nil, nil, errors
		}
	}
	newEngine := r.engine == 0
	for _, counter := range []struct {
		key, path string
		handle    *uintptr
	}{
		{"gpu", `\GPU Engine(*)\Utilization Percentage`, &r.engine},
		{"vram", `\GPU Adapter Memory(*)\Dedicated Usage`, &r.memory},
	} {
		if *counter.handle == 0 {
			path, _ := windows.UTF16PtrFromString(counter.path)
			if status, _, _ := pdhAdd.Call(r.query, uintptr(unsafe.Pointer(path)), 0, uintptr(unsafe.Pointer(counter.handle))); status != 0 {
				*counter.handle = 0
				errors[counter.key] = fmt.Sprintf("无法添加 GPU 性能计数器（0x%08x）。", uint32(status))
			}
		}
	}
	status, _, _ := pdhCollect.Call(r.query)
	if status == 0 && newEngine && r.engine != 0 {
		// Rate counters require two samples. Reuse the query on later reads.
		time.Sleep(time.Second)
		status, _, _ = pdhCollect.Call(r.query)
	}
	if status != 0 {
		message := fmt.Sprintf("无法采集 GPU 性能计数器（0x%08x）。", uint32(status))
		errors["gpu"], errors["vram"] = message, message
		r.close()
		return nil, nil, errors
	}
	var engines []gpuEngineCounter
	var memory []gpuMemoryCounter
	if r.engine != 0 {
		values, err := readPerformanceCounter(r.engine)
		if err != nil {
			errors["gpu"] = err.Error()
		} else {
			for _, value := range values {
				engines = append(engines, gpuEngineCounter{Name: value.Name, UtilizationPercentage: value.Value})
			}
		}
	}
	if r.memory != 0 {
		values, err := readPerformanceCounter(r.memory)
		if err != nil {
			errors["vram"] = err.Error()
		} else {
			for _, value := range values {
				memory = append(memory, gpuMemoryCounter{Name: value.Name, DedicatedUsage: uint64(value.Value)})
			}
		}
	}
	return engines, memory, errors
}

func (r *gpuPerformanceReader) close() {
	if r.query != 0 {
		pdhClose.Call(r.query) // Also closes all counters owned by this query.
	}
	r.query, r.engine, r.memory = 0, 0, 0
}

// Match the C layout: PDH_FMT_COUNTERVALUE has an 8-byte-aligned value union.
type pdhFormattedItem struct {
	Name   *uint16
	_      [8 - unsafe.Sizeof(uintptr(0))]byte
	Status uint32
	_      uint32
	Value  float64
}

type performanceValue struct {
	Name  string
	Value float64
}

func readPerformanceCounter(counter uintptr) ([]performanceValue, error) {
	const moreData = 0x800007D2
	const doubleFormat = 0x200
	for attempt := 0; attempt < 3; attempt++ {
		var size, count uint32
		status, _, _ := pdhArray.Call(counter, doubleFormat, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&count)), 0)
		if status != moreData || size == 0 {
			return nil, fmt.Errorf("无法读取 GPU 计数器大小（0x%08x）。", uint32(status))
		}
		buffer := make([]byte, size)
		status, _, _ = pdhArray.Call(counter, doubleFormat, uintptr(unsafe.Pointer(&size)), uintptr(unsafe.Pointer(&count)), uintptr(unsafe.Pointer(&buffer[0])))
		if status == moreData {
			continue // Counter instances can change between these two calls.
		}
		if status != 0 {
			return nil, fmt.Errorf("无法读取 GPU 计数器数据（0x%08x）。", uint32(status))
		}
		if uint64(count)*uint64(unsafe.Sizeof(pdhFormattedItem{})) > uint64(len(buffer)) {
			return nil, fmt.Errorf("GPU 计数器返回的数据长度无效。")
		}
		items := unsafe.Slice((*pdhFormattedItem)(unsafe.Pointer(&buffer[0])), int(count))
		values := make([]performanceValue, 0, len(items))
		for _, item := range items {
			// Status 0/1 means valid/new data. Ignore exited process instances.
			if item.Status <= 1 && isFinite(item.Value) && item.Value >= 0 {
				values = append(values, performanceValue{Name: windows.UTF16PtrToString(item.Name), Value: item.Value})
			}
		}
		runtime.KeepAlive(buffer)
		if len(values) == 0 {
			return nil, fmt.Errorf("GPU 计数器尚无有效采样数据。")
		}
		return values, nil
	}
	return nil, fmt.Errorf("GPU 计数器实例变化过快，请等待下一次采集。")
}
