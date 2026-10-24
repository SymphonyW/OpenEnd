import {useContext, useEffect, useState} from 'react';
import {SetProcessProject} from '../../wailsjs/go/main/App';
import {ProjectNavigationContext, ownershipOf, projectsChangedEvent} from '../services/projects';
import type {ProjectGroup, ProjectPage, ProjectView} from '../services/projects';
import type {ProcessInfo} from '../types/processes';
import type {Translator, TranslationKey} from '../services/i18n';
import {formatMemorySize} from '../services/systemResources';
import RefreshControls from './RefreshControls';
import OwnershipIcon from './OwnershipIcon';

export function ProjectToolbar({view, processes, count, total = processes.length, filtered, updatedAt, t}: {
    view: ProjectView; processes: ProcessInfo[]; count: number; total?: number; filtered: boolean; updatedAt?: number; t: Translator;
}) {
    const groups = new Map(processes.map(ownershipOf).filter(group => group.key).map(group => [group.key, group]));
    return <div className="project-toolbar">
        <div className="sort-controls project-view-switch" role="group" aria-label={t('projects.view')}>
            <button className={`sort-button${!view.grouped ? ' active' : ''}`} aria-pressed={!view.grouped} onClick={() => view.setGrouped(false)}>{t('projects.all')}</button>
            <button className={`sort-button${view.grouped ? ' active' : ''}`} aria-pressed={view.grouped} onClick={() => view.setGrouped(true)}>{t('projects.grouped')}</button>
        </div>
        <label className="filter-field project-filter"><span>{t('projects.filter')}</span>
            <select aria-label={t('projects.filter')} value={view.filter} onChange={event => view.setFilter(event.target.value)}>
                <option value="*">{t('projects.allProjects')}</option>
                <option value="">{t('projects.ungrouped')}</option>
                {[...groups].sort(([, a], [, b]) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path)).map(([key, group]) => <option key={key} value={key}>{group.name} · {t(group.kind === 'application' ? 'projects.kindApplication' : 'projects.kindProject')} · {group.path}</option>)}
                {view.filter !== '*' && view.filter !== '' && !groups.has(view.filter) && <option value={view.filter}>{view.filter}</option>}
            </select>
        </label>
        <div className="project-toolbar-status">
            <span className="resource-list-count" title={view.grouped ? t('projects.filteredSummary') : undefined}>
                {count}{filtered && ` / ${total}`} {t('common.items')}
            </span>
            <RefreshControls t={t} updatedAt={updatedAt}/>
        </div>
    </div>;
}

export function ProjectGroupRow<T>({group, view, columns, destination, t}: {group: ProjectGroup<T>; view: ProjectView; columns: number; destination: ProjectPage; t: Translator}) {
    const {navigate} = useContext(ProjectNavigationContext);
    const open = !view.collapsed.has(group.key);
    const allPorts = group.ports.join(', ');
    const shownPorts = group.ports.slice(0, 3).join(', ');
    return <tr className="project-group-row"><td colSpan={columns}>
        <div className="project-group-heading">
            <button className="project-group-toggle" aria-expanded={open} onClick={() => view.toggle(group.key)} title={group.path}>
                <span className="project-group-chevron" aria-hidden="true">▸</span>
                <OwnershipIcon kind={group.kind} iconDataURL={group.iconDataURL} name={group.name || t('projects.ungrouped')}/>
                <span className="project-group-identity">
                    <span className="project-group-name">
                        <strong>{group.name || t('projects.ungrouped')}</strong>
                        {group.kind !== 'unknown' && <span className={`ownership-kind ${group.kind}`}>{t(group.kind === 'application' ? 'projects.kindApplication' : 'projects.kindProject')}</span>}
                    </span>
                    {group.path && <span className="project-group-path">{group.path}</span>}
                </span>
            </button>
            <span className="project-group-metrics" title={t('projects.filteredSummary')}>
                <span className="project-group-count" title={t(group.hasUnknownOwners ? 'projects.knownProcesses' : 'projects.processes')}>
                    {group.processCount} {t('projects.processes')}{group.hasUnknownOwners && ' + ?'}
                </span>
                <span className="project-group-stat-divider" aria-hidden="true"> · </span>
                <span className="project-group-memory">{group.hasUnknownOwners ? t('common.unavailable') : formatMemorySize(group.memoryBytes)}</span>
            </span>
            <span className="project-group-ports" title={allPorts || t('projects.servicePorts')}>
                <span className="project-group-ports-label">{t('projects.servicePorts')}</span>
                <span className="project-group-ports-values mono">
                    <span className="project-group-port-numbers">{shownPorts || (group.hasUnknownOwners ? t('common.unavailable') : t('common.none'))}</span>
                    {group.ports.length > 3 && <span className="project-group-more"> +{group.ports.length - 3}</span>}
                </span>
            </span>
            <span className="project-group-action">
                {group.path && <button className="project-link" onClick={() => navigate(destination, group.key)}>
                    {t(destination === 'ports' ? 'projects.viewPorts' : 'projects.viewProcesses')}<span aria-hidden="true">↗</span>
                </button>}
            </span>
        </div>
    </td></tr>;
}

