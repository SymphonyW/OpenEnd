import {StrictMode} from 'react';
import type {ReactNode} from 'react';
import {act, cleanup, renderHook} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PageActivityContext, useSequentialAutoRefresh} from './useSequentialAutoRefresh';

function deferredRefresh() {
    let resolve!: () => void;
    const promise = new Promise<void>((complete) => {
        resolve = complete;
    });
    return {promise, resolve};
}

describe('useSequentialAutoRefresh', () => {
    let visibility: DocumentVisibilityState;

    beforeEach(() => {
        vi.useFakeTimers();
        visibility = 'visible';
        vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    async function setVisibility(next: DocumentVisibilityState) {
        await act(async () => {
            visibility = next;
            document.dispatchEvent(new Event('visibilitychange'));
        });
    }

    it('removes the polling timer while hidden and refreshes immediately on return', async () => {
        const loader = vi.fn().mockResolvedValue(undefined);
        renderHook(() => useSequentialAutoRefresh(loader, 5000));
        await act(async () => {});
        expect(loader).toHaveBeenCalledWith(true);
        expect(vi.getTimerCount()).toBe(1);

        await setVisibility('hidden');
        expect(vi.getTimerCount()).toBe(0);
        await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
        expect(loader).toHaveBeenCalledTimes(1);

        await setVisibility('visible');
        expect(loader).toHaveBeenCalledTimes(2);
        expect(loader).toHaveBeenLastCalledWith(false);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('stops inactive pages and resumes polling without unmounting', async () => {
        let active = true;
        const loader = vi.fn().mockResolvedValue(undefined);
        const wrapper = ({children}: {children: ReactNode}) => <PageActivityContext.Provider value={active}>{children}</PageActivityContext.Provider>;
        const {rerender} = renderHook(() => useSequentialAutoRefresh(loader, 5000), {wrapper});
        await act(async () => {});
        active = false;
        rerender();
        expect(vi.getTimerCount()).toBe(0);
        await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
        expect(loader).toHaveBeenCalledTimes(1);
        active = true;
        rerender();
        await act(async () => {});
        expect(loader).toHaveBeenCalledTimes(2);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('does not start work or a timer when mounted in a hidden document', async () => {
        visibility = 'hidden';
        const loader = vi.fn().mockResolvedValue(undefined);
        renderHook(() => useSequentialAutoRefresh(loader, 5000));
        expect(loader).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);

        await setVisibility('visible');
        expect(loader).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(1);
    });

    it('waits for completion before scheduling and remains idle if hidden during a request', async () => {
        const pending = deferredRefresh();
        const loader = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
        renderHook(() => useSequentialAutoRefresh(loader, 5000));

        await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
        expect(loader).toHaveBeenCalledTimes(1);
        expect(vi.getTimerCount()).toBe(0);
        await setVisibility('hidden');
        await act(async () => { pending.resolve(); });
        expect(vi.getTimerCount()).toBe(0);

        await setVisibility('visible');
        expect(loader).toHaveBeenCalledTimes(2);
        await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
        expect(loader).toHaveBeenCalledTimes(2);
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        expect(loader).toHaveBeenCalledTimes(3);
    });

    it('does not overlap a pending request when the interval changes or visibility toggles', async () => {
        const pending = deferredRefresh();
        const loader = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
        const {rerender} = renderHook(({interval}) => useSequentialAutoRefresh(loader, interval), {
            initialProps: {interval: 5000},
        });

        rerender({interval: 1000});
        await setVisibility('hidden');
        await setVisibility('visible');
        expect(loader).toHaveBeenCalledTimes(1);
        await act(async () => { pending.resolve(); });
        expect(vi.getTimerCount()).toBe(1);

        await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('shares the initial request across StrictMode effect restarts', async () => {
        const pending = deferredRefresh();
        const loader = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValue(undefined);
        renderHook(() => useSequentialAutoRefresh(loader, 5000), {
            wrapper: ({children}: {children: ReactNode}) => <StrictMode>{children}</StrictMode>,
        });
        expect(loader).toHaveBeenCalledTimes(1);

        await act(async () => { pending.resolve(); });
        expect(vi.getTimerCount()).toBe(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(loader).toHaveBeenCalledTimes(2);
    });

    it('uses the latest loader without restarting the polling schedule', async () => {
        const firstLoader = vi.fn().mockResolvedValue(undefined);
        const nextLoader = vi.fn().mockResolvedValue(undefined);
        const {rerender} = renderHook(({loader}) => useSequentialAutoRefresh(loader, 5000), {
            initialProps: {loader: firstLoader},
        });
        await act(async () => {});
        rerender({loader: nextLoader});
        expect(nextLoader).not.toHaveBeenCalled();

        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(firstLoader).toHaveBeenCalledTimes(1);
        expect(nextLoader).toHaveBeenCalledWith(false);
    });

    it('does not schedule more work after unmounting during a request', async () => {
        const pending = deferredRefresh();
        const loader = vi.fn().mockReturnValue(pending.promise);
        const {unmount} = renderHook(() => useSequentialAutoRefresh(loader, 5000));
        unmount();

        await act(async () => { pending.resolve(); });
        await setVisibility('visible');
        expect(vi.getTimerCount()).toBe(0);
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it('clears an already scheduled timer on unmount', async () => {
        const loader = vi.fn().mockResolvedValue(undefined);
        const {unmount} = renderHook(() => useSequentialAutoRefresh(loader, 5000));
        await act(async () => {});
        expect(vi.getTimerCount()).toBe(1);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('reports loader failures and continues polling without an unhandled rejection', async () => {
        const error = new Error('Scanner unavailable');
        const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const loader = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined);
        renderHook(() => useSequentialAutoRefresh(loader, 5000));
        await act(async () => {});

        expect(reportError).toHaveBeenCalledWith('Automatic refresh failed:', error);
        expect(vi.getTimerCount()).toBe(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
        expect(loader).toHaveBeenCalledTimes(2);
    });
});
