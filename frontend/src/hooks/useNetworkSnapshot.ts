import {useCallback, useState} from 'react';
import {useSequentialAutoRefresh} from './useSequentialAutoRefresh';
import {loadNetworkSnapshot} from '../services/network';
import type {NetworkSnapshot} from '../types/network';

export function useNetworkSnapshot() {
    const [snapshot, setSnapshot] = useState<NetworkSnapshot | null>(null);
    const [failed, setFailed] = useState(false);
    const load = useCallback(async () => {
        try { setSnapshot(await loadNetworkSnapshot()); setFailed(false); }
        catch { setFailed(true); }
    }, []);
    useSequentialAutoRefresh(load, 1000);
    return {snapshot, failed};
}
