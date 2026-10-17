//go:build windows

package process

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	gopsprocess "github.com/shirou/gopsutil/v3/process"
	"golang.org/x/sys/windows"
	"openend/internal/config"
)

func TestConfirmedKillChecksCreationTimeAndProtection(t *testing.T) {
	ctx := context.Background()
	// Only the child started here can be terminated by this test.
	cmd := exec.Command(os.Args[0], "-test.run=^TestConfirmedKillChild$")
	cmd.Env = append(os.Environ(), "OPENEND_KILL_TEST_CHILD=1")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	pid := cmd.Process.Pid
	process, err := gopsprocess.NewProcess(int32(pid))
	if err != nil {
		t.Fatal(err)
	}
	createdAt, err := process.CreateTime()
	if err != nil {
		t.Fatal(err)
	}
	rules := config.DefaultProtectionRules()
	result := KillConfirmedByPIDWithProtector(ctx, pid, createdAt+1, rules)
	if result.Success || result.Code != "identity_changed" {
		t.Fatalf("reused PID should be refused: %+v", result)
	}
	result = KillConfirmedByPIDWithProtector(ctx, pid, 0, rules)
	if result.Success || result.Code != "identity_changed" {
		t.Fatalf("unknown identity should be refused: %+v", result)
	}
	protected := config.NewProtectionRules([]string{filepath.Base(os.Args[0])})
	result = KillConfirmedByPIDWithProtector(ctx, pid, createdAt, protected)
	if result.Success {
		t.Fatal("protected process was terminated")
	}
	result = KillConfirmedByPIDWithProtector(ctx, pid, createdAt, rules)
	if !result.Success {
		t.Fatalf("confirmed child: %+v", result)
	}
	denied := confirmedFailure(OperationResult{PID: pid}, windows.ERROR_ACCESS_DENIED)
	if denied.Code != "permission_denied" || denied.Success {
		t.Fatalf("permission: %+v", denied)
	}
}

func TestConfirmedKillChild(t *testing.T) {
	if os.Getenv("OPENEND_KILL_TEST_CHILD") == "1" {
		time.Sleep(30 * time.Second)
	}
}
