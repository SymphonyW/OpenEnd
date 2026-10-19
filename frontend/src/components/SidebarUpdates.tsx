import {useEffect, useState, type ReactNode} from 'react';
import {AppVersion, CheckForUpdate} from '../../wailsjs/go/main/App';
import type {main} from '../../wailsjs/go/models';
import {BrowserOpenURL} from '../../wailsjs/runtime/runtime';
import type {Translator} from '../services/i18n';
import Icon from './Icon';

function SidebarUpdates({t, children}: {t: Translator; children: ReactNode}) {
    const [version, setVersion] = useState('');
    const [update, setUpdate] = useState<main.UpdateInfo | null>(null);
    const [showNotes, setShowNotes] = useState(false);

    useEffect(() => {
        let active = true;
        let checking = false;
        const check = async () => {
            if (checking) return;
            checking = true;
            try {
                const result = await CheckForUpdate();
                if (active) {
                    setUpdate(result);
                    setVersion(result.currentVersion);
                }
            } catch (error) {
                console.warn('Could not check for application updates:', error);
            } finally {
                checking = false;
            }
        };
        AppVersion().then(value => {
            if (active) setVersion(value);
        }).catch(error => {
            console.error('Could not read application version:', error);
        });
        void check();
        const timer = window.setInterval(() => void check(), 6 * 60 * 60 * 1000);
        return () => {
            active = false;
            window.clearInterval(timer);
        };
    }, []);

    return (
        <div className="sidebar-footer">
            {update?.available && (
                <div
                    className="sidebar-update"
                    onMouseEnter={() => setShowNotes(true)}
                    onMouseLeave={() => setShowNotes(false)}
                    onFocus={() => setShowNotes(true)}
                    onBlur={event => {
                        if (!event.currentTarget.contains(event.relatedTarget)) setShowNotes(false);
                    }}
                    onKeyDown={event => {
                        if (event.key === 'Escape') setShowNotes(false);
                    }}
                >
                    <button
                        className="nav-item nav-update"
                        type="button"
                        aria-label={t('updates.action')}
                        aria-describedby={showNotes ? 'sidebar-update-notes' : undefined}
                        onClick={() => BrowserOpenURL(update.downloadURL)}
                    >
                        <Icon name="update"/>
                        <span className="nav-label">{t('updates.action')}</span>
                    </button>
                    {showNotes && (
                        <div className="sidebar-update-tooltip" role="tooltip" id="sidebar-update-notes">
                            <div className="sidebar-update-content" tabIndex={0}>
                                <strong>{t('updates.available')} v{update.latestVersion}</strong>
                                <div className="sidebar-release-notes">{update.releaseNotes || t('updates.noNotes')}</div>
                                <p>{t('updates.installHint')}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
            {children}
            <span className="sidebar-version" aria-label={t('updates.current')} title={`${t('updates.current')} ${version}`}>
                {version ? `v${version}` : '—'}
            </span>
        </div>
    );
}

export default SidebarUpdates;
