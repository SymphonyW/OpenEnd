import type {PageId} from '../types/navigation';

type IconName = PageId | 'menu' | 'app' | 'update';

const paths: Record<IconName, string> = {
    app: 'M4 17V9m5 8V4m5 13v-6m5 6V7',
    menu: 'M4 6h16M4 12h16M4 18h16',
    update: 'M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5',
    dashboard: 'M3 17V5m0 14h18M6 14l4-5 4 3 6-8',
    processes: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
    ports: 'M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-12 0V8zm6 10v3',
    cleanup: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5',
    logs: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7m-7 4h7',
    feedback: 'M4 5h16v11H8l-4 4V5zm4 4h8m-8 4h5',
    settings: 'M9 3h6l.6 3 2.6 1.5 2.8-1 3 5.2-2.2 2 .1 3 2.1 2-3 5.2-2.8-1-2.6 1.5L15 27H9l-.6-3-2.6-1.5-2.8 1-3-5.2 2.2-2-.1-3-2.1-2 3-5.2 2.8 1L8.4 6 9 3z',
};

function Icon({name, size = 20}: {name: IconName; size?: number}) {
    return (
        <svg aria-hidden="true" width={size} height={size} viewBox={name === 'settings' ? '-3 0 30 30' : '0 0 24 24'} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d={paths[name]}/>
            {name === 'settings' && <circle cx="12" cy="15" r="4"/>}
        </svg>
    );
}

export default Icon;
