import type {PageDefinition} from '../types/navigation';
import type {LanguageCode, Translator} from '../services/i18n';
import CleanupPage from './CleanupPage';
import DashboardPage from './DashboardPage';
import FeedbackPage from './FeedbackPage';
import LogsPage from './LogsPage';
import PortsPage from './PortsPage';
import ProcessesPage from './ProcessesPage';
import SettingsPage from './SettingsPage';
import NetworkPage from './NetworkPage';

interface PagePanelProps {
    language: LanguageCode;
    page: PageDefinition;
    t: Translator;
    onLanguageChange: (language: LanguageCode) => void;
}

function PagePanel({language, page, t, onLanguageChange}: PagePanelProps) {
    if (page.id === 'network') return <NetworkPage page={page} t={t}/>;
    if (page.id === 'dashboard') {
        return <DashboardPage page={page} t={t}/>;
    }

    if (page.id === 'processes') {
        return <ProcessesPage page={page} t={t}/>;
    }

    if (page.id === 'ports') {
        return <PortsPage page={page} t={t}/>;
    }

    if (page.id === 'cleanup') {
        return <CleanupPage page={page} t={t}/>;
    }

    if (page.id === 'logs') {
        return <LogsPage page={page} t={t}/>;
    }

    if (page.id === 'feedback') {
        return <FeedbackPage page={page} t={t}/>;
    }

    if (page.id === 'settings') {
        return (
            <SettingsPage
                language={language}
                page={page}
                t={t}
                onLanguageChange={onLanguageChange}
            />
        );
    }

    return (
        <section className="page-panel" aria-label={t('page.unsupported.title')}>
            <div className="page-empty-state">
                <span>{t('page.unsupported.status')}</span>
                <p>{t('page.unsupported.description')}</p>
            </div>
        </section>
    );
}

export default PagePanel;
