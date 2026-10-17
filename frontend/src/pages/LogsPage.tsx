import {useCallback, useState} from 'react';
import ScrollableDataTable from '../components/ScrollableDataTable';
import StatusMessage from '../components/StatusMessage';
import RefreshControls from '../components/RefreshControls';
import {useSequentialAutoRefresh} from '../hooks/useSequentialAutoRefresh';
import {loadOperationLogs} from '../services/logs';
import type {Translator} from '../services/i18n';
import type {OperationLog} from '../types/logs';
import type {PageDefinition} from '../types/navigation';

const logRefreshIntervalMs = 5000;

interface LogsPageProps {
    page: PageDefinition;
    t: Translator;
}

function LogsPage({page, t}: LogsPageProps) {
    const [logs, setLogs] = useState<OperationLog[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<number>();
    const [errorMessage, setErrorMessage] = useState('');

    const loadLogs = useCallback(async (showLoading = true) => {
        if (showLoading) {
            setIsLoading(true);
        }
        setErrorMessage('');

        try {
            const nextLogs = await loadOperationLogs();
            setLogs(nextLogs);
            setLastUpdated(Date.now());
        } catch {
            setErrorMessage(t('logs.error'));
        } finally {
            if (showLoading) {
                setIsLoading(false);
            }
        }
    }, [t]);

    const refresh = useSequentialAutoRefresh(loadLogs, logRefreshIntervalMs);

    return (
        <section className="page-panel process-page" aria-label={page.title}>
            <RefreshControls t={t} {...refresh} updatedAt={lastUpdated}/>
            {errorMessage && <StatusMessage variant="error">{errorMessage}</StatusMessage>}
            {isLoading && logs.length === 0 && (
                <StatusMessage variant="loading">{t('logs.loading')}</StatusMessage>
            )}

            {!isLoading && !errorMessage && logs.length === 0 && (
                <StatusMessage variant="empty">{t('logs.empty')}</StatusMessage>
            )}

            {logs.length > 0 && (
                <ScrollableDataTable
                    className="compact-table-wrap"
                    scrollbarLabel={`${t('table.logsList')} horizontal scroll`}
                >
                    <table className="process-table logs-table compact-data-table" aria-label={t('table.logsList')}>
                        <thead>
                            <tr>
                                <th>{t('field.id')}</th>
                                <th>{t('field.action')}</th>
                                <th>{t('field.pid')}</th>
                                <th>{t('field.processName')}</th>
                                <th>{t('field.port')}</th>
                                <th>{t('field.result')}</th>
                                <th>{t('field.message')}</th>
                                <th>{t('field.createdAt')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id}>
                                    <td className="mono">{log.id}</td>
                                    <td className="mono" data-testid="operation-log-action">{log.action}</td>
                                    <td className="mono">{log.pid || t('common.notApplicable')}</td>
                                    <td>{log.processName || t('common.unavailable')}</td>
                                    <td className="mono">{log.port || t('common.notApplicable')}</td>
                                    <td>
                                        <span className={log.result === 'success' ? 'result-badge success' : 'result-badge failure'}>
                                            {log.result === 'success' ? t('operation.succeeded') : t('operation.failed')}
                                        </span>
                                    </td>
                                    <td className="muted-cell">{log.message || t('common.unavailable')}</td>
                                    <td className="mono">{formatCreatedAt(log.createdAt) || t('common.unavailable')}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </ScrollableDataTable>
            )}
        </section>
    );
}

function formatCreatedAt(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString();
}

export default LogsPage;
