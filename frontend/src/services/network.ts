import {GetNetworkSnapshot} from '../../wailsjs/go/main/App';
import {ownershipOf} from './projects';
import type {NetworkProcess, NetworkSnapshot, TrafficCounters} from '../types/network';
import type {Translator, TranslationKey} from './i18n';

export const loadNetworkSnapshot = async (): Promise<NetworkSnapshot> => await GetNetworkSnapshot() as NetworkSnapshot;

export function formatTraffic(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
export const formatRate = (rate: number) => `${formatTraffic(rate)}/s`;

export function networkMessage(snapshot: NetworkSnapshot | null, t: Translator): string {
    if (!snapshot) return t('network.loading');
    if (snapshot.error) {
        const code = snapshot.error.split(':')[0];
        const known: TranslationKey[] = ['network.permission', 'network.unsupported', 'network.startError', 'network.traceStopped'];
        return known.includes(code as TranslationKey) ? t(code as TranslationKey) : t('network.loadError');
    }
    return snapshot.state === 'collecting' ? t('network.loading') : '';
}

export type NetworkSort = 'total' | 'download' | 'upload' | 'rate';
export function trafficValue(row: TrafficCounters, sort: NetworkSort, local = false): number {
    const download = local ? row.localDownloadBytes : row.downloadBytes;
    const upload = local ? row.localUploadBytes : row.uploadBytes;
    return sort === 'download' ? download : sort === 'upload' ? upload : sort === 'rate' ? row.downloadRate + row.uploadRate : download + upload;
}
export function networkGroups(rows: NetworkProcess[], sort: NetworkSort, local = false) {
    const groups = new Map<string, ReturnType<typeof ownershipOf> & TrafficCounters & {rows: NetworkProcess[]}>();
    for (const row of rows) {
        const owner = ownershipOf(row);
        let group = groups.get(owner.key);
        if (!group) {
            group = {...owner, downloadBytes: 0, uploadBytes: 0, localDownloadBytes: 0, localUploadBytes: 0, downloadRate: 0, uploadRate: 0, rows: []};
            groups.set(owner.key, group);
        }
        group.rows.push(row);
        if (!group.iconDataURL) group.iconDataURL = owner.iconDataURL;
        for (const key of ['downloadBytes', 'uploadBytes', 'localDownloadBytes', 'localUploadBytes', 'downloadRate', 'uploadRate'] as const) group[key] += row[key];
    }
    const compare = (a: TrafficCounters, b: TrafficCounters) => trafficValue(b, sort, local) - trafficValue(a, sort, local);
    return [...groups.values()].map(group => ({...group, rows: group.rows.sort(compare)})).sort((a, b) => compare(a, b) || a.name.localeCompare(b.name));
}
