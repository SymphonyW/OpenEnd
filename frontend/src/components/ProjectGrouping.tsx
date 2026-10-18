import {useContext, useEffect, useState} from 'react';
import {SetProcessProject} from '../../wailsjs/go/main/App';
import {ProjectNavigationContext, ownershipOf, projectsChangedEvent} from '../services/projects';
import type {ProjectGroup, ProjectPage, ProjectView} from '../services/projects';
import type {ProcessInfo} from '../types/processes';
import type {Translator, TranslationKey} from '../services/i18n';
import {formatMemorySize} from '../services/systemResources';

export function ProjectToolbar({view, processes, t}: {view: ProjectView; processes: ProcessInfo[]; t: Translator}) {
    const groups = new Map(processes.map(ownershipOf).filter(group => group.key).map(group => [group.key, group]));
    return <div className="project-toolbar">
        <div className="sort-controls" role="group" aria-label={t('projects.view')}>
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
        {view.grouped && <span className="project-hint">{t('projects.filteredSummary')}</span>}
    </div>;
}

export function ProjectGroupRow<T>({group, view, columns, destination, t}: {group: ProjectGroup<T>; view: ProjectView; columns: number; destination: ProjectPage; t: Translator}) {
    const {navigate} = useContext(ProjectNavigationContext);
    const open = !view.collapsed.has(group.key);
    return <tr className="project-group-row"><td colSpan={columns}>
        <div className="project-group-heading">
            <button className="project-group-toggle" aria-expanded={open} onClick={() => view.toggle(group.key)} title={group.path}>
                <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                <strong>{group.name || t('projects.ungrouped')}</strong>
                {group.kind !== 'unknown' && <span className={`ownership-kind ${group.kind}`}>{t(group.kind === 'application' ? 'projects.kindApplication' : 'projects.kindProject')}</span>}
                {group.path && <span className="project-group-path">{group.path}</span>}
            </button>
            <span className="project-group-metrics">{group.processCount} {t(group.hasUnknownOwners ? 'projects.knownProcesses' : 'projects.processes')} · {group.hasUnknownOwners ? t('common.unavailable') : formatMemorySize(group.memoryBytes)} · {t('projects.servicePorts')}: {group.ports.join(', ') || (group.hasUnknownOwners ? t('common.unavailable') : t('common.none'))}</span>
            {group.path && <button className="project-link" onClick={() => navigate(destination, group.key)}>{t(destination === 'ports' ? 'projects.viewPorts' : 'projects.viewProcesses')}</button>}
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
