import {useCallback, useEffect, useMemo, useState} from 'react';
import type {KeyboardEvent} from 'react';
import ProcessNameCell from '../components/ProcessNameCell';
import ScrollableDataTable from '../components/ScrollableDataTable';
import StatusMessage from '../components/StatusMessage';
import RefreshControls from '../components/RefreshControls';
import {operationText, operationVariant, type OperationVariant} from '../services/operations';
import {useSequentialAutoRefresh} from '../hooks/useSequentialAutoRefresh';
import {buildCleanupCandidates, formatCleanupRuleNames, formatCleanupRuleReasons} from '../services/cleanup';
import {loadRecentOperationLogsForResource} from '../services/logs';
import {isCommonDevelopmentPort, loadPortList} from '../services/ports';
import {killProcessByPID, loadProcessList} from '../services/processes';
import {addCustomProtectedProcessName, loadCleanupRules} from '../services/settings';
import {formatMemorySize, formatPercent, isHighMemoryUsage} from '../services/systemResources';
import type {Translator} from '../services/i18n';
import type {CleanupCandidate} from '../types/cleanup';
import type {OperationLog} from '../types/logs';
import type {PageDefinition} from '../types/navigation';
import type {PortInfo} from '../types/ports';
import type {ProcessInfo} from '../types/processes';
import type {CleanupRule} from '../types/settings';

const cleanupRefreshIntervalMs = 5000;

interface CleanupPageProps {
    page: PageDefinition;
    t: Translator;
}

