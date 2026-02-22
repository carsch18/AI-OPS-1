/**
 * Analytics API Service — FULLY REAL, ZERO MOCKS
 * 
 * Connects to REAL backend APIs:
 * - Workflow Engine (port 8001): events, issues, workflows, executions, remediation stats
 * - Brain (port 8000): system metrics from Netdata (CPU, memory, disk, network)
 * 
 * RULES:
 * 1. NO mock data generators. EVER.
 * 2. If an API fails → throw an error or return empty defaults (zeros, empty arrays)
 * 3. Every number displayed comes from a real backend response
 * 4. Error states are propagated honestly to the UI
 */

const WORKFLOW_API = 'http://localhost:8001';
const BRAIN_API = 'http://localhost:8000';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
export type MetricType = 'cpu' | 'memory' | 'disk' | 'network' | 'latency' | 'throughput';

export interface SystemMetrics {
    timestamp: string;
    cpu_usage: number;
    memory_usage: number;
    disk_usage: number;
    network_in_mbps: number;
    network_out_mbps: number;
    active_connections: number;
}

export interface ExecutionStats {
    total_executions: number;
    successful_executions: number;
    failed_executions: number;
    avg_duration_ms: number;
    executions_by_hour: { hour: string; count: number }[];
    executions_by_status: { status: string; count: number }[];
}

export interface IssueStats {
    total_detected: number;
    total_resolved: number;
    avg_resolution_ms: number;
    by_severity: { severity: string; count: number }[];
    by_category: { category: string; count: number }[];
    resolution_trend: { date: string; detected: number; resolved: number }[];
}

export interface EventStats {
    total_events: number;
    events_per_minute: number;
    by_type: Record<string, number>;
    by_channel: Record<string, number>;
}

export interface EventHistoryItem {
    id: string;
    event_type: string;
    channel: string;
    data: Record<string, unknown>;
    timestamp: string;
}

export interface WorkflowStats {
    total_workflows: number;
    active_workflows: number;
    by_trigger_type: Record<string, number>;
    most_executed: { workflow_id: string; name: string; count: number }[];
}

export interface DashboardOverview {
    system: SystemMetrics;
    executions: ExecutionStats;
    issues: IssueStats;
    events: EventStats;
    workflows: WorkflowStats;
}

export interface TimeSeriesDataPoint {
    timestamp: string;
    value: number;
    label?: string;
}

