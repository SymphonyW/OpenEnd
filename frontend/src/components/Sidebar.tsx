import {useState} from 'react';
import Icon from './Icon';
import SidebarUpdates from './SidebarUpdates';
import type {PageDefinition, PageId} from '../types/navigation';
import type {Translator} from '../services/i18n';

interface SidebarProps {
    activePageId: PageId;
    pages: PageDefinition[];
    t: Translator;
    onSelectPage: (pageId: PageId) => void;
}

function Sidebar({activePageId, pages, t, onSelectPage}: SidebarProps) {
    const [collapsed, setCollapsed] = useState(false);
    return (
        <aside className={collapsed ? 'sidebar is-collapsed' : 'sidebar'} aria-label={t('sidebar.navigation')}>
            <button
                className="sidebar-brand"
                type="button"
                aria-expanded={!collapsed}
                title={t('sidebar.toggle')}
                onClick={() => setCollapsed(!collapsed)}
            >
                <span className="app-mark"><Icon name="app" size={22}/></span>
                <span className="brand-label">OpenEnd</span>
            </button>
            <nav className="nav-list">
                {pages.map((page) => {
                    const item = (
                        <button
                            key={page.id}
                            className={page.id === 'settings' ? 'nav-item nav-settings' : 'nav-item'}
                            type="button"
                            title={page.label}
                            aria-label={page.label}
                            aria-current={activePageId === page.id ? 'page' : undefined}
                            onClick={() => onSelectPage(page.id)}
                        >
                            <Icon name={page.id}/>
                            <span className="nav-label">{page.label}</span>
                        </button>
                    );
                    return page.id === 'settings' ? <SidebarUpdates key={page.id} t={t}>{item}</SidebarUpdates> : item;
                })}
            </nav>
        </aside>
    );
}

export default Sidebar;
