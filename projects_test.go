//go:build windows

package main

import (
	"os"
	"testing"

	"openend/internal/process"
)

func ownProjectProcess(t *testing.T, app *App) process.Info {
	t.Helper()
	rows, err := app.GetProcessList()
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if row.PID == int32(os.Getpid()) {
			return row
		}
	}
	t.Fatal("current process missing")
	return process.Info{}
}

func TestProjectAssignmentLifecycle(t *testing.T) {
	app := newTestApp(t)
	self := ownProjectProcess(t, app)
	if self.CreatedAt <= 0 || self.WorkingDirectory == "" {
		t.Fatal("current process identity and working directory must be readable")
	}
	path := t.TempDir()
	if err := app.SetProcessProject(int(self.PID), self.CreatedAt+1, path, false, false); err == nil {
		t.Fatal("stale identity accepted")
	}
	if err := app.SetProcessProject(int(self.PID), self.CreatedAt, "relative", false, false); err == nil {
		t.Fatal("relative project path accepted")
	}
	if err := app.SetProcessProject(int(self.PID), self.CreatedAt, path, false, false); err != nil {
		t.Fatal(err)
	}
	if got := ownProjectProcess(t, app); got.ProjectPath != path || got.ProjectReason != "manual" {
		t.Fatalf("manual assignment = %q (%s)", got.ProjectPath, got.ProjectReason)
	}
	if got := ownProjectProcess(t, NewApp()); got.ProjectPath == path {
		t.Fatal("temporary assignment persisted across app instances")
	}
	if err := app.SetProcessProject(int(self.PID), self.CreatedAt, path, true, false); err != nil {
		t.Fatal(err)
	}
	restarted := NewApp()
	if got := ownProjectProcess(t, restarted); got.ProjectPath != path || got.ProjectReason != "rule" {
		t.Fatalf("saved assignment = %q (%s)", got.ProjectPath, got.ProjectReason)
	}
	if err := restarted.SetProcessProject(int(self.PID), self.CreatedAt, "", false, false); err != nil {
		t.Fatal(err)
	}
	if got := ownProjectProcess(t, restarted); got.ProjectPath != "" || got.ProjectReason != "manual" {
		t.Fatal("explicit ungrouping failed")
	}
	if err := restarted.SetProcessProject(int(self.PID), self.CreatedAt, "", false, true); err != nil {
		t.Fatal(err)
	}
	if got := ownProjectProcess(t, restarted); got.ProjectReason == "rule" || got.ProjectReason == "manual" {
		t.Fatalf("reset did not restore automatic ownership: %s", got.ProjectReason)
	}
}
