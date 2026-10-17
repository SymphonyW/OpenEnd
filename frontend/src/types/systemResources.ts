export type ResourceState = 'collecting' | 'unavailable' | 'ready' | 'stale';
export interface ResourceStatus { state: ResourceState; updatedAt: number; error: string; }
export type ResourceMetric = 'cpu' | 'cpuInfo' | 'memory' | 'gpu' | 'vram' | 'processes' | 'threads' | 'ports' | 'uptime';
export interface SystemResourceInfo {
    metrics?: Partial<Record<ResourceMetric, ResourceStatus>>;
    cpuPercent: number;
    cpuName: string;
    cpuPhysicalCores: number;
    cpuLogicalProcessors: number;
    cpuMaxMHz: number;
    totalMemoryBytes: number;
    usedMemoryBytes: number;
    freeMemoryBytes: number;
    gpuPercent: number;
    gpuNames: string[] | null;
    totalVRAMBytes: number;
    usedVRAMBytes: number;
    freeVRAMBytes: number;
    processCount: number;
    threadCount: number;
    portCount: number;
    uptimeSeconds: number;
}
