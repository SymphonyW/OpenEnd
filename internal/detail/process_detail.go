package detail

import (
	"sort"
	"strings"

	"openend/internal/config"
	portscanner "openend/internal/port"
)

const defaultRecentLogLimit = 8

var developmentProcessKeywords = []string{
	"node.exe",
	"npm",
	"pnpm",
	"yarn",
	"vite",
	"python.exe",
	"uvicorn",
	"go.exe",
	"java.exe",
	"redis-server",
	"postgres",
	"mysql",
	"nginx",
	"docker",
	"wsl",
	"vmmem",
}

// ProcessSnapshot is the raw per-process detail collected before aggregation.
type ProcessSnapshot struct {
	CreatedAt           int64
	PID                 int32
	ProcessName         string
	IconDataURL         string
	ExecutablePath      string
	ExecutablePathError string
	CommandLine         string
	CommandLineError    string
	CPUPercent          float64
	MemoryBytes         uint64
	IsProtected         bool
}

// ProcessPort is a port owned by the process in a detail response.
type ProcessPort struct {
	Port     int    `json:"port"`
	Protocol string `json:"protocol"`
	Status   string `json:"status"`
}

// ProcessDetail is the process detail payload returned to the frontend.
type ProcessDetail struct {
	CreatedAt           int64                 `json:"createdAt"`
	PID                 int32                 `json:"pid"`
	ProcessName         string                `json:"processName"`
	IconDataURL         string                `json:"iconDataURL"`
	ExecutablePath      string                `json:"executablePath"`
	ExecutablePathError string                `json:"executablePathError"`
	CommandLine         string                `json:"commandLine"`
	CommandLineError    string                `json:"commandLineError"`
	CPUPercent          float64               `json:"cpuPercent"`
	MemoryBytes         uint64                `json:"memoryBytes"`
	IsProtected         bool                  `json:"isProtected"`
	IsDeveloperRelated  bool                  `json:"isDeveloperRelated"`
	Ports               []ProcessPort         `json:"ports"`
	PortsError          string                `json:"portsError"`
	RecentLogs          []config.OperationLog `json:"recentLogs"`
	LogsError           string                `json:"logsError"`
}

// BuildProcessDetail combines a process snapshot with current ports and recent logs.
func BuildProcessDetail(snapshot ProcessSnapshot, ports []portscanner.Info, logs []config.OperationLog, portsError string, logsError string) ProcessDetail {
	return ProcessDetail{
		CreatedAt:           snapshot.CreatedAt,
		PID:                 snapshot.PID,
		ProcessName:         strings.TrimSpace(snapshot.ProcessName),
		IconDataURL:         strings.TrimSpace(snapshot.IconDataURL),
		ExecutablePath:      strings.TrimSpace(snapshot.ExecutablePath),
		ExecutablePathError: strings.TrimSpace(snapshot.ExecutablePathError),
		CommandLine:         strings.TrimSpace(snapshot.CommandLine),
		CommandLineError:    strings.TrimSpace(snapshot.CommandLineError),
		CPUPercent:          snapshot.CPUPercent,
		MemoryBytes:         snapshot.MemoryBytes,
		IsProtected:         snapshot.IsProtected,
		IsDeveloperRelated:  IsDeveloperRelated(snapshot),
		Ports:               relatedPorts(snapshot.PID, ports),
		PortsError:          strings.TrimSpace(portsError),
		RecentLogs:          logs,
		LogsError:           strings.TrimSpace(logsError),
	}
}

// RecentLogLimit returns the default number of operation logs to show in detail.
func RecentLogLimit() int {
	return defaultRecentLogLimit
}

// IsDeveloperRelated reports whether a process looks relevant to common development workflows.
func IsDeveloperRelated(snapshot ProcessSnapshot) bool {
	tokens := processTokens(snapshot)
	for _, keyword := range developmentProcessKeywords {
		if tokensContainKeyword(tokens, keyword) {
			return true
		}
	}

	return false
}

func relatedPorts(pid int32, ports []portscanner.Info) []ProcessPort {
	related := make([]ProcessPort, 0)
	seen := make(map[ProcessPort]struct{})

	for _, port := range ports {
		if port.PID != pid || port.Port <= 0 {
			continue
		}

		item := ProcessPort{
			Port:     port.Port,
			Protocol: strings.TrimSpace(port.Protocol),
			Status:   strings.TrimSpace(port.Status),
		}
		if _, exists := seen[item]; exists {
			continue
		}
		seen[item] = struct{}{}
		related = append(related, item)
	}

	sort.Slice(related, func(i, j int) bool {
		if related[i].Port != related[j].Port {
			return related[i].Port < related[j].Port
		}
		if related[i].Protocol != related[j].Protocol {
			return related[i].Protocol < related[j].Protocol
		}
		return related[i].Status < related[j].Status
	})

	return related
}

func processTokens(snapshot ProcessSnapshot) []string {
	text := strings.Join([]string{
		snapshot.ProcessName,
		snapshot.ExecutablePath,
		snapshot.CommandLine,
	}, " ")

	return strings.FieldsFunc(strings.ToLower(text), func(r rune) bool {
		return !(r >= 'a' && r <= 'z') &&
			!(r >= '0' && r <= '9') &&
			r != '_' &&
			r != '.' &&
			r != '-'
	})
}

func tokensContainKeyword(tokens []string, keyword string) bool {
	normalizedKeyword := strings.ToLower(keyword)
	for _, token := range tokens {
		if token == normalizedKeyword {
			return true
		}
		if strings.HasSuffix(normalizedKeyword, ".exe") {
			continue
		}
		if token == normalizedKeyword+".exe" ||
			strings.HasPrefix(token, normalizedKeyword+".") ||
			strings.HasPrefix(token, normalizedKeyword+"-") {
			return true
		}
	}

	return false
}
