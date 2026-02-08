/**
 * useIssues - React Hook for Issue Management
 * 
 * Provides:
 * - Issue list with real-time updates
 * - Filtering, sorting, and search
 * - Issue actions (acknowledge, execute, resolve)
 * - Stats and patterns
 * - Integration with WebSocket for real-time updates
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import {
    listIssues,
    getIssue,
    getIssueStats,
    getDetectionPatterns,
    triggerDetection,
    acknowledgeIssue,
    executeRemediation,
    resolveIssue,
    autoRemediateIssue,
} from '../services/issueApi';
import type {
    Issue,
    IssueStats,
    DetectionPattern,
    IssueFilters,
    IssueSeverity,
    IssueCategory,
    IssueStatus,
} from '../services/issueApi';
import { useWebSocket } from './useWebSocket';

// Re-export types for convenience
export type { Issue, IssueStats, DetectionPattern, IssueFilters, IssueSeverity, IssueCategory, IssueStatus };

export type SortField = 'severity' | 'detected_at' | 'host' | 'category' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface UseIssuesOptions {
    autoRefresh?: boolean;
    refreshInterval?: number;
    initialFilters?: IssueFilters;
}

export interface UseIssuesReturn {
    // Data
    issues: Issue[];
    stats: IssueStats | null;
    patterns: DetectionPattern[];
    selectedIssue: Issue | null;

    // State
    loading: boolean;
    refreshing: boolean;
    error: string | null;

    // Filters & Sort
    filters: IssueFilters;
    setFilters: (filters: IssueFilters) => void;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
    sortField: SortField;
    setSortField: (field: SortField) => void;
    sortOrder: SortOrder;
    setSortOrder: (order: SortOrder) => void;

    // Computed
    filteredIssues: Issue[];
    issuesByCategory: Record<IssueCategory, Issue[]>;
    issuesBySeverity: Record<IssueSeverity, Issue[]>;

    // Actions
    refresh: () => Promise<void>;
    selectIssue: (issueId: string | null) => Promise<void>;
    acknowledge: (issueId: string) => Promise<boolean>;
    execute: (issueId: string, workflowId?: string) => Promise<boolean>;
    resolve: (issueId: string, resolution?: string) => Promise<boolean>;
    autoRemediate: (issueId: string) => Promise<boolean>;
    runDetection: (hosts?: string[]) => Promise<Issue[]>;
}

const DEFAULT_STATS: IssueStats = {
    total: 0,
    by_severity: { P0_CRITICAL: 0, P1_HIGH: 0, P2_MEDIUM: 0, P3_LOW: 0 },
    by_category: { compute: 0, storage: 0, network: 0, application: 0, security: 0, container: 0, compliance: 0, business: 0 },
    by_status: { detected: 0, acknowledged: 0, remediating: 0, resolved: 0, escalated: 0 },
    resolved: 0,
    avg_resolution_ms: 0,
    total_detected_24h: 0,
    avg_resolution_time_24h: 0,
};

export function useIssues(options: UseIssuesOptions = {}): UseIssuesReturn {
    const {
        autoRefresh = true,
        refreshInterval = 30000,
        initialFilters = {},
    } = options;

    // State
    const [issues, setIssues] = useState<Issue[]>([]);
    const [stats, setStats] = useState<IssueStats | null>(null);
    const [patterns, setPatterns] = useState<DetectionPattern[]>([]);
    const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters & Search
    const [filters, setFilters] = useState<IssueFilters>(initialFilters);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortField, setSortField] = useState<SortField>('severity');
    const [sortOrder, setSortOrder] = useState<SortOrder>('asc');

    // WebSocket for real-time updates
    const { lastEvent } = useWebSocket({
        channels: ['global', 'issues'],
        autoConnect: true,
    });

    // Fetch all data
    const fetchAll = useCallback(async (isRefresh = false) => {
        try {
            if (isRefresh) {
                setRefreshing(true);
            } else {
                setLoading(true);
            }
            setError(null);

            // Fetch issues, stats, and patterns in parallel
            const [issuesRes, statsRes, patternsRes] = await Promise.all([
                listIssues(filters),
                getIssueStats().catch(() => DEFAULT_STATS),
                getDetectionPatterns().catch(() => []),
            ]);

            setIssues(issuesRes.issues);
            setStats(statsRes);
            setPatterns(patternsRes);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch issues');
            console.error('Failed to fetch issues:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [filters]);

    // Initial fetch
    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Auto-refresh
    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(() => {
            fetchAll(true);
        }, refreshInterval);

        return () => clearInterval(interval);
    }, [autoRefresh, refreshInterval, fetchAll]);

    // Handle WebSocket events
    useEffect(() => {
        if (!lastEvent) return;

        const issueEventTypes = [
            'issue.detected',
            'issue.acknowledged',
            'issue.resolved',
            'issue.escalated',
        ];

        if (issueEventTypes.includes(lastEvent.event_type)) {
            // Refresh issues when we get issue-related events
            fetchAll(true);
        }
    }, [lastEvent, fetchAll]);

    // Computed: filtered & sorted issues
    const filteredIssues = useMemo(() => {
        let result = [...issues];

        // Apply search filter
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            result = result.filter(issue =>
                issue.pattern_name.toLowerCase().includes(query) ||
                issue.message.toLowerCase().includes(query) ||
                issue.host.toLowerCase().includes(query) ||
                issue.category.toLowerCase().includes(query)
            );
        }

        // Apply status filter (not sent to API)
        if (filters.status) {
            result = result.filter(issue => issue.status === filters.status);
        }

        // Apply host filter
        if (filters.host) {
            result = result.filter(issue =>
                issue.host.toLowerCase().includes(filters.host!.toLowerCase())
            );
        }

        // Sort
        result.sort((a, b) => {
            let comparison = 0;

            switch (sortField) {
                case 'severity':
                    comparison = a.severity_level - b.severity_level;
                    break;
                case 'detected_at':
                    comparison = new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime();
                    break;
                case 'host':
                    comparison = a.host.localeCompare(b.host);
                    break;
                case 'category':
                    comparison = a.category.localeCompare(b.category);
                    break;
                case 'status':
                    comparison = a.status.localeCompare(b.status);
                    break;
            }

            return sortOrder === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [issues, searchQuery, filters.status, filters.host, sortField, sortOrder]);

    // Computed: issues grouped by category
    const issuesByCategory = useMemo(() => {
        const grouped: Record<IssueCategory, Issue[]> = {
            compute: [],
            storage: [],
            network: [],
            application: [],
            security: [],
            container: [],
            compliance: [],
            business: [],
        };

        for (const issue of issues) {
            if (grouped[issue.category]) {
                grouped[issue.category].push(issue);
            }
        }

        return grouped;
    }, [issues]);

    // Computed: issues grouped by severity
    const issuesBySeverity = useMemo(() => {
        const grouped: Record<IssueSeverity, Issue[]> = {
            P0_CRITICAL: [],
            P1_HIGH: [],
            P2_MEDIUM: [],
            P3_LOW: [],
        };

        for (const issue of issues) {
            if (grouped[issue.severity]) {
                grouped[issue.severity].push(issue);
            }
        }

        return grouped;
    }, [issues]);

    // Actions
    const refresh = useCallback(async () => {
        await fetchAll(true);
    }, [fetchAll]);

    const selectIssue = useCallback(async (issueId: string | null) => {
        if (!issueId) {
            setSelectedIssue(null);
            return;
        }

        try {
            const issue = await getIssue(issueId);
            setSelectedIssue(issue);
        } catch (err) {
            console.error('Failed to fetch issue details:', err);
            // Try to find in local list
            const local = issues.find(i => i.id === issueId);
            if (local) {
                setSelectedIssue(local);
            }
        }
    }, [issues]);

    const acknowledge = useCallback(async (issueId: string) => {
        try {
            await acknowledgeIssue(issueId);
            await fetchAll(true);
            return true;
        } catch (err) {
            console.error('Failed to acknowledge issue:', err);
            return false;
        }
    }, [fetchAll]);

    const execute = useCallback(async (issueId: string, workflowId?: string) => {
        try {
            await executeRemediation(issueId, workflowId);
            await fetchAll(true);
            return true;
        } catch (err) {
            console.error('Failed to execute remediation:', err);
            return false;
        }
    }, [fetchAll]);

    const resolve = useCallback(async (issueId: string, resolution?: string) => {
        try {
            await resolveIssue(issueId, resolution);
            await fetchAll(true);
            return true;
        } catch (err) {
            console.error('Failed to resolve issue:', err);
            return false;
        }
    }, [fetchAll]);

    const autoRemediate = useCallback(async (issueId: string) => {
        try {
            await autoRemediateIssue(issueId);
            await fetchAll(true);
            return true;
        } catch (err) {
            console.error('Failed to auto-remediate:', err);
            return false;
        }
    }, [fetchAll]);

    const runDetection = useCallback(async (hosts?: string[]) => {
        try {
            const result = await triggerDetection(hosts);
            await fetchAll(true);
            return result.issues;
        } catch (err) {
            console.error('Failed to run detection:', err);
            return [];
        }
    }, [fetchAll]);

    return {
        // Data
        issues,
        stats,
        patterns,
        selectedIssue,

        // State
        loading,
        refreshing,
        error,

        // Filters & Sort
        filters,
        setFilters,
        searchQuery,
        setSearchQuery,
        sortField,
        setSortField,
        sortOrder,
        setSortOrder,

        // Computed
        filteredIssues,
        issuesByCategory,
        issuesBySeverity,

        // Actions
        refresh,
        selectIssue,
        acknowledge,
        execute,
        resolve,
        autoRemediate,
        runDetection,
    };
}

export default useIssues;
