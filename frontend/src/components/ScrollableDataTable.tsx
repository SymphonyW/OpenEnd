import {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import type {KeyboardEvent, ReactNode, UIEvent} from 'react';

interface ScrollState {
    maxScrollLeft: number;
    scrollLeft: number;
}

interface ScrollableDataTableProps {
    children: ReactNode;
    className?: string;
    scrollbarLabel: string;
}

function ScrollableDataTable({children, className = '', scrollbarLabel}: ScrollableDataTableProps) {
    const tableWrapperRef = useRef<HTMLDivElement | null>(null);
    const scrollbarRef = useRef<HTMLDivElement | null>(null);
    const scrollbarSpacerRef = useRef<HTMLDivElement | null>(null);
    const [scrollState, setScrollState] = useState<ScrollState>({
        maxScrollLeft: 0,
        scrollLeft: 0,
    });

    const updateScrollState = useCallback((scrollLeft: number, maxScrollLeft: number) => {
        setScrollState((currentState) => {
            if (
                currentState.scrollLeft === scrollLeft
                && currentState.maxScrollLeft === maxScrollLeft
            ) {
                return currentState;
            }

            return {scrollLeft, maxScrollLeft};
        });
    }, []);

    const syncMetrics = useCallback(() => {
        const tableWrapper = tableWrapperRef.current;
        const scrollbar = scrollbarRef.current;
        const scrollbarSpacer = scrollbarSpacerRef.current;
        if (!tableWrapper || !scrollbar || !scrollbarSpacer) {
            return;
        }

        const maxScrollLeft = Math.max(0, tableWrapper.scrollWidth - tableWrapper.clientWidth);
        tableWrapper.style.setProperty('--table-viewport-width', `${tableWrapper.clientWidth}px`);
        scrollbarSpacer.style.width = `${tableWrapper.scrollWidth}px`;
        if (scrollbar.scrollLeft !== tableWrapper.scrollLeft) {
            scrollbar.scrollLeft = tableWrapper.scrollLeft;
        }
        updateScrollState(tableWrapper.scrollLeft, maxScrollLeft);
    }, [updateScrollState]);

    const syncScrollbarFromTable = (event: UIEvent<HTMLDivElement>) => {
        const scrollbar = scrollbarRef.current;
        if (!scrollbar) {
            return;
        }

        const source = event.currentTarget;
        if (scrollbar.scrollLeft !== source.scrollLeft) {
            scrollbar.scrollLeft = source.scrollLeft;
        }
        updateScrollState(source.scrollLeft, Math.max(0, source.scrollWidth - source.clientWidth));
    };

    const syncTableFromScrollbar = (event: UIEvent<HTMLDivElement>) => {
        const tableWrapper = tableWrapperRef.current;
        if (!tableWrapper) {
            return;
        }

        const source = event.currentTarget;
        if (tableWrapper.scrollLeft !== source.scrollLeft) {
            tableWrapper.scrollLeft = source.scrollLeft;
        }
        updateScrollState(source.scrollLeft, Math.max(0, tableWrapper.scrollWidth - tableWrapper.clientWidth));
    };

    const handleScrollbarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const tableWrapper = tableWrapperRef.current;
        const scrollbar = scrollbarRef.current;
        if (!tableWrapper || !scrollbar) {
            return;
        }

        const step = 80;
        const pageStep = Math.max(step, tableWrapper.clientWidth * 0.8);
        const keyDeltas: Record<string, number> = {
            ArrowLeft: -step,
            ArrowRight: step,
            Home: -tableWrapper.scrollWidth,
            End: tableWrapper.scrollWidth,
            PageLeft: -pageStep,
            PageRight: pageStep,
        };
        const delta = keyDeltas[event.key];
        if (delta === undefined) {
            return;
        }

        event.preventDefault();
        const nextScrollLeft = Math.min(
            Math.max(0, tableWrapper.scrollLeft + delta),
            Math.max(0, tableWrapper.scrollWidth - tableWrapper.clientWidth),
        );
        tableWrapper.scrollLeft = nextScrollLeft;
        scrollbar.scrollLeft = nextScrollLeft;
        updateScrollState(nextScrollLeft, Math.max(0, tableWrapper.scrollWidth - tableWrapper.clientWidth));
    };

    useLayoutEffect(() => {
        syncMetrics();
    }, [children, syncMetrics]);

    useEffect(() => {
        const tableWrapper = tableWrapperRef.current;
        if (!tableWrapper) {
            return undefined;
        }

        if (typeof ResizeObserver === 'undefined') {
            window.addEventListener('resize', syncMetrics);
            return () => window.removeEventListener('resize', syncMetrics);
        }

        const resizeObserver = new ResizeObserver(syncMetrics);
        resizeObserver.observe(tableWrapper);
        if (tableWrapper.firstElementChild) {
            resizeObserver.observe(tableWrapper.firstElementChild);
        }

        return () => resizeObserver.disconnect();
    }, [syncMetrics]);

    const wrapperClassName = ['process-table-wrap', className].filter(Boolean).join(' ');

    return (
        <div className="process-table-shell">
            <div
                className={wrapperClassName}
                onScroll={syncScrollbarFromTable}
                ref={tableWrapperRef}
            >
                {children}
            </div>
            <div
                aria-label={scrollbarLabel}
                aria-valuemax={scrollState.maxScrollLeft}
                aria-valuemin={0}
                aria-valuenow={Math.min(scrollState.scrollLeft, scrollState.maxScrollLeft)}
                className="process-table-scrollbar"
                onKeyDown={handleScrollbarKeyDown}
                onScroll={syncTableFromScrollbar}
                ref={scrollbarRef}
                role="scrollbar"
                tabIndex={0}
            >
                <div className="process-table-scrollbar-spacer" ref={scrollbarSpacerRef}/>
            </div>
        </div>
    );
}

export default ScrollableDataTable;
