package project

import (
	"path/filepath"
	"testing"

	"openend/internal/config"
	"openend/internal/process"
)

func TestApplicationsAndProjectsStaySeparate(t *testing.T) {
	base := t.TempDir()
	repo := makeProject(t, filepath.Join(base, "OpenEnd"), ".git")
	code := filepath.Join(base, "VS Code", "Code.exe")
	chrome := filepath.Join(base, "Chrome", "chrome.exe")
	helper := filepath.Join(base, "VS Code", "helpers", "crashpad_handler.exe")
	rows := []process.Info{
		{PID: 1, CreatedAt: 10, Name: "Code.exe", Path: code, WorkingDirectory: repo},
		{PID: 2, CreatedAt: 20, ParentPID: 1, Name: "Code.exe", Path: code, WorkingDirectory: repo},
		{PID: 3, CreatedAt: 20, ParentPID: 1, Name: "node.exe", Path: filepath.Join(base, "node.exe"), WorkingDirectory: repo, IsProtected: true},
		{PID: 4, CreatedAt: 20, ParentPID: 1, Name: "crashpad_handler.exe", Path: helper, WorkingDirectory: repo},
		{PID: 5, CreatedAt: 10, Name: "chrome.exe", Path: chrome, WorkingDirectory: repo},
		{PID: 6, CreatedAt: 20, ParentPID: 5, Name: "chrome.exe", Path: chrome, WorkingDirectory: repo, IsProtected: true},
		{PID: 7, CreatedAt: 20, ParentPID: 1, Name: "node.exe", Path: filepath.Join(base, "node.exe")},
		{PID: 8, CreatedAt: 20, Name: "viewer.exe", Path: filepath.Join(base, "Viewer", "viewer.exe"), WorkingDirectory: repo},
	}
	Assign(rows, nil, nil)
	for _, i := range []int{0, 1, 3} {
		if rows[i].ApplicationPath != code || rows[i].ApplicationName != "Visual Studio Code" || rows[i].ProjectPath != "" {
			t.Errorf("editor member %d: app=%q project=%q", rows[i].PID, rows[i].ApplicationPath, rows[i].ProjectPath)
		}
	}
	for _, i := range []int{4, 5} {
		if rows[i].ApplicationPath != chrome || rows[i].ApplicationName != "Google Chrome" {
			t.Errorf("browser member %d not grouped", rows[i].PID)
		}
	}
	if rows[2].ProjectPath != repo || rows[2].ApplicationPath != "" {
		t.Fatal("editor launched development service must stay in its project")
	}
	if !rows[2].IsProtected || !rows[5].IsProtected {
		t.Fatal("grouping changed process protection")
	}
	if rows[6].ProjectPath != "" || rows[6].ApplicationPath != "" {
		t.Fatal("unidentified runtime must not be absorbed into the editor")
	}
	if rows[7].ProjectPath != "" || rows[7].ApplicationName != "viewer" {
		t.Fatal("opening an app from a project directory does not make the app a project member")
	}
	if rows[3].ApplicationReason != "applicationParent" {
		t.Fatal("missing helper ownership reason")
	}
}

func TestApplicationIdentityAndExplicitExclusions(t *testing.T) {
	base := t.TempDir()
	a := filepath.Join(base, "Chrome Stable", "chrome.exe")
	b := filepath.Join(base, "Chrome Other", "chrome.exe")
	helper := filepath.Join(base, "Outside", "crashpad_handler.exe")
	rows := []process.Info{
		{PID: 1, CreatedAt: 20, Name: "chrome.exe", Path: a},
		{PID: 2, CreatedAt: 30, ParentPID: 1, Name: "chrome.exe", Path: b},
		{PID: 3, CreatedAt: 30, ParentPID: 1, Name: "crashpad_handler.exe", Path: helper},
		{PID: 4, CreatedAt: 30, Name: "chrome.exe", Path: a},
		{PID: 5, CreatedAt: 30, Name: "chrome.exe", Path: a, WorkingDirectory: base},
		{PID: 6, CreatedAt: 10, ParentPID: 1, Name: "crashpad_handler.exe", Path: filepath.Join(base, "Chrome Stable", "crashpad_handler.exe")},
		{PID: 7, CreatedAt: 30, Name: "chrome.exe"},
	}
	Assign(rows, []config.ProjectRule{{SourcePath: base, ProjectPath: ""}}, map[Identity]string{{PID: 4, CreatedAt: 30}: ""})
	if rows[0].ApplicationPath != a || rows[1].ApplicationPath != b || rows[2].ApplicationPath != helper {
		t.Fatal("unrelated executable paths were merged")
	}
	for _, i := range []int{3, 4, 6} {
		if rows[i].ApplicationPath != "" {
			t.Errorf("pid %d should remain unidentified", rows[i].PID)
		}
	}
	if rows[5].ApplicationPath == a {
		t.Fatal("reused parent PID must not absorb a helper")
	}
	// Recalculation clears stale application membership when a process is moved.
	Assign(rows, nil, map[Identity]string{{PID: 1, CreatedAt: 20}: base})
	if rows[0].ApplicationPath != "" || rows[0].ProjectPath != base {
		t.Fatal("project assignment must take priority on recalculation")
	}
}
