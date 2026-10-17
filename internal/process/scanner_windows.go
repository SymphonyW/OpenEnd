//go:build windows

package process

import (
	"context"
	"fmt"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"openend/internal/config"

	gopsprocess "github.com/shirou/gopsutil/v3/process"
)

// List scans Windows processes and returns a best-effort snapshot.
func List(ctx context.Context) ([]Info, error) {
	rules, err := config.LoadDefaultProtectionRules(ctx)
	if err != nil {
		return nil, fmt.Errorf("load process protection rules: %w", err)
	}

	return ListWithProtector(ctx, rules)
}

// ListWithProtector scans Windows processes using the supplied protection rules.
func ListWithProtector(ctx context.Context, protector Protector) ([]Info, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("scan Windows processes: %w", err)
	}
	if protector == nil {
		protector = config.DefaultProtectionRules()
	}

	pids, err := gopsprocess.PidsWithContext(ctx)
	if err != nil {
		return nil, fmt.Errorf("scan Windows process ids: %w", err)
	}

	processes := make([]Info, 0, len(pids))
	seenPIDs := make(map[int32]struct{}, len(pids))
	sampledAt := time.Now()
	for _, pid := range pids {
		process, err := gopsprocess.NewProcessWithContext(ctx, pid)
		if err != nil {
			continue
		}

		info := Info{PID: pid}
		info.CreatedAt, _ = process.CreateTimeWithContext(ctx)
		seenPIDs[pid] = struct{}{}

		if name, err := process.NameWithContext(ctx); err == nil {
			info.Name = strings.TrimSpace(name)
		}
		if path, err := process.ExeWithContext(ctx); err == nil {
			info.Path = strings.TrimSpace(path)
			if info.Name == "" {
				info.Name = filepath.Base(path)
			}
			info.IconDataURL = IconDataURLForPath(info.Path)
		}
		if memory, err := process.MemoryInfoWithContext(ctx); err == nil && memory != nil {
			info.MemoryBytes = memory.RSS
		}
		if commandLine, err := process.CmdlineWithContext(ctx); err == nil {
			info.CommandLine = strings.TrimSpace(commandLine)
		}
		if user, err := process.UsernameWithContext(ctx); err == nil {
			info.User = strings.TrimSpace(user)
		}
		if cpuTimes, err := process.TimesWithContext(ctx); err == nil && cpuTimes != nil {
			info.CPUPercent = defaultCPUSampler.Percent(pid, cpuTimes.Total(), sampledAt)
		}

		info.IsProtected = protector.IsProtectedName(info.Name)
		processes = append(processes, info)
	}
	defaultCPUSampler.Prune(seenPIDs)

	sort.Slice(processes, func(i, j int) bool {
		return processes[i].PID < processes[j].PID
	})

	if len(pids) > 0 && len(processes) == 0 {
		return nil, fmt.Errorf("scan Windows processes: found %d process ids but could not read process details", len(pids))
	}

	return processes, nil
}