function CleanupPage({page, t}: CleanupPageProps) {
    const [processes, setProcesses] = useState<ProcessInfo[]>([]);
    const [ports, setPorts] = useState<PortInfo[]>([]);
    const [cleanupRules, setCleanupRules] = useState<CleanupRule[]>([]);
    const [selectedPIDs, setSelectedPIDs] = useState<Set<string>>(new Set());
    const [ignored, setIgnored] = useState<Set<string>>(new Set());
    const [batchCandidates, setBatchCandidates] = useState<CleanupCandidate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isKilling, setIsKilling] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number>();
    const [errorMessage, setErrorMessage] = useState('');
    const [operationStatus, setOperationStatus] = useState<OperationVariant>('success');
    const [operationMessage, setOperationMessage] = useState('');
    const [isConfirmingBatch, setIsConfirmingBatch] = useState(false);
    const [candidateToKill, setCandidateToKill] = useState<CleanupCandidate | null>(null);
    const [selectedDetailPID, setSelectedDetailPID] = useState<number | null>(null);
    const [operationLogs, setOperationLogs] = useState<OperationLog[]>([]);
    const [logsErrorMessage, setLogsErrorMessage] = useState('');

    const loadCleanupData = useCallback(async (showLoading = true) => {
        if (showLoading) {
            setIsLoading(true);
        }
        setErrorMessage('');

        try {
            const [nextProcesses, nextPorts, nextCleanupRules] = await Promise.all([
                loadProcessList(),
                loadPortList(),
                loadCleanupRules(),
            ]);
            setProcesses(nextProcesses);
            setPorts(nextPorts);
            setCleanupRules(nextCleanupRules);
            setLastUpdated(Date.now());
        } catch {
            setErrorMessage(t('cleanup.error'));
        } finally {
            if (showLoading) {
                setIsLoading(false);
            }
        }
    }, [t]);

    useSequentialAutoRefresh(loadCleanupData, cleanupRefreshIntervalMs);

    const candidates = useMemo(() => {
        return buildCleanupCandidates(processes, ports, cleanupRules).filter(candidate => !ignored.has(candidateIdentity(candidate)));
    }, [cleanupRules, ports, processes, ignored]);

    useEffect(() => {
        setSelectedPIDs((currentSelectedPIDs) => {
            const selectablePIDs = new Set(
                candidates
                    .filter((candidate) => !candidate.isProtected)
                    .map(candidateIdentity),
            );
            const nextSelectedPIDs = new Set<string>();
            currentSelectedPIDs.forEach((pid) => {
                if (selectablePIDs.has(pid)) {
                    nextSelectedPIDs.add(pid);
                }
            });

            return nextSelectedPIDs;
        });
    }, [candidates]);

    const selectedCandidates = useMemo(() => {
        return candidates.filter((candidate) => selectedPIDs.has(candidateIdentity(candidate)));
    }, [candidates, selectedPIDs]);

    const selectedCandidate = useMemo(() => {
        if (selectedDetailPID === null) {
            return null;
        }

        return candidates.find((candidate) => candidate.pid === selectedDetailPID) ?? null;
    }, [candidates, selectedDetailPID]);

    const selectedCandidatePorts = useMemo(() => {
        if (!selectedCandidate) {
            return [];
        }

        return ports.filter((port) => port.pid === selectedCandidate.pid);
    }, [ports, selectedCandidate]);

    const relatedLogs = useMemo(() => {
        if (!selectedCandidate) {
            return [];
        }

        return operationLogs.slice(0, 5);
    }, [operationLogs, selectedCandidate]);

    useEffect(() => {
        if (selectedDetailPID === null) {
            return;
        }
        if (!candidates.some((candidate) => candidate.pid === selectedDetailPID)) {
            setSelectedDetailPID(null);
            setOperationLogs([]);
            setLogsErrorMessage('');
        }
    }, [candidates, selectedDetailPID]);

    const loadRelatedLogs = useCallback(async (candidate: CleanupCandidate) => {
        setLogsErrorMessage('');

        try {
            setOperationLogs(await loadRecentOperationLogsForResource({
                pid: candidate.pid,
                processName: candidate.name,
                ports: candidate.ports,
            }));
        } catch {
            setOperationLogs([]);
            setLogsErrorMessage(t('logs.error'));
        }
    }, [t]);

    const openCleanupDetail = (candidate: CleanupCandidate) => {
        setOperationMessage('');
        setSelectedDetailPID(candidate.pid);
        void loadRelatedLogs(candidate);
    };

    const closeCleanupDetail = () => {
        setSelectedDetailPID(null);
        setOperationLogs([]);
        setLogsErrorMessage('');
    };

    const toggleCandidate = (candidate: CleanupCandidate) => {
        if (candidate.isProtected || isKilling) {
            return;
        }

        setSelectedPIDs((currentSelectedPIDs) => {
            const nextSelectedPIDs = new Set(currentSelectedPIDs);
            if (nextSelectedPIDs.has(candidateIdentity(candidate))) {
                nextSelectedPIDs.delete(candidateIdentity(candidate));
            } else {
                nextSelectedPIDs.add(candidateIdentity(candidate));
            }

            return nextSelectedPIDs;
        });
    };

    const openSingleKillConfirmation = (candidate: CleanupCandidate) => {
        if (candidate.isProtected) {
            return;
        }

        setOperationMessage('');
        setCandidateToKill(candidate);
    };

    const closeSingleKillConfirmation = () => {
        if (!isKilling) {
            setCandidateToKill(null);
        }
    };

    const handleCleanupRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, candidate: CleanupCandidate) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        event.preventDefault();
        openCleanupDetail(candidate);
    };

    const openBatchConfirmation = () => {
        setOperationMessage('');
        if (selectedCandidates.length > 0) {
            setBatchCandidates([...selectedCandidates]);
            setIsConfirmingBatch(true);
        }
    };

    const closeBatchConfirmation = () => {
        if (!isKilling) {
            setIsConfirmingBatch(false);
        }
    };

    const protectCandidate = async (candidate: CleanupCandidate) => {
        setIsKilling(true);
        try {
            await addCustomProtectedProcessName(candidate.name);
            setProcesses(current => current.map(process => process.name.toLowerCase() === candidate.name.toLowerCase() ? {...process, isProtected: true} : process));
            setOperationStatus('success'); setOperationMessage(t('cleanup.protected'));
            await loadCleanupData(false);
        } catch (error) {
            setOperationStatus('error'); setOperationMessage(String(error));
        } finally { setIsKilling(false); }
    };

    const confirmSingleKill = async () => {
        if (!candidateToKill) {
            return;
        }

        const target = candidateToKill;
        setIsKilling(true);
        setErrorMessage('');

        try {
            const result = await killProcessByPID(target.pid, target.createdAt);
            setOperationStatus(operationVariant(result));
            setOperationMessage(operationText(result, t));
            setCandidateToKill(null);

            if (result.code === 'identity_changed') { closeCleanupDetail(); await loadCleanupData(false); }
            if (result.success) {
                setSelectedPIDs((currentSelectedPIDs) => {
                    const nextSelectedPIDs = new Set(currentSelectedPIDs);
                    nextSelectedPIDs.delete(candidateIdentity(target));
                    return nextSelectedPIDs;
                });
                if (selectedDetailPID === target.pid) {
                    closeCleanupDetail();
                } else if (selectedCandidate) {
                    await loadRelatedLogs(selectedCandidate);
                }
                await loadCleanupData(false);
            }
        } catch {
            setOperationStatus('error');
            setOperationMessage(t('processes.killError'));
        } finally {
            setIsKilling(false);
        }
    };

    const confirmBatchKill = async () => {
        if (batchCandidates.length === 0) { return; }

        const candidatesToKill = batchCandidates;
        setIsKilling(true);
        setErrorMessage('');

        let successCount = 0;
        let failureCount = 0;
        let partialCount = 0;
        const failures: string[] = [];

        for (const candidate of candidatesToKill) {
            try {
                const result = await killProcessByPID(candidate.pid, candidate.createdAt);
                if (result.success) {
                    successCount += 1;
                    if (result.partial) { partialCount++; failures.push(`${candidate.name} (PID ${candidate.pid}): ${operationText(result, t)}`); }
                } else {
                    failureCount += 1;
                    failures.push(`${candidate.name} (PID ${candidate.pid}): ${operationText(result, t)}`);
                }
            } catch {
                failureCount += 1;
                failures.push(`${candidate.name} (PID ${candidate.pid}): ${t('processes.killError')}`);
            }
        }

        setIsConfirmingBatch(false);
        setSelectedPIDs(new Set());
        setOperationStatus(failureCount === candidatesToKill.length ? 'error' : failureCount > 0 || partialCount > 0 ? 'warning' : 'success');
        setOperationMessage((failureCount > 0 && successCount > 0 ? t('operation.partial') + ': ' : '') + `${candidatesToKill.length} ${t('cleanup.operationSummary')} ${successCount} ${t('operation.succeeded')}, ${failureCount} ${t('operation.failed')}.` + (partialCount ? ` ${partialCount} ${t('operation.partial')}.` : '') + (failures.length ? '\n' + failures.join('\n') : ''));

        try {
            await loadCleanupData(false);
            if (selectedCandidate) {
                await loadRelatedLogs(selectedCandidate);
            }
        } finally {
            setIsKilling(false);
        }
    };

    return (
        <section className="page-panel process-page" aria-label={page.title}>
            <div className="cleanup-statusbar">
                <p className="cleanup-notice">{t('cleanup.notice')}</p>
                <RefreshControls t={t} updatedAt={lastUpdated}/>
            </div>
            {ignored.size > 0 && <button type="button" className="sort-button" onClick={() => setIgnored(new Set())}>{t('cleanup.restore')} ({ignored.size})</button>}
            <div className="resource-toolbar cleanup-toolbar" role="toolbar" aria-label={t('cleanup.actions')}>
                <div className="cleanup-toolbar-stats">
                    <div className="cleanup-toolbar-stat">
                        <span>{t('cleanup.candidates')}</span>
                        <strong>{candidates.length}</strong>
                    </div>
                    <div className="cleanup-toolbar-stat">
                        <span>{t('cleanup.selected')}</span>
                        <strong>{selectedCandidates.length}</strong>
                    </div>
                </div>
                <button
                    className="danger-button"
                    type="button"
                    onClick={openBatchConfirmation}
                    disabled={selectedCandidates.length === 0 || isKilling}
                >
                    {t('terminate.selected')}
                </button>
            </div>

            {errorMessage && <StatusMessage variant="error">{errorMessage}</StatusMessage>}
            {operationMessage && <StatusMessage variant={operationStatus}><span className="operation-details">{operationMessage}</span></StatusMessage>}
            {isLoading && candidates.length === 0 && (
                <StatusMessage variant="loading">{t('cleanup.loading')}</StatusMessage>
            )}

            {!isLoading && !errorMessage && candidates.length === 0 && (
                <StatusMessage variant="empty">{t('cleanup.empty')}</StatusMessage>
            )}

            {candidates.length > 0 && (
                <div className={selectedCandidate ? 'process-detail-layout has-detail' : 'process-detail-layout'}>
                    <ScrollableDataTable
                        className="compact-table-wrap"
                        scrollbarLabel={`${t('table.cleanupList')} horizontal scroll`}
                    >
                        <table className="process-table cleanup-table compact-data-table" aria-label={t('table.cleanupList')}>
                            <thead>
                                <tr>
                                    <th>{t('field.select')}</th>
                                    <th>{t('field.pid')}</th>
                                    <th>{t('field.processName')}</th>
                                    <th>{t('field.path')}</th>
                                    <th>{t('field.command')}</th>
                                    <th>{t('field.cpu')}</th>
                                    <th>{t('field.memory')}</th>
                                    <th>{t('field.ports')}</th>
                                    <th>{t('field.rule')}</th>
                                    <th>{t('field.reason')}</th><th>{t('field.actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {candidates.map((candidate) => {
                                    const isSelected = selectedDetailPID === candidate.pid;

                                    return (
                                        <tr
                                            key={candidate.pid}
                                            aria-selected={isSelected}
                                            className={cleanupRowClassName(candidate, isSelected)}
                                            onClick={() => openCleanupDetail(candidate)}
                                            onKeyDown={(event) => handleCleanupRowKeyDown(event, candidate)}
                                            tabIndex={0}
                                        >
                                            <td>
                                                <input
                                                    aria-label={`${t('cleanup.selectProcess')} ${candidate.name || t('common.unknown')} PID ${candidate.pid}`}
                                                    checked={selectedPIDs.has(candidateIdentity(candidate))}
                                                    disabled={candidate.isProtected || isKilling}
                                                    type="checkbox"
                                                    onClick={(event) => event.stopPropagation()}
                                                    onChange={() => toggleCandidate(candidate)}
                                                    onKeyDown={(event) => event.stopPropagation()}
                                                />
                                            </td>
                                            <td className="mono">{candidate.pid}</td>
                                            <td data-testid="cleanup-process-name">
                                                <ProcessNameCell
                                                    iconDataURL={candidate.iconDataURL}
                                                    name={candidate.name}
                                                    fallbackName={t('common.unknown')}
                                                />
                                            </td>
                                            <td className="muted-cell compact-path-cell" title={candidate.path || t('common.unavailable')}>
                                                {candidate.path || t('common.unavailable')}
                                            </td>
                                            <td className="muted-cell" title={candidate.commandLine || t('common.unavailable')}>
                                                <span className="command-cell" title={candidate.commandLine || t('common.unavailable')}>
                                                    {candidate.commandLine || t('common.unavailable')}
                                                </span>
                                            </td>
                                            <td className="mono metric-cell">{formatPercent(candidate.cpuPercent)}</td>
                                            <td className="mono metric-cell">
                                                {formatMemorySize(candidate.memoryBytes)}
                                                {isHighMemoryUsage(candidate.memoryBytes) && <span className="memory-badge">{t('badge.high')}</span>}
                                            </td>
                                            <td className="mono">{renderPorts(candidate.ports, t)}</td>
                                            <td title={formatCleanupRuleNames(candidate)}>
                                                <span className="rule-cell">{formatCleanupRuleNames(candidate)}</span>
                                            </td>
                                            <td title={formatCleanupRuleReasons(candidate)}>
                                                <span className="reason-cell">{formatCleanupRuleReasons(candidate)}</span>
                                            </td>
                                            <td><div className="candidate-actions">
                                                <button type="button" className="sort-button" disabled={isKilling} onClick={event => { event.stopPropagation(); setIgnored(current => new Set(current).add(candidateIdentity(candidate))); }}>{t('cleanup.ignore')}</button>
                                                <button type="button" className="sort-button" disabled={isKilling || !candidate.name} onClick={event => { event.stopPropagation(); void protectCandidate(candidate); }}>{t('cleanup.protect')}</button>
                                            </div></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </ScrollableDataTable>

                    {selectedCandidate && (
                    <aside
                        aria-label={t('detail.cleanup.aria')}
                        className="process-detail-drawer"
                        role="complementary"
                    >
                        <div className="detail-drawer-header">
                            <div className="detail-drawer-title">
                                <p className="detail-drawer-kicker">{t('field.pid')} {selectedCandidate.pid}</p>
                                <h2>{selectedCandidate.name || t('common.unknown')} PID {selectedCandidate.pid}</h2>
                            </div>
                            <div className="detail-header-actions">
                                <button
                                    className="danger-button"
                                    type="button"
                                    disabled={selectedCandidate.isProtected || isKilling}
                                    onClick={() => openSingleKillConfirmation(selectedCandidate)}
                                >
                                    {t('terminate.process')}
                                </button>
                                <button
                                    aria-label={t('common.close')}
                                    className="detail-close-button"
                                    type="button"
                                    onClick={closeCleanupDetail}
                                    disabled={isKilling}
                                >
                                    <span aria-hidden="true">&times;</span>
                                </button>
                            </div>
                        </div>

                        <div className="detail-drawer-body">
                            <div className="detail-badge-row">
                                <span className={selectedCandidate.isProtected ? 'protected-badge' : 'standard-badge'}>
                                    {selectedCandidate.isProtected ? t('badge.protected') : t('badge.standard')}
                                </span>
                                <span className="protocol-badge">{t('detail.developerRelated')}</span>
                            </div>

                            <dl className="detail-field-list">
                                <div>
                                    <dt>{t('field.pid')}</dt>
                                    <dd className="mono">{selectedCandidate.pid}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.processName')}</dt>
                                    <dd>{selectedCandidate.name || t('common.unknown')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.path')}</dt>
                                    <dd>{selectedCandidate.path || t('common.unavailable')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.command')}</dt>
                                    <dd>{selectedCandidate.commandLine || t('common.unavailable')}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.cpu')}</dt>
                                    <dd className="mono">{formatPercent(selectedCandidate.cpuPercent)}</dd>
                                </div>
                                <div>
                                    <dt>{t('field.memory')}</dt>
                                    <dd className="mono">{formatMemorySize(selectedCandidate.memoryBytes)}</dd>
                                </div>
                            </dl>

                            <div className="detail-section">
                                <div className="detail-section-header">
                                    <h3>{t('field.ports')}</h3>
                                    <span className="settings-count">{selectedCandidatePorts.length}</span>
                                </div>
                                {selectedCandidatePorts.length === 0 && (
                                    <p className="detail-empty">{t('detail.noPorts')}</p>
                                )}
                                {selectedCandidatePorts.length > 0 && (
                                    <ul className="detail-port-list">
                                        {selectedCandidatePorts.map((port) => (
                                            <li key={`${port.protocol}-${port.port}-${port.status}`}>
                                                <span className="mono">{port.port}</span>
                                                <span className="protocol-badge">{port.protocol || t('common.unknown')}</span>
                                                <span className="mono muted-cell">{port.status || t('common.unknown')}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>

                            <CleanupRuleMatches candidate={selectedCandidate} t={t}/>

                            <CleanupRelatedLogs
                                logs={relatedLogs}
                                logsErrorMessage={logsErrorMessage}
                                t={t}
                            />
                        </div>
                    </aside>
                    )}
                </div>
            )}

            {candidateToKill && (
                <div className="modal-backdrop" role="presentation">
                    <section
                        aria-labelledby="cleanup-single-dialog-title"
                        className="confirmation-dialog"
                        role="dialog"
                    >
                        <div className="dialog-header">
                            <h2 id="cleanup-single-dialog-title">{t('dialog.process.title')}</h2>
                            <button
                                aria-label={t('common.close')}
                                className="dialog-close-button"
                                type="button"
                                onClick={closeSingleKillConfirmation}
                                disabled={isKilling}
                            >
                                {t('common.close')}
                            </button>
                        </div>
                        <dl className="confirmation-details">
                            <div><dt>{t('field.processCreatedAt')}</dt><dd>{candidateToKill.createdAt > 0 ? new Date(candidateToKill.createdAt).toLocaleString() : t('common.unavailable')}</dd></div>
                            <div>
                                <dt>{t('field.pid')}</dt>
                                <dd className="mono">{candidateToKill.pid}</dd>
                            </div>
                            <div>
                                <dt>{t('field.processName')}</dt>
                                <dd>{candidateToKill.name || t('common.unknown')}</dd>
                            </div>
                            <div>
                                <dt>{t('field.path')}</dt>
                                <dd>{candidateToKill.path || t('common.unavailable')}</dd>
                            </div>
                            <div>
                                <dt>{t('field.memory')}</dt>
                                <dd className="mono">{formatMemorySize(candidateToKill.memoryBytes)}</dd>
                            </div>
                        </dl>
                        <div className="dialog-actions">
                            <button
                                className="sort-button"
                                type="button"
                                onClick={closeSingleKillConfirmation}
                                disabled={isKilling}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                className="danger-button"
                                type="button"
                                onClick={confirmSingleKill}
                                disabled={isKilling}
                            >
                                {t('dialog.action.confirmEndProcess')}
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {isConfirmingBatch && (
                <div className="modal-backdrop" role="presentation">
                    <section
                        aria-labelledby="cleanup-dialog-title"
                        className="confirmation-dialog"
                        role="dialog"
                    >
                        <div className="dialog-header">
                            <h2 id="cleanup-dialog-title">{t('dialog.cleanup.title')}</h2>
                            <button
                                aria-label={t('common.close')}
                                className="dialog-close-button"
                                type="button"
                                onClick={closeBatchConfirmation}
                                disabled={isKilling}
                            >
                                {t('common.close')}
                            </button>
                        </div>
                        <p className="dialog-summary">{batchCandidates.length} {t('cleanup.dialog.summary')}</p>
                        <dl className="confirmation-details">
                            {batchCandidates.map((candidate) => (
                                <div key={candidate.pid}>
                                    <dt className="mono">{candidate.pid}</dt>
                                    <dd>
                                        <span>{candidate.name || t('common.unknown')}</span>
                                        <span className="muted-cell"> - {formatMemorySize(candidate.memoryBytes)} - {t('field.ports')} {formatPorts(candidate.ports, t)}</span>
                                    </dd>
                                </div>
                            ))}
                        </dl>
                        <div className="dialog-actions">
                            <button
                                className="sort-button"
                                type="button"
                                onClick={closeBatchConfirmation}
                                disabled={isKilling}
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                className="danger-button"
                                type="button"
                                onClick={confirmBatchKill}
                                disabled={isKilling}
                            >
                                {t('dialog.action.confirmEndSelected')}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
}

function candidateIdentity(candidate: CleanupCandidate): string { return `${candidate.pid}:${candidate.createdAt}`; }

function formatPorts(ports: number[], t: Translator): string {
    if (ports.length === 0) {
        return t('common.none');
    }

    return ports.join(', ');
}

function renderPorts(ports: number[], t: Translator) {
    if (ports.length === 0) {
        return t('common.none');
    }

    return ports.map((port, index) => (
        <span key={port}>
            {index > 0 && ', '}
            <span className={isCommonDevelopmentPort(port) ? 'inline-dev-port' : undefined}>{port}</span>
        </span>
    ));
}

interface CleanupRuleMatchesProps {
    candidate: CleanupCandidate;
    t: Translator;
}

function CleanupRuleMatches({candidate, t}: CleanupRuleMatchesProps) {
    return (
        <div className="detail-section">
            <div className="detail-section-header">
                <h3>{t('field.rule')}</h3>
                <span className="settings-count">{candidate.matchedRules.length}</span>
            </div>
            <ul className="cleanup-match-list">
                {candidate.matchedRules.map((match) => (
                    <li key={match.ruleId}>
                        <span className="protocol-badge">{match.ruleName}</span>
                        <div className="cleanup-match-reasons">
                            {match.reasons.map((reason) => (
                                <span key={reason}>{reason}</span>
                            ))}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

interface RelatedLogsProps {
    logs: OperationLog[];
    logsErrorMessage: string;
    t: Translator;
}

function CleanupRelatedLogs({logs, logsErrorMessage, t}: RelatedLogsProps) {
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

function cleanupRowClassName(candidate: CleanupCandidate, isSelected = false): string | undefined {
    const classNames = [];
    if (candidate.isProtected) {
        classNames.push('protected-row');
    }
    if (isHighMemoryUsage(candidate.memoryBytes)) {
        classNames.push('high-memory-row');
    }
    if (candidate.ports.some(isCommonDevelopmentPort)) {
        classNames.push('dev-port-row');
    }
    if (isSelected) {
        classNames.push('selected-process-row');
    }

    return classNames.length > 0 ? classNames.join(' ') : undefined;
}

function formatDetailCreatedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

export default CleanupPage;
