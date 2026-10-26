import {useCallback, useState} from 'react';
import {useSequentialAutoRefresh} from './useSequentialAutoRefresh';
import {loadNetworkSnapshot, loadNetworkSummary} from '../services/network';
import type {NetworkSnapshot} from '../types/network';

export function useNetworkSnapshot(summary = false) {
    const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null);
    const [failed, setFailed] = useState(false);
    const load = useCallback(async () => {
        try { setSnapshot(await (summary ? loadNetworkSummary() : loadNetworkSnapshot())); setFailed(false); }
        catch { setFailed(true); }
    }, [summary]);
    useSequentialAutoRefresh(load, 1000);
    return {snapshot, failed};
}
