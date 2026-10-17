//go:build windows

package detail

import (
	"context"
	"fmt"
	"path/filepath"
	"strings"

	processscanner "openend/internal/process"

	gopsprocess "github.com/shirou/gopsutil/v3/process"
)

// ReadProcessSnapshot reads detail fields for a single Windows process.
func ReadProcessSnapshot(ctx context.Context, pid int32, protector processscanner.Protector) (ProcessSnapshot, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return ProcessSnapshot{}, fmt.Errorf("read process detail: %w", err)
	}
	if pid <= 0 {
		return ProcessSnapshot{}, fmt.Errorf("read process detail: pid must be positive")
	}

	process, err := gopsprocess.NewProcessWithContext(ctx, pid)
	if err != nil {
		return ProcessSnapshot{}, fmt.Errorf("read process detail for pid %d: %w", pid, err)
	}

	snapshot := ProcessSnapshot{PID: pid}
	snapshot.CreatedAt, _ = process.CreateTimeWithContext(ctx)
	if name, err := process.NameWithContext(ctx); err == nil {
		snapshot.ProcessName = strings.TrimSpace(name)
	}
	if path, err := process.ExeWithContext(ctx); err == nil {
		snapshot.ExecutablePath = strings.TrimSpace(path)
		if snapshot.ProcessName == "" {
			snapshot.ProcessName = filepath.Base(snapshot.ExecutablePath)
		}
		snapshot.IconDataURL = processscanner.IconDataURLForPath(snapshot.ExecutablePath)
	} else {
		snapshot.ExecutablePathError = readFailureMessage("executable path", err)
	}
	if commandLine, err := process.CmdlineWithContext(ctx); err == nil {
		snapshot.CommandLine = strings.TrimSpace(commandLine)
	} else {
		snapshot.CommandLineError = readFailureMessage("command line", err)
	}
	if memory, err := process.MemoryInfoWithContext(ctx); err == nil && memory != nil {
		snapshot.MemoryBytes = memory.RSS
	}
	if cpuPercent, err := process.CPUPercentWithContext(ctx); err == nil && cpuPercent >= 0 {
		snapshot.CPUPercent = processscanner.NormalizeCPUPercent(cpuPercent)
	}
	if protector != nil {
		snapshot.IsProtected = protector.IsProtectedName(snapshot.ProcessName)
	}

	return snapshot, nil
}

func readFailureMessage(field string, err error) string {
	if err == nil {
		return ""
	}

	return fmt.Sprintf("Unable to read %s. Try running as administrator if Windows denied access: %v", field, err)
}
