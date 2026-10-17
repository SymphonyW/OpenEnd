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
	"openend/internal/resource"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	gopsprocess "github.com/shirou/gopsutil/v3/process"
)

// SystemResourceInfo is the resource snapshot returned to the frontend.
type SystemResourceInfo struct {
	CPUPercent           float64  `json:"cpuPercent"`
	CPUName              string   `json:"cpuName"`
	CPUPhysicalCores     int      `json:"cpuPhysicalCores"`
	CPULogicalProcessors int      `json:"cpuLogicalProcessors"`
	CPUMaxMHz            float64  `json:"cpuMaxMHz"`
	TotalMemoryBytes     uint64   `json:"totalMemoryBytes"`
	UsedMemoryBytes      uint64   `json:"usedMemoryBytes"`
	FreeMemoryBytes      uint64   `json:"freeMemoryBytes"`
	GPUPercent           float64  `json:"gpuPercent"`
	GPUNames             []string `json:"gpuNames"`
	TotalVRAMBytes       uint64   `json:"totalVRAMBytes"`
	UsedVRAMBytes        uint64   `json:"usedVRAMBytes"`
	FreeVRAMBytes        uint64   `json:"freeVRAMBytes"`
	ProcessCount         int      `json:"processCount"`
	ThreadCount          int      `json:"threadCount"`
	PortCount            int      `json:"portCount"`
	UptimeSeconds        uint64   `json:"uptimeSeconds"`
}

// App struct
type App struct {
	ctx context.Context
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
	CPUPercent   func() float64
	CPUInfo      func() cpuResourceInfo
	Memory       func() memoryResourceInfo
	GPU          func() resource.GPUInfo
	ProcessCount func() int
	ThreadCount  func() int
	PortCount    func() int
	Uptime       func() uint64
}

func defaultSystemResourceCollectors() systemResourceCollectors {
	return systemResourceCollectors{
		CPUPercent:   collectCPUPercent,
		CPUInfo:      defaultAsyncSystemResourceCollectors.CPUInfo,
		Memory:       collectMemoryResourceInfo,
		GPU:          defaultAsyncSystemResourceCollectors.GPU,
		ProcessCount: collectProcessCount,
		ThreadCount:  defaultAsyncSystemResourceCollectors.ThreadCount,
		PortCount:    defaultAsyncSystemResourceCollectors.PortCount,
		Uptime:       collectUptimeSeconds,
	}
}

func collectSystemResourceInfo(collectors systemResourceCollectors) SystemResourceInfo {
	var cpuPercent float64
	var cpuInfo cpuResourceInfo
	var memoryInfo memoryResourceInfo
	var gpuInfo resource.GPUInfo
	var processCount int
	var threadCount int
	var portCount int
	var uptimeSeconds uint64
	var waitGroup sync.WaitGroup
	waitGroup.Add(8)

	go func() {
		defer waitGroup.Done()
		if collectors.CPUPercent != nil {
			cpuPercent = collectors.CPUPercent()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.CPUInfo != nil {
			cpuInfo = collectors.CPUInfo()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.Memory == nil {
			return
		}
		memoryInfo = collectors.Memory()
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.GPU == nil {
			return
		}
		gpuInfo = collectors.GPU()
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.ProcessCount != nil {
			processCount = collectors.ProcessCount()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.ThreadCount != nil {
			threadCount = collectors.ThreadCount()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.PortCount != nil {
			portCount = collectors.PortCount()
		}
	}()

	go func() {
		defer waitGroup.Done()
		if collectors.Uptime != nil {
			uptimeSeconds = collectors.Uptime()
		}
	}()

	waitGroup.Wait()
	return SystemResourceInfo{
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

func collectCPUPercent() float64 {
	percentages, err := cpu.Percent(0, false)
	if err != nil || len(percentages) == 0 {
		// TODO: surface CPU collection errors to the frontend diagnostics panel.
		return 0
	}

	return roundOneDecimal(percentages[0])
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

func collectMemoryResourceInfo() memoryResourceInfo {
	memory, err := mem.VirtualMemory()
	if err != nil {
		// TODO: surface memory collection errors to the frontend diagnostics panel.
		return memoryResourceInfo{}
	}

	return memoryResourceInfo{
		TotalBytes: memory.Total,
		UsedBytes:  memory.Used,
		FreeBytes:  memory.Available,
	}
}

func collectProcessCount() int {
	pids, err := gopsprocess.Pids()
	if err != nil {
		// TODO: surface process collection permission errors to the frontend diagnostics panel.
		return 0
	}

	return len(pids)
}

func collectThreadCount() int {
	processes, err := gopsprocess.Processes()
	if err != nil {
		return 0
	}

	var threadCount int32
	for _, process := range processes {
		count, err := process.NumThreads()
		if err == nil && count > 0 {
			threadCount += count
		}
	}

	return int(threadCount)
}

func collectPortCount() int {
	connections, err := net.Connections("inet")
	if err != nil {
		// TODO: surface port collection permission errors to the frontend diagnostics panel.
		return 0
	}

	ports := make(map[uint32]struct{})
	for _, connection := range connections {
		if connection.Laddr.Port > 0 {
			ports[connection.Laddr.Port] = struct{}{}
		}
	}

	return len(ports)
}

func collectUptimeSeconds() uint64 {
	uptime, err := host.Uptime()
	if err != nil {
		return 0
	}

	return uptime
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

	return processes, nil
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
func (a *App) KillProcessByPID(pid int) processscanner.OperationResult {
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

	result := processscanner.KillByPIDWithProtector(ctx, pid, rules)
	return a.recordOperationLog(ctx, "kill_process_by_pid", 0, result)
}

// KillProcessByPort resolves a port owner and ends the owning process if it is allowed.
func (a *App) KillProcessByPort(port int, protocol string) processscanner.OperationResult {
	ctx := a.appContext()
	rules, err := a.loadProtectionRules(ctx)
	if err != nil {
		result := processscanner.OperationResult{
			Success: false,
			Message: "Unable to load process protection rules before ending port occupancy: " + err.Error(),
		}
		return a.recordOperationLog(ctx, "kill_process_by_port", port, result)
	}

	result := portscanner.KillProcessByPortWithProtector(ctx, port, protocol, rules)
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
	logMessage := fmt.Sprintf("Operation log write failed: %v", err)
	if baseMessage == "" {
		result.Message = logMessage
		return result
	}

	result.Message = baseMessage + " " + logMessage
	return result
}
