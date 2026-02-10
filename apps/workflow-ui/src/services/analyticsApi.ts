/**
 * Analytics API Service - Phase 7F
 * 
 * Connects to analytics and metrics backend APIs:
 * - System metrics and performance data
 * - Execution analytics and trends
 * - Event statistics and history
 * - Dashboard widgets data
 */

const API_BASE = 'http://localhost:8001';

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
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get dashboard overview with all key metrics
 */
export async function getDashboardOverview(): Promise<DashboardOverview> {
    // Fetch from multiple endpoints and combine
    const [eventStats, health] = await Promise.all([
        getEventStats().catch(() => null),
        getSystemHealth().catch(() => null),
    ]);

    // Build overview from available data
    return {
        system: health?.metrics || generateMockSystemMetrics(),
        executions: await getExecutionStats().catch(() => generateMockExecutionStats()),
        issues: await getIssueStats().catch(() => generateMockIssueStats()),
        events: eventStats || generateMockEventStats(),
        workflows: await getWorkflowStats().catch(() => generateMockWorkflowStats()),
    };
}

/**
 * Get event statistics
 */
export async function getEventStats(): Promise<EventStats> {
    const response = await fetch(`${API_BASE}/api/events/stats`);
    if (!response.ok) throw new Error(`Failed to fetch event stats: ${response.statusText}`);
    return response.json();
}

/**
 * Get event history
 */
export async function getEventHistory(options: {
    event_type?: string;
    channel?: string;
    limit?: number;
} = {}): Promise<EventHistoryItem[]> {
    try {
        const params = new URLSearchParams();
        if (options.event_type) params.append('event_type', options.event_type);
        if (options.channel) params.append('channel', options.channel);
        if (options.limit) params.append('limit', String(options.limit));

        const response = await fetch(`${API_BASE}/api/events/history?${params.toString()}`);
        if (!response.ok) throw new Error(`Failed to fetch event history: ${response.statusText}`);

        const data = await response.json();
        return data.events;
    } catch {
        // Return mock events when backend unavailable
        return generateMockEventHistory(options.limit || 10);
    }
}

function generateMockEventHistory(limit: number): EventHistoryItem[] {
    const eventTypes = ['workflow.started', 'workflow.completed', 'issue.detected', 'remediation.triggered', 'system.alert'];
    const channels = ['workflows', 'issues', 'alerts', 'metrics'];
    const events: EventHistoryItem[] = [];

    for (let i = 0; i < limit; i++) {
        events.push({
            id: `evt-${i}`,
            event_type: eventTypes[Math.floor(Math.random() * eventTypes.length)],
            channel: channels[Math.floor(Math.random() * channels.length)],
            timestamp: new Date(Date.now() - i * 60000).toISOString(),
            data: { source: 'demo' },
        });
    }
    return events;
}

/**
 * Get system health
 */
export async function getSystemHealth(): Promise<{
    status: string;
    uptime: number;
    metrics: SystemMetrics;
}> {
    const response = await fetch(`${API_BASE}/health`);
    if (!response.ok) throw new Error(`Failed to fetch health: ${response.statusText}`);
    return response.json();
}

/**
 * Get execution statistics
 */
export async function getExecutionStats(): Promise<ExecutionStats> {
    const response = await fetch(`${API_BASE}/api/analytics/executions`);
    if (!response.ok) throw new Error(`Failed to fetch execution stats: ${response.statusText}`);
    return response.json();
}

/**
 * Get issue statistics  
 */
export async function getIssueStats(): Promise<IssueStats> {
    const response = await fetch(`${API_BASE}/api/issues/stats`);
    if (!response.ok) throw new Error(`Failed to fetch issue stats: ${response.statusText}`);
    return response.json();
}

/**
 * Get workflow statistics
 */
export async function getWorkflowStats(): Promise<WorkflowStats> {
    const response = await fetch(`${API_BASE}/api/analytics/workflows`);
    if (!response.ok) throw new Error(`Failed to fetch workflow stats: ${response.statusText}`);
    return response.json();
}

