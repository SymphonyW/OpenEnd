//go:build windows

package port

import (
	"context"
	"fmt"
	"path/filepath"
	"sort"
	"strings"

	"openend/internal/config"
	processscanner "openend/internal/process"

	gopsnet "github.com/shirou/gopsutil/v3/net"
	gopsprocess "github.com/shirou/gopsutil/v3/process"
)

type processInfo struct {
	createdAt   int64
	name        string
	path        string
	isProtected bool
}

// List scans Windows TCP and UDP port ownership and returns a best-effort snapshot.
func List(ctx context.Context) ([]Info, error) {
	rules, err := config.LoadDefaultProtectionRules(ctx)
	if err != nil {
		return nil, fmt.Errorf("load port protection rules: %w", err)
	}

	return ListWithProtector(ctx, rules)
}

// ListWithProtector scans Windows port ownership using the supplied protection rules.
func ListWithProtector(ctx context.Context, protector processscanner.Protector) ([]Info, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("scan Windows ports: %w", err)
	}
	if protector == nil {
		protector = config.DefaultProtectionRules()
	}

	tcpConnections, err := gopsnet.ConnectionsWithContext(ctx, "tcp")
	if err != nil {
		return nil, fmt.Errorf("scan Windows TCP ports: %w; try running as administrator if Windows denied access to connection tables", err)
	}

	udpConnections, err := gopsnet.ConnectionsWithContext(ctx, "udp")
	if err != nil {
		return nil, fmt.Errorf("scan Windows UDP ports: %w; try running as administrator if Windows denied access to connection tables", err)
	}

	processes := buildProcessIndex(ctx, protector, tcpConnections, udpConnections)
	ports := make([]Info, 0, len(tcpConnections)+len(udpConnections))
	seen := make(map[string]struct{})

	ports = appendConnections(ports, tcpConnections, ProtocolTCP, processes, seen)
	ports = appendConnections(ports, udpConnections, ProtocolUDP, processes, seen)

	sort.Slice(ports, func(i, j int) bool {
		if ports[i].Port != ports[j].Port {
			return ports[i].Port < ports[j].Port
		}
		if ports[i].Protocol != ports[j].Protocol {
			return ports[i].Protocol < ports[j].Protocol
		}
		if ports[i].PID != ports[j].PID {
			return ports[i].PID < ports[j].PID
		}
		return ports[i].Status < ports[j].Status
	})

	return ports, nil
}

func appendConnections(ports []Info, connections []gopsnet.ConnectionStat, protocol string, processes map[int32]processInfo, seen map[string]struct{}) []Info {
	for _, connection := range connections {
		if connection.Laddr.Port == 0 {
			continue
		}

		info := Info{
			Port:     int(connection.Laddr.Port),
			Protocol: protocol,
			Status:   normalizeStatus(protocol, connection.Status),
			PID:      connection.Pid,
		}

		if process, ok := processes[connection.Pid]; ok {
			info.CreatedAt = process.createdAt
			info.ProcessName = process.name
			info.ProcessPath = process.path
			info.IsProtected = process.isProtected
		}

		key := fmt.Sprintf("%s:%d:%d:%s", info.Protocol, info.Port, info.PID, info.Status)
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}

		ports = append(ports, info)
	}

	return ports
}

func buildProcessIndex(ctx context.Context, protector processscanner.Protector, connectionGroups ...[]gopsnet.ConnectionStat) map[int32]processInfo {
	pids := make(map[int32]struct{})
	for _, connections := range connectionGroups {
		for _, connection := range connections {
			if connection.Pid > 0 {
				pids[connection.Pid] = struct{}{}
			}
		}
	}

	processes := make(map[int32]processInfo, len(pids))
	for pid := range pids {
		process, err := gopsprocess.NewProcessWithContext(ctx, pid)
		if err != nil {
			continue
		}

		info := processInfo{}
		info.createdAt, _ = process.CreateTimeWithContext(ctx)
		if name, err := process.NameWithContext(ctx); err == nil {
			info.name = strings.TrimSpace(name)
			info.isProtected = protector.IsProtectedName(info.name)
		}
		if path, err := process.ExeWithContext(ctx); err == nil {
			info.path = strings.TrimSpace(path)
			if info.name == "" {
				info.name = filepath.Base(path)
				info.isProtected = protector.IsProtectedName(info.name)
			}
		}

		if info.name != "" || info.path != "" {
			processes[pid] = info
		}
	}

	return processes
}

func normalizeStatus(protocol string, status string) string {
	status = strings.TrimSpace(status)
	if status != "" {
		return status
	}
	if protocol == ProtocolUDP {
		return "LISTEN"
	}

	return "UNKNOWN"
}
