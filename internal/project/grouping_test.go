package project

import (
	"os"
	"path/filepath"
	"testing"

	"openend/internal/config"
	"openend/internal/process"
)

func makeProject(t *testing.T, path string, marker string) string {
	t.Helper()
	if err := os.MkdirAll(path, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(path, marker), []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestOwnershipEvidenceAndInheritance(t *testing.T) {
	base := t.TempDir()
	a := makeProject(t, filepath.Join(base, "project a"), ".git")
	b := makeProject(t, filepath.Join(base, "project b"), "pyproject.toml")
	frontend := makeProject(t, filepath.Join(a, "frontend"), "package.json")
	processes := []process.Info{
		{PID: 1, CreatedAt: 10, Name: "node.exe", WorkingDirectory: frontend},
		{PID: 2, CreatedAt: 20, ParentPID: 1, Name: "worker.exe"},
		{PID: 3, CreatedAt: 20, ParentPID: 1, Name: "python.exe", WorkingDirectory: b},
		{PID: 4, CreatedAt: 20, Name: "node.exe", WorkingDirectory: a, CommandLine: `node --project="` + b + `"`},
		{PID: 5, CreatedAt: 20, Name: "code.exe", WorkingDirectory: a},
		{PID: 6, CreatedAt: 30, ParentPID: 5, Name: "node.exe"},
		{PID: 7, CreatedAt: 5, ParentPID: 1, Name: "worker.exe"},
		{PID: 8, CreatedAt: 20, ParentPID: 1, Name: "node.exe", CommandLine: `node "` + a + `" "` + b + `"`},
		{PID: 9, CreatedAt: 20, Name: "node.exe", CommandLine: `"` + filepath.Join(a, "node.exe") + `"`},
	}
	Assign(processes, nil, nil)
	want := []string{a, a, b, b, "", "", "", "", ""}
	for i, p := range processes {
		if p.ProjectPath != want[i] {
			t.Errorf("pid %d: got %q (%s), want %q", p.PID, p.ProjectPath, p.ProjectReason, want[i])
		}
	}
	if processes[1].ProjectReason != "parent" || processes[7].ProjectReason != "conflict" {
		t.Fatal("missing ownership reasons")
	}
}

func TestRulesAndOverridesDoNotLeakAcrossProcesses(t *testing.T) {
	base := t.TempDir()
	a := makeProject(t, filepath.Join(base, "app"), "package.json")
	b := makeProject(t, filepath.Join(base, "app-other"), "go.mod")
	sub := makeProject(t, filepath.Join(a, "frontend"), "package.json")
	rows := []process.Info{
		{PID: 1, CreatedAt: 10, Name: "node.exe", WorkingDirectory: a},
		{PID: 2, CreatedAt: 10, Name: "node.exe", WorkingDirectory: b},
		{PID: 3, CreatedAt: 10, Name: "node.exe", WorkingDirectory: sub},
		{PID: 4, CreatedAt: 10, Name: "node.exe", WorkingDirectory: a},
	}
	rules := []config.ProjectRule{{SourcePath: a, ProjectPath: b}, {SourcePath: sub, ProjectPath: ""}}
	Assign(rows, rules, map[Identity]string{{PID: 1, CreatedAt: 10}: a, {PID: 4, CreatedAt: 9}: a})
	want := []string{a, b, "", b}
	for i, p := range rows {
		if p.ProjectPath != want[i] {
			t.Errorf("pid %d got %q want %q", p.PID, p.ProjectPath, want[i])
		}
	}
	if rows[0].ProjectReason != "manual" || rows[2].ProjectRuleSource != sub {
		t.Fatal("missing manual/rule evidence")
	}
}

func TestDependencyDirectoriesAndCycles(t *testing.T) {
	base := t.TempDir()
	root := makeProject(t, filepath.Join(base, "app"), "package.json")
	dependency := makeProject(t, filepath.Join(root, "node_modules", "vite"), "package.json")
	if got := FindRoot(dependency); got != root {
		t.Fatalf("dependency root = %q, want %q", got, root)
	}
	rows := []process.Info{{PID: 1, ParentPID: 2, CreatedAt: 10}, {PID: 2, ParentPID: 1, CreatedAt: 10}}
	Assign(rows, nil, nil)
	if rows[0].ProjectPath != "" || rows[1].ProjectPath != "" {
		t.Fatal("cycle must remain ungrouped")
	}
}
