import OwnershipIcon from './OwnershipIcon';
import {formatTraffic, trafficValue} from '../services/network';
import type {networkGroups} from '../services/network';
import type {NetworkSnapshot} from '../types/network';
import type {Translator} from '../services/i18n';

const percent = (value: number, total: number) => total <= 0 ? '—' : value > 0 && value / total < .001 ? '<0.1%' : `${(value / total * 100).toFixed(1)}%`;

export default function NetworkTrafficCharts({snapshot, groups, local, filtered, t}: {
    snapshot: NetworkSnapshot; groups: ReturnType<typeof networkGroups>; local: boolean; filtered: boolean; t: Translator;
}) {
    const download = filtered ? groups.reduce((sum, group) => sum + trafficValue(group, 'download', local), 0) : trafficValue(snapshot, 'download', local);
    const upload = filtered ? groups.reduce((sum, group) => sum + trafficValue(group, 'upload', local), 0) : trafficValue(snapshot, 'upload', local);
    const total = download + upload;
    const downloadShare = total > 0 ? download / total * 100 : 0;
    const ranked = [...groups].sort((a, b) => trafficValue(b, 'total', local) - trafficValue(a, 'total', local) || a.name.localeCompare(b.name));
    const leaders = ranked.slice(0, 5);
    const others = ranked.slice(5).reduce((sum, group) => sum + trafficValue(group, 'total', local), 0);
    const directionLabel = `${t('network.direction')}: ${t('network.download')} ${formatTraffic(download)} (${percent(download, total)}), ${t('network.upload')} ${formatTraffic(upload)} (${percent(upload, total)})`;

    return <div className="network-visuals">
        <figure className="network-direction">
            <figcaption className="network-chart-heading"><h3>{t('network.direction')}</h3><span>{filtered ? t('network.filteredTraffic') : t('network.allTraffic')}</span></figcaption>
            <div className="network-direction-body">
                <div className="network-donut">
                    <svg viewBox="0 0 120 120" role="img" aria-label={directionLabel}>
                        <circle className="network-donut-track" cx="60" cy="60" r="50"/>
                        {total > 0 && <g transform="rotate(-90 60 60)" fill="none" strokeWidth="10">
                            <circle className="network-download-arc" cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${downloadShare} ${100 - downloadShare}`}/>
                            <circle className="network-upload-arc" cx="60" cy="60" r="50" pathLength="100" strokeDasharray={`${100 - downloadShare} ${downloadShare}`} strokeDashoffset={-downloadShare}/>
                        </g>}
                    </svg>
                    <dl className="network-donut-total"><dt>{t('network.total')}</dt><dd>{formatTraffic(total)}</dd></dl>
                </div>
                <dl className="network-totals">
                    <div className="network-download-total"><dt><span className="network-direction-key"/>{t('network.download')} <small>{percent(download, total)}</small></dt><dd>{formatTraffic(download)}</dd></div>
                    <div className="network-upload-total"><dt><span className="network-direction-key"/>{t('network.upload')} <small>{percent(upload, total)}</small></dt><dd>{formatTraffic(upload)}</dd></div>
                </dl>
            </div>
        </figure>
        <figure className="network-ranking">
            <figcaption className="network-chart-heading"><h3>{t('network.ranking')}</h3><span>{t('network.rankingNote')}</span></figcaption>
            {leaders.length === 0 ? <p className="network-ranking-empty">{t('network.empty')}</p> : <ol className="network-rank-list" aria-label={t('network.ranking')}>
                {leaders.map(group => {
                    const down = trafficValue(group, 'download', local);
                    const up = trafficValue(group, 'upload', local);
                    const name = group.name || t('projects.ungrouped');
                    const detail = `${t('network.download')} ${formatTraffic(down)} · ${t('network.upload')} ${formatTraffic(up)}`;
                    return <li key={group.key} tabIndex={0} aria-label={`${name}: ${formatTraffic(down + up)}, ${percent(down + up, total)}. ${detail}. ${group.path}`}>
                        <span className="network-rank-icon" aria-hidden="true"><OwnershipIcon kind={group.kind} iconDataURL={group.iconDataURL} name={name}/></span>
                        <span className="network-rank-name">{name}</span><span className="network-rank-value">{formatTraffic(down + up)}</span><span className="network-rank-share">{percent(down + up, total)}</span>
                        <span className="network-rank-bar" aria-hidden="true"><i className="network-download-bar" style={{width: `${total > 0 ? down / total * 100 : 0}%`}}/><i className="network-upload-bar" style={{width: `${total > 0 ? up / total * 100 : 0}%`}}/></span>
                        <span className="network-rank-tooltip" aria-hidden="true">{detail}{group.path && <small>{group.path}</small>}</span>
                    </li>;
                })}
            </ol>}
            <div className="network-ranking-footer">
                <span className="network-ranking-legend"><span><i className="network-download-bar"/>{t('network.download')}</span><span><i className="network-upload-bar"/>{t('network.upload')}</span></span>
                {others > 0 && <span className="network-rank-others">{t('network.otherGroups')} · {formatTraffic(others)} · {percent(others, total)}</span>}
            </div>
        </figure>
    </div>;
}
