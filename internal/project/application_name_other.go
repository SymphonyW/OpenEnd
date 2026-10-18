//go:build !windows

package project

func applicationName(path string) string { return fallbackApplicationName(path) }
