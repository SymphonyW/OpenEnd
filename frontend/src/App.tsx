import {useEffect, useMemo, useState} from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import UpdateNotice from './components/UpdateNotice';
import {PageActivityContext} from './hooks/useSequentialAutoRefresh';
import PagePanel from './pages/PagePanel';
import {
    createTranslator,
    languageStorageKey,
    resolveInitialLanguage,
    type LanguageCode,
} from './services/i18n';
import {defaultPageId, getPageById, getPages} from './services/pages';
import type {PageId} from './types/navigation';
import {ProjectNavigationContext} from './services/projects';
import type {ProjectPage} from './services/projects';

function App() {
    const [activePageId, setActivePageId] = useState<PageId>(defaultPageId);
    const [visitedPages, setVisitedPages] = useState<PageId[]>([defaultPageId]);
    const [projectTarget, setProjectTarget] = useState<{page: ProjectPage; path: string; sequence: number} | null>(null);
    const selectPage = (id: PageId) => {
        setVisitedPages(current => current.includes(id) ? current : [...current, id]);
        setActivePageId(id);
    };
    const [language, setLanguage] = useState<LanguageCode>(() => resolveInitialLanguage());

    const t = useMemo(() => createTranslator(language), [language]);
    const pages = useMemo(() => getPages(t), [t]);

    useEffect(() => {
        document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    }, [language]);

    const activePage = getPageById(activePageId, pages);

    const handleLanguageChange = (nextLanguage: LanguageCode) => {
        setLanguage(nextLanguage);
        window.localStorage.setItem(languageStorageKey, nextLanguage);
    };

    return (
        <div className="app-shell">
            <Sidebar
                activePageId={activePageId}
                pages={pages}
                t={t}
                onSelectPage={selectPage}
            />
            <main className="main-content" aria-label={activePage.label}>
                <UpdateNotice t={t} showDetails={activePageId === 'settings'}/>
                <ProjectNavigationContext.Provider value={{target: projectTarget, navigate: (page, path) => {
                    setProjectTarget(current => ({page, path, sequence: (current?.sequence ?? 0) + 1}));
                    selectPage(page);
                }}}>
                {visitedPages.map(id => (
                    <div className="workspace-body" key={id} hidden={id !== activePageId}>
                        <PageActivityContext.Provider value={id === activePageId}>
                            <PagePanel language={language} page={getPageById(id, pages)} t={t} onLanguageChange={handleLanguageChange}/>
                        </PageActivityContext.Provider>
                    </div>
                ))}
                </ProjectNavigationContext.Provider>
            </main>
        </div>
    );
}

export default App;
