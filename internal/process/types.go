package process

// Info is the process row returned to the Wails frontend.
type Info struct {
	ParentPID             int32   `json:"parentPID"`
	WorkingDirectory      string  `json:"workingDirectory"`
	WorkingDirectoryError string  `json:"workingDirectoryError"`
	ProjectPath           string  `json:"projectPath"`
	ProjectName           string  `json:"projectName"`
	ProjectReason         string  `json:"projectReason"`
	ProjectRuleSource     string  `json:"projectRuleSource"`
	ApplicationPath       string  `json:"applicationPath"`
	ApplicationName       string  `json:"applicationName"`
	ApplicationReason     string  `json:"applicationReason"`
	CreatedAt             int64   `json:"createdAt"`
	PID                   int32   `json:"pid"`
	Name                  string  `json:"name"`
	IconDataURL           string  `json:"iconDataURL"`
	Path                  string  `json:"path"`
	CommandLine           string  `json:"commandLine"`
	User                  string  `json:"user"`
	CPUPercent            float64 `json:"cpuPercent"`
	MemoryBytes           uint64  `json:"memoryBytes"`
	IsProtected           bool    `json:"isProtected"`
}
