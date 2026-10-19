//go:build windows

package resource

import (
	"testing"
	"unsafe"
)

func TestPerformanceCounterArrayLayoutAndInvalidHandle(t *testing.T) {
	var item pdhFormattedItem
	if unsafe.Sizeof(item) != 24 || unsafe.Offsetof(item.Value) != 16 {
		t.Fatal("formatted counter item must match the Windows C ABI")
	}
	if values, err := readPerformanceCounter(0); err == nil || len(values) != 0 {
		t.Fatalf("invalid counter must return an error: %v, %v", values, err)
	}
}
