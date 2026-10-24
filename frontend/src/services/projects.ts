import {createContext, useContext, useEffect, useState} from 'react';
import type {ProcessInfo} from '../types/processes';
import type {PortInfo} from '../types/ports';

export const projectsChangedEvent = 'openend:projects-changed';
export type ProjectPage = 'processes' | 'ports';
export const ProjectNavigationContext = createContext<{
    target: {page: ProjectPage; path: string; sequence: number} | null;
    navigate: (page: ProjectPage, path: string) => void;
}>({target: null, navigate: () => {}});

export function projectKey(path = ''): string {
    return path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
}

export type OwnershipKind = 'project' | 'application' | 'unknown';

export function ownershipOf(process?: ProcessInfo): {key: string; kind: OwnershipKind; path: string; name: string; reason: string; iconDataURL: string} {
    if (process?.projectPath) {
        return {key: projectKey(process.projectPath), kind: 'project', path: process.projectPath,
            name: process.projectName || process.projectPath.split(/[\\/]/).pop() || '', reason: process.projectReason || '', iconDataURL: ''};
    }
    if (process?.applicationPath) {
        return {key: `app:${projectKey(process.applicationPath)}`, kind: 'application', path: process.applicationPath,
            name: process.applicationName || process.applicationPath.split(/[\\/]/).pop() || '', reason: process.applicationReason || '',
            iconDataURL: process.applicationIconDataURL || (projectKey(process.path) === projectKey(process.applicationPath) ? process.iconDataURL : '')};
    }
    return {key: '', kind: 'unknown', path: '', name: '', reason: process?.projectReason || '', iconDataURL: ''};
}

export function matchingOwner(port: PortInfo, owners: Map<number, ProcessInfo>): ProcessInfo | undefined {
    const owner = owners.get(port.pid);
    return port.createdAt > 0 && owner?.createdAt === port.createdAt ? owner : undefined;
}

export function useProjectView(page: ProjectPage) {
    const {target} = useContext(ProjectNavigationContext);
    const [grouped, setGrouped] = useState(() => window.localStorage.getItem(`openend-${page}-project-view`) === 'grouped');
    const [filter, setFilter] = useState('*');
    const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
    useEffect(() => {
        if (target?.page === page) {
            setFilter(projectKey(target.path));
            setGrouped(true);
            setCollapsed(current => { const next = new Set(current); next.delete(projectKey(target.path)); return next; });
        }
    }, [target, page]);
    useEffect(() => {
        window.localStorage.setItem(`openend-${page}-project-view`, grouped ? 'grouped' : 'all');
    }, [grouped, page]);
    return {
        grouped, setGrouped, filter, setFilter, collapsed,
        navigationSequence: target?.page === page ? target.sequence : 0,
        toggle: (key: string) => setCollapsed(current => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        }),
    };
}

export type ProjectView = ReturnType<typeof useProjectView>;
export interface ProjectGroup<T> {
    key: string;
    path: string;
    name: string;
    kind: OwnershipKind;
    iconDataURL: string;
    rows: T[];
    processCount: number;
    memoryBytes: number;
    hasUnknownOwners: boolean;
    ports: string[];
}

export function projectRows<T>(groups: ProjectGroup<T>[], rows: T[], view: ProjectView): ({group: ProjectGroup<T>} | {row: T})[] {
    if (!view.grouped) return rows.map(row => ({row}));
    return groups.flatMap<{group: ProjectGroup<T>} | {row: T}>(group => [
        {group}, ...(view.collapsed.has(group.key) ? [] : group.rows.map(row => ({row}))),
    ]);
}

// Owners are deduplicated before summing memory: one process can own many ports.
export function buildProjectGroups<T>(rows: T[], ownerOf: (row: T) => ProcessInfo | undefined, ports: PortInfo[]): ProjectGroup<T>[] {
    const groups = new Map<string, {group: ProjectGroup<T>; owners: Map<string, ProcessInfo>}>();
    for (const row of rows) {
        const owner = ownerOf(row);
        const ownership = ownershipOf(owner);
        const {key} = ownership;
        let entry = groups.get(key);
        if (!entry) {
            entry = {group: {...ownership, rows: [], processCount: 0, memoryBytes: 0, hasUnknownOwners: false, ports: []}, owners: new Map()};
            groups.set(key, entry);
        }
        entry.group.rows.push(row);
        if (!entry.group.iconDataURL) entry.group.iconDataURL = ownership.iconDataURL;
        if (owner) entry.owners.set(`${owner.pid}:${owner.createdAt}`, owner);
        else entry.group.hasUnknownOwners = true;
    }
    for (const {group, owners} of groups.values()) {
        group.processCount = owners.size;
        group.memoryBytes = [...owners.values()].reduce((sum, owner) => sum + owner.memoryBytes, 0);
        group.ports = [...new Set(ports.filter(port => port.createdAt > 0
            && owners.has(`${port.pid}:${port.createdAt}`)
            && (port.protocol === 'UDP' || /^LISTEN(?:ING)?$/i.test(port.status)))
            .map(port => `${port.port}/${port.protocol}`))].sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));
    }
    return [...groups.values()].map(entry => entry.group).sort((a, b) => {
        if (!a.key) return b.key ? 1 : 0;
        if (!b.key) return -1;
        return b.memoryBytes - a.memoryBytes || a.path.localeCompare(b.path);
    });
}
