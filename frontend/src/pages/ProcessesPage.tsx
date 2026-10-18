import {useCallback, useEffect, useMemo, useState} from 'react';
import type {KeyboardEvent, MouseEvent} from 'react';
import ProcessNameCell from '../components/ProcessNameCell';
import ScrollableDataTable from '../components/ScrollableDataTable';
import StatusMessage from '../components/StatusMessage';
import {ProjectAssignment, ProjectCell, ProjectGroupRow, ProjectToolbar} from '../components/ProjectGrouping';
import {buildProjectGroups, ownershipOf, projectRows, projectsChangedEvent, useProjectView} from '../services/projects';
import {operationText, operationVariant, type OperationVariant} from '../services/operations';
import {useSequentialAutoRefresh} from '../hooks/useSequentialAutoRefresh';
import {formatMemorySize, formatPercent, isHighMemoryUsage} from '../services/systemResources';
import {isCommonDevelopmentPort, loadPortList} from '../services/ports';
import {killProcessByPID, loadProcessDetail, loadProcessList} from '../services/processes';
import type {Translator} from '../services/i18n';
import type {PageDefinition} from '../types/navigation';
import type {PortInfo} from '../types/ports';
import type {ProcessDetail, ProcessInfo, ProcessSortKey} from '../types/processes';

const processRefreshIntervalMs = 5000;

interface ProcessesPageProps {
    page: PageDefinition;
    t: Translator;
}

interface KillTarget {
    createdAt: number;
    pid: number;
    name: string;
    path: string;
    memoryBytes: number;
    isProtected: boolean;
}

interface ProcessContextMenu {
    process: ProcessInfo;
    x: number;
    y: number;
}

