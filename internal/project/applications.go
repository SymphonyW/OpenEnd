package project

import (
	"path/filepath"
	"strings"

	"openend/internal/process"
)

var applicationNames = map[string]string{
	"chrome": "Google Chrome", "msedge": "Microsoft Edge", "firefox": "Mozilla Firefox",
	"code": "Visual Studio Code", "code - insiders": "Visual Studio Code Insiders", "cursor": "Cursor",
	"codex": "Codex", "devenv": "Visual Studio", "idea64": "IntelliJ IDEA", "pycharm64": "PyCharm",
	"webstorm64": "WebStorm", "rider64": "Rider", "slack": "Slack", "discord": "Discord",
	"wechat": "WeChat", "weixin": "WeChat", "qq": "QQ", "telegram": "Telegram", "notion": "Notion",
	"spotify": "Spotify", "obs64": "OBS Studio", "winword": "Microsoft Word", "excel": "Microsoft Excel",
	"powerpnt": "Microsoft PowerPoint", "outlook": "Microsoft Outlook", "postman": "Postman",
}

func executableStem(name string) string {
	return strings.TrimSuffix(strings.ToLower(filepath.Base(name)), ".exe")
}

func developmentRuntime(name string) bool {
	stem := executableStem(name)
	switch stem {
	case "node", "nodejs", "npm", "pnpm", "yarn", "bun", "deno", "python", "pythonw", "py", "uv", "uvicorn", "gunicorn", "go", "gopls", "java", "javaw", "dotnet", "cargo", "rustc", "rust-analyzer", "ruby", "php", "git", "tsserver":
		return true
	}
	// Versioned Python executables are also shared runtimes, not applications.
	return strings.HasPrefix(stem, "python") && len(stem) > 6 && stem[6] >= '0' && stem[6] <= '9'
}

func applicationBoundary(name string) bool {
	switch executableStem(name) {
	case "system", "registry", "smss", "csrss", "wininit", "winlogon", "services", "lsass", "svchost", "explorer", "dwm", "taskhostw", "runtimebroker", "conhost", "cmd", "powershell", "pwsh", "windowsterminal", "docker", "docker desktop", "wsl", "wslhost":
		return true
	}
	return false
}

func validParent(child, parent process.Info) bool {
	return child.PID != parent.PID && parent.CreatedAt > 0 && child.CreatedAt >= parent.CreatedAt
}

func helperExecutable(name string) bool {
	stem := executableStem(name)
	return strings.Contains(stem, "crashpad") || strings.HasSuffix(stem, "_helper") || strings.HasSuffix(stem, " helper") || stem == "helper"
}

// A bundled helper is evidence only inside the parent's installation directory.
// Sharing a terminal, editor ancestor, or installation drive is not sufficient.
func bundledHelper(child process.Info, processes []process.Info, byPID map[int32]int) bool {
	parentIndex, ok := byPID[child.ParentPID]
	if !ok || !helperExecutable(child.Name) {
		return false
	}
	parent := processes[parentIndex]
	_, known := applicationNames[executableStem(parent.Name)]
	return known && validParent(child, parent) && parent.Path != "" && Contains(filepath.Dir(parent.Path), child.Path)
}

func assignApplications(processes []process.Info, byPID map[int32]int) {
	for i := range processes {
		p := &processes[i]
		p.ApplicationPath, p.ApplicationName, p.ApplicationReason = "", "", ""
	}
	resolved, visiting := make(map[int32]bool), make(map[int32]bool)
	var assign func(int)
	assign = func(i int) {
		p := &processes[i]
		if resolved[p.PID] || visiting[p.PID] {
			return
		}
		visiting[p.PID] = true
		defer func() { resolved[p.PID] = true; visiting[p.PID] = false }()
		// Explicit exclusions and ambiguous projects must not silently become apps.
		if p.ProjectPath != "" || p.ProjectReason != "" || applicationBoundary(p.Name) || developmentRuntime(p.Name) || !filepath.IsAbs(p.Path) || strings.HasPrefix(p.Path, `\\`) {
			return
		}
		path := filepath.Clean(p.Path)
		if !strings.EqualFold(filepath.Ext(path), ".exe") {
			return
		}
		if parentIndex, ok := byPID[p.ParentPID]; ok && validParent(*p, processes[parentIndex]) {
			assign(parentIndex)
			parent := processes[parentIndex]
			if parent.ApplicationPath != "" && (strings.EqualFold(path, parent.ApplicationPath) || (helperExecutable(p.Name) && Contains(filepath.Dir(parent.ApplicationPath), path))) {
				p.ApplicationPath, p.ApplicationName, p.ApplicationReason = parent.ApplicationPath, parent.ApplicationName, "applicationParent"
				return
			}
		}
		p.ApplicationPath, p.ApplicationName, p.ApplicationReason = path, applicationName(path), "applicationPath"
	}
	for i := range processes {
		assign(i)
	}
}

func fallbackApplicationName(path string) string {
	if name := applicationNames[executableStem(path)]; name != "" {
		return name
	}
	return strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))
}
