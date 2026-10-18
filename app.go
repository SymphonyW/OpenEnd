package main

import (
	"context"
	"fmt"
	"log"
	"math"
	"strings"
	"sync"

	"openend/internal/config"
	processdetail "openend/internal/detail"
	portscanner "openend/internal/port"
	processscanner "openend/internal/process"
	"openend/internal/project"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	gopsprocess "github.com/shirou/gopsutil/v3/process"
)

// SystemResourceInfo is the resource snapshot returned to the frontend.
type SystemResourceInfo struct {
	Metrics              map[string]ResourceStatus `json:"metrics"`
	CPUPercent           float64                   `json:"cpuPercent"`
	CPUName              string                    `json:"cpuName"`
	CPUPhysicalCores     int                       `json:"cpuPhysicalCores"`
	CPULogicalProcessors int                       `json:"cpuLogicalProcessors"`
	CPUMaxMHz            float64                   `json:"cpuMaxMHz"`
	TotalMemoryBytes     uint64                    `json:"totalMemoryBytes"`
	UsedMemoryBytes      uint64                    `json:"usedMemoryBytes"`
	FreeMemoryBytes      uint64                    `json:"freeMemoryBytes"`
	GPUPercent           float64                   `json:"gpuPercent"`
	GPUNames             []string                  `json:"gpuNames"`
	TotalVRAMBytes       uint64                    `json:"totalVRAMBytes"`
	UsedVRAMBytes        uint64                    `json:"usedVRAMBytes"`
	FreeVRAMBytes        uint64                    `json:"freeVRAMBytes"`
	ProcessCount         int                       `json:"processCount"`
	ThreadCount          int                       `json:"threadCount"`
	PortCount            int                       `json:"portCount"`
	UptimeSeconds        uint64                    `json:"uptimeSeconds"`
}

