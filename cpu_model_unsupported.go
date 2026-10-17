//go:build !windows

package main

func collectCPUResourceInfoFallback() cpuResourceInfo {
	return cpuResourceInfo{}
}

func collectCPUModelNameFallback() string {
	return ""
}
