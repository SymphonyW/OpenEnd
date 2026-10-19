//go:build windows

package project

import (
	"os"
	"path/filepath"
	"testing"
)

func TestReadInstalledWindowsApplicationName(t *testing.T) {
	path := filepath.Join(os.Getenv("WINDIR"), "System32", "notepad.exe")
	if _, err := os.Stat(path); err != nil {
		t.Skip("Windows Notepad is not installed")
	}
	if name := readApplicationName(path); name == "" {
		t.Fatal("expected a native executable description")
	}
	if name := applicationName(path); name == "" {
		t.Fatal("expected a cached application name")
	}
}
