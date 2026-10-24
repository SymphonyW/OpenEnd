package main

import (
	"context"
	"path/filepath"
	"strings"
	"time"

	"openend/internal/network"
	"openend/internal/process"

	gopsprocess "github.com/shirou/gopsutil/v3/process"
)

// GetNetworkSnapshot returns memory-only counters and the last minute of rates.
func (a *App) GetNetworkSnapshot() network.Snapshot {
	if a.networkMonitor == nil {
		return network.Snapshot{State: "collecting", Processes: []network.Row{}, History: []network.Sample{}}
	}
	return a.networkMonitor.Snapshot()
}

func (a *App) resolveNetworkProcesses(ctx context.Context, infos []process.Info) ([]process.Info, error) {
	ownershipContext := ctx
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	for i := range infos {
		if ctx.Err() != nil {
			break
		}
		info := &infos[i]
		// Cached metadata is tied to one process generation, never just its PID.
		if info.CreatedAt > 0 && info.Path != "" {
			continue
		}
		p, err := gopsprocess.NewProcessWithContext(ctx, info.PID)
		if err != nil {
			continue
		}
		created, err := p.CreateTimeWithContext(ctx)
		if err != nil || created <= 0 {
			continue
		}
		// Existing metadata must never be replaced by a later process's data.
		if info.CreatedAt > 0 && created > info.CreatedAt+10 {
			continue
		}
		info.CreatedAt = created
		if path, err := p.ExeWithContext(ctx); err == nil {
			info.Path = path
		}
		if name, err := p.NameWithContext(ctx); err == nil {
			info.Name = name
		}
		if parent, err := p.PpidWithContext(ctx); err == nil {
			info.ParentPID = parent
		}
		if command, err := p.CmdlineWithContext(ctx); err == nil {
			info.CommandLine = command
		}
		if directory, err := p.CwdWithContext(ctx); err == nil {
			info.WorkingDirectory = directory
		} else {
			info.WorkingDirectoryError = err.Error()
		}
		if info.Name == "" {
			info.Name = filepath.Base(info.Path)
		}
	}
	// ETW retains the command line of short-lived processes even if querying
	// their working directory is no longer possible.
	for i := range infos {
		if infos[i].Path == "" && filepath.IsAbs(infos[i].Name) {
			infos[i].Path = infos[i].Name
			infos[i].Name = filepath.Base(infos[i].Name)
		}
		infos[i].Name = strings.TrimSpace(infos[i].Name)
	}
	return a.assignProjects(ownershipContext, infos)
}

func (a *App) shutdown(ctx context.Context) {
	a.stopTray(ctx)
	if a.networkMonitor != nil {
		a.networkMonitor.Close()
	}
}
