//go:build windows

package process

import (
	"context"
	"fmt"
	"path/filepath"
	"time"

	"golang.org/x/sys/windows"
)

// KillConfirmedByPIDWithProtector checks identity and terminates using the same
// Windows handle so PID reuse between inspection and termination is harmless.
func KillConfirmedByPIDWithProtector(ctx context.Context, pid int, createdAt int64, protector Protector) OperationResult {
	if ctx == nil {
		ctx = context.Background()
	}
	result := OperationResult{PID: pid}
	if pid <= 0 || int64(pid) > int64(^uint32(0)>>1) {
		result.Message = "Invalid PID."
		return result
	}
	if createdAt <= 0 {
		return IdentityChanged(pid)
	}
	if err := ctx.Err(); err != nil {
		result.Message = err.Error()
		return result
	}
	handle, err := windows.OpenProcess(windows.PROCESS_QUERY_LIMITED_INFORMATION|windows.PROCESS_TERMINATE, false, uint32(pid))
	if err != nil {
		return confirmedFailure(result, err)
	}
	defer windows.CloseHandle(handle)
	var creation, exit, kernel, user windows.Filetime
	if err := windows.GetProcessTimes(handle, &creation, &exit, &kernel, &user); err != nil {
		return confirmedFailure(result, err)
	}
	if creation.Nanoseconds()/int64(time.Millisecond) != createdAt {
		return IdentityChanged(pid)
	}
	path := make([]uint16, 32768)
	length := uint32(len(path))
	if err := windows.QueryFullProcessImageName(handle, 0, &path[0], &length); err != nil {
		return confirmedFailure(result, err)
	}
	result.ProcessName = filepath.Base(windows.UTF16ToString(path[:length]))
	if protector == nil || protector.IsProtectedName(result.ProcessName) {
		result.Message = "Process is protected and cannot be ended."
		return result
	}
	if err := ctx.Err(); err != nil {
		result.Message = err.Error()
		return result
	}
	if err := windows.TerminateProcess(handle, 1); err != nil {
		return confirmedFailure(result, err)
	}
	result.Success = true
	result.Message = fmt.Sprintf("Process %s (PID %d) ended.", result.ProcessName, pid)
	return result
}

func confirmedFailure(result OperationResult, err error) OperationResult {
	if isAccessDenied(err) {
		result.Code = "permission_denied"
		result.Message = "Permission denied. Run OpenEnd as administrator, refresh the list and confirm again."
	} else {
		result.Message = fmt.Sprintf("Unable to inspect or end PID %d: %v. Refresh the list and confirm again.", result.PID, err)
	}
	return result
}
