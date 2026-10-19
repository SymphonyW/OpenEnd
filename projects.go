package main

import (
	"context"
	"fmt"
	"os"
	"path/filepath"

	"openend/internal/config"
	"openend/internal/process"
	"openend/internal/project"
)

func (a *App) assignProjects(ctx context.Context, processes []process.Info) ([]process.Info, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()
	rules, err := store.GetProjectRules(ctx)
	if err != nil {
		return nil, err
	}
	a.projectMu.Lock()
	overrides := make(map[project.Identity]string, len(a.projectOverrides))
	for key, path := range a.projectOverrides {
		overrides[key] = path
	}
	a.projectMu.Unlock()
	project.Assign(processes, rules, overrides)
	return processes, nil
}

// SetProcessProject changes ownership only; it never terminates a process.
// Reset also removes saved rules covering the current working directory.
func (a *App) SetProcessProject(pid int, createdAt int64, projectPath string, remember, reset bool) error {
	if pid <= 0 || createdAt <= 0 {
		return fmt.Errorf("process identity is unavailable; refresh and try again")
	}
	processes, err := a.GetProcessList()
	if err != nil {
		return err
	}
	var target *process.Info
	for i := range processes {
		if int(processes[i].PID) == pid && processes[i].CreatedAt == createdAt {
			target = &processes[i]
			break
		}
	}
	if target == nil {
		return fmt.Errorf("process exited or its identity changed; refresh and try again")
	}
	if !reset && projectPath != "" {
		if !filepath.IsAbs(projectPath) {
			return fmt.Errorf("project path must be an absolute directory")
		}
		projectPath = filepath.Clean(projectPath)
		info, err := os.Stat(projectPath)
		if err != nil || !info.IsDir() || filepath.Dir(projectPath) == projectPath {
			return fmt.Errorf("project path must be an existing directory below a drive root")
		}
	}
	if remember || reset {
		store, err := config.NewDefaultStore()
		if err != nil {
			return err
		}
		defer store.Close()
		if reset {
			err = store.ResetProjectRules(a.appContext(), target.WorkingDirectory)
		} else {
			info, statErr := os.Stat(target.WorkingDirectory)
			if statErr != nil || !info.IsDir() {
				return fmt.Errorf("working directory is unavailable; cannot save a directory rule")
			}
			err = store.SetProjectRule(a.appContext(), target.WorkingDirectory, projectPath)
		}
		if err != nil {
			return err
		}
	}
	a.projectMu.Lock()
	defer a.projectMu.Unlock()
	if a.projectOverrides == nil {
		a.projectOverrides = make(map[project.Identity]string)
	}
	if reset || remember {
		delete(a.projectOverrides, project.Key(*target))
	} else {
		a.projectOverrides[project.Key(*target)] = projectPath
	}
	return nil
}
