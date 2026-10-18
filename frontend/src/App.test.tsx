import {readFileSync} from 'node:fs';
import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import App from './App';
import type {SystemResourceInfo} from './types/systemResources';

const appStyles = readFileSync('src/App.css', 'utf8');

const getSystemResourceInfoMock = vi.fn();
const getProcessListMock = vi.fn();
const getProcessDetailMock = vi.fn();
const getPortListMock = vi.fn();
const killProcessByPIDMock = vi.fn();
const killProcessByPortMock = vi.fn();
const getProtectionSettingsMock = vi.fn();
const addCustomProtectedProcessNameMock = vi.fn();
const deleteCustomProtectedProcessNameMock = vi.fn();
const getCleanupRulesMock = vi.fn();
const addCleanupRuleMock = vi.fn();
const setCleanupRuleEnabledMock = vi.fn();
const deleteCleanupRuleMock = vi.fn();
const getOperationLogsMock = vi.fn();
const getRecentOperationLogsForResourceMock = vi.fn();
const setProcessProjectMock = vi.fn();

vi.mock('../wailsjs/go/main/App', () => ({
    AddCleanupRule: (input: CleanupRuleInputFixture) => addCleanupRuleMock(input),
    AddCustomProtectedProcessName: (name: string) => addCustomProtectedProcessNameMock(name),
    AppName: () => new Promise(() => {}),
    DeleteCleanupRule: (id: string) => deleteCleanupRuleMock(id),
    DeleteCustomProtectedProcessName: (name: string) => deleteCustomProtectedProcessNameMock(name),
    GetCleanupRules: () => getCleanupRulesMock(),
    GetOperationLogs: () => getOperationLogsMock(),
    GetPortList: () => getPortListMock(),
    GetProcessDetail: (pid: number) => getProcessDetailMock(pid),
    GetProcessList: () => getProcessListMock(),
    GetProtectionSettings: () => getProtectionSettingsMock(),
    GetRecentOperationLogsForResource: (pid: number, processName: string, ports: number[]) => getRecentOperationLogsForResourceMock(pid, processName, ports),
    GetSystemResourceInfo: () => getSystemResourceInfoMock(),
    KillProcessByPID: (pid: number, createdAt: number) => killProcessByPIDMock(pid, createdAt),
    KillProcessByPort: (port: number, protocol: string, pid: number, createdAt: number) => killProcessByPortMock(port, protocol, pid, createdAt),
    SetCleanupRuleEnabled: (id: string, enabled: boolean) => setCleanupRuleEnabledMock(id, enabled),
    SetProcessProject: (pid: number, createdAt: number, path: string, remember: boolean, reset: boolean) => setProcessProjectMock(pid, createdAt, path, remember, reset),
}));

interface CleanupPortRangeFixture {
    start: number;
    end: number;
}

interface CleanupRuleInputFixture {
    name: string;
    enabled: boolean;
    matchProcessNames: string[];
    matchCommandKeywords: string[];
    matchPorts: number[];
    matchPortRanges: CleanupPortRangeFixture[];
}

interface CleanupRuleFixture extends CleanupRuleInputFixture {
    id: string;
    isBuiltin: boolean;
}

const nodeIconDataURL = 'data:image/png;base64,node-icon';

const processRows = [
    {
        pid: 4,
        createdAt: 1000,
        name: 'System',
        iconDataURL: '',
        path: '',
        commandLine: '',
        user: '',
        cpuPercent: 0,
        memoryBytes: 96 * 1024 * 1024,
        isProtected: true,
    },
    {
        pid: 100,
        createdAt: 1000,
        name: 'node.exe',
        iconDataURL: nodeIconDataURL,
        path: 'C:\\Program Files\\nodejs\\node.exe',
        commandLine: 'node server.js',
        user: 'DESKTOP\\dev',
        cpuPercent: 12.3,
        memoryBytes: 512 * 1024 * 1024,
        isProtected: false,
    },
    {
        pid: 200,
        createdAt: 1000,
        name: 'postgres.exe',
        iconDataURL: '',
        path: 'C:\\PostgreSQL\\bin\\postgres.exe',
        commandLine: 'postgres -D data',
        user: 'DESKTOP\\postgres',
        cpuPercent: 2.4,
        memoryBytes: 1024 * 1024 * 1024,
        isProtected: false,
    },
    {
        pid: 500,
        createdAt: 1000,
        name: 'vmmem',
        iconDataURL: '',
        path: '',
        commandLine: '',
        user: 'NT AUTHORITY\\SYSTEM',
        cpuPercent: 0.5,
        memoryBytes: 256 * 1024 * 1024,
        isProtected: true,
    },
    {
        pid: 600,
        createdAt: 1000,
        name: 'chrome.exe',
        iconDataURL: '',
        path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        commandLine: 'chrome.exe',
        user: 'DESKTOP\\dev',
        cpuPercent: 1.1,
        memoryBytes: 384 * 1024 * 1024,
        isProtected: false,
    },
];

const portRows = [
    {
        port: 3000,
        protocol: 'TCP',
        status: 'LISTEN',
        pid: 100,
        createdAt: 1000,
        processName: 'node.exe',
        processPath: 'C:\\Program Files\\nodejs\\node.exe',
        isProtected: false,
    },
    {
        port: 5432,
        protocol: 'TCP',
        status: 'LISTEN',
        pid: 200,
        createdAt: 1000,
        processName: 'postgres.exe',
        processPath: 'C:\\PostgreSQL\\bin\\postgres.exe',
        isProtected: false,
    },
    {
        port: 5353,
        protocol: 'UDP',
        status: 'LISTEN',
        pid: 300,
        createdAt: 1000,
        processName: 'dns-sd.exe',
        processPath: '',
        isProtected: false,
    },
    {
        port: 9000,
        protocol: 'TCP',
        status: 'ESTABLISHED',
        pid: 400,
        createdAt: 1000,
        processName: 'custom-api.exe',
        processPath: 'C:\\dev\\custom-api.exe',
        isProtected: false,
    },
    {
        port: 135,
        protocol: 'TCP',
        status: 'LISTEN',
        pid: 456,
        createdAt: 1000,
        processName: 'svchost.exe',
        processPath: 'C:\\Windows\\System32\\svchost.exe',
        isProtected: true,
    },
];

const protectionSettings = {
    defaultProcessNames: ['System', 'Registry', 'svchost.exe', 'explorer.exe', 'lsass.exe'],
    customProcessNames: ['redis-server.exe'],
};

const cleanupRules: CleanupRuleFixture[] = [
    {
        id: 'builtin-node-vite',
        name: 'Node/Vite',
        enabled: true,
        isBuiltin: true,
        matchProcessNames: ['node.exe', 'npm', 'pnpm', 'yarn', 'vite'],
        matchCommandKeywords: [],
        matchPorts: [3000, 5173, 5174],
        matchPortRanges: [],
    },
    {
        id: 'builtin-database',
        name: 'Database',
        enabled: true,
        isBuiltin: true,
        matchProcessNames: ['redis-server', 'postgres', 'mysql'],
        matchCommandKeywords: [],
        matchPorts: [6379, 5432, 3306],
        matchPortRanges: [],
    },
    {
        id: 'custom-local-api',
        name: 'Local API',
        enabled: true,
        isBuiltin: false,
        matchProcessNames: ['custom-api.exe'],
        matchCommandKeywords: ['--local-api'],
        matchPorts: [9000],
        matchPortRanges: [
            {start: 9100, end: 9102},
        ],
    },
];

const operationLogs = [
    {
        id: 2,
        action: 'kill_process_by_port',
        pid: 100,
        processName: 'node.exe',
        port: 3000,
        result: 'success',
        message: 'Process node.exe (PID 100) ended for TCP port 3000.',
        createdAt: '2026-07-03T09:05:00Z',
    },
    {
        id: 1,
        action: 'kill_process_by_pid',
        pid: -1,
        processName: '',
        port: 0,
        result: 'failure',
        message: 'PID -1 is invalid.',
        createdAt: '2026-07-03T09:00:00Z',
    },
];

const nodeProcessDetail = {
    pid: 100,
        createdAt: 1000,
    processName: 'node.exe',
    iconDataURL: nodeIconDataURL,
    executablePath: '',
    executablePathError: 'Unable to read executable path. Try running as administrator.',
    commandLine: 'node server.js',
    commandLineError: '',
    cpuPercent: 12.3,
    memoryBytes: 512 * 1024 * 1024,
    isProtected: false,
    isDeveloperRelated: true,
    ports: [
        {
            port: 3000,
            protocol: 'TCP',
            status: 'LISTEN',
        },
    ],
    portsError: '',
    recentLogs: [
        operationLogs[0],
    ],
    logsError: '',
};

