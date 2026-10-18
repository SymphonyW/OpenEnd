// Package project resolves project ownership once for both process and port views.
package project

import (
	"os"
	"path/filepath"
	"sort"
	"strings"

	"openend/internal/config"
	"openend/internal/process"
)

type Identity struct {
	PID       int32
	CreatedAt int64
}

func Key(p process.Info) Identity { return Identity{p.PID, p.CreatedAt} }

// Assign mutates only ownership fields, leaving resource and protection data intact.
func Assign(processes []process.Info, rules []config.ProjectRule, overrides map[Identity]string) {
	roots := make(map[string]string)
	rootFor := func(path string) string {
		if root, ok := roots[path]; ok {
			return root
		}
		root := FindRoot(path)
		roots[path] = root
		return root
	}
	rules = append([]config.ProjectRule(nil), rules...)
	sort.SliceStable(rules, func(i, j int) bool { return len(rules[i].SourcePath) > len(rules[j].SourcePath) })
	byPID := make(map[int32]int, len(processes))
	resolved := make(map[int32]bool, len(processes))
	for i := range processes {
		p := &processes[i]
		p.ProjectPath, p.ProjectName, p.ProjectReason, p.ProjectRuleSource = "", "", "", ""
		byPID[p.PID] = i
		for _, rule := range rules {
			if Contains(rule.SourcePath, p.WorkingDirectory) {
				setProject(p, rule.ProjectPath, "rule")
				p.ProjectRuleSource = rule.SourcePath
				resolved[p.PID] = true
				break
			}
		}
		if path, ok := overrides[Key(*p)]; ok && p.CreatedAt > 0 {
			setProject(p, path, "manual")
			resolved[p.PID] = true
			continue
		}
		if resolved[p.PID] || sharedHost(p.Name) || p.IsProtected {
			resolved[p.PID] = true
			continue
		}
		// Only absolute argument paths are evidence. The executable itself is not.
		candidates := make(map[string]string)
		args := splitCommand(p.CommandLine)
		for _, arg := range args[min(1, len(args)):] {
			if _, value, ok := strings.Cut(arg, "="); ok {
				arg = value
			}
			if filepath.IsAbs(arg) {
				if root := rootFor(arg); root != "" {
					candidates[strings.ToLower(root)] = root
				}
			}
		}
		if len(candidates) > 1 {
			p.ProjectReason = "conflict"
			resolved[p.PID] = true
			continue
		}
		for _, root := range candidates {
			setProject(p, root, "command")
		}
		if p.ProjectPath == "" {
			if root := rootFor(p.WorkingDirectory); root != "" {
				setProject(p, root, "directory")
			}
		}
		if p.ProjectPath != "" {
			resolved[p.PID] = true
		}
	}

	// Resolve ancestors with cycle detection; never inherit through shared hosts.
	visiting := make(map[int32]bool)
	var inherit func(int)
	inherit = func(i int) {
		p := &processes[i]
		if resolved[p.PID] || visiting[p.PID] {
			return
		}
		visiting[p.PID] = true
		if parentIndex, ok := byPID[p.ParentPID]; ok && parentIndex != i {
			parent := &processes[parentIndex]
			if !sharedHost(parent.Name) && parent.CreatedAt > 0 && p.CreatedAt >= parent.CreatedAt {
				inherit(parentIndex)
				if parent.ProjectPath != "" {
					setProject(p, parent.ProjectPath, "parent")
				}
			}
		}
		visiting[p.PID] = false
		resolved[p.PID] = true
	}
	for i := range processes {
		inherit(i)
	}
}

func setProject(p *process.Info, path, reason string) {
	p.ProjectPath, p.ProjectReason = path, reason
	if path != "" {
		p.ProjectName = filepath.Base(path)
	}
}

// Contains compares directory components, so app and app-other never match.
func Contains(parent, path string) bool {
	if parent == "" || path == "" || !filepath.IsAbs(parent) || !filepath.IsAbs(path) {
		return false
	}
	parent = strings.ToLower(filepath.Clean(parent))
	path = strings.ToLower(filepath.Clean(path))
	return path == parent || strings.HasPrefix(path, parent+string(filepath.Separator))
}

// FindRoot prefers the nearest Git repository over nested package manifests.
func FindRoot(path string) string {
	if path == "" || !filepath.IsAbs(path) || strings.HasPrefix(path, `\\`) {
		return ""
	}
	path = filepath.Clean(path)
	info, err := os.Stat(path)
	if err != nil {
		return ""
	}
	if !info.IsDir() {
		path = filepath.Dir(path)
	}
	packageRoot := ""
	for dir := path; filepath.Dir(dir) != dir; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, ".git")); err == nil {
			return dir
		}
		if packageRoot == "" && !dependencyPath(dir) {
			for _, marker := range []string{"package.json", "go.mod", "pyproject.toml", "Cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts"} {
				if info, err := os.Stat(filepath.Join(dir, marker)); err == nil && !info.IsDir() {
					packageRoot = dir
					break
				}
			}
		}
	}
	return packageRoot
}

func dependencyPath(path string) bool {
	for _, part := range strings.Split(strings.ToLower(filepath.Clean(path)), string(filepath.Separator)) {
		if part == "node_modules" || part == ".venv" || part == "venv" || part == "site-packages" {
			return true
		}
	}
	return false
}

func sharedHost(name string) bool {
	switch strings.ToLower(strings.TrimSuffix(strings.ToLower(name), ".exe")) {
	case "code", "code - insiders", "codex", "cursor", "devenv", "idea64", "pycharm64", "webstorm64", "rider64", "chrome", "msedge", "firefox", "explorer", "windowsterminal", "cmd", "powershell", "pwsh", "conhost", "docker", "docker desktop", "wsl", "wslhost":
		return true
	}
	return false
}
