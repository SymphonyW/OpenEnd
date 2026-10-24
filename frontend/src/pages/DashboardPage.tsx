import {useCallback, useRef, useState} from 'react';
import type {MouseEvent, ReactNode} from 'react';
import StatusMessage from '../components/StatusMessage';
import {NetworkChart, NetworkPerformance} from '../components/NetworkChart';
import {useNetworkSnapshot} from '../hooks/useNetworkSnapshot';
import {formatRate} from '../services/network';
import {useSequentialAutoRefresh} from '../hooks/useSequentialAutoRefresh';
import {formatMemorySize, formatPercent, loadSystemResourceInfo, mergeResourceInfo, resourceStatus} from '../services/systemResources';
import type {Translator} from '../services/i18n';
import type {PageDefinition} from '../types/navigation';
import type {SystemResourceInfo, ResourceMetric, ResourceStatus} from '../types/systemResources';
import './DashboardPage.css';

const refreshInterval = 1000;
const historyWindow = 60_000;
const maxHistorySamples = 61;
type ResourceKey = 'cpu' | 'memory' | 'gpu' | 'vram';
interface Sample { time: number; cpu: number | null; memory: number | null; gpu: number | null; vram: number | null; }
interface Props { page: PageDefinition; t: Translator; }

const percent = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
const ratio = (used: number, total: number) => total > 0 ? percent(used / total * 100) : 0;

interface Metric {
    label: string;
    value: ReactNode;
}

function graphPoints(history: Sample[], key: ResourceKey) {
    // Metrics become available independently. Leading pending samples are not
    // gaps in an otherwise valid series, and must not suppress its area fill.
    const first = history.findIndex(sample => sample[key] !== null);
    if (first < 0) return [];
    const samples = history.slice(first);
    const start = samples[0].time;
    const end = history[history.length - 1]?.time ?? 0;
    return samples.flatMap((sample, index) => {
        const value = sample[key];
        return value === null ? [] : [{time: sample.time, x: end > start ? percent((sample.time - start) / (end - start) * 100) : 100, y: 100 - value, value, gap: index > 0 && samples[index - 1][key] === null}];
    });
}
function graphSegments(points: ReturnType<typeof graphPoints>) {
    const segments: typeof points[] = [];
    for (const point of points) {
        if (!segments.length || point.gap) segments.push([]);
        segments[segments.length - 1].push(point);
    }
    return segments;
}

function ResourceLines({points, filled = false}: {points: ReturnType<typeof graphPoints>; filled?: boolean}) {
    return <>{graphSegments(points).map((segment, index) => {
        const first = segment[0];
        const last = segment[segment.length - 1];
        const coordinates = segment.map(point => point.x + ',' + point.y).join(' ');
        return <g key={index}>
            {filled && segment.length > 1 && <path className="performance-area"
                d={`M${first.x},100 L${coordinates.replaceAll(' ', ' L')} L${last.x},100 Z`}/>}
            <polyline className={filled ? 'performance-line' : undefined} points={coordinates}/>
            {segment.length === 1 && <line className={filled ? 'performance-line' : undefined}
                x1={Math.max(0, first.x - 0.6)} x2={Math.min(100, first.x + 0.6)} y1={first.y} y2={first.y}/>}
        </g>;
    })}</>;
}

