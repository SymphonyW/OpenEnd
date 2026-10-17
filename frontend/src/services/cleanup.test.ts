import {describe, expect, it} from 'vitest';
import {buildCleanupCandidates} from './cleanup';
import type {CleanupRule} from '../types/settings';
import type {PortInfo} from '../types/ports';
import type {ProcessInfo} from '../types/processes';

const baseProcess: ProcessInfo = {
    pid: 0,
    createdAt: 1000,
    name: '',
    iconDataURL: '',
    path: '',
    commandLine: '',
    user: '',
    cpuPercent: 0,
    memoryBytes: 0,
    isProtected: false,
};

const rules: CleanupRule[] = [
    {
        id: 'node',
        name: 'Node/Vite',
        enabled: true,
        isBuiltin: true,
        matchProcessNames: ['node.exe'],
        matchCommandKeywords: ['vite'],
        matchPorts: [3000],
        matchPortRanges: [],
    },
    {
        id: 'api',
        name: 'API range',
        enabled: true,
        isBuiltin: false,
        matchProcessNames: [],
        matchCommandKeywords: ['local-api'],
        matchPorts: [],
        matchPortRanges: [
            {start: 9100, end: 9102},
        ],
    },
    {
        id: 'disabled',
        name: 'Disabled',
        enabled: false,
        isBuiltin: false,
        matchProcessNames: ['chrome.exe'],
        matchCommandKeywords: [],
        matchPorts: [],
        matchPortRanges: [],
    },
];

describe('buildCleanupCandidates', () => {
    it('matches enabled cleanup rules by process name command keyword port and port range', () => {
        const processes: ProcessInfo[] = [
            {
                ...baseProcess,
                pid: 100,
                createdAt: 1000,
                name: 'node.exe',
                commandLine: 'node ./node_modules/vite/bin/vite.js',
                memoryBytes: 200,
            },
            {
                ...baseProcess,
                pid: 200,
                createdAt: 1000,
                name: 'worker.exe',
                commandLine: 'worker --local-api',
                memoryBytes: 300,
            },
            {
                ...baseProcess,
                pid: 300,
                createdAt: 1000,
                name: 'svchost.exe',
                memoryBytes: 400,
                isProtected: true,
            },
            {
                ...baseProcess,
                pid: 400,
                createdAt: 1000,
                name: 'chrome.exe',
                memoryBytes: 500,
            },
        ];
        const ports: PortInfo[] = [
            {
                port: 3000,
                protocol: 'TCP',
                status: 'LISTEN',
                pid: 100,
                createdAt: 1000,
                processName: 'node.exe',
                processPath: '',
                isProtected: false,
            },
            {
                port: 9101,
                protocol: 'TCP',
                status: 'LISTEN',
                pid: 200,
                createdAt: 1000,
                processName: 'worker.exe',
                processPath: '',
                isProtected: false,
            },
            {
                port: 3000,
                protocol: 'TCP',
                status: 'LISTEN',
                pid: 300,
                createdAt: 1000,
                processName: 'svchost.exe',
                processPath: '',
                isProtected: true,
            },
        ];

        const candidates = buildCleanupCandidates(processes, ports, rules);

        expect(candidates.map((candidate) => candidate.pid)).toEqual([200, 100]);
        expect(candidates[0].matchedRules).toEqual([
            {
                ruleId: 'api',
                ruleName: 'API range',
                reasons: ['command keyword local-api', 'port 9101 in 9100-9102'],
            },
        ]);
        expect(candidates[1].matchedRules).toEqual([
            {
                ruleId: 'node',
                ruleName: 'Node/Vite',
                reasons: ['process name node.exe', 'command keyword vite', 'port 3000'],
            },
        ]);
    });
});
