import {act, fireEvent, render, screen, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import NetworkPage from './NetworkPage';
import {NetworkPerformance} from '../components/NetworkChart';
import {PageActivityContext} from '../hooks/useSequentialAutoRefresh';
import {createTranslator} from '../services/i18n';
import {networkGroups} from '../services/network';
import type {NetworkSnapshot, NetworkProcess} from '../types/network';

const load = vi.hoisted(() => vi.fn());
vi.mock('../../wailsjs/go/main/App', () => ({GetNetworkSnapshot: () => load()}));
const t = createTranslator('en');
const page = {id: 'network' as const, label: 'Network', title: 'Network', description: '', eyebrow: ''};
const row = (id: number, overrides: Partial<NetworkProcess> = {}): NetworkProcess => ({
    id, pid: 42, createdAt: 1000, name: 'node.exe', iconDataURL: '', path: 'C:\\node.exe', commandLine: '', user: '', cpuPercent: 0, memoryBytes: 0, isProtected: false,
    projectPath: 'D:\\repo', projectName: 'repo', downloadBytes: 2048, uploadBytes: 1024, localDownloadBytes: 512, localUploadBytes: 256, downloadRate: 128, uploadRate: 64, exited: false, ...overrides,
});
const snapshot = (overrides: Partial<NetworkSnapshot> = {}): NetworkSnapshot => ({
    state: 'ready', error: '', attributionError: '', startedAt: 1000, updatedAt: 3000, eventsLost: 0, buffersLost: 0, unparsedEvents: 0,
    downloadBytes: 2048, uploadBytes: 1024, localDownloadBytes: 512, localUploadBytes: 256, downloadRate: 128, uploadRate: 64,
    processes: [row(1)], history: [{time: 2000, downloadRate: 128, uploadRate: 32}, {time: 3000, downloadRate: 64, uploadRate: 64}], ...overrides,
});

describe('session network monitoring', () => {
    beforeEach(() => { load.mockReset(); load.mockResolvedValue(snapshot()); });
    afterEach(() => { vi.useRealTimers(); });

    it('groups archived processes without merging same-name apps or projects', () => {
        const groups = networkGroups([row(1, {exited: true}), row(2), row(3, {projectPath: 'D:\\other\\repo'}), row(4, {projectPath: '', applicationPath: 'D:\\repo', applicationName: 'repo'})], 'total');
        expect(groups).toHaveLength(3);
        const repo = groups.find(group => group.key === 'd:/repo')!;
        expect(repo.downloadBytes).toBe(4096);
        expect(repo.rows).toHaveLength(2);
        expect(repo.rows.some(process => process.exited)).toBe(true);
    });

    it('shows totals, expands exited processes and separates localhost counters', async () => {
        load.mockResolvedValue(snapshot({processes: [row(1, {exited: true})]}));
        render(<NetworkPage page={page} t={t}/>);
        const table = await screen.findByRole('table', {name: 'Network traffic by app and project'});
        expect(screen.queryByText(/Collected since monitoring started/)).not.toBeInTheDocument();
        const period = document.querySelector('.network-time-range')!;
        expect(period).toHaveTextContent('Statistics period:');
        expect(period.querySelectorAll('time')[0]).toHaveAttribute('dateTime', new Date(1000).toISOString());
        expect(period.querySelectorAll('time')[1]).toHaveAttribute('dateTime', new Date(3000).toISOString());
        fireEvent.click(within(table).getByRole('button', {name: /repo/}));
        expect(within(table).getByText('node.exe')).toBeInTheDocument();
        expect(within(table).getByText(/PID 42 · Exited/)).toBeInTheDocument();
        expect(within(table).getAllByText('2.0 KB')).toHaveLength(2);
        fireEvent.change(screen.getByLabelText('Traffic scope'), {target: {value: 'local'}});
        expect(within(table).getAllByText('512 B')).toHaveLength(2);
        expect(within(table).getAllByText('768 B')).toHaveLength(2);
        fireEvent.change(screen.getByLabelText('Search app, project or process'), {target: {value: 'missing'}});
        expect(screen.getByText('No matching traffic has been collected yet.')).toBeInTheDocument();
    });

    it('shows main application icons and process icons for expanded traffic rows', async () => {
        const mainIcon = 'data:image/png;base64,main-icon';
        const helperIcon = 'data:image/png;base64,helper-icon';
        load.mockResolvedValue(snapshot({processes: [row(1, {projectPath: '', applicationPath: 'C:\\App\\app.exe', applicationName: 'App',
            applicationIconDataURL: mainIcon, path: 'C:\\App\\helper.exe', iconDataURL: helperIcon, name: 'helper.exe'})]}));
        render(<NetworkPage page={page} t={t}/>);
        const table = await screen.findByRole('table');
        expect(within(table).getByRole('img', {name: 'App icon'}).querySelector('img')).toHaveAttribute('src', mainIcon);
        fireEvent.click(within(table).getByRole('button', {name: /App/}));
        expect(within(table).getByRole('img', {name: 'helper.exe icon'}).querySelector('img')).toHaveAttribute('src', helperIcon);
    });

    it('shows a permission explanation instead of valid zero totals', async () => {
        load.mockResolvedValue(snapshot({state: 'unavailable', startedAt: 0, error: 'network.permission: Access denied', history: [], processes: []}));
        render(<NetworkPage page={page} t={t}/>);
        expect(await screen.findByText('Run OpenEnd as administrator to monitor traffic by app and project.')).toBeInTheDocument();
        expect(screen.queryByRole('table')).not.toBeInTheDocument();
        expect(screen.queryByText('0 B')).not.toBeInTheDocument();
    });

    it('retains totals on refresh failure and refreshes from backend history on page reactivation', async () => {
        vi.useFakeTimers();
        const view = render(<PageActivityContext.Provider value={true}><NetworkPage page={page} t={t}/></PageActivityContext.Provider>);
        await act(async () => {});
        load.mockRejectedValueOnce(new Error('bridge unavailable'));
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(screen.getByText('Unable to refresh network data. Previously collected totals are retained.')).toBeInTheDocument();
        expect(screen.getByRole('table')).toHaveTextContent('2.0 KB');
        expect(document.querySelector('.network-time-range time:last-child')).toHaveAttribute('dateTime', new Date(3000).toISOString());
        view.rerender(<PageActivityContext.Provider value={false}><NetworkPage page={page} t={t}/></PageActivityContext.Provider>);
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(load).toHaveBeenCalledTimes(2);
        load.mockResolvedValue(snapshot({downloadBytes: 8192, processes: [row(1, {downloadBytes: 8192})]}));
        view.rerender(<PageActivityContext.Provider value={true}><NetworkPage page={page} t={t}/></PageActivityContext.Provider>);
        await act(async () => {});
        expect(screen.getByRole('table')).toHaveTextContent('8.0 KB');
    });

    it('plots upload and download on the same adaptive scale with keyboard values and a loss warning', () => {
        render(<NetworkPerformance snapshot={snapshot({eventsLost: 2})} failed={false} t={t}/>);
        const chart = screen.getByRole('img', {name: 'Network upload and download chart'});
        expect(chart.querySelectorAll('polyline')).toHaveLength(2);
        fireEvent.focus(chart);
        expect(screen.getByRole('status')).toHaveTextContent('Download 64 B/s');
        fireEvent.keyDown(chart, {key: 'ArrowLeft'});
        expect(screen.getByRole('status')).toHaveTextContent('Download 128 B/s');
        expect(screen.getByText('Some network events were lost. Session totals are incomplete.')).toBeInTheDocument();
        expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
        expect(screen.queryByText(/Collected since monitoring started/)).not.toBeInTheDocument();
    });
});