/**
 * Get time series metrics
 */
export async function getTimeSeriesMetrics(
    metricType: MetricType,
    timeRange: TimeRange
): Promise<TimeSeriesDataPoint[]> {
    const response = await fetch(`${API_BASE}/api/analytics/metrics/${metricType}?range=${timeRange}`);
    if (!response.ok) {
        // Return mock data if endpoint not available
        return generateMockTimeSeries(metricType, timeRange);
    }
    return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA GENERATORS (for demo when backend not available)
// ═══════════════════════════════════════════════════════════════════════════

function generateMockSystemMetrics(): SystemMetrics {
    return {
        timestamp: new Date().toISOString(),
        cpu_usage: 35 + Math.random() * 30,
        memory_usage: 55 + Math.random() * 20,
        disk_usage: 40 + Math.random() * 15,
        network_in_mbps: 50 + Math.random() * 100,
        network_out_mbps: 30 + Math.random() * 80,
        active_connections: Math.floor(100 + Math.random() * 200),
    };
}

function generateMockExecutionStats(): ExecutionStats {
    const hours = Array.from({ length: 24 }, (_, i) => ({
        hour: `${String(i).padStart(2, '0')}:00`,
        count: Math.floor(10 + Math.random() * 40),
    }));

    return {
        total_executions: 1247,
        successful_executions: 1189,
        failed_executions: 58,
        avg_duration_ms: 3420,
        executions_by_hour: hours,
        executions_by_status: [
            { status: 'completed', count: 1189 },
            { status: 'failed', count: 58 },
            { status: 'running', count: 3 },
        ],
    };
}

function generateMockIssueStats(): IssueStats {
    return {
        total_detected: 342,
        total_resolved: 318,
        avg_resolution_ms: 125000,
        by_severity: [
            { severity: 'critical', count: 12 },
            { severity: 'high', count: 45 },
            { severity: 'medium', count: 128 },
            { severity: 'low', count: 157 },
        ],
        by_category: [
            { category: 'compute', count: 89 },
            { category: 'storage', count: 67 },
            { category: 'network', count: 54 },
            { category: 'container', count: 78 },
            { category: 'application', count: 54 },
        ],
        resolution_trend: Array.from({ length: 7 }, (_, i) => ({
            date: new Date(Date.now() - (6 - i) * 86400000).toISOString().split('T')[0],
            detected: Math.floor(40 + Math.random() * 20),
            resolved: Math.floor(35 + Math.random() * 25),
        })),
    };
}

function generateMockEventStats(): EventStats {
    return {
        total_events: 15234,
        events_per_minute: 42,
        by_type: {
            'workflow.execution': 5420,
            'issue.detected': 3200,
            'issue.resolved': 2980,
            'remediation.started': 1890,
            'system.health': 1744,
        },
        by_channel: {
            global: 8500,
            workflows: 4200,
            issues: 2534,
        },
    };
}

function generateMockWorkflowStats(): WorkflowStats {
    return {
        total_workflows: 24,
        active_workflows: 18,
        by_trigger_type: {
            manual: 8,
            schedule: 6,
            webhook: 5,
            event: 5,
        },
        most_executed: [
            { workflow_id: 'wf-1', name: 'Memory Crisis Recovery', count: 234 },
            { workflow_id: 'wf-2', name: 'Disk Cleanup', count: 189 },
            { workflow_id: 'wf-3', name: 'Container Restart', count: 156 },
        ],
    };
}

function generateMockTimeSeries(metricType: MetricType, timeRange: TimeRange): TimeSeriesDataPoint[] {
    const points = timeRange === '1h' ? 60 : timeRange === '6h' ? 72 : timeRange === '24h' ? 96 : 168;
    const baseValue = metricType === 'cpu' ? 40 : metricType === 'memory' ? 60 : 30;

    return Array.from({ length: points }, (_, i) => ({
        timestamp: new Date(Date.now() - (points - i) * 60000).toISOString(),
        value: baseValue + Math.random() * 30 + Math.sin(i / 10) * 10,
    }));
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
