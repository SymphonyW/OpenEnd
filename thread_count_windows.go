//go:build windows

package main

import (
	"fmt"
	"unsafe"

	"golang.org/x/sys/windows"
)

func collectThreadCount() (int, error) {
	// All counts come from one snapshot, so processes exiting during enumeration
	// cannot invalidate the sample. No per-process queries or handles are needed.
	snapshot, err := windows.CreateToolhelp32Snapshot(windows.TH32CS_SNAPPROCESS, 0)
	if err != nil {
		return 0, fmt.Errorf("capture thread counts: %w", err)
	}
	defer windows.CloseHandle(snapshot)

	entry := windows.ProcessEntry32{Size: uint32(unsafe.Sizeof(windows.ProcessEntry32{}))}
	threadCount := 0
	for err = windows.Process32First(snapshot, &entry); err == nil; err = windows.Process32Next(snapshot, &entry) {
		threadCount += int(entry.Threads)
	}
	if err != windows.ERROR_NO_MORE_FILES {
		return 0, fmt.Errorf("read thread counts from process snapshot: %w", err)
	}
	return threadCount, nil
}
