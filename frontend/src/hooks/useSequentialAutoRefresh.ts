import {createContext, useContext, useEffect, useRef} from 'react';

export const PageActivityContext = createContext(true);

export type AutoRefreshLoader = (showLoading?: boolean) => Promise<void> | void;

export function useSequentialAutoRefresh(loader: AutoRefreshLoader, intervalMs: number, refreshEvent?: string) {
    const active = useContext(PageActivityContext);
    const loaderRef = useRef(loader);
    const activeRefreshRef = useRef<Promise<void> | null>(null);

    useEffect(() => {
        loaderRef.current = loader;
    }, [loader]);

    useEffect(() => {
        if (!active) return;
        let isDisposed = false;
        let timerId: number | undefined;

        const clearScheduledRefresh = () => {
            if (timerId !== undefined) {
                window.clearTimeout(timerId);
                timerId = undefined;
            }
        };

        const scheduleNextRefresh = () => {
            if (isDisposed || document.visibilityState === 'hidden') {
                return;
            }

            clearScheduledRefresh();
            timerId = window.setTimeout(() => {
                timerId = undefined;
                void runRefresh(false);
            }, intervalMs);
        };

        const runRefresh = async (showLoading: boolean) => {
            if (isDisposed || document.visibilityState === 'hidden') {
                return;
            }

            // Keep one request in flight even when the effect restarts after an
            // interval change or React StrictMode setup/cleanup cycle.
            if (activeRefreshRef.current) {
                await activeRefreshRef.current;
                scheduleNextRefresh();
                return;
            }

            let finishRefresh!: () => void;
            activeRefreshRef.current = new Promise<void>((resolve) => {
                finishRefresh = resolve;
            });
            try {
                await loaderRef.current(showLoading);
            } catch (error: unknown) {
                console.error('Automatic refresh failed:', error);
            } finally {
                activeRefreshRef.current = null;
                finishRefresh();
                scheduleNextRefresh();
            }
        };

        const handleVisibilityChange = () => {
            clearScheduledRefresh();
            if (document.visibilityState !== 'visible') {
                return;
            }

            void runRefresh(false);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        const handleRequestedRefresh = async () => {
            if (activeRefreshRef.current) await activeRefreshRef.current;
            clearScheduledRefresh();
            void runRefresh(false);
        };
        if (refreshEvent) window.addEventListener(refreshEvent, handleRequestedRefresh);
        void runRefresh(true);

        return () => {
            isDisposed = true;
            clearScheduledRefresh();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (refreshEvent) window.removeEventListener(refreshEvent, handleRequestedRefresh);
        };
    }, [intervalMs, active, refreshEvent]);
}
