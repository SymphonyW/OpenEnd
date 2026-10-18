//go:build windows

package project

import (
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"unsafe"

	"golang.org/x/sys/windows"
)

var applicationNameCache = struct {
	sync.Mutex
	names map[string]string
}{names: make(map[string]string)}

func applicationName(path string) string {
	key := strings.ToLower(filepath.Clean(path))
	applicationNameCache.Lock()
	defer applicationNameCache.Unlock()
	if name, ok := applicationNameCache.names[key]; ok {
		return name
	}
	name := readApplicationName(path)
	if name == "" {
		name = fallbackApplicationName(path)
	}
	if len(applicationNameCache.names) >= 256 {
		clear(applicationNameCache.names)
	}
	applicationNameCache.names[key] = name
	return name
}

func readApplicationName(path string) string {
	size, err := windows.GetFileVersionInfoSize(path, nil)
	if err != nil || size == 0 || size > 4*1024*1024 {
		return ""
	}
	data := make([]byte, size)
	if err := windows.GetFileVersionInfo(path, 0, size, unsafe.Pointer(&data[0])); err != nil {
		return ""
	}
	var translations *uint16
	var length uint32
	if err := windows.VerQueryValue(unsafe.Pointer(&data[0]), `\VarFileInfo\Translation`, unsafe.Pointer(&translations), &length); err != nil || translations == nil || length < 4 {
		return ""
	}
	languages := unsafe.Slice(translations, length/2)
	for _, field := range []string{"FileDescription", "ProductName"} {
		for i := 0; i+1 < len(languages); i += 2 {
			var value *uint16
			query := fmt.Sprintf(`\StringFileInfo\%04x%04x\%s`, languages[i], languages[i+1], field)
			if err := windows.VerQueryValue(unsafe.Pointer(&data[0]), query, unsafe.Pointer(&value), &length); err == nil && value != nil && length > 1 {
				if name := strings.TrimSpace(windows.UTF16ToString(unsafe.Slice(value, length))); name != "" {
					return name
				}
			}
		}
	}
	return ""
}