// App struct
type App struct {
	ctx              context.Context
	projectMu        sync.Mutex
	projectOverrides map[project.Identity]string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// AppName returns the desktop application name through the Wails binding.
func (a *App) AppName() string {
	return "OpenEnd"
}

// GetSystemResourceInfo returns a best-effort snapshot of local system usage.
func (a *App) GetSystemResourceInfo() SystemResourceInfo {
	return collectSystemResourceInfo(defaultSystemResourceCollectors())
}

func roundOneDecimal(value float64) float64 {
	return math.Round(value*10) / 10
}

type memoryResourceInfo struct {
	TotalBytes uint64
	UsedBytes  uint64
	FreeBytes  uint64
}

type cpuResourceInfo struct {
	Name              string
	PhysicalCores     int
	LogicalProcessors int
	MaxMHz            float64
}

type systemResourceCollectors struct {
	CPUPercent   func() (float64, ResourceStatus)
	CPUInfo      func() (cpuResourceInfo, ResourceStatus)
	Memory       func() (memoryResourceInfo, ResourceStatus)
	GPU          func() (gpuResourceReading, ResourceStatus)
	ProcessCount func() (int, ResourceStatus)
	ThreadCount  func() (int, ResourceStatus)
	PortCount    func() (int, ResourceStatus)
	Uptime       func() (uint64, ResourceStatus)
}

func defaultSystemResourceCollectors() systemResourceCollectors {
	return defaultAsyncSystemResourceCollectors
}

func collectSystemResourceInfo(collectors systemResourceCollectors) SystemResourceInfo {
	var cpuPercent float64
	var cpuInfo cpuResourceInfo
	var memoryInfo memoryResourceInfo
	var gpuReading gpuResourceReading
	var processCount int
	var threadCount int
	var portCount int
	var uptimeSeconds uint64
	var cpuStatus, cpuInfoStatus, memoryStatus, gpuStatus, processStatus, threadStatus, portStatus, uptimeStatus ResourceStatus
	var waitGroup sync.WaitGroup
	waitGroup.Add(8)

	go func() {
		defer waitGroup.Done()
		if collectors.CPUPercent != nil {
			cpuPercent, cpuStatus = collectors.CPUPercent()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.CPUInfo != nil {
			cpuInfo, cpuInfoStatus = collectors.CPUInfo()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.Memory == nil {
			return
		}
		memoryInfo, memoryStatus = collectors.Memory()
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.GPU == nil {
			return
		}
		gpuReading, gpuStatus = collectors.GPU()
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.ProcessCount != nil {
			processCount, processStatus = collectors.ProcessCount()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.ThreadCount != nil {
			threadCount, threadStatus = collectors.ThreadCount()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.PortCount != nil {
			portCount, portStatus = collectors.PortCount()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.Uptime != nil {
			uptimeSeconds, uptimeStatus = collectors.Uptime()
		}
	}()

	waitGroup.Wait()
	statuses := map[string]ResourceStatus{"cpu": cpuStatus, "cpuInfo": cpuInfoStatus, "memory": memoryStatus, "gpu": gpuStatus, "vram": gpuStatus, "processes": processStatus, "threads": threadStatus, "ports": portStatus, "uptime": uptimeStatus}
	if gpuStatus.State == "ready" {
		statuses["gpu"] = gpuReading.GPU
		statuses["vram"] = gpuReading.VRAM
	}
	for key, status := range statuses {
		if status.State == "" {
			statuses[key] = ResourceStatus{State: "unavailable"}
		}
	}
	gpuInfo := gpuReading.Info

	return SystemResourceInfo{
		Metrics:              statuses,
		CPUPercent:           cpuPercent,
		CPUName:              cpuInfo.Name,
		CPUPhysicalCores:     cpuInfo.PhysicalCores,
		CPULogicalProcessors: cpuInfo.LogicalProcessors,
		CPUMaxMHz:            cpuInfo.MaxMHz,
		TotalMemoryBytes:     memoryInfo.TotalBytes,
		UsedMemoryBytes:      memoryInfo.UsedBytes,
		FreeMemoryBytes:      memoryInfo.FreeBytes,
		GPUPercent:           gpuInfo.GPUPercent,
		GPUNames:             nonNilStrings(gpuInfo.Names),
		TotalVRAMBytes:       gpuInfo.TotalVRAMBytes,
		UsedVRAMBytes:        gpuInfo.UsedVRAMBytes,
		FreeVRAMBytes:        gpuInfo.FreeVRAMBytes,
		ProcessCount:         processCount,
		ThreadCount:          threadCount,
		PortCount:            portCount,
		UptimeSeconds:        uptimeSeconds,
	}
}

func collectCPUPercent() (float64, error) {
	percentages, err := cpu.Percent(0, false)
	if err != nil || len(percentages) == 0 {
		return 0, fmt.Errorf("CPU collection unavailable: %v", err)
	}

	return roundOneDecimal(percentages[0]), nil
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}

	return values
}

func collectCPUResourceInfo() cpuResourceInfo {
	var info cpuResourceInfo

	cpuStats, err := cpu.Info()
	if err != nil {
		log.Printf("collect CPU information: %v", err)
	}
	if err == nil {
		for _, stat := range cpuStats {
			if info.Name == "" {
				info.Name = strings.TrimSpace(stat.ModelName)
			}
			if stat.Mhz > info.MaxMHz {
				info.MaxMHz = stat.Mhz
			}
		}
	}
	if info.Name == "" {
		info.Name = collectCPUModelNameFallback()
	}

	if physicalCores, err := cpu.Counts(false); err == nil && physicalCores > 0 {
		info.PhysicalCores = physicalCores
	} else if err != nil {
		log.Printf("collect physical CPU cores: %v", err)
	}
	if logicalProcessors, err := cpu.Counts(true); err == nil && logicalProcessors > 0 {
		info.LogicalProcessors = logicalProcessors
	}
	if info.MaxMHz <= 0 || info.PhysicalCores <= 0 {
		fallback := collectCPUResourceInfoFallback()
		if info.MaxMHz <= 0 {
			info.MaxMHz = fallback.MaxMHz
		}
		if info.PhysicalCores <= 0 {
			info.PhysicalCores = fallback.PhysicalCores
		}
	}

	return info
}

func collectMemoryResourceInfo() (memoryResourceInfo, error) {
	memory, err := mem.VirtualMemory()
	if err != nil {
		return memoryResourceInfo{}, err
	}

	return memoryResourceInfo{
		TotalBytes: memory.Total,
		UsedBytes:  memory.Used,
		FreeBytes:  memory.Available,
	}, nil
}

func collectProcessCount() (int, error) {
	pids, err := gopsprocess.Pids()
	if err != nil {
		return 0, err
	}

	return len(pids), nil
}

func collectThreadCount() (int, error) {
	processes, err := gopsprocess.Processes()
	if err != nil {
		return 0, err
	}

	var threadCount int32
	readable := 0
	for _, process := range processes {
		count, err := process.NumThreads()
		if err == nil {
			readable++
			if count > 0 {
				threadCount += count
			}
		}
	}

	if readable < len(processes) {
		return 0, fmt.Errorf("thread counts readable for only %d/%d processes; try running as administrator", readable, len(processes))
	}
	return int(threadCount), nil
}

func collectPortCount() (int, error) {
	connections, err := net.Connections("inet")
	if err != nil {
		return 0, err
	}

	ports := make(map[uint32]struct{})
	for _, connection := range connections {
		if connection.Laddr.Port > 0 {
			ports[connection.Laddr.Port] = struct{}{}
		}
	}

	return len(ports), nil
}

func collectUptimeSeconds() (uint64, error) {
	uptime, err := host.Uptime()
	if err != nil {
		return 0, err
	}

	return uptime, nil
}

// GetProcessList returns the current Windows process list for the frontend.
func (a *App) GetProcessList() ([]processscanner.Info, error) {
	ctx := a.appContext()
	rules, err := a.loadProtectionRules(ctx)
	if err != nil {
		return nil, err
	}

	processes, err := processscanner.ListWithProtector(ctx, rules)
	if err != nil {
		return nil, err
	}

	return a.assignProjects(ctx, processes)
}

// GetProcessDetail returns a single process detail view with ports and recent logs.
func (a *App) GetProcessDetail(pid int) (processdetail.ProcessDetail, error) {
	ctx := a.appContext()
	rules, err := a.loadProtectionRules(ctx)
	if err != nil {
		return processdetail.ProcessDetail{}, err
	}

	snapshot, err := processdetail.ReadProcessSnapshot(ctx, int32(pid), rules)
	if err != nil {
		return processdetail.ProcessDetail{}, err
	}

	ports, portsError := a.processDetailPorts(ctx, rules)
	logs, logsError := a.processDetailLogs(ctx, pid, snapshot.ProcessName)

	return processdetail.BuildProcessDetail(snapshot, ports, logs, portsError, logsError), nil
}

// GetPortList returns the current Windows TCP/UDP port occupancy list for the frontend.
func (a *App) GetPortList() ([]portscanner.Info, error) {
	ctx := a.appContext()
	rules, err := a.loadProtectionRules(ctx)
	if err != nil {
		return nil, err
	}

	ports, err := portscanner.ListWithProtector(ctx, rules)
	if err != nil {
		return nil, err
	}

	return ports, nil
}

func (a *App) processDetailPorts(ctx context.Context, rules config.ProtectionRules) ([]portscanner.Info, string) {
	ports, err := portscanner.ListWithProtector(ctx, rules)
	if err != nil {
		return nil, "Unable to load occupied ports for this process: " + err.Error()
	}

	return ports, ""
}

func (a *App) processDetailLogs(ctx context.Context, pid int, processName string) ([]config.OperationLog, string) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return nil, "Unable to open operation log store: " + err.Error()
	}
	defer store.Close()

	logs, err := store.GetRecentOperationLogsForProcess(ctx, pid, processName, processdetail.RecentLogLimit())
	if err != nil {
		return nil, "Unable to load recent operation logs: " + err.Error()
	}

	return logs, ""
}

// KillProcessByPID ends a non-protected process by PID and returns an operation result.
func (a *App) KillProcessByPID(pid int, createdAt int64) processscanner.OperationResult {
	ctx := a.appContext()
	rules, err := a.loadProtectionRules(ctx)
	if err != nil {
		result := processscanner.OperationResult{
			Success: false,
			Message: "Unable to load process protection rules before ending process: " + err.Error(),
			PID:     pid,
		}
		return a.recordOperationLog(ctx, "kill_process_by_pid", 0, result)
	}

	result := processscanner.KillConfirmedByPIDWithProtector(ctx, pid, createdAt, rules)
	return a.recordOperationLog(ctx, "kill_process_by_pid", 0, result)
}

// KillProcessByPort resolves a port owner and ends the owning process if it is allowed.
func (a *App) KillProcessByPort(port int, protocol string, expectedPID int, createdAt int64) processscanner.OperationResult {
	ctx := a.appContext()
	rules, err := a.loadProtectionRules(ctx)
	if err != nil {
		result := processscanner.OperationResult{
			Success: false,
			Message: "Unable to load process protection rules before ending port occupancy: " + err.Error(),
		}
		return a.recordOperationLog(ctx, "kill_process_by_port", port, result)
	}

	result := portscanner.KillConfirmedProcessByPortWithProtector(ctx, port, protocol, expectedPID, createdAt, rules)
	return a.recordOperationLog(ctx, "kill_process_by_port", port, result)
}

// GetProtectionSettings returns the built-in and user-managed protected process names.
func (a *App) GetProtectionSettings() (config.ProtectionSettings, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return config.ProtectionSettings{}, err
	}
	defer store.Close()

	return store.GetProtectionSettings(a.appContext())
}

// AddCustomProtectedProcessName adds a user-managed protected process name.
func (a *App) AddCustomProtectedProcessName(name string) (config.ProtectionSettings, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return config.ProtectionSettings{}, err
	}
	defer store.Close()

	return store.AddCustomProtectedProcessName(a.appContext(), name)
}

// DeleteCustomProtectedProcessName removes a user-managed protected process name.
func (a *App) DeleteCustomProtectedProcessName(name string) (config.ProtectionSettings, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return config.ProtectionSettings{}, err
	}
	defer store.Close()

	return store.DeleteCustomProtectedProcessName(a.appContext(), name)
}

