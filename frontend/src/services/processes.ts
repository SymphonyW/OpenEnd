import {GetProcessDetail, GetProcessList, KillProcessByPID} from '../../wailsjs/go/main/App';
import type {OperationResult, ProcessDetail, ProcessInfo} from '../types/processes';

export function loadProcessList(): Promise<ProcessInfo[]> {
    return GetProcessList();
}

export function loadProcessDetail(pid: number): Promise<ProcessDetail> {
    return GetProcessDetail(pid);
}

export function killProcessByPID(pid: number, createdAt: number): Promise<OperationResult> {
    return KillProcessByPID(pid, createdAt);
}
