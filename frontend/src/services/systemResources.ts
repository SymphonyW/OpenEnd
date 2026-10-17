import {GetSystemResourceInfo} from '../../wailsjs/go/main/App';
import type {SystemResourceInfo, ResourceMetric, ResourceStatus} from '../types/systemResources';

const bytesPerMegabyte = 1024 * 1024;
const bytesPerGigabyte = bytesPerMegabyte * 1024;

export function loadSystemResourceInfo(): Promise<SystemResourceInfo> {
    return GetSystemResourceInfo();
}

export function formatMemorySize(bytes: number): string {
    if (bytes <= 0) {
        return '0 MB';
    }

    if (bytes >= bytesPerGigabyte) {
        return `${(bytes / bytesPerGigabyte).toFixed(1)} GB`;
    }

    if (bytes < bytesPerMegabyte) {
        return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    }

    return `${(bytes / bytesPerMegabyte).toFixed(1)} MB`;
}

export function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}

export function isHighMemoryUsage(bytes: number): boolean {
    return bytes >= bytesPerGigabyte;
}

const metricFields: Record<ResourceMetric, (keyof SystemResourceInfo)[]> = {
    cpu: ['cpuPercent'], cpuInfo: ['cpuName', 'cpuPhysicalCores', 'cpuLogicalProcessors', 'cpuMaxMHz'],
    memory: ['usedMemoryBytes', 'freeMemoryBytes', 'totalMemoryBytes'], gpu: ['gpuPercent', 'gpuNames'],
    vram: ['usedVRAMBytes', 'freeVRAMBytes', 'totalVRAMBytes'], processes: ['processCount'], threads: ['threadCount'], ports: ['portCount'], uptime: ['uptimeSeconds'],
};
export function resourceStatus(info: SystemResourceInfo, key: ResourceMetric): ResourceStatus {
    return info.metrics?.[key] ?? {state: info.metrics ? 'unavailable' : 'ready', updatedAt: 0, error: ''};
}
export function mergeResourceInfo(previous: SystemResourceInfo | null, next: SystemResourceInfo): SystemResourceInfo {
    const merged = {...next, metrics: next.metrics ? {...next.metrics} : undefined};
    for (const key of Object.keys(metricFields) as ResourceMetric[]) {
        const status = resourceStatus(next, key);
        const old = previous ? resourceStatus(previous, key) : null;
        if (status.state !== 'ready' && previous && old && (old.state === 'ready' || old.state === 'stale')) {
            for (const field of metricFields[key]) Object.assign(merged, {[field]: previous[field]});
            (merged.metrics ??= {})[key] = {...status, state: 'stale', updatedAt: old.updatedAt};
        }
    }
    return merged;
}
