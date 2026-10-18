//go:build windows

package project

import "golang.org/x/sys/windows"

func splitCommand(command string) []string {
	args, err := windows.DecomposeCommandLine(command)
	if err != nil {
		return nil
	}
	return args
}
