//go:build windows

package port

import (
	"context"
	"strings"
	"testing"

	processscanner "openend/internal/process"

	gopsnet "github.com/shirou/gopsutil/v3/net"
)

type fakePortKillOperations struct {
	connections map[string][]gopsnet.ConnectionStat
	killResult  processscanner.OperationResult
	killedPID   int
}

func (ops *fakePortKillOperations) connectionsWithContext(ctx context.Context, protocol string) ([]gopsnet.ConnectionStat, error) {
	return ops.connections[protocol], nil
}

func (ops *fakePortKillOperations) killProcessByPID(ctx context.Context, pid int) processscanner.OperationResult {
	ops.killedPID = pid
	if ops.killResult.PID == 0 {
		ops.killResult.PID = pid
	}

	return ops.killResult
}

func TestKillProcessByPortResolvesPIDBeforeKilling(t *testing.T) {
	ops := &fakePortKillOperations{
		connections: map[string][]gopsnet.ConnectionStat{
			"tcp": {
				{Laddr: gopsnet.Addr{Port: 8000}, Pid: 123},
			},
		},
		killResult: processscanner.OperationResult{
			Success:     true,
			Message:     "Process node.exe (PID 123) ended.",
			PID:         123,
			ProcessName: "node.exe",
		},
	}

	result := killProcessByPort(context.Background(), 8000, "TCP", ops)

	if !result.Success {
		t.Fatalf("expected successful kill by port, got %q", result.Message)
	}
	if ops.killedPID != 123 {
		t.Fatalf("expected resolved pid 123 to be killed, got %d", ops.killedPID)
	}
	if result.ProcessName != "node.exe" {
		t.Fatalf("expected process name node.exe, got %q", result.ProcessName)
	}
}

func TestConfirmedPortKillRefusesChangedMissingOrMultipleOwners(t *testing.T) {
	for _, pids := range [][]int32{{200}, {}, {100, 200}} {
		var connections []gopsnet.ConnectionStat
		for _, pid := range pids {
			connections = append(connections, gopsnet.ConnectionStat{Laddr: gopsnet.Addr{Port: 3000}, Pid: pid})
		}
		ops := &fakePortKillOperations{connections: map[string][]gopsnet.ConnectionStat{"tcp": connections}}
		result := killProcessByPort(context.Background(), 3000, "TCP", ops, 100)
		if result.Success || result.Code != "identity_changed" || ops.killedPID != 0 {
			t.Fatalf("owners %v: %+v killed=%d", pids, result, ops.killedPID)
		}
	}
}

func TestKillProcessByPortDoesNotKillMissingPort(t *testing.T) {
	ops := &fakePortKillOperations{
		connections: map[string][]gopsnet.ConnectionStat{
			"tcp": {
				{Laddr: gopsnet.Addr{Port: 3000}, Pid: 100},
			},
		},
	}

	result := killProcessByPort(context.Background(), 8000, "TCP", ops)

	if result.Success {
		t.Fatalf("expected missing port kill to fail")
	}
	if !strings.Contains(strings.ToLower(result.Message), "no tcp process") {
		t.Fatalf("expected missing TCP port message, got %q", result.Message)
	}
	if ops.killedPID != 0 {
		t.Fatalf("missing port should not kill a process")
	}
}

func TestKillProcessByPortRejectsUnsupportedProtocol(t *testing.T) {
	ops := &fakePortKillOperations{}

	result := killProcessByPort(context.Background(), 8000, "ICMP", ops)

	if result.Success {
		t.Fatalf("expected unsupported protocol kill to fail")
	}
	if !strings.Contains(strings.ToLower(result.Message), "unsupported protocol") {
		t.Fatalf("expected unsupported protocol message, got %q", result.Message)
	}
	if ops.killedPID != 0 {
		t.Fatalf("unsupported protocol should not kill a process")
	}
}

func TestKillProcessByPortReturnsProtectedProcessResult(t *testing.T) {
	ops := &fakePortKillOperations{
		connections: map[string][]gopsnet.ConnectionStat{
			"tcp": {
				{Laddr: gopsnet.Addr{Port: 135}, Pid: 456},
			},
		},
		killResult: processscanner.OperationResult{
			Success:     false,
			Message:     "Process svchost.exe (PID 456) is protected and cannot be ended.",
			PID:         456,
			ProcessName: "svchost.exe",
		},
	}

	result := killProcessByPort(context.Background(), 135, "TCP", ops)

	if result.Success {
		t.Fatalf("expected protected process kill to fail")
	}
	if ops.killedPID != 456 {
		t.Fatalf("expected port resolver to pass pid 456 to process killer, got %d", ops.killedPID)
	}
	if !strings.Contains(strings.ToLower(result.Message), "protected") {
		t.Fatalf("expected protected message, got %q", result.Message)
	}
}