export function ProjectCell({process, t}: {process?: ProcessInfo; t: Translator}) {
    const ownership = ownershipOf(process);
    return <span title={ownership.path}>{ownership.name || t('projects.ungrouped')}</span>;
}

const reasons: Record<string, TranslationKey> = {
    manual: 'projects.reasonManual', rule: 'projects.reasonRule', command: 'projects.reasonCommand',
    directory: 'projects.reasonDirectory', parent: 'projects.reasonParent', conflict: 'projects.reasonConflict',
    applicationPath: 'projects.reasonApplicationPath', applicationParent: 'projects.reasonApplicationParent',
};

export function ProjectAssignment({process, processes, t}: {process: ProcessInfo; processes: ProcessInfo[]; t: Translator}) {
    const ownership = ownershipOf(process);
    const [path, setPath] = useState(process.projectPath || '');
    const [remember, setRemember] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);
    useEffect(() => { setPath(process.projectPath || ''); }, [process.projectPath]);
    const save = async (reset: boolean, nextPath = path) => {
        setSaving(true); setError(''); setSaved(false);
        try {
            await SetProcessProject(process.pid, process.createdAt, nextPath.trim(), remember, reset);
            window.dispatchEvent(new Event(projectsChangedEvent));
            setSaved(true);
        } catch (err) {
            setError(`${t('projects.saveError')} ${String(err)}`);
        } finally { setSaving(false); }
    };
    const projectPaths = [...new Set(processes.map(p => p.projectPath).filter((p): p is string => !!p))];
    return <div className="project-assignment detail-section">
        <dl className="detail-field-list">
            <div>
                <dt>{t('projects.project')}</dt>
                <dd>
                    {ownership.name || t('projects.ungrouped')}
                    {ownership.kind !== 'unknown' && <span className={`ownership-kind ${ownership.kind}`}>
                        {t(ownership.kind === 'application' ? 'projects.kindApplication' : 'projects.kindProject')}
                    </span>}
                    {ownership.path && <div>{ownership.path}</div>}
                </dd>
            </div>
            <div><dt>{t('projects.reason')}</dt><dd>{t(reasons[ownership.reason] || 'projects.reasonUnknown')}</dd></div>
            <div><dt>{t('projects.directory')}</dt><dd>{process.workingDirectory || t('projects.directoryUnavailable')}</dd></div>
        </dl>
        <details><summary>{t('projects.edit')}</summary>
            <form onSubmit={event => {event.preventDefault(); void save(false);}}>
                <label className="filter-field"><span>{t('projects.path')}</span>
                    <input aria-label={t('projects.path')} value={path} onChange={event => {setPath(event.target.value); setSaved(false);}} placeholder="D:\Projects\MyProject" disabled={saving}/>
                </label>
                {projectPaths.length > 0 && <label className="filter-field"><span>{t('projects.choose')}</span>
                    <select aria-label={t('projects.choose')} value="" disabled={saving} onChange={event => setPath(event.target.value)}>
                        <option value="" disabled>{t('projects.choose')}</option>
                        {projectPaths.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </label>}
                <p className="project-hint">{t('projects.temporaryHint')}</p>
                <label className="project-remember"><input type="checkbox" checked={remember} onChange={event => setRemember(event.target.checked)} disabled={saving || !process.workingDirectory}/>{t('projects.remember')}</label>
                {remember && <p className="project-hint">{t('projects.ruleHint')} {process.workingDirectory}</p>}
                {process.projectRuleSource && <p className="project-hint">{t('projects.resetHint')} {process.projectRuleSource}</p>}
                <div className="project-edit-actions">
                    <button type="submit" className="sort-button" disabled={saving || process.createdAt <= 0}>{t('projects.save')}</button>
                    <button type="button" className="sort-button" disabled={saving || process.createdAt <= 0} onClick={() => {setPath(''); void save(false, '');}}>{t('projects.remove')}</button>
                    <button type="button" className="sort-button" disabled={saving || process.createdAt <= 0} onClick={() => void save(true)}>{t('projects.reset')}</button>
                </div>
            </form>
        </details>
        {error && <p role="alert" className="detail-inline-warning">{error}</p>}
        {saved && <p role="status">{t('projects.saved')}</p>}
    </div>;
}
