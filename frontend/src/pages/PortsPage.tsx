import {useCallback, useEffect, useMemo, useState} from 'react';
import type {KeyboardEvent, MouseEvent} from 'react';
import ProcessNameCell from '../components/ProcessNameCell';
import ScrollableDataTable from '../components/ScrollableDataTable';
import StatusMessage from '../components/StatusMessage';
import RefreshControls from '../components/RefreshControls';
import {operationText, operationVariant, type OperationVariant} from '../services/operations';
import {useSequentialAutoRefresh} from '../hooks/useSequentialAutoRefresh';
import {loadRecentOperationLogsForResource} from '../services/logs';
import {isCommonDevelopmentPort, killProcessByPort, loadPortList} from '../services/ports';
import {loadProcessList} from '../services/processes';
import {formatMemorySize, formatPercent} from '../services/systemResources';
import type {Translator} from '../services/i18n';
import type {OperationLog} from '../types/logs';
import type {PageDefinition} from '../types/navigation';
import type {PortInfo, PortProtocolFilter} from '../types/ports';
import type {ProcessInfo} from '../types/processes';

const portRefreshIntervalMs = 5000;

interface PortsPageProps {
    page: PageDefinition;
    t: Translator;
}

interface PortContextMenu {
    port: PortInfo;
    x: number;
    y: number;
}

