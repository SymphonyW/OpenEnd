//go:build !windows

package main

import (
	"fmt"

	gopsprocess "github.com/shirou/gopsutil/v3/process"
)

func collectThreadCount() (int, error) {
	processes, err := gopsprocess.Processes()
	if err != nil {
		return 0, err
	}

	var threadCount int32
	readable := 0
	for _, process := range processes {
		count, err := process.NumThreads()
		if err == nil {
			readable++
			if count > 0 {
				threadCount += count
			}
		}
	}

	if readable < len(processes) {
		return 0, fmt.Errorf("thread counts readable for only %d/%d processes; try running as administrator", readable, len(processes))
	}
	return int(threadCount), nil
}