export interface ChartData {
    labels: string[];
    datasets: {
        label: string;
        data: number[];
        color?: string;
    }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY DEFAULTS — These are zeros, not fake data. They represent "no data".
// ═══════════════════════════════════════════════════════════════════════════

const EMPTY_SYSTEM_METRICS: SystemMetrics = {
    timestamp: new Date().toISOString(),
    cpu_usage: 0,
    memory_usage: 0,
    disk_usage: 0,
    network_in_mbps: 0,
    network_out_mbps: 0,
    active_connections: 0,
};

const EMPTY_EXECUTION_STATS: ExecutionStats = {
    total_executions: 0,
    successful_executions: 0,
    failed_executions: 0,
    avg_duration_ms: 0,
    executions_by_hour: [],
    executions_by_status: [],
};

const EMPTY_ISSUE_STATS: IssueStats = {
    total_detected: 0,
    total_resolved: 0,
    avg_resolution_ms: 0,
    by_severity: [],
    by_category: [],
    resolution_trend: [],
};

const EMPTY_EVENT_STATS: EventStats = {
    total_events: 0,
    events_per_minute: 0,
    by_type: {},
    by_channel: {},
};

const EMPTY_WORKFLOW_STATS: WorkflowStats = {
    total_workflows: 0,
    active_workflows: 0,
    by_trigger_type: {},
    most_executed: [],
};

// ═══════════════════════════════════════════════════════════════════════════
// NORMALIZATION — Ensures safe shapes even if backend returns partial data
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize raw API data into a guaranteed-safe DashboardOverview.
 * Every nested array/object gets a default so .map() calls never crash.
 * Defaults are zeros/empty — NOT random fake numbers.
 */
function normalizeDashboardOverview(raw: Partial<DashboardOverview> | null | undefined): DashboardOverview {
    if (!raw || typeof raw !== 'object') {
        return {
            system: { ...EMPTY_SYSTEM_METRICS },
            executions: { ...EMPTY_EXECUTION_STATS },
            issues: { ...EMPTY_ISSUE_STATS },
            events: { ...EMPTY_EVENT_STATS },
            workflows: { ...EMPTY_WORKFLOW_STATS },
        };
    }

    const sys = raw.system;
    const exec = raw.executions;
    const iss = raw.issues;
    const evt = raw.events;
    const wf = raw.workflows;

    return {
        system: {
            timestamp: sys?.timestamp || new Date().toISOString(),
            cpu_usage: Number(sys?.cpu_usage) || 0,
            memory_usage: Number(sys?.memory_usage) || 0,
            disk_usage: Number(sys?.disk_usage) || 0,
            network_in_mbps: Number(sys?.network_in_mbps) || 0,
            network_out_mbps: Number(sys?.network_out_mbps) || 0,
            active_connections: Number(sys?.active_connections) || 0,
        },
        executions: {
            total_executions: Number(exec?.total_executions) || 0,
            successful_executions: Number(exec?.successful_executions) || 0,
            failed_executions: Number(exec?.failed_executions) || 0,
            avg_duration_ms: Number(exec?.avg_duration_ms) || 0,
            executions_by_hour: Array.isArray(exec?.executions_by_hour) ? exec.executions_by_hour : [],
            executions_by_status: Array.isArray(exec?.executions_by_status) ? exec.executions_by_status : [],
        },
        issues: {
            total_detected: Number(iss?.total_detected) || 0,
            total_resolved: Number(iss?.total_resolved) || 0,
            avg_resolution_ms: Number(iss?.avg_resolution_ms) || 0,
            by_severity: Array.isArray(iss?.by_severity) ? iss.by_severity : [],
            by_category: Array.isArray(iss?.by_category) ? iss.by_category : [],
            resolution_trend: Array.isArray(iss?.resolution_trend) ? iss.resolution_trend : [],
        },
        events: {
            total_events: Number(evt?.total_events) || 0,
            events_per_minute: Number(evt?.events_per_minute) || 0,
            by_type: (evt?.by_type && typeof evt.by_type === 'object') ? evt.by_type : {},
            by_channel: (evt?.by_channel && typeof evt.by_channel === 'object') ? evt.by_channel : {},
        },
        workflows: {
            total_workflows: Number(wf?.total_workflows) || 0,
            active_workflows: Number(wf?.active_workflows) || 0,
            by_trigger_type: (wf?.by_trigger_type && typeof wf.by_trigger_type === 'object') ? wf.by_trigger_type : {},
            most_executed: Array.isArray(wf?.most_executed) ? wf.most_executed : [],
        },
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS — All calls go to REAL backend endpoints
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get dashboard overview with all key metrics from REAL backends.
 * Fetches from both workflow-engine and brain in parallel.
 * Returns normalized data — zeros for any endpoint that fails (never fake data).
 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
    // Fetch from real endpoints in parallel — each can fail independently
    const [systemMetrics, eventStats, executionStats, issueStats, workflowStats] = await Promise.all([
        getSystemMetrics().catch(() => undefined),
        getEventStats().catch(() => undefined),
        getExecutionStats().catch(() => undefined),
        getIssueStats().catch(() => undefined),
        getWorkflowStats().catch(() => undefined),
    ]);

    const raw: Partial<DashboardOverview> = {
        system: systemMetrics || undefined,
        executions: executionStats || undefined,
        issues: issueStats || undefined,
        events: eventStats || undefined,
        workflows: workflowStats || undefined,
    };

    return normalizeDashboardOverview(raw);
}

/**
 * Get REAL system metrics from Brain's monitoring service.
 * Brain pulls from Netdata — these are actual CPU/memory/disk readings.
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
    const response = await fetch(`${BRAIN_API}/api/metrics/infrastructure`);
    if (!response.ok) throw new Error(`Brain metrics unavailable: ${response.status} ${response.statusText}`);
    const data = await response.json();

    // Map brain's infrastructure metrics to our SystemMetrics interface
    return {
        timestamp: new Date().toISOString(),
        cpu_usage: Number(data.cpu_percent ?? data.cpu_usage ?? 0),
        memory_usage: Number(data.memory_percent ?? data.memory_usage ?? 0),
        disk_usage: Number(data.disk_percent ?? data.disk_usage ?? 0),
        network_in_mbps: Number(data.network_in ?? data.network_in_mbps ?? 0),
        network_out_mbps: Number(data.network_out ?? data.network_out_mbps ?? 0),
        active_connections: Number(data.active_connections ?? data.connections ?? 0),
    };
}

/**
 * Get REAL event statistics from workflow engine's event bus.
 */
export async function getEventStats(): Promise<EventStats> {
    const response = await fetch(`${WORKFLOW_API}/api/events/stats`);
    if (!response.ok) throw new Error(`Event stats unavailable: ${response.status} ${response.statusText}`);
    return response.json();
}

/**
 * Get REAL event history from workflow engine.
 * No mock fallback — if backend is down, error propagates to UI.
 */
export async function getEventHistory(options: {
    event_type?: string;
    channel?: string;
    limit?: number;
} = {}): Promise<EventHistoryItem[]> {
    const params = new URLSearchParams();
    if (options.event_type) params.append('event_type', options.event_type);
    if (options.channel) params.append('channel', options.channel);
    if (options.limit) params.append('limit', String(options.limit));

    const response = await fetch(`${WORKFLOW_API}/api/events/history?${params.toString()}`);
    if (!response.ok) throw new Error(`Event history unavailable: ${response.status} ${response.statusText}`);

    const data = await response.json();
    return Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : [];
}

/**
 * Get REAL system health from workflow engine.
 */
export async function getSystemHealth(): Promise<{
    status: string;
    uptime: number;
    metrics: SystemMetrics;
}> {
    const response = await fetch(`${WORKFLOW_API}/health`);
    if (!response.ok) throw new Error(`Health check failed: ${response.status} ${response.statusText}`);
    return response.json();
}

/**
 * Get REAL execution statistics from workflow engine.
 * Uses /api/remediation/stats which has real execution data from DB.
 */
export async function getExecutionStats(): Promise<ExecutionStats> {
    // Try the remediation stats endpoint first (has execution counts)
    const response = await fetch(`${WORKFLOW_API}/api/remediation/stats`);
    if (!response.ok) throw new Error(`Execution stats unavailable: ${response.status} ${response.statusText}`);

    const data = await response.json();

    // Map the remediation stats to our ExecutionStats interface
    return {
        total_executions: Number(data.total_executions ?? data.total ?? 0),
        successful_executions: Number(data.successful_executions ?? data.successful ?? data.completed ?? 0),
        failed_executions: Number(data.failed_executions ?? data.failed ?? 0),
        avg_duration_ms: Number(data.avg_duration_ms ?? data.avg_duration ?? 0),
        executions_by_hour: Array.isArray(data.executions_by_hour) ? data.executions_by_hour : [],
        executions_by_status: Array.isArray(data.executions_by_status) ? data.executions_by_status : [],
    };
}

/**
 * Get REAL issue statistics from workflow engine's issue detector.
 */
export async function getIssueStats(): Promise<IssueStats> {
    const response = await fetch(`${WORKFLOW_API}/api/issues/stats`);
    if (!response.ok) throw new Error(`Issue stats unavailable: ${response.status} ${response.statusText}`);
    return response.json();
}

/**
 * Get REAL workflow statistics from workflow engine.
 * Derives stats from the actual workflow list endpoint.
 */
export async function getWorkflowStats(): Promise<WorkflowStats> {
    const response = await fetch(`${WORKFLOW_API}/api/workflows`);
    if (!response.ok) throw new Error(`Workflow stats unavailable: ${response.status} ${response.statusText}`);

    const data = await response.json();
    const workflows = Array.isArray(data.workflows) ? data.workflows : Array.isArray(data) ? data : [];

    // Derive real stats from the actual workflow list
    const activeWorkflows = workflows.filter((w: Record<string, unknown>) => w.is_active);
    const triggerCounts: Record<string, number> = {};
    for (const w of workflows) {
        const trigger = String(w.trigger_type || 'manual');
        triggerCounts[trigger] = (triggerCounts[trigger] || 0) + 1;
    }

    return {
        total_workflows: workflows.length,
        active_workflows: activeWorkflows.length,
        by_trigger_type: triggerCounts,
        most_executed: [], // Populated by execution history when available
    };
}

/**
 * Get REAL time series metrics from Brain's monitoring service.
 * Maps metric types to the appropriate Brain endpoint.
 */
export async function getTimeSeriesMetrics(
    metricType: MetricType,
    timeRange: TimeRange
): Promise<TimeSeriesDataPoint[]> {
    // Map metric types to real Brain endpoints
    const endpointMap: Record<MetricType, string> = {
        cpu: '/api/metrics/infrastructure',
        memory: '/api/metrics/infrastructure',
        disk: '/api/metrics/infrastructure',
        network: '/api/metrics/infrastructure',
        latency: '/api/metrics/performance',
        throughput: '/api/metrics/performance',
    };

    const endpoint = endpointMap[metricType];
    const response = await fetch(`${BRAIN_API}${endpoint}?range=${timeRange}&metric=${metricType}`);
    if (!response.ok) throw new Error(`Metrics unavailable for ${metricType}: ${response.status} ${response.statusText}`);

    const data = await response.json();

    // If the response is already an array of data points, return it
    if (Array.isArray(data)) return data;

    // If it's a single snapshot, wrap it as a single data point
    if (data && typeof data === 'object') {
        const valueKey = metricType === 'cpu' ? 'cpu_percent'
            : metricType === 'memory' ? 'memory_percent'
                : metricType === 'disk' ? 'disk_percent'
                    : metricType === 'network' ? 'network_in'
                        : metricType === 'latency' ? 'latency_ms'
                            : 'throughput';

        return [{
            timestamp: data.timestamp || new Date().toISOString(),
            value: Number(data[valueKey] ?? 0),
            label: metricType,
        }];
    }

    return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Format percentage
 */
export function formatPercent(value: number): string {
    return `${value.toFixed(1)}%`;
}

/**
 * Format duration
 */
export function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Get trend indicator
 */
export function getTrendIndicator(current: number, previous: number): 'up' | 'down' | 'stable' {
    const change = ((current - previous) / previous) * 100;
    if (change > 5) return 'up';
    if (change < -5) return 'down';
    return 'stable';
}

/**
 * Get metric color based on value
 */
export function getMetricColor(value: number, thresholds: { warn: number; critical: number }): string {
    if (value >= thresholds.critical) return 'red';
    if (value >= thresholds.warn) return 'yellow';
    return 'green';
}

export default {
    getDashboardOverview,
    getSystemMetrics,
    getEventStats,
    getEventHistory,
    getSystemHealth,
    getExecutionStats,
    getIssueStats,
    getWorkflowStats,
    getTimeSeriesMetrics,
    formatPercent,
    formatDuration,
    getTrendIndicator,
    getMetricColor,
};