// GetCleanupRules returns built-in and user-managed cleanup matching rules.
func (a *App) GetCleanupRules() ([]config.CleanupRule, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()

	return store.GetCleanupRules(a.appContext())
}

// AddCleanupRule adds a user-managed cleanup matching rule.
func (a *App) AddCleanupRule(input config.CleanupRuleInput) ([]config.CleanupRule, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()

	return store.AddCleanupRule(a.appContext(), input)
}

// SetCleanupRuleEnabled enables or disables a cleanup matching rule.
func (a *App) SetCleanupRuleEnabled(id string, enabled bool) ([]config.CleanupRule, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()

	return store.SetCleanupRuleEnabled(a.appContext(), id, enabled)
}

// DeleteCleanupRule removes a user-managed cleanup matching rule.
func (a *App) DeleteCleanupRule(id string) ([]config.CleanupRule, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()

	return store.DeleteCleanupRule(a.appContext(), id)
}

// GetOperationLogs returns persisted process operation logs ordered newest first.
func (a *App) GetOperationLogs() ([]config.OperationLog, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()

	return store.GetOperationLogs(a.appContext())
}

// GetRecentOperationLogsForResource returns bounded logs related to one detail target.
func (a *App) GetRecentOperationLogsForResource(pid int, processName string, ports []int) ([]config.OperationLog, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()

	return store.GetRecentOperationLogsForResource(a.appContext(), pid, processName, ports, processdetail.RecentLogLimit())
}

