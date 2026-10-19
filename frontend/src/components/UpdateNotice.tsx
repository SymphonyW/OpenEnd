import {useCallback, useEffect, useRef, useState} from 'react';
import {AppVersion, CheckForUpdate} from '../../wailsjs/go/main/App';
import type {main} from '../../wailsjs/go/models';
import {BrowserOpenURL} from '../../wailsjs/runtime/runtime';
import type {Translator} from '../services/i18n';

function UpdateNotice({t, showDetails}: {t: Translator; showDetails: boolean}) {
    const [version, setVersion] = useState('');
    const [update, setUpdate] = useState<main.UpdateInfo | null>(null);
    const [checking, setChecking] = useState(false);
    const [failed, setFailed] = useState(false);
    const [dismissedVersion, setDismissedVersion] = useState('');
    const inFlight = useRef(false);
    const mounted = useRef(false);

    const check = useCallback(async () => {
        if (inFlight.current) return;
        inFlight.current = true;
        setChecking(true);
        setFailed(false);
        try {
            const result = await CheckForUpdate();
            if (mounted.current) {
                setUpdate(result);
                setVersion(result.currentVersion);
                setDismissedVersion('');
            }
        } catch {
            if (mounted.current) setFailed(true);
        } finally {
            inFlight.current = false;
            if (mounted.current) setChecking(false);
        }
    }, []);

    useEffect(() => {
        mounted.current = true;
        AppVersion().then(value => {
            if (mounted.current) setVersion(value);
        }).catch(() => {
            if (mounted.current) setFailed(true);
        });
        void check();
        const timer = window.setInterval(() => void check(), 6 * 60 * 60 * 1000);
        return () => {
            mounted.current = false;
            window.clearInterval(timer);
        };
    }, [check]);

    const available = update?.available && (showDetails || dismissedVersion !== update.latestVersion);
    if (!showDetails && !available) return null;

    return (
        <section className="update-notice" aria-label={t('updates.title')}>
            <div className="update-notice-copy" role="status">
                {showDetails && <span>{t('updates.current')} {version ? `v${version}` : t('common.unavailable')}</span>}
                {available && <strong>{t('updates.available')} v{update.latestVersion}</strong>}
                {available && <span>{t('updates.installHint')}</span>}
                {showDetails && failed && <span>{t('updates.error')}</span>}
                {showDetails && !failed && !checking && update && !update.available && <span>{t('updates.latest')}</span>}
            </div>
            <div className="update-notice-actions">
                {available && <button className="primary-action-button" type="button" onClick={() => BrowserOpenURL(update.downloadURL)}>{t('updates.download')}</button>}
                {showDetails && <button className="secondary-button" type="button" disabled={checking} onClick={() => void check()}>{t(checking ? 'updates.checking' : 'updates.check')}</button>}
                {showDetails && failed && <button className="secondary-button" type="button" onClick={() => BrowserOpenURL('https://github.com/SymphonyW/OpenEnd/releases')}>{t('updates.releases')}</button>}
                {!showDetails && <button className="secondary-button" type="button" onClick={() => setDismissedVersion(update?.latestVersion ?? '')}>{t('updates.later')}</button>}
            </div>
        </section>
    );
}

export default UpdateNotice;
