//go:build !windows

package resource

// GetGPUInfo returns zeroed GPU fields on unsupported platforms.
func GetGPUInfo() GPUInfo {
	// TODO: add GPU and VRAM collection for non-Windows platforms.
	return GPUInfo{Errors: map[string]string{"gpu": "GPU collection is unsupported", "vram": "VRAM collection is unsupported"}}
}
