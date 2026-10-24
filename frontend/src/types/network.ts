import type {ProcessInfo} from './processes';
import type {ResourceState} from './systemResources';

export interface TrafficCounters {
    downloadBytes: number;
    uploadBytes: number;
    localDownloadBytes: number;
    localUploadBytes: number;
    downloadRate: number;
    uploadRate: number;
}
export interface NetworkProcess extends ProcessInfo, TrafficCounters { id: number; exited: boolean; }
export interface NetworkSample { time: number; downloadRate: number; uploadRate: number; }
export interface NetworkSnapshot extends TrafficCounters {
    state: ResourceState;
    error: string;
    attributionError: string;
    startedAt: number;
    updatedAt: number;
    eventsLost: number;
    buffersLost: number;
    unparsedEvents: number;
    processes: NetworkProcess[];
    history: NetworkSample[];
}
