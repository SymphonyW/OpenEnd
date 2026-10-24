import {describe, expect, it} from 'vitest';
import {buildProjectGroups, matchingOwner, ownershipOf, projectKey} from './projects';
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

    it('keeps application identities separate from projects and deduplicates application port totals', () => {
        const appPath = 'C:\\Apps\\Chrome\\chrome.exe';
        const app = {...owner, projectPath: '', projectName: '', applicationPath: appPath, applicationName: 'Google Chrome', applicationReason: 'applicationPath'};
        const otherInstall = {...app, pid: 11, applicationPath: 'D:\\Apps\\Chrome\\chrome.exe'};
        const project = {...owner, pid: 12, projectPath: appPath, projectName: 'Google Chrome'};
        const groups = buildProjectGroups([app, otherInstall, project], row => row, []);
        expect(groups).toHaveLength(3);
        expect(groups.filter(group => group.kind === 'application')).toHaveLength(2);
        expect(ownershipOf({...app, projectPath: 'D:\\work'}).kind).toBe('project');
        const ports = [port, {...port, port: 8080}];
        const portGroups = buildProjectGroups(ports, row => matchingOwner(row, new Map([[app.pid, app]])), ports);
        expect(portGroups[0].key).toBe('app:c:/apps/chrome/chrome.exe');
        expect(portGroups[0].memoryBytes).toBe(app.memoryBytes);
        expect(portGroups[0].kind).toBe('application');
    });

    it('uses the main application icon even when only a helper process is visible', () => {
        const helper = {...owner, projectPath: '', applicationPath: 'C:\\App\\app.exe', applicationName: 'App',
            path: 'C:\\App\\helper.exe', iconDataURL: 'helper-icon', applicationIconDataURL: 'app-icon'};
        expect(buildProjectGroups([helper], row => row, [])[0].iconDataURL).toBe('app-icon');
        expect(buildProjectGroups([port], () => helper, [port])[0].iconDataURL).toBe('app-icon');
        expect(ownershipOf({...helper, applicationIconDataURL: ''}).iconDataURL).toBe('');
        expect(ownershipOf({...helper, applicationIconDataURL: '', path: helper.applicationPath, iconDataURL: 'main-icon'}).iconDataURL).toBe('main-icon');
        expect(ownershipOf({...helper, projectPath: 'D:\\repo'}).iconDataURL).toBe('');
    });
});
