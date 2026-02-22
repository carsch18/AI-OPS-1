/**
 * useApiCall — Unified API call hook for REAL backend interactions
 * 
 * Provides:
 * - Loading states (skeleton/spinner)
 * - Error states with clear messages (not fake data)
 * - Auto-retry with configurable delay
 * - Data freshness tracking (last fetched timestamp)
 * - Manual refresh capability
 * - Interval-based auto-refresh
 * 
 * Phase 4 additions:
 * - Stale-while-revalidate (shows last data while refreshing)
 * - navigator.onLine awareness
 * - onSuccess / onError callbacks
 * - `enabled` option for conditional fetching
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export interface ApiCallState<T> {
    /** The fetched data, or null if not yet loaded or errored */
    data: T | null;
    /** Whether the API call is currently in progress */
    loading: boolean;
    /** Error message from a failed call, or null */
    error: string | null;
    /** ISO timestamp of when data was last successfully fetched */
    lastFetched: string | null;
    /** Whether this is the initial load (no data has ever been fetched) */
    isInitialLoad: boolean;
    /** Whether data displayed is stale (a refresh is in progress) */
    isStale: boolean;
    /** Whether the browser is offline */
    isOffline: boolean;
    /** Manually trigger a refresh */
    refresh: () => void;
}

interface UseApiCallOptions<T> {
    /** Auto-refresh interval in milliseconds (0 = disabled) */
    refreshInterval?: number;
    /** Number of automatic retries on failure (default: 1) */
    retries?: number;
    /** Delay between retries in ms (default: 2000) */
    retryDelay?: number;
    /** Whether to fetch immediately on mount (default: true) */
    immediate?: boolean;
    /** Dependencies that trigger a re-fetch when changed */
    deps?: unknown[];
    /** Whether the hook is enabled (default: true) — set false to skip fetching */
    enabled?: boolean;
    /** Callback on successful fetch */
    onSuccess?: (data: T) => void;
    /** Callback on failed fetch */
    onError?: (error: string) => void;
}

/**
 * Hook for making typed API calls with full state management.
 * 
 * @example
 * ```tsx
 * const { data, loading, error, refresh } = useApiCall(
 *     () => getDashboardOverview(),
 *     { refreshInterval: 30000 }
 * );
 * 
 * if (loading && !data) return <Skeleton />;
 * if (error) return <ErrorBanner message={error} onRetry={refresh} />;
 * ```
 */
export function useApiCall<T>(
    fetcher: () => Promise<T>,
    options: UseApiCallOptions<T> = {}
): ApiCallState<T> {
    const {
        refreshInterval = 0,
        retries = 1,
        retryDelay = 2000,
        immediate = true,
        deps = [],
        enabled = true,
        onSuccess,
        onError,
    } = options;

    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(immediate && enabled);
    const [error, setError] = useState<string | null>(null);
    const [lastFetched, setLastFetched] = useState<string | null>(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [isStale, setIsStale] = useState(false);
    const [isOffline, setIsOffline] = useState(!navigator.onLine);

    const fetcherRef = useRef(fetcher);
    const mountedRef = useRef(true);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const onSuccessRef = useRef(onSuccess);
    const onErrorRef = useRef(onError);

    // Keep refs up to date
    fetcherRef.current = fetcher;
    onSuccessRef.current = onSuccess;
    onErrorRef.current = onError;

    // Track online/offline
    useEffect(() => {
        const goOnline = () => setIsOffline(false);
        const goOffline = () => setIsOffline(true);
        window.addEventListener('online', goOnline);
        window.addEventListener('offline', goOffline);
        return () => {
            window.removeEventListener('online', goOnline);
            window.removeEventListener('offline', goOffline);
        };
    }, []);

    const fetchData = useCallback(async () => {
        if (!mountedRef.current) return;

        // If we already have data, this is a revalidation — mark as stale
        if (data !== null) {
            setIsStale(true);
        }

        setLoading(true);

        let lastError: Error | null = null;
        const maxAttempts = retries + 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const result = await fetcherRef.current();
                if (!mountedRef.current) return;

                setData(result);
                setError(null);
                setLastFetched(new Date().toISOString());
                setIsInitialLoad(false);
                setIsStale(false);
                setLoading(false);
                onSuccessRef.current?.(result);
                return;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error(String(err));

                // If not the last attempt, wait before retry
                if (attempt < maxAttempts - 1) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }
        }

        // All attempts failed
        if (!mountedRef.current) return;

        const errorMessage = lastError?.message || 'Unknown error';

        // Provide human-readable error messages
        let displayError = errorMessage;
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
            displayError = 'Backend unreachable — check if services are running';
        } else if (errorMessage.includes('unavailable')) {
            displayError = errorMessage; // Already descriptive
        } else if (errorMessage.includes('500')) {
            displayError = 'Server error — backend encountered an internal error';
        } else if (errorMessage.includes('404')) {
            displayError = 'Endpoint not found — this API may not be deployed yet';
        }

        setError(displayError);
        setIsStale(false);
        setLoading(false);
        setIsInitialLoad(false);
        onErrorRef.current?.(displayError);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retries, retryDelay]);

    // Initial fetch and deps-based re-fetch
    useEffect(() => {
        if (immediate && enabled) {
            fetchData();
        }

        return () => {
            // Don't set mountedRef false here — it should only be on unmount
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [immediate, enabled, fetchData, ...deps]);

    // Auto-refresh interval
    useEffect(() => {
        if (refreshInterval > 0 && enabled) {
            intervalRef.current = setInterval(fetchData, refreshInterval);
            return () => {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                }
            };
        }
    }, [refreshInterval, enabled, fetchData]);

    // Re-fetch when coming back online
    useEffect(() => {
        if (!isOffline && error) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOffline]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            mountedRef.current = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    const refresh = useCallback(() => {
        fetchData();
    }, [fetchData]);

    return {
        data,
        loading,
        error,
        lastFetched,
        isInitialLoad,
        isStale,
        isOffline,
        refresh,
    };
}

export default useApiCall;