function DashboardPage({page, t}: Props) {
	const network = useNetworkSnapshot();
    const infoRef = useRef<SystemResourceInfo | null>(null);
    const [info, setInfo] = useState<SystemResourceInfo | null>(null);
    const [history, setHistory] = useState<Sample[]>([]);
    const [selected, setSelected] = useState<ResourceKey | 'network'>('cpu');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        try {
            const next = mergeResourceInfo(infoRef.current, await loadSystemResourceInfo());
            infoRef.current = next;
            const sample: Sample = {
                time: Date.now(),
                cpu: resourceStatus(next, 'cpu').state === 'ready' ? percent(next.cpuPercent) : null,
                memory: resourceStatus(next, 'memory').state === 'ready' ? ratio(next.usedMemoryBytes, next.totalMemoryBytes) : null,
                gpu: resourceStatus(next, 'gpu').state === 'ready' ? percent(next.gpuPercent) : null,
                vram: resourceStatus(next, 'vram').state === 'ready' ? ratio(next.usedVRAMBytes, next.totalVRAMBytes) : null,
            };
            setInfo(next);
            setHistory(current => [...current.filter(item => item.time >= sample.time - historyWindow), sample].slice(-maxHistorySamples));
            setError('');
        } catch {
            const previous = infoRef.current;
            if (previous) {
                const metrics = {...previous.metrics};
                for (const key of Object.keys(metrics) as ResourceMetric[]) {
                    const status = metrics[key]!;
                    if (status.state === 'ready') metrics[key] = {...status, state: 'stale', error: t('dashboard.error')};
                }
                infoRef.current = {...previous, metrics};
                setInfo(infoRef.current);
                const time = Date.now();
                setHistory(current => [...current.filter(item => item.time >= time - historyWindow), {time, cpu: null, memory: null, gpu: null, vram: null}].slice(-maxHistorySamples));
            }
            setError(t('dashboard.error'));
        } finally {
            setLoading(false);
        }
    }, [t]);
    useSequentialAutoRefresh(load, refreshInterval, {runInBackground: true});

    const resources = [
        {key: 'cpu' as const, title: t('dashboard.chart.cpu'), aria: t('dashboard.chart.cpuAria')},
        {key: 'memory' as const, title: t('dashboard.chart.memory'), aria: t('dashboard.chart.memoryAria')},
        {key: 'gpu' as const, title: t('dashboard.chart.gpu'), aria: t('dashboard.chart.gpuAria')},
        {key: 'vram' as const, title: t('dashboard.chart.vram'), aria: t('dashboard.chart.vramAria')},
    ];
    const active = resources.find(resource => resource.key === selected)!;
    const subtitle = info && selected !== 'network' ? resourceSubtitle(info, selected, t) : t('dashboard.autoRefresh');
    const metrics = info && selected !== 'network' ? buildMetrics(info, selected, resourceUsage(info, selected), t) : [];

    return (
        <section className="page-panel dashboard-page" aria-label={page.title}>
            {error && <StatusMessage variant="error">{error}</StatusMessage>}
            {loading && !info && <StatusMessage variant="loading">{t('dashboard.loading')}</StatusMessage>}
            {info && <div className="performance-workspace">
                <div className="resource-selector" role="group" aria-label={t('dashboard.resources')}>
                    {resources.map(resource => {
                        const points = graphPoints(history, resource.key);
                        return (
                            <button type="button" className="resource-select" key={resource.key}
                                aria-label={resource.title} aria-pressed={selected === resource.key}
                                onClick={() => setSelected(resource.key)}>
                                <svg className="resource-mini-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                                    <ResourceLines points={points}/>
                                </svg>
                                <span className="resource-select-text">
                                    <span className="resource-select-title">{resource.title}</span>
                                    <span className="resource-select-value">{metricValue(info, resource.key, formatPercent(resourceUsage(info, resource.key)), t)}</span>
                                    <span className="resource-select-meta">{resourceSubtitle(info, resource.key, t)}</span>
                                </span>
                            </button>
                        );
                    })}
                    <button type="button" className="resource-select" aria-label={t('page.network.label')} aria-pressed={selected === 'network'} onClick={() => setSelected('network')}>
                        <NetworkChart snapshot={network.snapshot} mini t={t}/>
                        <span className="resource-select-text"><span className="resource-select-title">{t('page.network.label')}</span>
                            <span className="resource-select-value">{!network.failed && network.snapshot?.state === 'ready' ? formatRate(network.snapshot.downloadRate + network.snapshot.uploadRate) : t(network.snapshot?.state === 'collecting' || !network.snapshot ? 'resource.collecting' : 'resource.unavailable')}</span>
                            <span className="resource-select-meta">{t('network.rate')}</span></span>
                    </button>
                </div>
                {selected === 'network' ? <NetworkPerformance snapshot={network.snapshot} failed={network.failed} t={t}/> : <div className="performance-main">
                    <div className="performance-heading">
                        <h2>{active.title}</h2>
                        <span>{subtitle}</span>
                    </div>
                    <ResourceGraph key={selected} history={history} resourceKey={selected} status={resourceStatus(info, selected)} title={active.title} ariaLabel={active.aria} t={t}/>
                    <dl className="performance-metrics">
                        {metrics.map(metric => <div key={metric.label}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
                    </dl>
                    {resourceStatus(info, selected).updatedAt > 0 && <p className="resource-updated-at">{t('dashboard.lastUpdated')}: {new Date(resourceStatus(info, selected).updatedAt).toLocaleTimeString()}</p>}
                    {resourceStatus(info, selected).error && <StatusMessage variant="warning">{resourceStatus(info, selected).error}</StatusMessage>}
                </div>}
            </div>}
        </section>
    );
}

function resourceUsage(info: SystemResourceInfo, key: ResourceKey): number {
    return key === 'cpu' ? info.cpuPercent : key === 'gpu' ? info.gpuPercent : key === 'memory' ? ratio(info.usedMemoryBytes, info.totalMemoryBytes) : ratio(info.usedVRAMBytes, info.totalVRAMBytes);
}
function metricValue(info: SystemResourceInfo, key: ResourceMetric, value: string, t: Translator): ReactNode {
    const status = resourceStatus(info, key);
    if (status.state === 'collecting') return t('resource.collecting');
    if (status.state === 'unavailable') return t('resource.unavailable');
    const time = status.updatedAt > 0 ? ' · ' + new Date(status.updatedAt).toLocaleTimeString() : '';
    return status.state === 'stale' ? <>{value}<small className="resource-metric-status" title={status.error || undefined}>{t('resource.stale')}{time}</small></> : value;
}

function resourceSubtitle(info: SystemResourceInfo | null, key: ResourceKey, t: Translator): ReactNode {
    if (!info) {
        return t('dashboard.autoRefresh');
    }

    if (key === 'cpu') {
        return info.cpuName || t('common.unavailable');
    }
    if (key === 'memory') {
        return metricValue(info, 'memory', formatMemorySize(info.totalMemoryBytes), t);
    }
    if (key === 'gpu') {
        return formatList(info.gpuNames, t);
    }

    return info.totalVRAMBytes > 0 ? formatMemorySize(info.totalVRAMBytes) : metricValue(info, 'vram', t('common.unavailable'), t);
}

function buildMetrics(info: SystemResourceInfo, key: ResourceKey, usage: number, t: Translator): Metric[] {
    const commonSystemMetrics = [
        {label: t('dashboard.metric.processes'), value: metricValue(info, 'processes', formatWholeNumber(info.processCount), t)},
        {label: t('dashboard.metric.threads'), value: metricValue(info, 'threads', formatWholeNumber(info.threadCount), t)},
        {label: t('dashboard.metric.occupiedPorts'), value: metricValue(info, 'ports', formatWholeNumber(info.portCount), t)},
        {label: t('dashboard.metric.uptime'), value: metricValue(info, 'uptime', formatUptime(info.uptimeSeconds, t), t)},
    ];

    if (key === 'cpu') {
        return [
            {label: t('dashboard.metric.usage'), value: metricValue(info, key, formatPercent(usage), t)},
            {label: t('dashboard.metric.baseSpeed'), value: metricValue(info, 'cpuInfo', formatFrequencyMHz(info.cpuMaxMHz, t), t)},
            {label: t('dashboard.metric.physicalCores'), value: metricValue(info, 'cpuInfo', info.cpuPhysicalCores > 0 ? formatWholeNumber(info.cpuPhysicalCores) : t('common.unavailable'), t)},
            {label: t('dashboard.metric.logicalProcessors'), value: metricValue(info, 'cpuInfo', info.cpuLogicalProcessors > 0 ? formatWholeNumber(info.cpuLogicalProcessors) : t('common.unavailable'), t)},
            ...commonSystemMetrics,
        ];
    }

    if (key === 'memory') {
        return [
            {label: t('dashboard.metric.usage'), value: metricValue(info, key, formatPercent(usage), t)},
            {label: t('dashboard.metric.usedMemory'), value: metricValue(info, 'memory', formatMemorySize(info.usedMemoryBytes), t)},
            {label: t('dashboard.metric.freeMemory'), value: metricValue(info, 'memory', formatMemorySize(info.freeMemoryBytes), t)},
            {label: t('dashboard.metric.totalMemory'), value: metricValue(info, 'memory', formatMemorySize(info.totalMemoryBytes), t)},
            ...commonSystemMetrics.slice(0, 2),
        ];
    }

    if (key === 'gpu') {
        return [
            {label: t('dashboard.metric.usage'), value: metricValue(info, key, formatPercent(usage), t)},
            {label: t('dashboard.metric.gpuModel'), value: formatList(info.gpuNames, t)},
            {label: t('dashboard.metric.usedVRAM'), value: metricValue(info, 'vram', formatMemorySize(info.usedVRAMBytes), t)},
            {label: t('dashboard.metric.totalVRAM'), value: resourceSubtitle(info, 'vram', t)},
        ];
    }

    return [
        {label: t('dashboard.metric.usage'), value: metricValue(info, key, formatPercent(usage), t)},
        {label: t('dashboard.metric.usedVRAM'), value: metricValue(info, 'vram', formatMemorySize(info.usedVRAMBytes), t)},
        {label: t('dashboard.metric.freeVRAM'), value: metricValue(info, 'vram', formatMemorySize(info.freeVRAMBytes), t)},
        {label: t('dashboard.metric.totalVRAM'), value: resourceSubtitle(info, 'vram', t)},
        {label: t('dashboard.metric.gpuModel'), value: formatList(info.gpuNames, t)},
    ];
}

function formatList(values: string[] | null | undefined, t: Translator): string {
    const normalized = (values ?? []).map(value => value.trim()).filter(Boolean);
    return normalized.length > 0 ? normalized.join(', ') : t('common.unavailable');
}

function formatFrequencyMHz(value: number, t: Translator): string {
    if (!Number.isFinite(value) || value <= 0) {
        return t('common.unavailable');
    }

    if (value >= 1000) {
        return `${(value / 1000).toFixed(2)} GHz`;
    }

    return `${Math.round(value)} MHz`;
}

function formatWholeNumber(value: number): string {
    if (!Number.isFinite(value) || value <= 0) {
        return '0';
    }

    return Math.round(value).toLocaleString();
}

function formatUptime(totalSeconds: number, t: Translator): string {
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
        return t('common.unavailable');
    }

    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor(totalSeconds % 86400 / 3600);
    const minutes = Math.floor(totalSeconds % 3600 / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (days > 0) {
        return `${days}:${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
    }

    return `${hours}:${padTime(minutes)}:${padTime(seconds)}`;
}

function padTime(value: number): string {
    return value.toString().padStart(2, '0');
}

function ResourceGraph({history, resourceKey, status, title, ariaLabel, t}: {
    history: Sample[]; resourceKey: ResourceKey; status: ResourceStatus; title: string; ariaLabel: string; t: Translator;
}) {
    const [activeIndex, setActiveIndex] = useState<number | null>(null);
    const points = graphPoints(history, resourceKey);
    const active = activeIndex === null ? null : points[Math.min(activeIndex, points.length - 1)];
    const duration = points.length ? Math.max(0, Math.round(((history[history.length - 1]?.time ?? 0) - points[0].time) / 1000)) : 0;

    const handleMove = (event: MouseEvent<SVGSVGElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / (bounds.width || 100) * 100;
        if (!points.length) return;
        const nearest = points.reduce((best, point, index) => Math.abs(point.x - x) < Math.abs(points[best].x - x) ? index : best, 0);
        setActiveIndex(nearest);
    };

    return (
        <div className="performance-chart">
            <div className="performance-chart-label"><span>{t('dashboard.metric.usage')}</span><span>100%</span></div>
            <div className="performance-chart-frame">
                <svg className="performance-graph" viewBox="0 0 100 100" preserveAspectRatio="none"
                    aria-label={ariaLabel} aria-describedby="chart-keyboard-hint" role="img" tabIndex={0}
                    onMouseMove={handleMove} onMouseLeave={() => setActiveIndex(null)}
                    onFocus={() => setActiveIndex(points.length - 1)} onBlur={() => setActiveIndex(null)}
                    onKeyDown={event => {
                        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                        event.preventDefault();
                        setActiveIndex(current => Math.max(0, Math.min(points.length - 1, (current ?? points.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
                    }}>
                    <g className="performance-grid">
                        {[20, 40, 60, 80].map(value => <line key={'h' + value} x1="0" x2="100" y1={value} y2={value}/>)}
                        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(value => <line key={'v' + value} y1="0" y2="100" x1={value} x2={value}/>)}
                    </g>
                    <ResourceLines points={points} filled/>
                    {active && <line className="performance-crosshair" x1={active.x} x2={active.x} y1="0" y2="100"/>}
                </svg>
                {points.length === 0 && <span className="performance-chart-status">{t(status.state === 'collecting' ? 'resource.collecting' : 'resource.unavailable')}</span>}
                {points.length === 1 && status.state === 'ready' && <span className="performance-chart-status">{t('dashboard.chart.firstSample')}</span>}
                {active && <output className="chart-hover-tooltip">{title} {formatPercent(active.value)}</output>}
            </div>
            <div className="performance-chart-label"><span>{duration >= 60 ? t('dashboard.chart.sixtySeconds') : `${duration} ${t('dashboard.chart.secondsUnit')}`}</span><span>{t('dashboard.chart.now')}</span></div>
            <span className="visually-hidden" id="chart-keyboard-hint">{t('dashboard.chart.keyboardHint')}</span>
        </div>
    );
}

export default DashboardPage;
