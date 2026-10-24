export type PageId = 'dashboard' | 'processes' | 'ports' | 'network' | 'cleanup' | 'logs' | 'feedback' | 'settings';

export interface PageDefinition {
    id: PageId;
    label: string;
    title: string;
    description: string;
    eyebrow: string;
}
