import {describe, expect, it} from 'vitest';
import {buildProjectGroups, matchingOwner, projectKey} from './projects';
import type {ProcessInfo} from '../types/processes';
import type {PortInfo} from '../types/ports';

const owner: ProcessInfo = {pid: 10, createdAt: 100, name: 'node.exe', iconDataURL: '', path: '', commandLine: '', user: '', cpuPercent: 1, memoryBytes: 1024, isProtected: false, projectName: 'app', projectPath: 'D:\\Projects\\app'};
const port: PortInfo = {pid: 10, createdAt: 100, port: 5173, protocol: 'TCP', status: 'LISTEN', processName: 'node.exe', processPath: '', isProtected: false};

describe('shared project views', () => {
    it('uses the same ownership for ports and processes and counts memory once per process', () => {
        const ports = [port, {...port, port: 8080}, {...port, port: 55000, status: 'ESTABLISHED'}];
        const owners = new Map([[owner.pid, owner]]);
        const processGroups = buildProjectGroups([owner], row => row, ports);
        const portGroups = buildProjectGroups(ports, row => matchingOwner(row, owners), ports);
        expect(portGroups[0].key).toBe(processGroups[0].key);
        expect(portGroups[0].memoryBytes).toBe(1024);
        expect(portGroups[0].processCount).toBe(1);
        expect(portGroups[0].ports).toEqual(['5173/TCP', '8080/TCP']);
        expect(portGroups[0].rows).toHaveLength(3);
    });

    it('leaves reused and unverifiable process identities ungrouped', () => {
        const owners = new Map([[owner.pid, owner]]);
        expect(matchingOwner({...port, createdAt: 101}, owners)).toBeUndefined();
        expect(matchingOwner({...port, createdAt: 0}, new Map([[owner.pid, {...owner, createdAt: 0}]]))).toBeUndefined();
        const unknown = buildProjectGroups([port], row => matchingOwner(row, new Map()), [port])[0];
        expect(unknown.key).toBe('');
        expect(unknown.hasUnknownOwners).toBe(true);
        expect(projectKey('D:\\Projects\\APP')).toBe(projectKey('d:/projects/app/'));
    });
});
