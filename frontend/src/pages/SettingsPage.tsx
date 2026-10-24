import {FormEvent, useCallback, useState} from 'react';
import StatusMessage from '../components/StatusMessage';
import {useSequentialAutoRefresh} from '../hooks/useSequentialAutoRefresh';
import {
    addCleanupRule,
    addCustomProtectedProcessName,
    deleteCleanupRule,
    deleteCustomProtectedProcessName,
    loadCleanupRules,
    loadProtectionSettings,
    setCleanupRuleEnabled,
} from '../services/settings';
import {languages, type LanguageCode, type Translator} from '../services/i18n';
import type {PageDefinition} from '../types/navigation';
import type {CleanupPortRange, CleanupRule, CleanupRuleInput, ProtectionSettings} from '../types/settings';

const settingsRefreshIntervalMs = 10000;

interface SettingsPageProps {
    language: LanguageCode;
    page: PageDefinition;
    t: Translator;
    onLanguageChange: (language: LanguageCode) => void;
}

const emptyProtectionSettings: ProtectionSettings = {
    defaultProcessNames: [],
    customProcessNames: [],
};

function SettingsPage({language, page, t, onLanguageChange}: SettingsPageProps) {
    const [settings, setSettings] = useState<ProtectionSettings>(emptyProtectionSettings);
    const [cleanupRules, setCleanupRules] = useState<CleanupRule[]>([]);
    const [customName, setCustomName] = useState('');
    const [cleanupRuleName, setCleanupRuleName] = useState('');
    const [cleanupRuleProcessNames, setCleanupRuleProcessNames] = useState('');
    const [cleanupRuleCommandKeywords, setCleanupRuleCommandKeywords] = useState('');
    const [cleanupRulePorts, setCleanupRulePorts] = useState('');
    const [cleanupRulePortRanges, setCleanupRulePortRanges] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [operationMessage, setOperationMessage] = useState('');

    const loadSettings = useCallback(async (showLoading = true) => {
        if (showLoading) {
            setIsLoading(true);
        }
        setErrorMessage('');

        try {
            const [nextSettings, nextCleanupRules] = await Promise.all([
                loadProtectionSettings(),
                loadCleanupRules(),
            ]);
            setSettings(nextSettings);
            setCleanupRules(nextCleanupRules);
        } catch {
            setSettings(emptyProtectionSettings);
            setCleanupRules([]);
            setErrorMessage(t('settings.errorLoad'));
        } finally {
            if (showLoading) {
                setIsLoading(false);
            }
        }
    }, [t]);

    useSequentialAutoRefresh(loadSettings, settingsRefreshIntervalMs);

    const handleAddCustomProcess = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const nextName = customName.trim();
        if (nextName === '') {
            setErrorMessage(t('settings.customNameEmpty'));
            return;
        }

        setIsSaving(true);
        setErrorMessage('');
        setOperationMessage('');

        try {
            const nextSettings = await addCustomProtectedProcessName(nextName);
            setSettings(nextSettings);
            setCustomName('');
            setOperationMessage(t('settings.operationAdded'));
        } catch {
            setErrorMessage(t('settings.errorAdd'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteCustomProcess = async (name: string) => {
        setIsSaving(true);
        setErrorMessage('');
        setOperationMessage('');

        try {
            const nextSettings = await deleteCustomProtectedProcessName(name);
            setSettings(nextSettings);
            setOperationMessage(t('settings.operationRemoved'));
        } catch {
            setErrorMessage(t('settings.errorDelete'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleAddCleanupRule = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const name = cleanupRuleName.trim();
        if (name === '') {
            setErrorMessage(t('settings.cleanupRuleNameEmpty'));
            return;
        }

        let input: CleanupRuleInput;
        try {
            input = {
                name,
                enabled: true,
                matchProcessNames: parseStringList(cleanupRuleProcessNames),
                matchCommandKeywords: parseStringList(cleanupRuleCommandKeywords),
                matchPorts: parsePortList(cleanupRulePorts),
                matchPortRanges: parsePortRangeList(cleanupRulePortRanges),
            };
        } catch {
            setErrorMessage(t('settings.cleanupRuleInvalidMatchers'));
            return;
        }

        if (
            input.matchProcessNames.length === 0 &&
            input.matchCommandKeywords.length === 0 &&
            input.matchPorts.length === 0 &&
            input.matchPortRanges.length === 0
        ) {
            setErrorMessage(t('settings.cleanupRuleMatchersEmpty'));
            return;
        }

        setIsSaving(true);
        setErrorMessage('');
        setOperationMessage('');

        try {
            const nextRules = await addCleanupRule(input);
            setCleanupRules(nextRules);
            setCleanupRuleName('');
            setCleanupRuleProcessNames('');
            setCleanupRuleCommandKeywords('');
            setCleanupRulePorts('');
            setCleanupRulePortRanges('');
            setOperationMessage(t('settings.cleanupRuleAdded'));
        } catch {
            setErrorMessage(t('settings.cleanupRuleErrorAdd'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleCleanupRule = async (rule: CleanupRule) => {
        setIsSaving(true);
        setErrorMessage('');
        setOperationMessage('');

        try {
            const nextRules = await setCleanupRuleEnabled(rule.id, !rule.enabled);
            setCleanupRules(nextRules);
            setOperationMessage(t('settings.cleanupRuleUpdated'));
        } catch {
            setErrorMessage(t('settings.cleanupRuleErrorUpdate'));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteCleanupRule = async (rule: CleanupRule) => {
        if (rule.isBuiltin) {
            return;
        }

        setIsSaving(true);
        setErrorMessage('');
        setOperationMessage('');

        try {
            const nextRules = await deleteCleanupRule(rule.id);
            setCleanupRules(nextRules);
            setOperationMessage(t('settings.cleanupRuleDeleted'));
        } catch {
            setErrorMessage(t('settings.cleanupRuleErrorDelete'));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <section className="page-panel settings-page" aria-label={page.title}>
            <div className="settings-preferences-row">
                <section className="settings-section settings-preferences" aria-labelledby="settings-preferences-title">
                    <div className="settings-section-header">
                        <h2 id="settings-preferences-title">{t('settings.preferences.title')}</h2>
                    </div>
                    <div className="settings-preference-body">
                        <label className="filter-field">
                            <span>{t('settings.language.label')}</span>
                            <select
                                aria-label={t('settings.language.label')}
                                value={language}
                                onChange={(event) => onLanguageChange(event.target.value as LanguageCode)}
                            >
                                {languages.map((option) => (
                                    <option key={option.code} value={option.code}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                        <p>{t('settings.language.help')}</p>
                    </div>
                </section>
            </div>

            {errorMessage && <StatusMessage variant="error">{errorMessage}</StatusMessage>}
            {operationMessage && <StatusMessage variant="success">{operationMessage}</StatusMessage>}
            {isLoading && <StatusMessage variant="loading">{t('settings.loading')}</StatusMessage>}

            {!isLoading && (
                <div className="settings-layout">
                    <div className="settings-grid">
                        <section className="settings-section" aria-labelledby="default-protection-title">
                            <div className="settings-section-header">
                                <h2 id="default-protection-title">{t('settings.defaultProcesses')}</h2>
                                <span className="settings-count">{settings.defaultProcessNames.length}</span>
                            </div>
                            <ul className="protection-list" aria-label={t('settings.defaultProcesses')}>
                                {settings.defaultProcessNames.map((name) => (
                                    <li className="protection-list-row" key={name}>
                                        <span className="mono">{name}</span>
                                        <span className="protected-badge">{t('badge.default')}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <section className="settings-section" aria-labelledby="custom-protection-title">
                            <div className="settings-section-header">
                                <h2 id="custom-protection-title">{t('settings.customProcesses')}</h2>
                                <span className="settings-count">{settings.customProcessNames.length}</span>
                            </div>
                            <form className="settings-add-form" onSubmit={handleAddCustomProcess}>
                                <label className="filter-field">
                                    <span>{t('settings.customProcessName')}</span>
                                    <input
                                        aria-label={t('settings.customProcessName')}
                                        value={customName}
                                        onChange={(event) => setCustomName(event.target.value)}
                                        placeholder="node.exe"
                                        disabled={isSaving}
                                    />
                                </label>
                                <button
                                    aria-label={t('settings.addCustom')}
                                    className="primary-action-button"
                                    type="submit"
                                    disabled={isSaving}
                                >
                                    {t('common.add')}
                                </button>
                            </form>
                            {settings.customProcessNames.length === 0 ? (
                                <StatusMessage variant="empty">{t('settings.customEmpty')}</StatusMessage>
                            ) : (
                                <ul className="protection-list" aria-label={t('settings.customProcesses')}>
                                    {settings.customProcessNames.map((name) => (
                                        <li className="protection-list-row" key={name}>
                                            <span className="mono">{name}</span>
                                            <button
                                                aria-label={`${t('settings.deleteCustom')} ${name}`}
                                                className="danger-button table-action-button"
                                                type="button"
                                                onClick={() => void handleDeleteCustomProcess(name)}
                                                disabled={isSaving}
                                            >
                                                {t('common.delete')}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                    </div>

                    <section className="settings-section cleanup-rules-section" aria-labelledby="cleanup-rules-title">
                        <div className="settings-section-header">
                            <h2 id="cleanup-rules-title">{t('settings.cleanupRules.title')}</h2>
                            <span className="settings-count">{cleanupRules.length}</span>
                        </div>
                        <form className="cleanup-rule-form" onSubmit={handleAddCleanupRule}>
                            <label className="filter-field">
                                <span>{t('settings.cleanupRuleName')}</span>
                                <input
                                    aria-label={t('settings.cleanupRuleName')}
                                    value={cleanupRuleName}
                                    onChange={(event) => setCleanupRuleName(event.target.value)}
                                    placeholder="Local API"
                                    disabled={isSaving}
                                />
                            </label>
                            <label className="filter-field">
                                <span>{t('settings.cleanupRuleProcessNames')}</span>
                                <input
                                    aria-label={t('settings.cleanupRuleProcessNames')}
                                    value={cleanupRuleProcessNames}
                                    onChange={(event) => setCleanupRuleProcessNames(event.target.value)}
                                    placeholder="node.exe, api.exe"
                                    disabled={isSaving}
                                />
                            </label>
                            <label className="filter-field">
                                <span>{t('settings.cleanupRuleCommandKeywords')}</span>
                                <input
                                    aria-label={t('settings.cleanupRuleCommandKeywords')}
                                    value={cleanupRuleCommandKeywords}
                                    onChange={(event) => setCleanupRuleCommandKeywords(event.target.value)}
                                    placeholder="vite, uvicorn"
                                    disabled={isSaving}
                                />
                            </label>
                            <label className="filter-field">
                                <span>{t('settings.cleanupRulePorts')}</span>
                                <input
                                    aria-label={t('settings.cleanupRulePorts')}
                                    value={cleanupRulePorts}
                                    onChange={(event) => setCleanupRulePorts(event.target.value)}
                                    placeholder="3000, 5173"
                                    disabled={isSaving}
                                />
                            </label>
                            <label className="filter-field">
                                <span>{t('settings.cleanupRulePortRanges')}</span>
                                <input
                                    aria-label={t('settings.cleanupRulePortRanges')}
                                    value={cleanupRulePortRanges}
                                    onChange={(event) => setCleanupRulePortRanges(event.target.value)}
                                    placeholder="7000-7010"
                                    disabled={isSaving}
                                />
                            </label>
                            <button
                                aria-label={t('settings.cleanupRuleAdd')}
                                className="primary-action-button cleanup-rule-add-button"
                                type="submit"
                                disabled={isSaving}
                            >
                                {t('common.add')}
                            </button>
                        </form>

                        {cleanupRules.length === 0 ? (
                            <StatusMessage variant="empty">{t('settings.cleanupRulesEmpty')}</StatusMessage>
                        ) : (
                            <ul className="cleanup-rule-list" aria-label={t('settings.cleanupRules.title')}>
                                {cleanupRules.map((rule) => (
                                    <li className="cleanup-rule-row" key={rule.id}>
                                        <div className="cleanup-rule-main">
                                            <div className="cleanup-rule-title-row">
                                                <strong>{rule.name}</strong>
                                                <span className={rule.enabled ? 'standard-badge' : 'protected-badge'}>
                                                    {rule.enabled ? t('settings.enabled') : t('settings.disabled')}
                                                </span>
                                                <span className="protocol-badge">
                                                    {rule.isBuiltin ? t('badge.default') : t('settings.customRule')}
                                                </span>
                                            </div>
                                            <dl className="cleanup-rule-matchers">
                                                <div>
                                                    <dt>{t('settings.cleanupRuleProcessNames')}</dt>
                                                    <dd>{formatRuleValues(rule.matchProcessNames, t)}</dd>
                                                </div>
                                                <div>
                                                    <dt>{t('settings.cleanupRuleCommandKeywords')}</dt>
                                                    <dd>{formatRuleValues(rule.matchCommandKeywords, t)}</dd>
                                                </div>
                                                <div>
                                                    <dt>{t('settings.cleanupRulePorts')}</dt>
                                                    <dd>{formatRuleValues(rule.matchPorts.map(String), t)}</dd>
                                                </div>
                                                <div>
                                                    <dt>{t('settings.cleanupRulePortRanges')}</dt>
                                                    <dd>{formatRuleValues(rule.matchPortRanges.map(formatPortRange), t)}</dd>
                                                </div>
                                            </dl>
                                        </div>
                                        <div className="cleanup-rule-actions">
                                            <button
                                                aria-label={`${rule.enabled ? t('common.disable') : t('common.enable')} ${rule.name}`}
                                                className="sort-button"
                                                type="button"
                                                onClick={() => void handleToggleCleanupRule(rule)}
                                                disabled={isSaving}
                                            >
                                                {rule.enabled ? t('common.disable') : t('common.enable')}
                                            </button>
                                            {!rule.isBuiltin && (
                                                <button
                                                    aria-label={`${t('common.delete')} ${rule.name}`}
                                                    className="danger-button table-action-button"
                                                    type="button"
                                                    onClick={() => void handleDeleteCleanupRule(rule)}
                                                    disabled={isSaving}
                                                >
                                                    {t('common.delete')}
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                </div>
            )}
        </section>
    );
}

function parseStringList(value: string): string[] {
    return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function parsePortList(value: string): number[] {
    const ports = parseStringList(value).map((part) => Number(part));
    if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
        throw new Error('invalid port list');
    }

    return ports;
}

function parsePortRangeList(value: string): CleanupPortRange[] {
    return parseStringList(value).map((part) => {
        const match = part.match(/^(\d+)\s*-\s*(\d+)$/);
        if (!match) {
            throw new Error('invalid port range');
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 65535 || start > end) {
            throw new Error('invalid port range');
        }

        return {start, end};
    });
}

function formatRuleValues(values: string[], t: Translator): string {
    return values.length === 0 ? t('common.none') : values.join(', ');
}

function formatPortRange(portRange: CleanupPortRange): string {
    return `${portRange.start}-${portRange.end}`;
}

export default SettingsPage;