function PortsPage({page, t}: PortsPageProps) {
    const [ports, setPorts] = useState<PortInfo[]>([]);
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    const [portSearch, setPortSearch] = useState('');
    const [processSearch, setProcessSearch] = useState('');
    const [protocolFilter, setProtocolFilter] = useState<PortProtocolFilter>('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [isLoading, setIsLoading] = useState(false);
    const [isKilling, setIsKilling] = useState(false);
    const [relatedUpdated, setRelatedUpdated] = useState<number>();
    const [lastUpdated, setLastUpdated] = useState<number>();
    const [errorMessage, setErrorMessage] = useState('');
    const [operationStatus, setOperationStatus] = useState<OperationVariant>('success');
    const [operationMessage, setOperationMessage] = useState('');
    const [portToKill, setPortToKill] = useState<PortInfo | null>(null);
    const [selectedPort, setSelectedPort] = useState<PortInfo | null>(null);
    const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
    const [logsErrorMessage, setLogsErrorMessage] = useState('');
    const [contextMenu, setContextMenu] = useState<PortContextMenu | null>(null);

    const loadPorts = useCallback(async (showLoading = true) => {
        if (showLoading) {
            setIsLoading(true);
        }
        setErrorMessage('');

        try {
            const [primary, related] = await Promise.allSettled([loadPortList(), loadProcessList()]);
            if (primary.status === 'rejected') throw primary.reason;
            setPorts(primary.value);
            if (related.status === 'fulfilled') { setProcesses(related.value); setRelatedUpdated(Date.now()); }
            else setErrorMessage(t('refresh.relatedError') + (relatedUpdated ? ' ' + t('dashboard.lastUpdated') + ': ' + new Date(relatedUpdated).toLocaleTimeString() : ' ' + t('common.unavailable')));
            setLastUpdated(Date.now());
        } catch {
            setErrorMessage(t('ports.error'));
        } finally {
            if (showLoading) {
                setIsLoading(false);
            }
        }
    }, [t, relatedUpdated]);

    useSequentialAutoRefresh(loadPorts, portRefreshIntervalMs);

    const loadRelatedLogs = useCallback(async (port: PortInfo) => {
        setLogsErrorMessage('');

        try {
            setOperationLogs(await loadRecentOperationLogsForResource({
                pid: port.pid,
                processName: port.processName,
                ports: [port.port],
            }));
        } catch {
            setOperationLogs([]);
            setLogsErrorMessage(t('logs.error'));
        }
    }, [t]);

    const openPortDetail = (port: PortInfo) => {
        setOperationMessage('');
        setContextMenu(null);
        setSelectedPort(port);
        void loadRelatedLogs(port);
    };

    const closePortDetail = () => {
        setSelectedPort(null);
        setOperationLogs([]);
        setLogsErrorMessage('');
    };

    const openKillConfirmation = (port: PortInfo) => {
        if (port.isProtected) {
            return;
        }

        setOperationMessage('');
        setContextMenu(null);
        setPortToKill(port);
    };

    const closeKillConfirmation = () => {
        if (!isKilling) {
            setPortToKill(null);
        }
    };

    const confirmKillPortOccupant = async () => {
        if (!portToKill) {
            return;
        }

        setIsKilling(true);
        setErrorMessage('');

        try {
            const result = await killProcessByPort(portToKill.port, portToKill.protocol, portToKill.pid, portToKill.createdAt);
            setOperationStatus(operationVariant(result));
            setOperationMessage(operationText(result, t));
            setPortToKill(null);

            if (result.code === 'identity_changed') { closePortDetail(); await loadPorts(false); }
            if (result.success) {
                await loadPorts(false);
                if (selectedPort && samePort(selectedPort, portToKill)) {
                    closePortDetail();
                } else if (selectedPort) {
                    await loadRelatedLogs(selectedPort);
                }
            }
        } catch {
            setOperationStatus('error');
            setOperationMessage(t('processes.killError'));
        } finally {
            setIsKilling(false);
        }
    };

    const handlePortRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, port: PortInfo) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        openPortDetail(port);
    };

    const openPortContextMenu = (port: PortInfo, x: number, y: number) => {
        setOperationMessage('');
        setContextMenu({
            port,
            x,
            y,
        });
    };

    const handlePortRowMouseDown = (event: MouseEvent<HTMLTableRowElement>, port: PortInfo) => {
        if (event.button !== 2) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        openPortContextMenu(port, event.clientX, event.clientY);
    };

    const handlePortRowContextMenu = (event: MouseEvent<HTMLTableRowElement>, port: PortInfo) => {
        event.preventDefault();
        event.stopPropagation();
        openPortContextMenu(port, event.clientX, event.clientY);
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

    const statusOptions = useMemo(() => {
        return Array.from(new Set(ports.map((port) => port.status).filter(Boolean))).sort();
    }, [ports]);

    const visiblePorts = useMemo(() => {
        const normalizedPortSearch = portSearch.trim();
        const normalizedProcessSearch = processSearch.trim().toLowerCase();

        return ports.filter((port) => {
            const matchesPort = normalizedPortSearch === ''
                || port.port.toString().includes(normalizedPortSearch);
            const matchesProcess = normalizedProcessSearch === ''
                || port.processName.toLowerCase().includes(normalizedProcessSearch);
            const matchesProtocol = protocolFilter === 'all' || port.protocol === protocolFilter;
            const matchesStatus = statusFilter === 'all' || port.status === statusFilter;

            return matchesPort && matchesProcess && matchesProtocol && matchesStatus;
        });
    }, [portSearch, ports, processSearch, protocolFilter, statusFilter]);

    const isFiltered = portSearch.trim() !== ''
        || processSearch.trim() !== ''
        || protocolFilter !== 'all'
        || statusFilter !== 'all';
    const emptyMessage = isFiltered ? t('ports.emptyFiltered') : t('ports.empty');
    const processesByPID = useMemo(() => groupProcessesByPID(processes), [processes]);
    const selectedProcess = selectedPort ? processesByPID.get(selectedPort.pid) : undefined;
    const selectedOwner = selectedProcess?.createdAt === selectedPort?.createdAt ? selectedProcess : undefined;
    const relatedLogs = useMemo(() => {
        if (!selectedPort) {
            return [];
        }

        return operationLogs.slice(0, 5);
    }, [operationLogs, selectedPort]);

    return (
        <section className="page-panel process-page" aria-label={page.title}>
            <RefreshControls t={t} updatedAt={lastUpdated}/>
            <div className="resource-toolbar port-toolbar">
                <label className="filter-field compact-filter">
                    <span>{t('filter.port')}</span>
                    <input
                        aria-label={t('filter.port')}
                        inputMode="numeric"
                        value={portSearch}
                        onChange={(event) => setPortSearch(event.target.value)}
                        placeholder="5173"
                    />
                </label>
                <label className="filter-field">
                    <span>{t('filter.processName')}</span>
                    <input
                        aria-label={t('filter.processName')}
                        value={processSearch}
                        onChange={(event) => setProcessSearch(event.target.value)}
                        placeholder="node.exe"
                    />
                </label>
                <label className="filter-field compact-filter">
                    <span>{t('filter.protocol')}</span>
                    <select
                        aria-label={t('filter.protocol')}
                        value={protocolFilter}
                        onChange={(event) => setProtocolFilter(event.target.value as PortProtocolFilter)}
                    >
                        <option value="all">{t('common.allProtocols')}</option>
                        <option value="TCP">TCP</option>
                        <option value="UDP">UDP</option>
                    </select>
                </label>
                <label className="filter-field compact-filter">
                    <span>{t('filter.status')}</span>
                    <select
                        aria-label={t('filter.status')}
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                    >
                        <option value="all">{t('common.allStatuses')}</option>
                        {statusOptions.map((status) => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>
                </label>
                <span className="resource-list-count">
                    {visiblePorts.length}{isFiltered && ` / ${ports.length}`} {t('common.items')}
                </span>
            </div>

            {errorMessage && <StatusMessage variant="error">{errorMessage}</StatusMessage>}
            {operationMessage && <StatusMessage variant={operationStatus}>{operationMessage}</StatusMessage>}
            {isLoading && ports.length === 0 && (
                <StatusMessage variant="loading">{t('ports.loading')}</StatusMessage>
            )}

            {!isLoading && !errorMessage && visiblePorts.length === 0 && (
                <StatusMessage variant="empty">{emptyMessage}</StatusMessage>
            )}

            {visiblePorts.length > 0 && (
                <div className={selectedPort ? 'process-detail-layout has-detail' : 'process-detail-layout'}>
                    <ScrollableDataTable
                        className="compact-table-wrap"
                        scrollbarLabel={`${t('table.portList')} horizontal scroll`}
                    >
                        <table className="process-table port-table compact-data-table" aria-label={t('table.portList')}>
                            <thead>
                                <tr>
                                    <th>{t('field.port')}</th>
                                    <th>{t('field.processName')}</th>
                                    <th>{t('field.pid')}</th>
                                    <th>{t('field.protocol')}</th>
                                    <th>{t('field.status')}</th>
                                    <th className="metric-heading">{t('field.cpu')}</th>
                                    <th className="metric-heading">{t('field.memory')}</th>
                                    <th>{t('field.protected')}</th>
                                    <th>{t('field.path')}</th>
                                    <th>{t('field.command')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visiblePorts.map((port) => {
                                    const isDevPort = isCommonDevelopmentPort(port.port);
                                    const isSelected = (selectedPort ? samePort(selectedPort, port) : false)
                                        || (contextMenu ? samePort(contextMenu.port, port) : false);
                                    const candidateOwner = processesByPID.get(port.pid);
                                    const owner = candidateOwner?.createdAt === port.createdAt ? candidateOwner : undefined;
                                    const processName = owner?.name || port.processName || t('common.unknown');
                                    const processPath = owner?.path || port.processPath || t('common.unavailable');
                                    const commandLine = owner?.commandLine || t('common.unavailable');
                                    const isProtected = owner?.isProtected ?? port.isProtected;

                                    return (
                                        <tr
                                            key={portRowKey(port)}
                                            aria-selected={isSelected}
                                            className={portRowClassName(port, isSelected)}
                                            onClick={() => openPortDetail(port)}
                                            onContextMenu={(event) => handlePortRowContextMenu(event, port)}
                                            onKeyDown={(event) => handlePortRowKeyDown(event, port)}
                                            onMouseDown={(event) => handlePortRowMouseDown(event, port)}
                                            tabIndex={0}
                                        >
                                            <td>
                                                <span className="mono">{port.port}</span>
                                                {isDevPort && <span className="dev-port-badge">{t('badge.devPort')}</span>}
                                            </td>
                                            <td data-testid="port-process-name">
                                                <ProcessNameCell
                                                    iconDataURL={owner?.iconDataURL ?? ''}
                                                    name={processName}
                                                    fallbackName={t('common.unknown')}
                                                />
                                            </td>
                                            <td className="mono">{port.pid}</td>
                                            <td><span className="protocol-badge">{port.protocol || t('common.unknown')}</span></td>
                                            <td className="mono">{port.status || t('common.unknown')}</td>
                                            <td className="mono metric-cell">{owner ? formatPercent(owner.cpuPercent) : t('common.unavailable')}</td>
                                            <td className="mono metric-cell">{owner ? formatMemorySize(owner.memoryBytes) : t('common.unavailable')}</td>
                                            <td>
                                                <span className={isProtected ? 'protected-badge' : 'standard-badge'}>
                                                    {isProtected ? t('badge.protected') : t('badge.standard')}
                                                </span>
                                            </td>
                                            <td className="muted-cell compact-path-cell" title={processPath}>
                                                {processPath}
                                            </td>
                                            <td className="muted-cell" title={commandLine}>
                                                <span className="command-cell" title={commandLine}>{commandLine}</span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </ScrollableDataTable>

                    {selectedPort && (
                    <aside
                        aria-label={t('detail.port.aria')}
                        className="process-detail-drawer"
                        role="complementary"
                    >
                        <div className="detail-drawer-header">
                            <div className="detail-drawer-title">
                                <p className="detail-drawer-kicker">{t('detail.port.aria')}</p>
                                <h2>{selectedPort.processName || t('common.unknown')} :{selectedPort.port}</h2>
                            </div>
                            <div className="detail-header-actions">
                                <button
                                    className="danger-button"
                                    type="button"
                                    disabled={selectedPort.isProtected || isKilling}
                                    onClick={() => openKillConfirmation(selectedPort)}
                                >
                                    {t('terminate.occupancy')}
                                </button>
                                <button
                                    aria-label={t('common.close')}
                                    className="detail-close-button"
                                    type="button"
                                    onClick={closePortDetail}
                                    disabled={isKilling}
                                >
                                    <span aria-hidden="true">&times;</span>
                                </button>
                            </div>
                        </div>

                        <div className="detail-drawer-body">
                            <div className="detail-badge-row">
                                <span className={selectedPort.isProtected ? 'protected-badge' : 'standard-badge'}>
                                    {selectedPort.isProtected ? t('badge.protected') : t('badge.standard')}
                                </span>
                                {isCommonDevelopmentPort(selectedPort.port) && (
                                    <span className="protocol-badge">{t('badge.devPort')}</span>
                                )}
                            </div>

                            <dl className="detail-field-list">
                                <div>
                                    <dt>{t('field.port')}</dt>
                                    <dd className="mono">{selectedPort.port}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.protocol')}</dt>
                                    <dd>{selectedPort.protocol || t('common.unknown')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.status')}</dt>
                                    <dd className="mono">{selectedPort.status || t('common.unknown')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.pid')}</dt>
                                    <dd className="mono">{selectedPort.pid}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.processName')}</dt>
                                    <dd>{selectedPort.processName || t('common.unknown')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.cpu')}</dt>
                                    <dd className="mono">{selectedOwner ? formatPercent(selectedOwner.cpuPercent) : t('common.unavailable')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.memory')}</dt>
                                    <dd className="mono">{selectedOwner ? formatMemorySize(selectedOwner.memoryBytes) : t('common.unavailable')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.processPath')}</dt>
                                    <dd>{selectedOwner?.path || selectedPort.processPath || t('common.unavailable')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.command')}</dt>
                                    <dd>{selectedOwner?.commandLine || t('common.unavailable')}</dd>
                                </div>
                            </dl>

                            <PortRelatedLogs
                                logs={relatedLogs}
                                logsErrorMessage={logsErrorMessage}
                                t={t}
                            />
                        </div>
                    </aside>
                    )}
                </div>
            )}

            {contextMenu && (
                <div
                    className="process-context-menu"
                    role="menu"
                    style={{left: contextMenu.x, top: contextMenu.y}}
                    aria-label={t('table.portList')}
                    onClick={(event) => event.stopPropagation()}
                    onContextMenu={(event) => event.preventDefault()}
                >
                    <button
                        type="button"
                        role="menuitem"
                        onClick={() => openPortDetail(contextMenu.port)}
                    >
                        {t('processes.details')}
                    </button>
                    <button
                        className="danger-menu-item"
                        type="button"
                        role="menuitem"
                        disabled={contextMenu.port.isProtected || isKilling}
                        onClick={() => openKillConfirmation(contextMenu.port)}
                    >
                        {t('terminate.occupancy')}
                    </button>
                </div>
            )}

            {portToKill && (
                <div className="modal-backdrop" role="presentation">
                    <section
                        aria-labelledby="kill-port-dialog-title"
                        className="confirmation-dialog"
                        role="dialog"
                    >
                        <div className="dialog-header">
                            <h2 id="kill-port-dialog-title">{t('dialog.port.title')}</h2>
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
                            <div><dt>{t('field.processCreatedAt')}</dt><dd>{portToKill.createdAt > 0 ? new Date(portToKill.createdAt).toLocaleString() : t('common.unavailable')}</dd></div>
                            <div>
                                <dt>{t('field.port')}</dt>
                                <dd className="mono">{portToKill.port}</dd>
                            </div>
                            <div>
                                <dt>{t('field.protocol')}</dt>
                                <dd>{portToKill.protocol || t('common.unknown')}</dd>
                            </div>
                            <div>
                                <dt>{t('field.pid')}</dt>
                                <dd className="mono">{portToKill.pid}</dd>
                            </div>
                            <div>
                                <dt>{t('field.processName')}</dt>
                                <dd>{portToKill.processName || t('common.unknown')}</dd>
                            </div>
                            <div>
                                <dt>{t('field.path')}</dt>
                                <dd>{portToKill.processPath || t('common.unavailable')}</dd>
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
                                onClick={confirmKillPortOccupant}
                                disabled={isKilling}
                            >
                                {t('dialog.action.confirmEndOccupancy')}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
}

function groupProcessesByPID(processes: ProcessInfo[]): Map<number, ProcessInfo> {
    const processesByPID = new Map<number, ProcessInfo>();
    for (const process of processes) {
        processesByPID.set(process.pid, process);
    }

    return processesByPID;
}

interface RelatedLogsProps {
    logs: OperationLog[];
    logsErrorMessage: string;
    t: Translator;
}

function PortRelatedLogs({logs, logsErrorMessage, t}: RelatedLogsProps) {
    return (
        <div className="detail-section">
            <div className="detail-section-header">
                <h3>{t('detail.recentLogs')}</h3>
                <span className="settings-count">{logs.length}</span>
            </div>
            {logsErrorMessage && (
                <p className="detail-inline-warning">{logsErrorMessage}</p>
            )}
            {logs.length === 0 && !logsErrorMessage && (
                <p className="detail-empty">{t('detail.noLogs')}</p>
            )}
            {logs.length > 0 && (
                <ul className="detail-log-list">
                    {logs.map((log) => (
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
    );
}

function portRowClassName(port: PortInfo, isSelected: boolean): string | undefined {
    const classNames = [];
    if (isCommonDevelopmentPort(port.port)) {
        classNames.push('dev-port-row');
    }
    if (isSelected) {
        classNames.push('selected-process-row');
    }

    return classNames.length > 0 ? classNames.join(' ') : undefined;
}

function portRowKey(port: PortInfo): string {
    return `${port.protocol}-${port.port}-${port.pid}-${port.createdAt}-${port.status}`;
}

function samePort(left: PortInfo, right: PortInfo): boolean {
    return portRowKey(left) === portRowKey(right);
}

function formatDetailCreatedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

export default PortsPage;
