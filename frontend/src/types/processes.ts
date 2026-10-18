import type {OperationLog} from './logs';

export interface ProcessInfo {
	parentPID?: number;
	workingDirectory?: string;
	workingDirectoryError?: string;
	projectPath?: string;
	projectName?: string;
	projectReason?: string;
	projectRuleSource?: string;
    pid: number;
    createdAt: number;
    name: string;
    iconDataURL: string;
    path: string;
    commandLine: string;
    user: string;
    cpuPercent: number;
    memoryBytes: number;
    isProtected: boolean;
}

export interface ProcessDetailPort {
    port: number;
    protocol: string;
    status: string;
}

export interface ProcessDetail {
    pid: number;
    createdAt: number;
    processName: string;
    iconDataURL: string;
    executablePath: string;
    executablePathError: string;
    commandLine: string;
    commandLineError: string;
    cpuPercent: number;
    memoryBytes: number;
    isProtected: boolean;
    isDeveloperRelated: boolean;
    ports: ProcessDetailPort[];
    portsError: string;
    recentLogs: OperationLog[];
    logsError: string;
}

export interface OperationResult {
    partial?: boolean;
    code?: string;
    success: boolean;
    message: string;
    pid: number;
    processName: string;
}

export type ProcessSortKey = 'memory' | 'cpu';
