import {useId, useState} from 'react';
import StatusMessage from './StatusMessage';
import {formatRate, formatTraffic, networkMessage} from '../services/network';
import type {NetworkSnapshot} from '../types/network';
import type {Translator} from '../services/i18n';

export function NetworkChart({snapshot, failed = false, mini = false, t}: {snapshot: NetworkSnapshot | null; failed?: boolean; mini?: boolean; t: Translator}) {
    const [hover, setHover] = useState<number | null>(null);
    const hint = useId();
    const history = snapshot?.history ?? [];
    const end = history[history.length - 1]?.time ?? 0;
    const start = end - 60_000;
    const samples = history.filter(sample => sample.time >= start);
    const peak = Math.max(1024, ...samples.flatMap(sample => [sample.downloadRate, sample.uploadRate]));
    const ceiling = 2 ** Math.ceil(Math.log2(peak));
    const x = (time: number) => (time - start) / 60_000 * 100;
    const y = (rate: number) => 100 - Math.min(100, rate / ceiling * 100);
    const active = hover === null ? null : samples[Math.min(hover, samples.length - 1)];
    const lines = <>{(['downloadRate', 'uploadRate'] as const).map(key => <g key={key} className={key === 'uploadRate' ? 'network-upload-line' : 'network-download-line'}>
        <polyline points={samples.map(sample => `${x(sample.time)},${y(sample[key])}`).join(' ')}/>
        {samples.length === 1 && <line x1="99.3" x2="100" y1={y(samples[0][key])} y2={y(samples[0][key])}/>}
    </g>)}</>;
    if (mini) return <svg className="resource-mini-chart network-mini-chart" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{lines}</svg>;
    return <div className="performance-chart">
        <div className="performance-chart-label"><span>{t('network.rate')}</span><span>{formatRate(ceiling)}</span></div>
        <div className={`performance-chart-frame${failed || snapshot?.state === 'stale' ? ' network-chart-stale' : ''}`}>
            <svg className="performance-graph network-graph" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" tabIndex={0} aria-label={t('network.chartAria')} aria-describedby={hint}
                onMouseMove={event => {
                    if (!samples.length) return;
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const target = (event.clientX - bounds.left) / (bounds.width || 100) * 100;
                    setHover(samples.reduce((best, sample, index) => Math.abs(x(sample.time) - target) < Math.abs(x(samples[best].time) - target) ? index : best, 0));
                }} onMouseLeave={() => setHover(null)} onFocus={() => setHover(samples.length - 1)} onBlur={() => setHover(null)}
                onKeyDown={event => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    setHover(current => Math.max(0, Math.min(samples.length - 1, (current ?? samples.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
                }}>
                <g className="performance-grid">
                    {[20, 40, 60, 80].map(value => <line key={`h${value}`} x1="0" x2="100" y1={value} y2={value}/>)}
                    {[10, 20, 30, 40, 50, 60, 70, 80, 90].map(value => <line key={`v${value}`} y1="0" y2="100" x1={value} x2={value}/>)}
                </g>
                {lines}
                {active && <line className="performance-crosshair" x1={x(active.time)} x2={x(active.time)} y1="0" y2="100"/>}
            </svg>
            {samples.length === 0 && <span className="performance-chart-status">{snapshot?.state === 'ready' ? t('dashboard.chart.firstSample') : networkMessage(snapshot, t) || t('resource.unavailable')}</span>}
            {active && <output className="chart-hover-tooltip">{new Date(active.time).toLocaleTimeString()} · {t('network.downloadRate')} {formatRate(active.downloadRate)} · {t('network.uploadRate')} {formatRate(active.uploadRate)}</output>}
        </div>
        <div className="performance-chart-label"><span>{t('dashboard.chart.sixtySeconds')}</span><span>{t('dashboard.chart.now')}</span></div>
        <p className="network-legend"><span className="network-download-key">{t('network.downloadRate')}</span><span className="network-upload-key">{t('network.uploadRate')}</span></p>
        <span className="visually-hidden" id={hint}>{t('dashboard.chart.keyboardHint')}</span>
    </div>;
}

export function NetworkPerformance({snapshot, failed, t}: {snapshot: NetworkSnapshot | null; failed: boolean; t: Translator}) {
    const message = failed ? t('network.loadError') : networkMessage(snapshot, t);
    const available = !!snapshot?.startedAt;
    const ready = !failed && snapshot?.state === 'ready';
    return <div className="performance-main">
        <div className="performance-heading"><h2>{t('page.network.label')}</h2><span>{t('network.external')}</span></div>
        <NetworkChart snapshot={snapshot} failed={failed} t={t}/>
        <dl className="performance-metrics">
            <div><dt>{t('network.downloadRate')}</dt><dd>{ready ? formatRate(snapshot.downloadRate) : t('resource.unavailable')}</dd></div>
            <div><dt>{t('network.uploadRate')}</dt><dd>{ready ? formatRate(snapshot.uploadRate) : t('resource.unavailable')}</dd></div>
            <div><dt>{t('network.download')}</dt><dd>{available ? formatTraffic(snapshot.downloadBytes) : t('resource.unavailable')}</dd></div>
            <div><dt>{t('network.upload')}</dt><dd>{available ? formatTraffic(snapshot.uploadBytes) : t('resource.unavailable')}</dd></div>
        </dl>
        {!!snapshot?.updatedAt && <p className="resource-updated-at">{t('dashboard.lastUpdated')}: {new Date(snapshot.updatedAt).toLocaleTimeString()}</p>}
        {message && <StatusMessage variant="warning">{message}</StatusMessage>}
        {!!snapshot && (snapshot.eventsLost > 0 || snapshot.buffersLost > 0) && <StatusMessage variant="warning">{t('network.eventsLost')}</StatusMessage>}
        {!!snapshot?.unparsedEvents && <StatusMessage variant="warning">{t('network.unparsedEvents')}</StatusMessage>}
        {(failed || snapshot?.state === 'stale') && available && <StatusMessage variant="warning">{t('resource.stale')}</StatusMessage>}
    </div>;
}