function ProcessesPage({page, t}: ProcessesPageProps) {
    const projectView = useProjectView('processes');
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    const [processPorts, setProcessPorts] = useState<PortInfo[]>([]);
    const [nameSearch, setNameSearch] = useState('');
    const [pidSearch, setPidSearch] = useState('');
    const [sortKey, setSortKey] = useState<ProcessSortKey>('memory');
    const [isLoading, setIsLoading] = useState(false);
    const [isKilling, setIsKilling] = useState(false);
    const [relatedUpdated, setRelatedUpdated] = useState<number>();
    const [lastUpdated, setLastUpdated] = useState<number>();
    const [errorMessage, setErrorMessage] = useState('');
    const [operationStatus, setOperationStatus] = useState<OperationVariant>('success');
    const [operationMessage, setOperationMessage] = useState('');
    const [processToKill, setProcessToKill] = useState<KillTarget | null>(null);
    const [selectedDetailPID, setSelectedDetailPID] = useState<number | null>(null);
    const [processDetail, setProcessDetail] = useState<ProcessDetail | null>(null);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [detailErrorMessage, setDetailErrorMessage] = useState('');
    const [contextMenu, setContextMenu] = useState<ProcessContextMenu | null>(null);

    useEffect(() => {
        if (projectView.navigationSequence > 0) { setNameSearch(''); setPidSearch(''); }
    }, [projectView.navigationSequence]);

    const loadProcesses = useCallback(async (showLoading = true) => {
        if (showLoading) {
            setIsLoading(true);
        }
        setErrorMessage('');

        try {
            const [primary, related] = await Promise.allSettled([loadProcessList(), loadPortList()]);
            if (primary.status === 'rejected') throw primary.reason;
            setProcesses(primary.value);
            if (related.status === 'fulfilled') { setProcessPorts(related.value); setRelatedUpdated(Date.now()); }
            else setErrorMessage(t('refresh.relatedError') + (relatedUpdated ? ' ' + t('dashboard.lastUpdated') + ': ' + new Date(relatedUpdated).toLocaleTimeString() : ' ' + t('common.unavailable')));
            setLastUpdated(Date.now());
        } catch {
            setErrorMessage(t('processes.error'));
        } finally {
            if (showLoading) {
                setIsLoading(false);
            }
        }
    }, [t, relatedUpdated]);

    useSequentialAutoRefresh(loadProcesses, processRefreshIntervalMs, projectsChangedEvent);

    const loadDetail = useCallback(async (pid: number) => {
        setIsDetailLoading(true);
        setDetailErrorMessage('');

        try {
            const detail = await loadProcessDetail(pid);
            setProcessDetail(detail);
        } catch {
            setProcessDetail(null);
            setDetailErrorMessage(t('detail.process.error'));
        } finally {
            setIsDetailLoading(false);
        }
    }, [t]);

    const openProcessDetail = (process: ProcessInfo) => {
        setOperationMessage('');
        setContextMenu(null);
        setSelectedDetailPID(process.pid);
        setProcessDetail(null);
        void loadDetail(process.pid);
    };

    const closeProcessDetail = () => {
        setSelectedDetailPID(null);
        setProcessDetail(null);
        setDetailErrorMessage('');
    };

    const openKillConfirmation = (target: KillTarget) => {
        if (target.isProtected) {
            return;
        }

        setOperationMessage('');
        setContextMenu(null);
        setProcessToKill(target);
    };

    const openDetailKillConfirmation = (detail: ProcessDetail) => {
        openKillConfirmation({
            createdAt: detail.createdAt,
            pid: detail.pid,
            name: detail.processName,
            path: detail.executablePath,
            memoryBytes: detail.memoryBytes,
            isProtected: detail.isProtected,
        });
    };

    const openRowKillConfirmation = (process: ProcessInfo) => {
        openKillConfirmation({
            createdAt: process.createdAt,
            pid: process.pid,
            name: process.name,
            path: process.path,
            memoryBytes: process.memoryBytes,
            isProtected: process.isProtected,
        });
    };

    const closeKillConfirmation = () => {
        if (!isKilling) {
            setProcessToKill(null);
        }
    };

    const handleProcessRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, process: ProcessInfo) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        openProcessDetail(process);
    };

    const openProcessContextMenu = (process: ProcessInfo, x: number, y: number) => {
        setOperationMessage('');
        setContextMenu({
            process,
            x,
            y,
        });
    };

    const handleProcessRowMouseDown = (event: MouseEvent<HTMLTableRowElement>, process: ProcessInfo) => {
        if (event.button !== 2) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        openProcessContextMenu(process, event.clientX, event.clientY);
    };

    const handleProcessRowContextMenu = (event: MouseEvent<HTMLTableRowElement>, process: ProcessInfo) => {
        event.preventDefault();
        event.stopPropagation();
        openProcessContextMenu(process, event.clientX, event.clientY);
    };

    useEffect(() => {
        if (!contextMenu) {
            return undefined;
        }

        const closeContextMenu = () => setContextMenu(null);
        const closeContextMenuOnEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape') {
                closeContextMenu();
            }
        };

        window.addEventListener('click', closeContextMenu);
        window.addEventListener('contextmenu', closeContextMenu);
        window.addEventListener('keydown', closeContextMenuOnEscape);
        return () => {
            window.removeEventListener('click', closeContextMenu);
            window.removeEventListener('contextmenu', closeContextMenu);
            window.removeEventListener('keydown', closeContextMenuOnEscape);
        };
    }, [contextMenu]);

    const confirmKillProcess = async () => {
        if (!processToKill || processToKill.isProtected) {
            return;
        }

        const target = processToKill;
        setIsKilling(true);
        setErrorMessage('');

        try {
            const result = await killProcessByPID(target.pid, target.createdAt);
            setOperationStatus(operationVariant(result));
            setOperationMessage(operationText(result, t));
            setProcessToKill(null);

            if (result.code === 'identity_changed') { await loadProcesses(false); closeProcessDetail(); }
            if (result.success) {
                await loadProcesses(false);
                if (selectedDetailPID === target.pid) {
                    closeProcessDetail();
                }
            }
        } catch {
            setOperationStatus('error');
            setOperationMessage(t('processes.killError'));
        } finally {
            setIsKilling(false);
        }
    };

    const visibleProcesses = useMemo(() => {
        const normalizedNameSearch = nameSearch.trim().toLowerCase();
        const normalizedPidSearch = pidSearch.trim();

        return processes
            .filter((process) => {
                const matchesName = normalizedNameSearch === ''
                    || process.name.toLowerCase().includes(normalizedNameSearch)
                    || ownershipOf(process).name.toLowerCase().includes(normalizedNameSearch)
                    || ownershipOf(process).path.toLowerCase().includes(normalizedNameSearch);
                const matchesPid = normalizedPidSearch === ''
                    || process.pid.toString().includes(normalizedPidSearch);

                return matchesName && matchesPid && (projectView.filter === '*' || ownershipOf(process).key === projectView.filter);
            })
            .sort((left, right) => {
                if (sortKey === 'cpu') {
                    return right.cpuPercent - left.cpuPercent;
                }

                return right.memoryBytes - left.memoryBytes;
            });
    }, [nameSearch, pidSearch, processes, sortKey, projectView.filter]);

    const projectGroups = useMemo(() => buildProjectGroups(visibleProcesses, process => process, processPorts), [visibleProcesses, processPorts]);
    const rows = projectRows(projectGroups, visibleProcesses, projectView);
    const selectedProjectProcess = processes.find(process => process.pid === processDetail?.pid && process.createdAt === processDetail?.createdAt);

    const portsByPID = useMemo(() => groupPortsByPID(processPorts), [processPorts]);
    const isFiltered = nameSearch.trim() !== '' || pidSearch.trim() !== '' || projectView.filter !== '*';
    const emptyMessage = isFiltered ? t('processes.emptyFiltered') : t('processes.empty');

    return (
        <section className="page-panel process-page" aria-label={page.title}>
            <ProjectToolbar view={projectView} processes={processes} count={visibleProcesses.length} filtered={isFiltered} updatedAt={lastUpdated} t={t}/>
            <div className="resource-toolbar process-toolbar">
                <label className="filter-field">
                    <span>{t('filter.processName')}</span>
                    <input
                        aria-label={t('filter.processName')}
                        value={nameSearch}
                        onChange={(event) => setNameSearch(event.target.value)}
                        placeholder="node.exe"
                    />
                </label>
                <label className="filter-field compact-filter">
                    <span>{t('field.pid')}</span>
                    <input
                        aria-label={t('field.pid')}
                        inputMode="numeric"
                        value={pidSearch}
                        onChange={(event) => setPidSearch(event.target.value)}
                        placeholder="5173"
                    />
                </label>
                <div className="sort-controls" aria-label={t('filter.search')}>
                    <button
                        aria-label={t('sort.memory')}
                        aria-pressed={sortKey === 'memory'}
                        className={sortKey === 'memory' ? 'sort-button active' : 'sort-button'}
                        type="button"
                        onClick={() => setSortKey('memory')}
                    >
                        {t('sort.memory')}
                    </button>
                    <button
                        aria-label={t('sort.cpu')}
                        aria-pressed={sortKey === 'cpu'}
                        className={sortKey === 'cpu' ? 'sort-button active' : 'sort-button'}
                        type="button"
                        onClick={() => setSortKey('cpu')}
                    >
                        {t('sort.cpu')}
                    </button>
                </div>
            </div>

            {errorMessage && <StatusMessage variant="error">{errorMessage}</StatusMessage>}
            {operationMessage && <StatusMessage variant={operationStatus}>{operationMessage}</StatusMessage>}
            {isLoading && processes.length === 0 && (
                <StatusMessage variant="loading">{t('processes.loading')}</StatusMessage>
            )}

            {!isLoading && !errorMessage && visibleProcesses.length === 0 && (
                <StatusMessage variant="empty">{emptyMessage}</StatusMessage>
            )}

            {(visibleProcesses.length > 0 || selectedDetailPID !== null) && (
                <div className={selectedDetailPID !== null ? 'process-detail-layout has-detail' : 'process-detail-layout'}>
                    <ScrollableDataTable
                        className="compact-table-wrap"
                        scrollbarLabel={`${t('table.processList')} horizontal scroll`}
                    >
                        <table className="process-table process-list-table compact-data-table" aria-label={t('table.processList')}>
                            <thead>
                                <tr>
                                    <th>{t('field.processName')}</th>
                                    <th>{t('field.pid')}</th>
                                    <th className="metric-heading" aria-sort={sortKey === 'cpu' ? 'descending' : undefined}>{t('field.cpu')}</th>
                                    <th className="metric-heading" aria-sort={sortKey === 'memory' ? 'descending' : undefined}>{t('field.memory')}</th>
                                    <th>{t('field.ports')}</th>
                                    <th>{t('field.protected')}</th>
                                    <th>{t('projects.project')}</th>
                                    <th>{t('field.path')}</th>
                                    <th>{t('field.command')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(entry => {
                                    if ('group' in entry) return <ProjectGroupRow key={`group:${entry.group.key}`} group={entry.group} view={projectView} columns={9} destination="ports" t={t}/>;
                                    const process = entry.row;
                                    const commandLine = process.commandLine || t('common.unavailable');
                                    const path = process.path || t('common.unavailable');
                                    const isSelected = selectedDetailPID === process.pid || contextMenu?.process.pid === process.pid;
                                    const ownedPorts = (portsByPID.get(process.pid) ?? []).filter(port => port.createdAt === process.createdAt);

                                    return (
                                        <tr
                                            key={process.pid}
                                            aria-selected={isSelected}
                                            className={processRowClassName(process, isSelected)}
                                            onClick={() => openProcessDetail(process)}
                                            onContextMenu={(event) => handleProcessRowContextMenu(event, process)}
                                            onKeyDown={(event) => handleProcessRowKeyDown(event, process)}
                                            onMouseDown={(event) => handleProcessRowMouseDown(event, process)}
                                            tabIndex={0}
                                        >
                                            <td data-testid="process-name">
                                                <ProcessNameCell
                                                    iconDataURL={process.iconDataURL}
                                                    name={process.name}
                                                    fallbackName={t('common.unknown')}
                                                />
                                            </td>
                                            <td className="mono">{process.pid}</td>
                                            <td className="mono metric-cell">{formatPercent(process.cpuPercent)}</td>
                                            <td className="mono metric-cell">
                                                {formatMemorySize(process.memoryBytes)}
                                                {isHighMemoryUsage(process.memoryBytes) && <span className="memory-badge">{t('badge.high')}</span>}
                                            </td>
                                            <td className="mono">{relatedUpdated ? renderProcessPorts(ownedPorts, t) : t('common.unavailable')}</td>
                                            <td>
                                                <span className={process.isProtected ? 'protected-badge' : 'standard-badge'}>
                                                    {process.isProtected ? t('badge.protected') : t('badge.standard')}
                                                </span>
                                            </td>
                                            <td><ProjectCell process={process} t={t}/></td>
                                            <td className="muted-cell compact-path-cell" title={path}>{path}</td>
                                            <td className="muted-cell" title={commandLine}>
                                                <span className="command-cell" title={commandLine}>{commandLine}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </ScrollableDataTable>

                    {selectedDetailPID !== null && (
                    <aside
                        aria-label={t('detail.process.aria')}
                        className="process-detail-drawer"
                        role="complementary"
                    >
                        <div className="detail-drawer-header">
                            <div className="detail-drawer-title">
                                <p className="detail-drawer-kicker">{t('detail.process.aria')}</p>
                                <h2>{processDetail?.processName ? `${processDetail.processName} PID ${processDetail.pid}` : t('detail.process.aria')}</h2>
                            </div>
                            {selectedDetailPID !== null && (
                                <div className="detail-header-actions">
                                    <button
                                        className="danger-button"
                                        type="button"
                                        disabled={!processDetail || processDetail.isProtected || isKilling}
                                        onClick={() => {
                                            if (processDetail) {
                                                openDetailKillConfirmation(processDetail);
                                            }
                                        }}
                                    >
                                        {t('terminate.process')}
                                    </button>
                                    <button
                                        aria-label={t('common.close')}
                                        className="detail-close-button"
                                        type="button"
                                        onClick={closeProcessDetail}
                                        disabled={isKilling}
                                    >
                                        <span aria-hidden="true">&times;</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {detailErrorMessage && <StatusMessage variant="error">{detailErrorMessage}</StatusMessage>}
                        {isDetailLoading && !processDetail && (
                            <StatusMessage variant="loading">{t('detail.process.loading')}</StatusMessage>
                        )}

                        {processDetail && (
                            <div className="detail-drawer-body">
                                {selectedProjectProcess && <ProjectAssignment key={`${selectedProjectProcess.pid}:${selectedProjectProcess.createdAt}`} process={selectedProjectProcess} processes={processes} t={t}/>}
                                <div className="detail-badge-row">
                                    <span className={processDetail.isProtected ? 'protected-badge' : 'standard-badge'}>
                                        {processDetail.isProtected ? t('badge.protected') : t('badge.standard')}
                                    </span>
                                    <span className={processDetail.isDeveloperRelated ? 'protocol-badge' : 'standard-badge'}>
                                        {processDetail.isDeveloperRelated ? t('detail.developerRelated') : t('detail.notDeveloperRelated')}
                                    </span>
                                </div>

                                <dl className="detail-field-list">
                                    <div>
                                        <dt>{t('field.pid')}</dt>
                                        <dd className="mono">{processDetail.pid}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('field.processName')}</dt>
                                        <dd>{processDetail.processName || t('common.unknown')}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('field.cpu')}</dt>
                                        <dd className="mono">{formatPercent(processDetail.cpuPercent)}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('field.memory')}</dt>
                                        <dd className="mono">{formatMemorySize(processDetail.memoryBytes)}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('field.executablePath')}</dt>
                                        <dd>{renderDetailValue(processDetail.executablePath, processDetail.executablePathError, t)}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('field.command')}</dt>
                                        <dd>{renderDetailValue(processDetail.commandLine, processDetail.commandLineError, t)}</dd>
                                    </div>
                                </dl>

                                <div className="detail-section">
                                    <div className="detail-section-header">
                                        <h3>{t('field.ports')}</h3>
                                        <span className="settings-count">{processDetail.ports.length}</span>
                                    </div>
                                    {processDetail.portsError && (
                                        <p className="detail-inline-warning">{processDetail.portsError}</p>
                                    )}
                                    {processDetail.ports.length === 0 && !processDetail.portsError && (
                                        <p className="detail-empty">{t('detail.noPorts')}</p>
                                    )}
                                    {processDetail.ports.length > 0 && (
                                        <ul className="detail-port-list">
                                            {processDetail.ports.map((port) => (
                                                <li key={`${port.protocol}-${port.port}-${port.status}`}>
                                                    <span className="mono">{port.port}</span>
                                                    <span className="protocol-badge">{port.protocol || t('common.unknown')}</span>
                                                    <span className="mono muted-cell">{port.status || t('common.unknown')}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                <div className="detail-section">
                                    <div className="detail-section-header">
                                        <h3>{t('detail.recentLogs')}</h3>
                                        <span className="settings-count">{processDetail.recentLogs.length}</span>
                                    </div>
                                    {processDetail.logsError && (
                                        <p className="detail-inline-warning">{processDetail.logsError}</p>
                                    )}
                                    {processDetail.recentLogs.length === 0 && !processDetail.logsError && (
                                        <p className="detail-empty">{t('detail.noLogs')}</p>
                                    )}
                                    {processDetail.recentLogs.length > 0 && (
                                        <ul className="detail-log-list">
                                            {processDetail.recentLogs.map((log) => (
                                                <li key={log.id}>
                                                    <div className="detail-log-meta">
                                                        <span className="mono">{log.action}</span>
                                                        <span className={log.result === 'success' ? 'result-badge success' : 'result-badge failure'}>
                                                            {log.result === 'success' ? t('operation.succeeded') : t('operation.failed')}
                                                        </span>
                                                    </div>
                                                    <p>{log.message || t('common.unavailable')}</p>
                                                    <span className="mono muted-cell">{formatDetailCreatedAt(log.createdAt) || t('common.unavailable')}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                            </div>
                        )}
                    </aside>
                    )}
                </div>
            )}

            {contextMenu && (
                <div
                    className="process-context-menu"
                    role="menu"
                    style={{left: contextMenu.x, top: contextMenu.y}}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <button
                        role="menuitem"
                        type="button"
                        onClick={() => openProcessDetail(contextMenu.process)}
                    >
                        {t('processes.details')}
                    </button>
                    <button
                        className="danger-menu-item"
                        role="menuitem"
                        type="button"
                        disabled={contextMenu.process.isProtected || isKilling}
                        onClick={() => openRowKillConfirmation(contextMenu.process)}
                    >
                        {t('terminate.process')}
                    </button>
                </div>
            )}

            {processToKill && (
                <div className="modal-backdrop" role="presentation">
                    <section
                        aria-labelledby="kill-process-dialog-title"
                        className="confirmation-dialog"
                        role="dialog"
                    >
                        <div className="dialog-header">
                            <h2 id="kill-process-dialog-title">{t('dialog.process.title')}</h2>
                            <button
                                aria-label={t('common.close')}
                                className="dialog-close-button"
                                type="button"
                                onClick={closeKillConfirmation}
                                disabled={isKilling}
                            >
                                {t('common.close')}
                            </button>
                        </div>
                        <dl className="confirmation-details">
                            <div><dt>{t('field.processCreatedAt')}</dt><dd>{processToKill.createdAt > 0 ? new Date(processToKill.createdAt).toLocaleString() : t('common.unavailable')}</dd></div>
                            <div>
                                <dt>{t('field.pid')}</dt>
                                <dd className="mono">{processToKill.pid}</dd>
                            </div>
                            <div>
                                <dt>{t('field.processName')}</dt>
                                <dd>{processToKill.name || t('common.unknown')}</dd>
                            </div>
                            <div>
                                <dt>{t('field.path')}</dt>
                                <dd>{processToKill.path || t('common.unavailable')}</dd>
                            </div>
                            <div>
                                <dt>{t('field.memory')}</dt>
                                <dd className="mono">{formatMemorySize(processToKill.memoryBytes)}</dd>
                            </div>
                        </dl>
                        <div className="dialog-actions">
                            <button
                                className="sort-button"
                                type="button"
                                onClick={closeKillConfirmation}
                                disabled={isKilling}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                className="danger-button"
                                type="button"
                                onClick={confirmKillProcess}
                                disabled={isKilling}
                            >
                                {t('dialog.action.confirmEndProcess')}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
}

function groupPortsByPID(ports: PortInfo[]): Map<number, PortInfo[]> {
    const portsByPID = new Map<number, PortInfo[]>();
    for (const port of ports) {
        if (port.pid <= 0) {
            continue;
        }

        const existingPorts = portsByPID.get(port.pid) ?? [];
        existingPorts.push(port);
        portsByPID.set(port.pid, existingPorts);
    }

    return portsByPID;
}

function renderProcessPorts(ports: PortInfo[], t: Translator) {
    const portNumbers = Array.from(new Set(ports.map((port) => port.port).filter((port) => port > 0)))
        .sort((left, right) => left - right);
    if (portNumbers.length === 0) {
        return t('common.none');
    }

    return portNumbers.map((port, index) => (
        <span key={port}>
            {index > 0 && ', '}
            <span className={isCommonDevelopmentPort(port) ? 'inline-dev-port' : undefined}>{port}</span>
        </span>
    ));
}

function processRowClassName(process: ProcessInfo, isSelected = false): string | undefined {
    const classNames = [];
    if (process.isProtected) {
        classNames.push('protected-row');
    }
    if (isHighMemoryUsage(process.memoryBytes)) {
        classNames.push('high-memory-row');
    }
    if (isSelected) {
        classNames.push('selected-process-row');
    }

    return classNames.length > 0 ? classNames.join(' ') : undefined;
}

function renderDetailValue(value: string, error: string, t: Translator) {
    if (value.trim() !== '') {
        return <span>{value}</span>;
    }
    if (error.trim() !== '') {
        return <span className="detail-inline-warning">{error}</span>;
    }

    return <span className="muted-cell">{t('common.unavailable')}</span>;
}

function formatDetailCreatedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

export default ProcessesPage;
