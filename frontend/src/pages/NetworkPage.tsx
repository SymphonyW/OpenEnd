import {Fragment, useState} from 'react';
import ScrollableDataTable from '../components/ScrollableDataTable';
import StatusMessage from '../components/StatusMessage';
import OwnershipIcon from '../components/OwnershipIcon';
import ProcessNameCell from '../components/ProcessNameCell';
import {useNetworkSnapshot} from '../hooks/useNetworkSnapshot';
import {formatRate, formatTraffic, networkGroups, networkMessage, trafficValue} from '../services/network';
import type {NetworkSort} from '../services/network';
import type {TrafficCounters} from '../types/network';
import type {Translator} from '../services/i18n';
import type {PageDefinition} from '../types/navigation';

export default function NetworkPage({page, t}: {page: PageDefinition; t: Translator}) {
    const {snapshot, failed} = useNetworkSnapshot();
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<NetworkSort>('total');
    const [local, setLocal] = useState(false);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const query = search.trim().toLowerCase();
    const groups = networkGroups(snapshot?.processes ?? [], sort, local).filter(group => trafficValue(group, 'total', local) > 0).filter(group =>
        !query || `${group.name} ${group.path}`.toLowerCase().includes(query)
        || group.rows.some(row => `${row.name} ${row.pid} ${row.commandLine}`.toLowerCase().includes(query)));
    const available = !!snapshot && snapshot.startedAt > 0;
    const stale = failed || snapshot?.state === 'stale';
    const message = failed ? t('network.loadError') : networkMessage(snapshot, t);
    const cells = (row: TrafficCounters) => {
        const download = local ? row.localDownloadBytes : row.downloadBytes;
        const upload = local ? row.localUploadBytes : row.uploadBytes;
        return <><td className="network-number">{formatTraffic(download)}</td><td className="network-number">{formatTraffic(upload)}</td>
            <td className="network-number">{formatTraffic(download + upload)}</td>
            <td className="network-number">{stale || local ? '—' : formatRate(row.downloadRate)}</td><td className="network-number">{stale || local ? '—' : formatRate(row.uploadRate)}</td></>;
    };
    return <section className="page-panel process-page network-page" aria-label={page.title}>
        <div className="resource-toolbar">
            <label className="filter-field"><span>{t('network.search')}</span><input value={search} onChange={event => setSearch(event.target.value)} aria-label={t('network.search')}/></label>
            <label className="filter-field"><span>{t('network.scope')}</span><select value={local ? 'local' : 'network'} onChange={event => { setLocal(event.target.value === 'local'); if (sort === 'rate') setSort('total'); }}>
                <option value="network">{t('network.external')}</option><option value="local">{t('network.local')}</option>
            </select></label>
            <label className="filter-field"><span>{t('network.sort')}</span><select value={sort} onChange={event => setSort(event.target.value as NetworkSort)}>
                <option value="total">{t('network.total')}</option><option value="download">{t('network.download')}</option><option value="upload">{t('network.upload')}</option>
                {!local && <option value="rate">{t('network.rate')}</option>}
            </select></label>
        </div>
        <p className="network-session-note">{t('network.sessionNote')}{snapshot?.startedAt ? ` · ${t('network.startedAt')} ${new Date(snapshot.startedAt).toLocaleTimeString()}` : ''}</p>
        {message && <StatusMessage variant={snapshot?.state === 'collecting' || !snapshot && !failed ? 'loading' : 'warning'}>{message}</StatusMessage>}
        {!!snapshot && (snapshot.eventsLost > 0 || snapshot.buffersLost > 0) && <StatusMessage variant="warning">{t('network.eventsLost')}</StatusMessage>}
        {!!snapshot?.unparsedEvents && <StatusMessage variant="warning">{t('network.unparsedEvents')}</StatusMessage>}
        {!!snapshot?.attributionError && <StatusMessage variant="warning">{t('network.attributionError')}</StatusMessage>}
        {stale && available && <StatusMessage variant="warning">{t('resource.stale')}</StatusMessage>}
        {available && <>
            <dl className="network-totals">
                <div><dt>{t('network.download')}</dt><dd>{formatTraffic(local ? snapshot.localDownloadBytes : snapshot.downloadBytes)}</dd></div>
                <div><dt>{t('network.upload')}</dt><dd>{formatTraffic(local ? snapshot.localUploadBytes : snapshot.uploadBytes)}</dd></div>
                <div><dt>{t('network.total')}</dt><dd>{formatTraffic(local ? snapshot.localDownloadBytes + snapshot.localUploadBytes : snapshot.downloadBytes + snapshot.uploadBytes)}</dd></div>
            </dl>
            {groups.length === 0 ? <StatusMessage variant="empty">{t('network.empty')}</StatusMessage> : <ScrollableDataTable scrollbarLabel={t('network.table')}>
                <table className="process-table network-table" aria-label={t('network.table')}>
                    <colgroup><col style={{width: '40%'}}/>{[0, 1, 2, 3, 4].map(index => <col key={index} style={{width: '12%'}}/>)}</colgroup>
                    <thead><tr><th>{t('projects.project')}</th><th>{t('network.download')}</th><th>{t('network.upload')}</th><th>{t('network.total')}</th><th>{t('network.downloadRate')}</th><th>{t('network.uploadRate')}</th></tr></thead>
                    <tbody>{groups.map(group => <Fragment key={group.key}>
                        <tr className="network-group"><td><button type="button" className="network-expand" aria-expanded={expanded.has(group.key)} onClick={() => setExpanded(current => {
                            const next = new Set(current); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next;
                        })}><span aria-hidden="true">{expanded.has(group.key) ? '▾' : '▸'}</span>
                            <OwnershipIcon kind={group.kind} iconDataURL={group.iconDataURL} name={group.name || t('projects.ungrouped')}/>
                            <span className="network-group-identity"><span>{group.name || t('projects.ungrouped')} <small>{group.rows.length} {t('network.processes')}</small></span>
                                <span className="network-path" title={group.path}>{group.kind === 'project' ? t('projects.kindProject') : group.kind === 'application' ? t('projects.kindApplication') : ''}{group.path ? ` · ${group.path}` : ''}</span>
                            </span></button></td>{cells(group)}</tr>
                        {expanded.has(group.key) && group.rows.map(row => <tr key={row.id}><td className="network-process" title={row.commandLine || row.path}>
                            <span className="network-process-identity"><ProcessNameCell iconDataURL={row.iconDataURL} name={row.name} fallbackName={t('common.unavailable')}/>
                                <small>PID {row.pid} · {row.exited ? t('network.exited') : t('network.running')}</small></span>
                        </td>{cells(row)}</tr>)}
                    </Fragment>)}</tbody>
                </table>
            </ScrollableDataTable>}
        </>}
    </section>;
}