const baseSystemResourceInfo = {
    metrics: undefined as SystemResourceInfo['metrics'],
    cpuPercent: 42.5,
    cpuName: 'Intel(R) Core(TM) i9-14900HX',
    cpuPhysicalCores: 24,
    cpuLogicalProcessors: 32,
    cpuMaxMHz: 2200,
    totalMemoryBytes: 16 * 1024 * 1024 * 1024,
    usedMemoryBytes: 9.5 * 1024 * 1024 * 1024,
    freeMemoryBytes: 6.5 * 1024 * 1024 * 1024,
    gpuPercent: 18.2,
    gpuNames: ['NVIDIA GeForce RTX 4070 Laptop GPU'],
    totalVRAMBytes: 8 * 1024 * 1024 * 1024,
    usedVRAMBytes: 3 * 1024 * 1024 * 1024,
    freeVRAMBytes: 5 * 1024 * 1024 * 1024,
    processCount: 184,
    threadCount: 22656,
    portCount: 37,
    uptimeSeconds: 57_600,
};

function makeSystemResourceInfo(overrides: Partial<typeof baseSystemResourceInfo> = {}) {
    return {
        ...baseSystemResourceInfo,
        ...overrides,
    };
}

describe('App layout navigation', () => {
    afterEach(() => {
        vi.useRealTimers();
        window.localStorage.clear();
    });

    beforeEach(() => {
        window.localStorage.clear();
        getSystemResourceInfoMock.mockReset();
        getSystemResourceInfoMock.mockResolvedValue(makeSystemResourceInfo());
        getProcessListMock.mockReset();
        getProcessListMock.mockResolvedValue(processRows);
        setProcessProjectMock.mockReset();
        setProcessProjectMock.mockResolvedValue(undefined);
        getProcessDetailMock.mockReset();
        getProcessDetailMock.mockResolvedValue(nodeProcessDetail);
        getPortListMock.mockReset();
        getPortListMock.mockResolvedValue(portRows);
        killProcessByPIDMock.mockReset();
        killProcessByPIDMock.mockResolvedValue({
            success: true,
            message: 'Process node.exe (PID 100) ended.',
            pid: 100,
            processName: 'node.exe',
        });
        killProcessByPortMock.mockReset();
        killProcessByPortMock.mockResolvedValue({
            success: true,
            message: 'Process node.exe (PID 100) ended for TCP port 3000.',
            pid: 100,
            processName: 'node.exe',
        });
        getProtectionSettingsMock.mockReset();
        getProtectionSettingsMock.mockResolvedValue(protectionSettings);
        addCustomProtectedProcessNameMock.mockReset();
        addCustomProtectedProcessNameMock.mockResolvedValue({
            defaultProcessNames: protectionSettings.defaultProcessNames,
            customProcessNames: ['redis-server.exe', 'webpack.exe'],
        });
        deleteCustomProtectedProcessNameMock.mockReset();
        deleteCustomProtectedProcessNameMock.mockResolvedValue({
            defaultProcessNames: protectionSettings.defaultProcessNames,
            customProcessNames: [],
        });
        getCleanupRulesMock.mockReset();
        getCleanupRulesMock.mockResolvedValue(cleanupRules);
        addCleanupRuleMock.mockReset();
        addCleanupRuleMock.mockResolvedValue([
            ...cleanupRules,
            {
                id: 'custom-worker',
                name: 'Worker',
                enabled: true,
                isBuiltin: false,
                matchProcessNames: ['worker.exe'],
                matchCommandKeywords: ['queue'],
                matchPorts: [7001],
                matchPortRanges: [
                    {start: 7100, end: 7102},
                ],
            },
        ]);
        setCleanupRuleEnabledMock.mockReset();
        setCleanupRuleEnabledMock.mockResolvedValue(cleanupRules.map((rule) => (
            rule.id === 'builtin-node-vite'
                ? {...rule, enabled: false}
                : rule
        )));
        deleteCleanupRuleMock.mockReset();
        deleteCleanupRuleMock.mockResolvedValue(cleanupRules.filter((rule) => rule.id !== 'custom-local-api'));
        getOperationLogsMock.mockReset();
        getOperationLogsMock.mockResolvedValue(operationLogs);
        getRecentOperationLogsForResourceMock.mockReset();
        getRecentOperationLogsForResourceMock.mockResolvedValue(operationLogs);
    });

    it('renders all primary navigation pages and highlights Performance by default', async () => {
        render(<App/>);

        expect(screen.queryByText('Desktop')).not.toBeInTheDocument();
        const sidebar = screen.getByRole('complementary', {name: 'Primary navigation'});
        const brandButton = screen.getByRole('button', {name: 'OpenEnd'});
        expect(brandButton).toHaveAttribute('aria-expanded', 'true');
        expect(screen.queryByRole('button', {name: 'Toggle navigation'})).not.toBeInTheDocument();
        fireEvent.click(brandButton);
        expect(sidebar).toHaveClass('is-collapsed');
        expect(brandButton).toHaveAttribute('aria-expanded', 'false');
        expect(screen.getByRole('button', {name: 'Performance'})).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('button', {name: 'Processes'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Ports'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Cleanup'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Logs'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Feedback'})).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Settings'})).toBeInTheDocument();
        expect(await screen.findByLabelText('CPU usage chart')).toBeInTheDocument();
        expect(screen.queryByRole('heading', {name: 'Performance'})).not.toBeInTheDocument();
        expect(screen.queryByText('System overview')).not.toBeInTheDocument();
    });

    it('renders Dashboard while async GPU details are still pending', async () => {
        getSystemResourceInfoMock.mockResolvedValueOnce({
            ...makeSystemResourceInfo(),
            gpuNames: null,
            gpuPercent: 0,
            totalVRAMBytes: 0,
            usedVRAMBytes: 0,
            freeVRAMBytes: 0,
        });

        render(<App/>);

        expect(await screen.findByLabelText('CPU usage chart')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'GPU'})).toHaveTextContent('Unavailable');
        expect(screen.getByRole('button', {name: 'VRAM'})).toHaveTextContent('Unavailable');
    });

    it('switches the main content when a navigation item is selected', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));

        expect(screen.getByRole('button', {name: 'Ports'})).toHaveAttribute('aria-current', 'page');
        expect(await screen.findByText('node.exe')).toBeInTheDocument();
        expect(screen.queryByRole('heading', {name: 'Ports'})).not.toBeInTheDocument();
        expect(screen.queryByText('Review local TCP and UDP ports and the owning process.')).not.toBeInTheDocument();
    });

    it('opens the Feedback page with an email channel', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Feedback'}));

        expect(screen.getByRole('button', {name: 'Feedback'})).toHaveAttribute('aria-current', 'page');
        expect(screen.queryByRole('heading', {name: 'Feedback'})).not.toBeInTheDocument();
        expect(screen.getByRole('main', {name: 'Feedback'})).toBeInTheDocument();
        expect(screen.getByText('xinzhanwu1201@gmail.com')).toBeInTheDocument();
        expect(screen.getByText('Email template')).toBeInTheDocument();
        expect(screen.getByText(/Related process or port:/)).toBeInTheDocument();
        expect(screen.getByRole('link', {name: 'Email feedback'})).toHaveAttribute('href', expect.stringContaining('mailto:xinzhanwu1201@gmail.com'));
    });

    it('uses sidebar navigation to identify pages without duplicate workspace titles', async () => {
        render(<App/>);

        expect(await screen.findByLabelText('CPU usage chart')).toBeInTheDocument();
        expect(screen.queryByText('System overview')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', {name: 'Performance'})).not.toBeInTheDocument();
        expect(screen.getByRole('main', {name: 'Performance'})).toBeInTheDocument();
        expect(screen.queryByText('Monitor CPU, memory, GPU, VRAM, processes, and occupied ports in real time.')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();
        expect(screen.queryByText('Process monitor')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', {name: 'Processes'})).not.toBeInTheDocument();
        expect(screen.getByRole('main', {name: 'Processes'})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Settings'}));
        expect(await screen.findByText('redis-server.exe')).toBeInTheDocument();
        expect(screen.queryByText('Protection settings')).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', {name: 'Settings'})).not.toBeInTheDocument();
        expect(screen.getByRole('main', {name: 'Settings'})).toBeInTheDocument();
    });

    it('loads Dashboard resource metrics and refreshes them automatically', async () => {
        vi.useFakeTimers();
        getSystemResourceInfoMock
            .mockResolvedValueOnce(makeSystemResourceInfo({
                cpuPercent: 42.5,
                usedMemoryBytes: 9.5 * 1024 * 1024 * 1024,
                freeMemoryBytes: 6.5 * 1024 * 1024 * 1024,
                gpuPercent: 18.2,
                usedVRAMBytes: 3 * 1024 * 1024 * 1024,
                freeVRAMBytes: 5 * 1024 * 1024 * 1024,
                processCount: 184,
                threadCount: 22656,
                portCount: 37,
            }))
            .mockResolvedValueOnce(makeSystemResourceInfo({
                cpuPercent: 25,
                usedMemoryBytes: 8 * 1024 * 1024 * 1024,
                freeMemoryBytes: 7.5 * 1024 * 1024 * 1024,
                gpuPercent: 28.4,
                usedVRAMBytes: 4 * 1024 * 1024 * 1024,
                freeVRAMBytes: 4 * 1024 * 1024 * 1024,
                processCount: 190,
                threadCount: 23000,
                portCount: 42,
            }));

        render(<App/>);

        await act(async () => {});

        expect(screen.getAllByText('42.5%').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Intel(R) Core(TM) i9-14900HX').length).toBeGreaterThan(0);
        expect(screen.getByText('2.20 GHz')).toBeInTheDocument();
        expect(screen.getByText('32')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Memory'})).toHaveTextContent('59.4%');
        expect(screen.queryByText('Total Memory')).not.toBeInTheDocument();
        expect(screen.queryByText('Used Memory')).not.toBeInTheDocument();
        expect(screen.queryByText('Free Memory')).not.toBeInTheDocument();
        expect(screen.getByText('GPU')).toBeInTheDocument();
        expect(screen.getByText('VRAM')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'VRAM'})).toHaveTextContent('37.5%');
        expect(screen.getByText('184')).toBeInTheDocument();
        expect(screen.getByText('22,656')).toBeInTheDocument();
        expect(screen.getByText('37')).toBeInTheDocument();
        expect(screen.getAllByText('Intel(R) Core(TM) i9-14900HX').length).toBeGreaterThan(0);

        expect(screen.queryByRole('button', {name: 'Refresh'})).not.toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(999);
        });
        await act(async () => {});
        expect(getSystemResourceInfoMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            vi.advanceTimersByTime(1);
        });
        await act(async () => {});

        expect(getSystemResourceInfoMock).toHaveBeenCalledTimes(2);
        expect(screen.getAllByText('25.0%').length).toBeGreaterThan(0);
        expect(screen.getByRole('button', {name: 'Memory'})).toHaveTextContent('50.0%');
        expect(screen.getByRole('button', {name: 'VRAM'})).toHaveTextContent('50.0%');
        expect(screen.getByText('190')).toBeInTheDocument();
        expect(screen.getByText('23,000')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders Dashboard resource charts and updates them on an interval', async () => {
        vi.useFakeTimers();
        getSystemResourceInfoMock
            .mockResolvedValueOnce(makeSystemResourceInfo({
                cpuPercent: 42.5,
                usedMemoryBytes: 9.5 * 1024 * 1024 * 1024,
                freeMemoryBytes: 6.5 * 1024 * 1024 * 1024,
                gpuPercent: 18.2,
                usedVRAMBytes: 3 * 1024 * 1024 * 1024,
                freeVRAMBytes: 5 * 1024 * 1024 * 1024,
                processCount: 184,
                portCount: 37,
            }))
            .mockResolvedValueOnce(makeSystemResourceInfo({
                cpuPercent: 25,
                usedMemoryBytes: 8 * 1024 * 1024 * 1024,
                freeMemoryBytes: 8 * 1024 * 1024 * 1024,
                gpuPercent: 28.4,
                usedVRAMBytes: 4 * 1024 * 1024 * 1024,
                freeVRAMBytes: 4 * 1024 * 1024 * 1024,
                processCount: 190,
                portCount: 42,
            }));

        render(<App/>);

        await act(async () => {});

        expect(screen.getAllByText('42.5%').length).toBeGreaterThan(0);
        expect(screen.getByLabelText('CPU usage chart')).toBeInTheDocument();
        expect(screen.queryByLabelText('Memory usage chart')).not.toBeInTheDocument();
        expect(screen.getByLabelText('CPU usage chart').querySelector('polyline')?.getAttribute('points')?.split(' ')).toHaveLength(1);

        await act(async () => {
            vi.advanceTimersByTime(1000);
        });
        await act(async () => {});

        expect(getSystemResourceInfoMock).toHaveBeenCalledTimes(2);
        expect(screen.getAllByText('25.0%').length).toBeGreaterThan(0);
        expect(screen.getAllByText('50.0%').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('28.4%')).toBeInTheDocument();
        const cpuPoints = screen.getByLabelText('CPU usage chart').querySelector('polyline')?.getAttribute('points')?.split(' ') ?? [];
        expect(cpuPoints).toHaveLength(2);
        expect(cpuPoints[0]).toMatch(/^0,/);
        expect(cpuPoints[1]).toMatch(/^100,/);
        fireEvent.focus(screen.getByLabelText('CPU usage chart'));
        fireEvent.keyDown(screen.getByLabelText('CPU usage chart'), {key: 'ArrowLeft'});
        expect(screen.getByText('CPU 42.5%')).toBeInTheDocument();
        fireEvent.keyDown(screen.getByLabelText('CPU usage chart'), {key: 'ArrowRight'});
        expect(screen.getByText('CPU 25.0%')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Memory'}));
        expect(screen.getByLabelText('Memory usage chart')).toBeInTheDocument();
        expect(screen.getByText('Total Memory')).toBeInTheDocument();
        expect(screen.getByRole('button', {name: 'Memory'})).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(screen.getByRole('button', {name: 'GPU'}));
        expect(screen.getByLabelText('GPU usage chart')).toBeInTheDocument();
        expect(screen.getAllByText('NVIDIA GeForce RTX 4070 Laptop GPU').length).toBeGreaterThan(0);
        fireEvent.click(screen.getByRole('button', {name: 'VRAM'}));
        expect(screen.getByLabelText('VRAM usage chart')).toBeInTheDocument();
    });

    it('shows interactive Dashboard chart values when hovering a chart', async () => {
        render(<App/>);

        const chart = await screen.findByLabelText('CPU usage chart');
        fireEvent.mouseMove(chart, {clientX: 20});

        expect(screen.getByText('CPU 42.5%')).toBeInTheDocument();
    });

    it('switches application language from Settings', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Settings'}));
        expect(await screen.findByText('redis-server.exe')).toBeInTheDocument();

        await act(async () => {
            fireEvent.change(screen.getByLabelText('Language'), {target: {value: 'zh'}});
        });

        expect(screen.getByRole('button', {name: '进程'})).toBeInTheDocument();
        expect(screen.queryByRole('heading', {name: '设置'})).not.toBeInTheDocument();
        expect(screen.getByLabelText('语言')).toHaveValue('zh');
    });

    it('loads Processes into selectable rows with a row context menu', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));

        expect(await screen.findByText('node.exe')).toBeInTheDocument();
        expect(screen.getByText('System')).toBeInTheDocument();
        expect(screen.getAllByText('Protected').length).toBeGreaterThan(1);

        const table = screen.getByRole('table', {name: 'Process list'});
        const nodeRow = screen.getByText('node.exe').closest('tr');

        expect(nodeRow).not.toBeNull();
        expect(nodeRow).toHaveAttribute('tabindex', '0');
        expect(within(table).queryByRole('button', {name: 'Details'})).not.toBeInTheDocument();
        expect(within(table).queryByRole('button', {name: 'End Process'})).not.toBeInTheDocument();
        expect(screen.queryByRole('complementary', {name: 'Process detail'})).not.toBeInTheDocument();

        fireEvent.mouseDown(nodeRow as HTMLTableRowElement, {button: 2, clientX: 80, clientY: 120});

        const menu = screen.getByRole('menu');
        expect(within(menu).getByRole('menuitem', {name: 'Details'})).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', {name: 'End Process'})).toBeInTheDocument();
    });

    it('shows process icons with a fallback initial in process name cells', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        const nodeRow = screen.getByText('node.exe').closest('tr');
        const systemRow = screen.getByText('System').closest('tr');
        expect(nodeRow).not.toBeNull();
        expect(systemRow).not.toBeNull();

        const nodeIcon = within(nodeRow as HTMLTableRowElement).getByRole('img', {name: 'node.exe icon'});
        expect(nodeIcon.querySelector('img')).toHaveAttribute('src', nodeIconDataURL);

        const fallbackIcon = within(systemRow as HTMLTableRowElement).getByRole('img', {name: 'System icon'});
        expect(fallbackIcon).toHaveTextContent('S');
    });

    it('keeps long process commands visually constrained while preserving full command text', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        const nodeRow = screen.getByText('node.exe').closest('tr');
        expect(nodeRow).not.toBeNull();
        const commandCell = within(nodeRow as HTMLTableRowElement).getByText('node server.js');
        expect(commandCell).toHaveClass('command-cell');
        expect(commandCell).toHaveAttribute('title', 'node server.js');
    });

    it('opens a process detail drawer with ports logs and permission warnings without resetting filters', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Process name'), {target: {value: 'node'}});
        const nodeRow = screen.getByText('node.exe').closest('tr');
        expect(nodeRow).not.toBeNull();
        fireEvent.click(nodeRow as HTMLTableRowElement);

        await waitFor(() => expect(getProcessDetailMock).toHaveBeenCalledWith(100));
        const drawer = await screen.findByRole('complementary', {name: 'Process detail'});
        const processDetailHeader = drawer.querySelector('.detail-drawer-header') as HTMLElement;

        expect(nodeRow).toHaveAttribute('aria-selected', 'true');
        const processCloseButton = within(processDetailHeader).getByRole('button', {name: 'Close'});
        expect(processCloseButton).toHaveClass('detail-close-button');
        expect(processCloseButton.closest('.detail-header-actions')).not.toBeNull();
        await waitFor(() => expect(within(processDetailHeader).getByRole('button', {name: 'End Process'})).not.toBeDisabled());
        expect(within(drawer).getByText('node.exe')).toBeInTheDocument();
        expect(within(drawer).getByText('100')).toBeInTheDocument();
        expect(within(drawer).getByText('Unable to read executable path. Try running as administrator.')).toBeInTheDocument();
        expect(within(drawer).getByText('node server.js')).toBeInTheDocument();
        expect(within(drawer).getByText('Developer-related')).toBeInTheDocument();
        expect(within(drawer).getByText('3000')).toBeInTheDocument();
        expect(within(drawer).getByText('kill_process_by_port')).toBeInTheDocument();
        expect(within(drawer).getByText('Process node.exe (PID 100) ended for TCP port 3000.')).toBeInTheDocument();

        fireEvent.click(within(drawer).getByRole('button', {name: 'Close'}));

        expect(screen.queryByRole('complementary', {name: 'Process detail'})).not.toBeInTheDocument();
        expect(screen.getByLabelText('Process name')).toHaveValue('node');
    });

    it('confirms before ending a process from the detail drawer', async () => {
        getProcessListMock
            .mockResolvedValueOnce(processRows)
            .mockResolvedValueOnce(processRows.filter((process) => process.pid !== 100));

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        const nodeRow = screen.getByText('node.exe').closest('tr');
        expect(nodeRow).not.toBeNull();
        fireEvent.click(nodeRow as HTMLTableRowElement);

        const drawer = await screen.findByRole('complementary', {name: 'Process detail'});
        fireEvent.click(within(drawer).getByRole('button', {name: 'End Process'}));

        const dialog = screen.getByRole('dialog', {name: 'Confirm process termination'});
        expect(within(dialog).getByText('node.exe')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm End Process'}));

        await waitFor(() => expect(killProcessByPIDMock).toHaveBeenCalledWith(100, 1000));
        expect(await screen.findByText('Process node.exe (PID 100) ended.')).toBeInTheDocument();
    });

    it('confirms before ending a process from the row context menu', async () => {
        getProcessListMock
            .mockResolvedValueOnce(processRows)
            .mockResolvedValueOnce(processRows.filter((process) => process.pid !== 100));

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        const nodeRow = screen.getByText('node.exe').closest('tr');
        expect(nodeRow).not.toBeNull();
        fireEvent.mouseDown(nodeRow as HTMLTableRowElement, {button: 2, clientX: 80, clientY: 120});
        fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', {name: 'End Process'}));

        const dialog = screen.getByRole('dialog', {name: 'Confirm process termination'});
        expect(within(dialog).getByText('node.exe')).toBeInTheDocument();
        expect(within(dialog).getByText('C:\\Program Files\\nodejs\\node.exe')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm End Process'}));

        await waitFor(() => expect(killProcessByPIDMock).toHaveBeenCalledWith(100, 1000));
        expect(await screen.findByText('Process node.exe (PID 100) ended.')).toBeInTheDocument();
    });

    it('filters Processes by name and PID', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Process name'), {target: {value: 'node'}});
        expect(screen.getByText('node.exe')).toBeInTheDocument();
        expect(screen.queryByText('postgres.exe')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Process name'), {target: {value: ''}});
        fireEvent.change(screen.getByLabelText('PID'), {target: {value: '200'}});
        expect(screen.getByText('postgres.exe')).toBeInTheDocument();
        expect(screen.queryByText('node.exe')).not.toBeInTheDocument();
    });

    it('sorts Processes by memory and CPU usage', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Memory'}));
        expect(screen.getAllByTestId('process-name')[0]).toHaveTextContent('postgres.exe');

        fireEvent.click(screen.getByRole('button', {name: 'CPU'}));
        expect(screen.getAllByTestId('process-name')[0]).toHaveTextContent('node.exe');
    });

    it('auto refreshes Processes and handles empty and error states', async () => {
        vi.useFakeTimers();
        getProcessListMock
            .mockResolvedValueOnce(processRows)
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('scan failed'));

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        await act(async () => {});
        expect(screen.getByText('node.exe')).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Refresh Processes'})).not.toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        await act(async () => {});
        expect(screen.getByText('No processes found.')).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        await act(async () => {});
        expect(screen.getByText('Unable to load process list.')).toBeInTheDocument();
    });

    it('does not overlap process refreshes while a scan is still pending', async () => {
        vi.useFakeTimers();
        let resolveInitialProcesses: (value: typeof processRows) => void = () => {};
        getProcessListMock
            .mockReturnValueOnce(new Promise<typeof processRows>((resolve) => {
                resolveInitialProcesses = resolve;
            }))
            .mockResolvedValueOnce([]);

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        await act(async () => {});
        expect(screen.getByText('Loading process list...')).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(15000);
        });
        await act(async () => {});
        expect(getProcessListMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            resolveInitialProcesses(processRows);
        });
        expect(screen.getByText('node.exe')).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        await act(async () => {});
        expect(getProcessListMock).toHaveBeenCalledTimes(2);
    });

    it('loads Ports into selectable rows with a detail panel and no inline action buttons', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));

        expect(await screen.findByText('node.exe')).toBeInTheDocument();
        expect(screen.getByText('3000')).toBeInTheDocument();
        expect(screen.getByText('5432')).toBeInTheDocument();
        expect(screen.getAllByText('Dev port')).toHaveLength(2);

        const table = screen.getByRole('table', {name: 'Port list'});
        const nodeRow = screen.getByText('node.exe').closest('tr');
        const protectedRow = screen.getByText('svchost.exe').closest('tr');

        expect(nodeRow).not.toBeNull();
        expect(protectedRow).not.toBeNull();
        expect(nodeRow).toHaveAttribute('tabindex', '0');
        expect(within(table).queryByRole('button', {name: 'End Occupancy'})).not.toBeInTheDocument();
        expect(screen.queryByRole('complementary', {name: 'Port detail'})).not.toBeInTheDocument();

        fireEvent.mouseDown(nodeRow as HTMLTableRowElement, {button: 2, clientX: 80, clientY: 120});
        const menu = screen.getByRole('menu');
        expect(within(menu).getByRole('menuitem', {name: 'Details'})).toBeInTheDocument();
        expect(within(menu).getByRole('menuitem', {name: 'End Occupancy'})).toBeInTheDocument();
        fireEvent.click(within(menu).getByRole('menuitem', {name: 'Details'}));

        await waitFor(() => expect(screen.getByRole('complementary', {name: 'Port detail'})).toBeInTheDocument());

        const detailPanel = screen.getByRole('complementary', {name: 'Port detail'});
        const portDetailHeader = detailPanel.querySelector('.detail-drawer-header') as HTMLElement;
        expect(nodeRow).toHaveAttribute('aria-selected', 'true');
        const portCloseButton = within(portDetailHeader).getByRole('button', {name: 'Close'});
        expect(portCloseButton).toHaveClass('detail-close-button');
        expect(portCloseButton.closest('.detail-header-actions')).not.toBeNull();
        expect(within(portDetailHeader).getByRole('button', {name: 'End Occupancy'})).not.toBeDisabled();
        await waitFor(() => expect(getRecentOperationLogsForResourceMock).toHaveBeenCalledWith(100, 'node.exe', [3000]));
        expect(within(detailPanel).getByText('3000')).toBeInTheDocument();
        expect(within(detailPanel).getByText('TCP')).toBeInTheDocument();
        expect(within(detailPanel).getByText('LISTEN')).toBeInTheDocument();
        expect(within(detailPanel).getByText('100')).toBeInTheDocument();
        expect(within(detailPanel).getByText('C:\\Program Files\\nodejs\\node.exe')).toBeInTheDocument();
        await waitFor(() => expect(within(detailPanel).getByText('kill_process_by_port')).toBeInTheDocument());
        expect(within(detailPanel).getByRole('button', {name: 'End Occupancy'})).not.toBeDisabled();

        fireEvent.click(protectedRow as HTMLTableRowElement);
        await act(async () => {});

        expect(protectedRow).toHaveAttribute('aria-selected', 'true');
        expect(within(detailPanel).getByText('135')).toBeInTheDocument();
        expect(within(detailPanel).getByRole('button', {name: 'End Occupancy'})).toBeDisabled();
    });

    it('confirms before ending a port occupant and refreshes the port list', async () => {
        getPortListMock
            .mockResolvedValueOnce(portRows)
            .mockResolvedValueOnce(portRows.filter((port) => port.port !== 3000));

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        const nodeRow = screen.getByText('node.exe').closest('tr');
        expect(nodeRow).not.toBeNull();
        fireEvent.click(nodeRow as HTMLTableRowElement);

        const detailPanel = screen.getByRole('complementary', {name: 'Port detail'});
        fireEvent.click(within(detailPanel).getByRole('button', {name: 'End Occupancy'}));

        const dialog = screen.getByRole('dialog', {name: 'Confirm port occupancy termination'});
        expect(within(dialog).getByText('Port')).toBeInTheDocument();
        expect(within(dialog).getByText('3000')).toBeInTheDocument();
        expect(within(dialog).getByText('TCP')).toBeInTheDocument();
        expect(within(dialog).getByText('100')).toBeInTheDocument();
        expect(within(dialog).getByText('node.exe')).toBeInTheDocument();
        expect(within(dialog).getByText('C:\\Program Files\\nodejs\\node.exe')).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm End Occupancy'}));

        await waitFor(() => expect(killProcessByPortMock).toHaveBeenCalledWith(3000, 'TCP', 100, 1000));
        expect(await screen.findByText('Process node.exe (PID 100) ended for TCP port 3000.')).toBeInTheDocument();
        expect(screen.queryByRole('dialog', {name: 'Confirm port occupancy termination'})).not.toBeInTheDocument();
        await waitFor(() => expect(getPortListMock).toHaveBeenCalledTimes(2));
    });

    it('confirms before ending a port occupant from the row context menu', async () => {
        getPortListMock
            .mockResolvedValueOnce(portRows)
            .mockResolvedValueOnce(portRows.filter((port) => port.port !== 3000));

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        const nodeRow = screen.getByText('node.exe').closest('tr');
        expect(nodeRow).not.toBeNull();
        fireEvent.mouseDown(nodeRow as HTMLTableRowElement, {button: 2, clientX: 80, clientY: 120});
        fireEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', {name: 'End Occupancy'}));

        const dialog = screen.getByRole('dialog', {name: 'Confirm port occupancy termination'});
        expect(within(dialog).getByText('3000')).toBeInTheDocument();
        expect(within(dialog).getByText('node.exe')).toBeInTheDocument();
        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm End Occupancy'}));

        await waitFor(() => expect(killProcessByPortMock).toHaveBeenCalledWith(3000, 'TCP', 100, 1000));
        expect(await screen.findByText('Process node.exe (PID 100) ended for TCP port 3000.')).toBeInTheDocument();
    });

    it('filters Ports by port number and process name', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Port'), {target: {value: '5432'}});
        expect(screen.getByText('postgres.exe')).toBeInTheDocument();
        expect(screen.queryByText('node.exe')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Port'), {target: {value: ''}});
        fireEvent.change(screen.getByLabelText('Process name'), {target: {value: 'custom'}});
        expect(screen.getByText('custom-api.exe')).toBeInTheDocument();
        expect(screen.queryByText('postgres.exe')).not.toBeInTheDocument();
    });

    it('filters Ports by protocol and status', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        expect(await screen.findByText('dns-sd.exe')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Protocol'), {target: {value: 'UDP'}});
        expect(screen.getByText('dns-sd.exe')).toBeInTheDocument();
        expect(screen.queryByText('node.exe')).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Protocol'), {target: {value: 'all'}});
        fireEvent.change(screen.getByLabelText('Status'), {target: {value: 'ESTABLISHED'}});
        expect(screen.getByText('custom-api.exe')).toBeInTheDocument();
        expect(screen.queryByText('postgres.exe')).not.toBeInTheDocument();
    });

    it('auto refreshes Ports and handles loading empty and error states', async () => {
        vi.useFakeTimers();
        let resolveInitialPorts: (value: typeof portRows) => void = () => {};
        getPortListMock
            .mockReturnValueOnce(new Promise<typeof portRows>((resolve) => {
                resolveInitialPorts = resolve;
            }))
            .mockResolvedValueOnce([])
            .mockRejectedValueOnce(new Error('scan failed'));

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        await act(async () => {});
        expect(screen.getByText('Loading port list...')).toBeInTheDocument();

        await act(async () => {
            resolveInitialPorts(portRows);
        });
        expect(screen.getByText('node.exe')).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Refresh Ports'})).not.toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        await act(async () => {});
        expect(screen.getByText('No ports found.')).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        await act(async () => {});
        expect(screen.getByText('Unable to load port list.')).toBeInTheDocument();
    });

    it('loads Cleanup candidates from rules and shows matched rule reasons without protected processes', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Cleanup'}));

        expect(await screen.findByText('node.exe')).toBeInTheDocument();
        expect(screen.queryByRole('heading', {name: 'Cleanup'})).not.toBeInTheDocument();
        expect(screen.getByRole('toolbar', {name: 'Cleanup actions'})).toHaveClass('cleanup-toolbar');
        expect(screen.getByText('Development process candidates')).toBeInTheDocument();
        expect(screen.getByText('Selected')).toBeInTheDocument();
        expect(screen.getByText('postgres.exe')).toBeInTheDocument();
        expect(screen.queryByText('vmmem')).not.toBeInTheDocument();
        expect(screen.queryByText('chrome.exe')).not.toBeInTheDocument();
        expect(screen.getByText('3000')).toBeInTheDocument();
        expect(screen.getByText('5432')).toBeInTheDocument();
        expect(screen.getByText('Node/Vite')).toBeInTheDocument();
        expect(screen.getByText('Database')).toBeInTheDocument();
        expect(screen.getByText('Node/Vite: process name node.exe; port 3000')).toBeInTheDocument();
        expect(screen.getByText('Database: process name postgres; port 5432')).toBeInTheDocument();

        const nodeRow = screen.getByText('node.exe').closest('tr');

        expect(screen.queryByRole('complementary', {name: 'Cleanup detail'})).not.toBeInTheDocument();
        expect(nodeRow).not.toBeNull();
        expect(nodeRow).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('checkbox', {name: 'Select node.exe PID 100'})).not.toBeDisabled();

        fireEvent.click(nodeRow as HTMLTableRowElement);

        const detailPanel = screen.getByRole('complementary', {name: 'Cleanup detail'});
        expect(nodeRow).toHaveAttribute('aria-selected', 'true');
        await waitFor(() => expect(getRecentOperationLogsForResourceMock).toHaveBeenCalledWith(100, 'node.exe', [3000]));
        expect(within(detailPanel).getByRole('heading', {name: 'node.exe PID 100'})).toBeInTheDocument();
        const cleanupDetailHeader = detailPanel.querySelector('.detail-drawer-header') as HTMLElement;
        const cleanupCloseButton = within(cleanupDetailHeader).getByRole('button', {name: 'Close'});
        expect(cleanupCloseButton).toHaveClass('detail-close-button');
        expect(cleanupCloseButton.closest('.detail-header-actions')).not.toBeNull();
        expect(within(cleanupDetailHeader).getByRole('button', {name: 'End Process'})).not.toBeDisabled();
        expect(detailPanel.querySelector('.detail-actions')).not.toBeInTheDocument();
        expect(within(detailPanel).getByText('100')).toBeInTheDocument();
        expect(within(detailPanel).getByText('C:\\Program Files\\nodejs\\node.exe')).toBeInTheDocument();
        expect(within(detailPanel).getByText('node server.js')).toBeInTheDocument();
        expect(within(detailPanel).getByText('3000')).toBeInTheDocument();
        expect(within(detailPanel).getByText('Node/Vite')).toBeInTheDocument();
        expect(within(detailPanel).getByText('process name node.exe')).toBeInTheDocument();
        expect(within(detailPanel).getByText('port 3000')).toBeInTheDocument();
        await waitFor(() => expect(within(detailPanel).getByText('kill_process_by_port')).toBeInTheDocument());
        expect(within(detailPanel).getByRole('button', {name: 'End Process'})).not.toBeDisabled();
    });

    it('prioritizes the resource identity and usage before long diagnostic fields', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();
        expect(getColumnHeaders('Process list')).toEqual([
            'Process Name',
            'PID',
            'CPU',
            'Memory',
            'Ports',
            'Protected',
            'App / project',
            'Path',
            'Command',
        ]);

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        expect(await screen.findByText('3000')).toBeInTheDocument();
        expect(getColumnHeaders('Port list')).toEqual([
            'Port',
            'Process Name',
            'PID',
            'Protocol',
            'Status',
            'CPU',
            'Memory',
            'Protected',
            'App / project',
            'Path',
            'Command',
        ]);

        fireEvent.click(screen.getByRole('button', {name: 'Cleanup'}));
        expect(await within(await screen.findByRole('table', {name: 'Cleanup candidate list'})).findByText('postgres.exe')).toBeInTheDocument();
        expect(getColumnHeaders('Cleanup candidate list')).toEqual([
            'Select',
            'PID',
            'Process Name',
            'Path',
            'Command',
            'CPU',
            'Memory',
            'Ports',
            'Rule',
            'Reason',
            'Actions',
        ]);
    });

    it('groups both pages consistently and opens a project without retaining unrelated filters', async () => {
        const projectPath = 'D:\\Projects\\Alpha';
        getProcessListMock.mockResolvedValue(processRows.map(process => process.pid === 100
            ? {...process, projectName: 'Alpha', projectPath, projectReason: 'directory'} : process));
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        await screen.findByRole('table', {name: 'Port list'});
        fireEvent.change(screen.getByLabelText('Port'), {target: {value: '5432'}});
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        const processesTable = await screen.findByRole('table', {name: 'Process list'});
        fireEvent.click(screen.getByRole('button', {name: 'Apps & projects'}));
        const heading = within(processesTable).getByRole('button', {name: /Alpha/});
        fireEvent.click(heading);
        expect(within(processesTable).queryByText('node.exe')).not.toBeInTheDocument();
        fireEvent.click(heading);
        expect(within(processesTable).getByText('node.exe')).toBeInTheDocument();
        fireEvent.click(within(heading.closest('tr')!).getByRole('button', {name: 'View ports'}));
        const portsTable = await screen.findByRole('table', {name: 'Port list'});
        await waitFor(() => expect(within(portsTable).getByText('3000')).toBeInTheDocument());
        expect(within(portsTable).queryByText('5432')).not.toBeInTheDocument();
        expect(screen.getByLabelText('Port')).toHaveValue('');
        expect(screen.getByRole('combobox', {name: 'App or project filter'})).toHaveValue('d:/projects/alpha');
        expect(within(portsTable).getByRole('button', {name: /Alpha/}).closest('tr')).toHaveTextContent('1 processes · 512.0 MB');
        fireEvent.click(screen.getByRole('button', {name: 'View processes'}));
        await screen.findByRole('table', {name: 'Process list'});
        expect(screen.getByRole('combobox', {name: 'App or project filter'})).toHaveValue('d:/projects/alpha');
        expect(window.localStorage.getItem('openend-ports-project-view')).toBe('grouped');
    });

    it('shows app and project groups together and filters app ports using the same executable identity', async () => {
        const appPath = 'C:\\Apps\\Browser\\chrome.exe';
        getProcessListMock.mockResolvedValue(processRows.map(process => {
            if (process.pid === 600) return {...process, applicationName: 'Google Chrome', applicationPath: appPath, applicationReason: 'applicationPath'};
            if (process.pid === 100) return {...process, projectName: 'Alpha', projectPath: 'D:\\Projects\\Alpha'};
            return process;
        }));
        getPortListMock.mockResolvedValue([...portRows, {...portRows[0], pid: 600, port: 9222, processName: 'chrome.exe'}]);
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        const processTable = await screen.findByRole('table', {name: 'Process list'});
        fireEvent.click(screen.getByRole('button', {name: 'Apps & projects'}));
        const appHeading = within(processTable).getByRole('button', {name: /Google Chrome/});
        expect(appHeading).toHaveTextContent('App');
        expect(within(processTable).getByRole('button', {name: /Alpha/})).toHaveTextContent('Project');
        fireEvent.click(within(appHeading.closest('tr')!).getByRole('button', {name: 'View ports'}));
        const portsTable = await screen.findByRole('table', {name: 'Port list'});
        await waitFor(() => expect(within(portsTable).getByText('9222')).toBeInTheDocument());
        expect(within(portsTable).queryByText('3000')).not.toBeInTheDocument();
        expect(screen.getByRole('combobox', {name: 'App or project filter'})).toHaveValue('app:c:/apps/browser/chrome.exe');
        expect(within(portsTable).getByRole('button', {name: /Google Chrome/})).toHaveTextContent('App');
        fireEvent.click(screen.getByRole('button', {name: 'View processes'}));
        const filteredProcesses = await screen.findByRole('table', {name: 'Process list'});
        expect(within(filteredProcesses).getByText('chrome.exe', {selector: '.process-name-text'})).toBeInTheDocument();
        expect(within(filteredProcesses).queryByText('node.exe')).not.toBeInTheDocument();
    });

    it('can exclude an app process and restore its automatic application assignment', async () => {
        const app = {...processRows[4], applicationName: 'Google Chrome', applicationPath: processRows[4].path, applicationReason: 'applicationPath', projectReason: ''};
        let currentRows = [app];
        getProcessListMock.mockImplementation(async () => currentRows);
        getProcessDetailMock.mockResolvedValue({...nodeProcessDetail, pid: app.pid, processName: app.name});
        setProcessProjectMock.mockImplementation(async (_pid: number, _createdAt: number, _path: string, _remember: boolean, reset: boolean) => {
            currentRows = [reset ? app : {...app, applicationName: '', applicationPath: '', applicationReason: '', projectReason: 'manual'}];
        });
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        const table = await screen.findByRole('table', {name: 'Process list'});
        fireEvent.click(within(table).getByText('chrome.exe', {selector: '.process-name-text'}));
        const detail = await screen.findByRole('complementary', {name: 'Process detail'});
        fireEvent.click(await within(detail).findByText('Change assignment'));
        fireEvent.click(within(detail).getByRole('button', {name: 'Remove from group'}));
        await waitFor(() => expect(within(table).getByText('Unidentified')).toBeInTheDocument());
        expect(setProcessProjectMock).toHaveBeenCalledWith(app.pid, app.createdAt, '', false, false);
        fireEvent.click(within(detail).getByRole('button', {name: 'Restore automatic assignment'}));
        await waitFor(() => expect(within(table).getByText('Google Chrome')).toBeInTheDocument());
        expect(setProcessProjectMock).toHaveBeenLastCalledWith(app.pid, app.createdAt, '', false, true);
    });

    it('updates assignment from a port detail and refreshes the process view when revisited', async () => {
        const projectPath = 'D:\\Projects\\Beta';
        let currentRows = processRows.map(process => ({...process, workingDirectory: 'D:\\Projects\\Alpha', projectName: 'Alpha', projectPath: 'D:\\Projects\\Alpha'}));
        getProcessListMock.mockImplementation(async () => currentRows);
        setProcessProjectMock.mockImplementation(async (pid: number, _createdAt: number, path: string) => {
            currentRows = currentRows.map(process => process.pid === pid ? {...process, projectName: 'Beta', projectPath: path} : process);
        });
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        await screen.findByRole('table', {name: 'Process list'});
        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        const portsTable = await screen.findByRole('table', {name: 'Port list'});
        fireEvent.click(within(portsTable).getByText('3000'));
        const detail = screen.getByRole('complementary', {name: /Port detail/i});
        fireEvent.click(within(detail).getByText('Change assignment'));
        fireEvent.change(within(detail).getByLabelText('Project directory'), {target: {value: projectPath}});
        fireEvent.click(within(detail).getByRole('button', {name: 'Save assignment'}));
        await waitFor(() => expect(setProcessProjectMock).toHaveBeenCalledWith(100, 1000, projectPath, false, false));
        await waitFor(() => expect(within(portsTable).getByText('3000').closest('tr')).toHaveTextContent('Beta'));
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        const processesTable = await screen.findByRole('table', {name: 'Process list'});
        await waitFor(() => expect(within(processesTable).getByText('node.exe').closest('tr')).toHaveTextContent('Beta'));
    });

    it('renders bottom horizontal scrollbars for process data tables', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();
        expect(screen.getByLabelText('Process list horizontal scroll')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        expect(await screen.findByText('3000')).toBeInTheDocument();
        expect(screen.getByLabelText('Port list horizontal scroll')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Cleanup'}));
        expect(await within(await screen.findByRole('table', {name: 'Cleanup candidate list'})).findByText('postgres.exe')).toBeInTheDocument();
        expect(screen.getByLabelText('Cleanup candidate list horizontal scroll')).toBeInTheDocument();
    });

    it('keeps data table rows at a fixed height with single-line cells', () => {
        expect(appStyles).toContain('--resource-table-header-height: 34px;');
        expect(appStyles).toContain('--resource-table-row-height: 38px;');
        expect(appStyles).toMatch(/\.process-table th\s*\{[^}]*height: var\(--resource-table-header-height\);/s);
        expect(appStyles).toMatch(/\.process-table tbody tr\s*\{[^}]*height: var\(--resource-table-row-height\);/s);
        expect(appStyles).toMatch(/\.process-table td\s*\{[^}]*height: var\(--resource-table-row-height\);/s);
        expect(appStyles).toMatch(/\.command-cell\s*\{[^}]*white-space: nowrap;/s);
        expect(appStyles).toMatch(/\.process-name-cell\s*\{[^}]*display: flex;/s);
        expect(appStyles).toMatch(/\.process-table-shell\s*\{[^}]*min-height: 0;/s);
        expect(appStyles).toMatch(/\.process-table-wrap\s*\{[^}]*overflow-x: hidden;/s);
        expect(appStyles).toMatch(/\.process-table-wrap\s*\{[^}]*overflow-y: auto;/s);
        expect(appStyles).toMatch(/\.process-table-scrollbar\s*\{[^}]*position: relative;/s);
        expect(appStyles).toMatch(/\.process-table-scrollbar\s*\{[^}]*scrollbar-color: auto;/s);
        expect(appStyles).not.toMatch(/\.process-table-scrollbar::-webkit-scrollbar-thumb\s*\{[^}]*var\(--accent/s);
    });

    it('confirms and ends selected Cleanup candidates through the logged PID operation', async () => {
        getProcessListMock
            .mockResolvedValueOnce(processRows)
            .mockResolvedValueOnce(processRows.filter((process) => process.pid !== 100 && process.pid !== 200));
        getPortListMock
            .mockResolvedValueOnce(portRows)
            .mockResolvedValueOnce(portRows.filter((port) => port.pid !== 100 && port.pid !== 200));
        killProcessByPIDMock
            .mockResolvedValueOnce({
                success: true,
                message: 'Process node.exe (PID 100) ended.',
                pid: 100,
                processName: 'node.exe',
            })
            .mockResolvedValueOnce({
                success: true,
                message: 'Process postgres.exe (PID 200) ended.',
                pid: 200,
        createdAt: 1000,
                processName: 'postgres.exe',
            });

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Cleanup'}));
        expect(await screen.findByText('node.exe')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('checkbox', {name: 'Select node.exe PID 100'}));
        fireEvent.click(screen.getByRole('checkbox', {name: 'Select postgres.exe PID 200'}));
        fireEvent.click(screen.getByRole('button', {name: 'End selected processes'}));

        const dialog = screen.getByRole('dialog', {name: 'Confirm cleanup termination'});
        expect(within(dialog).getByText('2 selected processes')).toBeInTheDocument();
        expect(within(dialog).getByText('node.exe')).toBeInTheDocument();
        expect(within(dialog).getByText('postgres.exe')).toBeInTheDocument();

        fireEvent.click(within(dialog).getByRole('button', {name: 'Confirm End Selected'}));

        await waitFor(() => expect(killProcessByPIDMock).toHaveBeenCalledWith(100, 1000));
        await waitFor(() => expect(killProcessByPIDMock).toHaveBeenCalledWith(200, 1000));
        expect(await screen.findByText('2 cleanup operations finished. 2 succeeded, 0 failed.')).toBeInTheDocument();
        await waitFor(() => expect(getProcessListMock.mock.calls.length).toBeGreaterThanOrEqual(2));
        await waitFor(() => expect(getPortListMock.mock.calls.length).toBeGreaterThanOrEqual(2));
    });

    it('loads Settings protection lists and keeps default entries read-only', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Settings'}));

        expect(await screen.findByText('System')).toBeInTheDocument();
        expect(screen.getByText('svchost.exe')).toBeInTheDocument();
        expect(screen.getByText('redis-server.exe')).toBeInTheDocument();

        const defaultList = screen.getByRole('list', {name: 'Default protected processes'});
        const customList = screen.getByRole('list', {name: 'Custom protected processes'});

        expect(within(defaultList).queryByRole('button', {name: /delete/i})).not.toBeInTheDocument();
        expect(within(customList).getByRole('button', {name: 'Delete redis-server.exe'})).toBeInTheDocument();
    });

    it('adds a custom protected process from Settings', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Settings'}));
        expect(await screen.findByText('redis-server.exe')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Custom protected process name'), {target: {value: 'webpack.exe'}});
        fireEvent.click(screen.getByRole('button', {name: 'Add protected process'}));

        await waitFor(() => expect(addCustomProtectedProcessNameMock).toHaveBeenCalledWith('webpack.exe'));
        expect(await screen.findByText('webpack.exe')).toBeInTheDocument();
        expect(screen.getByText('Custom protected process added.')).toBeInTheDocument();
    });

    it('deletes a custom protected process from Settings', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Settings'}));
        expect(await screen.findByText('redis-server.exe')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Delete redis-server.exe'}));

        await waitFor(() => expect(deleteCustomProtectedProcessNameMock).toHaveBeenCalledWith('redis-server.exe'));
        expect(await screen.findByText('No custom protected processes yet.')).toBeInTheDocument();
        expect(screen.getByText('Custom protected process removed.')).toBeInTheDocument();
    });

    it('loads Settings cleanup rules and supports toggling and deleting rules', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Settings'}));

        expect(await screen.findByText('Cleanup rules')).toBeInTheDocument();
        expect(screen.getByText('Node/Vite')).toBeInTheDocument();
        expect(screen.getByText('Local API')).toBeInTheDocument();
        expect(screen.getByText('node.exe, npm, pnpm, yarn, vite')).toBeInTheDocument();
        expect(screen.getByText('3000, 5173, 5174')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Disable Node/Vite'}));

        await waitFor(() => expect(setCleanupRuleEnabledMock).toHaveBeenCalledWith('builtin-node-vite', false));
        expect(await screen.findByRole('button', {name: 'Enable Node/Vite'})).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', {name: 'Delete Local API'}));

        await waitFor(() => expect(deleteCleanupRuleMock).toHaveBeenCalledWith('custom-local-api'));
        expect(screen.queryByText('Local API')).not.toBeInTheDocument();
    });

    it('adds a cleanup rule from Settings', async () => {
        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Settings'}));
        expect(await screen.findByText('Cleanup rules')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Cleanup rule name'), {target: {value: 'Worker'}});
        fireEvent.change(screen.getByLabelText('Process names'), {target: {value: 'worker.exe'}});
        fireEvent.change(screen.getByLabelText('Command keywords'), {target: {value: 'queue'}});
        fireEvent.change(screen.getByRole('textbox', {name: 'Ports'}), {target: {value: '7001'}});
        fireEvent.change(screen.getByLabelText('Port ranges'), {target: {value: '7100-7102'}});
        fireEvent.click(screen.getByRole('button', {name: 'Add cleanup rule'}));

        await waitFor(() => expect(addCleanupRuleMock).toHaveBeenCalledWith({
            name: 'Worker',
            enabled: true,
            matchProcessNames: ['worker.exe'],
            matchCommandKeywords: ['queue'],
            matchPorts: [7001],
            matchPortRanges: [
                {start: 7100, end: 7102},
            ],
        }));
        expect(await screen.findByText('Worker')).toBeInTheDocument();
        expect(screen.getByText('Cleanup rule added.')).toBeInTheDocument();
    });

    it('loads Logs in newest-first order and refreshes them automatically', async () => {
        vi.useFakeTimers();
        getOperationLogsMock
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce(operationLogs);

        render(<App/>);

        fireEvent.click(screen.getByRole('button', {name: 'Logs'}));

        await act(async () => {});
        expect(screen.queryByRole('heading', {name: 'Logs'})).not.toBeInTheDocument();
        expect(screen.getByText('No operation logs found.')).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Refresh Logs'})).not.toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(5000);
        });
        await act(async () => {});

        expect(screen.getByText('kill_process_by_port')).toBeInTheDocument();
        expect(screen.getByText('kill_process_by_pid')).toBeInTheDocument();
        expect(screen.getByText('Process node.exe (PID 100) ended for TCP port 3000.')).toBeInTheDocument();
        expect(screen.getByText('PID -1 is invalid.')).toBeInTheDocument();
        expect(screen.getAllByTestId('operation-log-action')[0]).toHaveTextContent('kill_process_by_port');
        expect(getOperationLogsMock).toHaveBeenCalledTimes(2);
    });
    it.each([
        [{success: false, message: 'Permission denied', code: 'permission_denied'}, 'error'],
        [{success: true, partial: true, message: 'Process ended; operation log failed'}, 'warning'],
    ])('shows the actual operation status and actionable permission errors', async (result, variant) => {
        killProcessByPIDMock.mockResolvedValue({...result, pid: 100, processName: 'node.exe'});
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        const table = await screen.findByRole('table', {name: 'Process list'});
        fireEvent.contextMenu(within(table).getByText('node.exe').closest('tr')!);
        fireEvent.click(screen.getByRole('menuitem', {name: 'End Process'}));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Confirm End Process'}));
        const status = await screen.findByRole('alert');
        expect(status).toHaveClass(variant);
        if (variant === 'error') expect(status).toHaveTextContent('administrator');
        expect(killProcessByPIDMock).toHaveBeenCalledWith(100, 1000);
    });

    it('requires a new confirmation after the port owner changes', async () => {
        killProcessByPortMock.mockResolvedValue({success: false, code: 'identity_changed', message: 'changed', pid: 200});
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        const table = await screen.findByRole('table', {name: 'Port list'});
        fireEvent.contextMenu(within(table).getByText('node.exe').closest('tr')!);
        fireEvent.click(screen.getByRole('menuitem', {name: 'End Occupancy'}));
        getPortListMock.mockResolvedValue([{...portRows[0], pid: 999, createdAt: 2000, processName: 'new-service.exe'}]);
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Confirm End Occupancy'}));
        expect(await screen.findByRole('alert')).toHaveTextContent('confirm again');
        expect(await within(table).findByText('new-service.exe')).toBeInTheDocument();
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(killProcessByPortMock).toHaveBeenCalledTimes(1);
        fireEvent.contextMenu(within(table).getByText('new-service.exe').closest('tr')!);
        fireEvent.click(screen.getByRole('menuitem', {name: 'End Occupancy'}));
        expect(within(screen.getByRole('dialog')).getByText('999')).toBeInTheDocument();
        expect(killProcessByPortMock).toHaveBeenCalledTimes(1);
    });

    it('ignores candidates for this session and adds process names to protection', async () => {
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Cleanup'}));
        const table = await screen.findByRole('table', {name: 'Cleanup candidate list'});
        fireEvent.click(within(within(table).getByText('node.exe').closest('tr')!).getByRole('button', {name: 'Ignore this time'}));
        expect(within(table).queryByText('node.exe')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Ports'}));
        await screen.findByRole('table', {name: 'Port list'});
        fireEvent.click(screen.getByRole('button', {name: 'Cleanup'}));
        await act(async () => {});
        expect(within(table).queryByText('node.exe')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: /Restore ignored candidates/}));
        getProcessListMock.mockResolvedValue(processRows.map(process => process.name === 'node.exe' ? {...process, isProtected: true} : process));
        fireEvent.click(within(within(table).getByText('node.exe').closest('tr')!).getByRole('button', {name: 'Add to protection'}));
        await waitFor(() => expect(addCustomProtectedProcessNameMock).toHaveBeenCalledWith('node.exe'));
        await waitFor(() => expect(within(table).queryByText('node.exe')).not.toBeInTheDocument());
    });

    it('keeps updating and preserves filters sorting and graph history across navigation', async () => {
        vi.useFakeTimers();
        render(<App/>);
        await act(async () => {});
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        const points = screen.getByLabelText('CPU usage chart').querySelector('polyline')!.getAttribute('points')!.split(' ');
        const dashboardCalls = getSystemResourceInfoMock.mock.calls.length;
        expect(screen.queryByRole('button', {name: /Pause refresh|Resume refresh/})).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        await act(async () => {});
        fireEvent.change(screen.getByLabelText('Process name'), {target: {value: 'node'}});
        fireEvent.click(screen.getByRole('button', {name: 'CPU'}));
        const calls = getProcessListMock.mock.calls.length;
        await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
        expect(getProcessListMock).toHaveBeenCalledTimes(calls + 2);
        expect(getSystemResourceInfoMock).toHaveBeenCalledTimes(dashboardCalls);
        fireEvent.click(screen.getByRole('button', {name: 'Performance'}));
        await act(async () => {});
        const retainedPoints = screen.getByLabelText('CPU usage chart').querySelector('polyline')!.getAttribute('points')!.split(' ');
        expect(retainedPoints).toHaveLength(points.length + 1);
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        expect(screen.getByLabelText('Process name')).toHaveValue('node');
        expect(screen.getByRole('button', {name: 'CPU'})).toHaveAttribute('aria-pressed', 'true');
        expect(screen.queryByRole('button', {name: /Pause refresh|Resume refresh/})).not.toBeInTheDocument();
    });

    it('retains process rows and the last successful update time after refresh failure', async () => {
        vi.useFakeTimers();
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Processes'}));
        await act(async () => {});
        const timestamp = screen.getByText(/Last updated:/).textContent;
        getProcessListMock.mockRejectedValue(new Error('denied'));
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(screen.getByRole('alert')).toHaveTextContent('Unable to load');
        expect(within(screen.getByRole('table', {name: 'Process list'})).getByText('node.exe')).toBeInTheDocument();
        expect(screen.getByText(/Last updated:/).textContent).toBe(timestamp);
    });

    it('distinguishes pending unavailable true zero and stale metric readings without charting failed zeroes', async () => {
        vi.useFakeTimers();
        getSystemResourceInfoMock.mockResolvedValueOnce(makeSystemResourceInfo({cpuPercent: 0, gpuPercent: 0, metrics: {
            cpu: {state: 'ready', updatedAt: 1000, error: ''},
            gpu: {state: 'collecting', updatedAt: 0, error: ''},
            vram: {state: 'unavailable', updatedAt: 0, error: 'Driver unavailable'},
        }}));
        render(<App/>);
        await act(async () => {});
        expect(screen.getByRole('button', {name: 'CPU'})).toHaveTextContent('0.0%');
        expect(screen.getByRole('button', {name: 'GPU'})).toHaveTextContent('Collecting');
        expect(screen.getByRole('button', {name: 'VRAM'})).toHaveTextContent('Unavailable');
        getSystemResourceInfoMock.mockResolvedValue(makeSystemResourceInfo({cpuPercent: 99, metrics: {cpu: {state: 'unavailable', updatedAt: 0, error: 'Denied'}}}));
        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(screen.getByRole('button', {name: 'CPU'})).toHaveTextContent('0.0%');
        expect(screen.getByRole('button', {name: 'CPU'})).toHaveTextContent('Last known value');
        const points = screen.getByLabelText('CPU usage chart').querySelector('polyline')!.getAttribute('points')!.split(' ');
        expect(points).toHaveLength(1);
        expect(screen.getByRole('alert')).toHaveTextContent('Denied');
    });

    it('shows mixed batch results as a partial success with failure details', async () => {
        killProcessByPIDMock.mockResolvedValueOnce({success: true, message: 'ended'}).mockResolvedValueOnce({success: false, code: 'permission_denied', message: 'Permission denied'});
        render(<App/>);
        fireEvent.click(screen.getByRole('button', {name: 'Cleanup'}));
        await screen.findByRole('table', {name: 'Cleanup candidate list'});
        fireEvent.click(screen.getByLabelText('Select node.exe PID 100'));
        fireEvent.click(screen.getByLabelText('Select postgres.exe PID 200'));
        fireEvent.click(screen.getByRole('button', {name: 'End selected processes'}));
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', {name: 'Confirm End Selected'}));
        const result = await screen.findByRole('alert');
        expect(result).toHaveClass('warning');
        expect(result).toHaveTextContent('1 succeeded, 1 failed');
        expect(result).toHaveTextContent('administrator');
    });

});

function getColumnHeaders(tableName: string): string[] {
    const table = screen.getByRole('table', {name: tableName});

    return within(table)
        .getAllByRole('columnheader')
        .map((header) => header.textContent?.trim() ?? '');
}
