//go:build !windows

package project

import (
	"strings"
	"unicode"
)

// The live process scanner is Windows-only. This conservative fallback keeps
// filesystem-based grouping checks runnable on other platforms.
func splitCommand(command string) []string {
	var args []string
	var current strings.Builder
	quoted := false
	for _, ch := range command {
		if ch == '"' {
			quoted = !quoted
			continue
		}
		if unicode.IsSpace(ch) && !quoted {
			if current.Len() > 0 {
				args = append(args, current.String())
				current.Reset()
			}
		} else {
			current.WriteRune(ch)
		}
	}
	if current.Len() > 0 && !quoted {
		args = append(args, current.String())
	}
	return args
}