func (a *App) appContext() context.Context {
	if a.ctx == nil {
		return context.Background()
	}

	return a.ctx
}

func (a *App) loadProtectionRules(ctx context.Context) (config.ProtectionRules, error) {
	store, err := config.NewDefaultStore()
	if err != nil {
		return config.ProtectionRules{}, err
	}
	defer store.Close()

	rules, err := store.LoadProtectionRules(ctx)
	if err != nil {
		return config.ProtectionRules{}, err
	}

	return rules, nil
}

func (a *App) recordOperationLog(ctx context.Context, action string, port int, result processscanner.OperationResult) processscanner.OperationResult {
	store, err := config.NewDefaultStore()
	if err != nil {
		return appendOperationLogError(result, err)
	}
	defer store.Close()

	logResult := "failure"
	if result.Success {
		logResult = "success"
	}

	err = store.AddOperationLog(ctx, config.OperationLogInput{
		Action:      action,
		PID:         result.PID,
		ProcessName: result.ProcessName,
		Port:        port,
		Result:      logResult,
		Message:     result.Message,
	})
	if err != nil {
		return appendOperationLogError(result, err)
	}

	return result
}

func appendOperationLogError(result processscanner.OperationResult, err error) processscanner.OperationResult {
	if err == nil {
		return result
	}

	baseMessage := strings.TrimSpace(result.Message)
	if result.Success {
		result.Partial = true
	}
	logMessage := fmt.Sprintf("Operation log write failed: %v", err)
	if baseMessage == "" {
		result.Message = logMessage
		return result
	}

	result.Message = baseMessage + " " + logMessage
	return result
}
