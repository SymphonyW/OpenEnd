//go:build !windows

package process

import (
	"context"
	"fmt"
	"runtime"
)

// KillByPID is implemented only for Windows because this app currently targets Windows process management.
func KillByPID(ctx context.Context, pid int) OperationResult {
	return OperationResult{
		Success: false,
		Message: fmt.Sprintf("process termination is not supported on %s", runtime.GOOS),
		PID:     pid,
	}
}

// KillByPIDWithProtector is implemented only for Windows because this app currently targets Windows process management.
func KillByPIDWithProtector(ctx context.Context, pid int, protector Protector) OperationResult {
	return OperationResult{
		Success: false,
		Message: fmt.Sprintf("process termination is not supported on %s", runtime.GOOS),
		PID:     pid,
	}
}

func KillConfirmedByPIDWithProtector(ctx context.Context, pid int, createdAt int64, protector Protector) OperationResult {
	return KillByPIDWithProtector(ctx, pid, protector)
}
