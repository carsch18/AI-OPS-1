/**
 * Analytics Page - MAANG-Grade Metrics Dashboard
 * 
 * PHASE 3 ENHANCEMENTS:
 * - CSV/JSON data export for dashboard metrics
 * - Chart drill-down modals (click any chart for detailed view)
 * - 7-day × 24-hour event heatmap grid
 * 
 * Existing features preserved:
 * - Overview cards with key metrics
 * - Time range selector
 * - Execution trends chart
 * - Issue breakdown charts
 * - Live event feed
 * - System health indicators
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
    getDashboardOverview,
    getEventHistory,
    getTimeSeriesMetrics,
} from '../services/analyticsApi';
import type {
    DashboardOverview,
    EventHistoryItem,
    TimeSeriesDataPoint,
    TimeRange,
} from '../services/analyticsApi';
import { formatPercent, getMetricColor } from '../services/analyticsApi';
import {
    LayoutDashboard,
    Cpu,
    MemoryStick,
    FileText,
    CheckCircle,
    Flame,
    Zap,
    Activity,
    Radio,
    BarChart3,
    FolderOpen,
    RefreshCw,
    TrendingUp,
    TrendingDown,
    AlertTriangle,
    Download,
    X,
} from '../components/Icons';
import './Analytics.css';

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: DATA EXPORT
// ═══════════════════════════════════════════════════════════════════════════

function downloadBlob(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function exportDashboard(overview: DashboardOverview, format: 'csv' | 'json') {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    if (format === 'json') {
        downloadBlob(JSON.stringify(overview, null, 2), `analytics_${ts}.json`, 'application/json');
    } else {
        const rows = [
            ['Metric', 'Value'],
            ['CPU Usage', String(overview.system.cpu_usage)],
            ['Memory Usage', String(overview.system.memory_usage)],
            ['Total Executions', String(overview.executions.total_executions)],
            ['Successful Executions', String(overview.executions.successful_executions)],
            ['Failed Executions', String(overview.executions.failed_executions)],
            ['Total Issues', String(overview.issues.total_detected)],
            ['Resolved Issues', String(overview.issues.total_resolved)],
            ['Events/min', String(overview.events.events_per_minute)],
            ['Active Workflows', String(overview.workflows.total_workflows)],
        ];
        downloadBlob(rows.map(r => r.join(',')).join('\n'), `analytics_${ts}.csv`, 'text/csv');
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: CHART DRILL-DOWN MODAL
// ═══════════════════════════════════════════════════════════════════════════

interface DrillDownModalProps {
    title: string;
    data: { label: string; value: number; color?: string }[];
    onClose: () => void;
}

function DrillDownModal({ title, data, onClose }: DrillDownModalProps) {
    const total = data.reduce((s, d) => s + d.value, 0);
    const sorted = [...data].sort((a, b) => b.value - a.value);
    const max = sorted[0]?.value || 1;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content drill-down-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title} — Detail</h2>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="drill-down-body">
                    <div className="drill-down-total">
                        Total: <strong>{total.toLocaleString()}</strong>
                    </div>
                    <div className="drill-down-rows">
                        {sorted.map((item, i) => (
                            <div key={i} className="drill-down-row">
                                <span className="drill-label">{item.label}</span>
                                <div className="drill-bar-bg">
                                    <div
                                        className="drill-bar-fill"
                                        style={{
                                            width: `${(item.value / max) * 100}%`,
                                            backgroundColor: item.color || '#8b5cf6',
                                        }}
                                    />
                                </div>
                                <span className="drill-value">{item.value.toLocaleString()}</span>
                                <span className="drill-pct">
                                    {total > 0 ? `${((item.value / total) * 100).toFixed(1)}%` : '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: HEATMAP
// ═══════════════════════════════════════════════════════════════════════════

interface HeatmapProps {
    events: EventHistoryItem[];
}

function EventHeatmap({ events }: HeatmapProps) {
    // Build a 7-day × 24-hour grid from actual event timestamps
    const heatmapData = useMemo(() => {
        const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
        const now = Date.now();
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

        events.forEach(e => {
            const ts = new Date(e.timestamp).getTime();
            if (ts >= sevenDaysAgo) {
                const dayIndex = Math.floor((now - ts) / (24 * 60 * 60 * 1000));
                const hour = new Date(e.timestamp).getHours();
                if (dayIndex >= 0 && dayIndex < 7) {
                    grid[6 - dayIndex][hour]++;
                }
            }
        });
        return grid;
    }, [events]);

    const maxVal = Math.max(1, ...heatmapData.flat());

    const dayLabels = useMemo(() => {
        const days: string[] = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            days.push(d.toLocaleDateString('en', { weekday: 'short' }));
        }
        return days;
    }, []);

    const getHeatColor = (val: number) => {
        if (val === 0) return 'rgba(71, 85, 105, 0.2)';
        const intensity = val / maxVal;
        if (intensity > 0.75) return 'rgba(139, 92, 246, 0.9)';
        if (intensity > 0.5) return 'rgba(139, 92, 246, 0.6)';
        if (intensity > 0.25) return 'rgba(139, 92, 246, 0.35)';
        return 'rgba(139, 92, 246, 0.15)';
    };

    return (
        <div className="heatmap-container">
            <h3><Activity size={18} /> Event Activity Heatmap</h3>
            <p className="heatmap-subtitle">Last 7 days × 24 hours</p>
            <div className="heatmap-grid">
                {/* Hour labels (top) */}
                <div className="heatmap-hour-labels">
                    <div className="heatmap-corner" />
                    {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="heatmap-hour-label">
                            {h % 6 === 0 ? `${h}h` : ''}
                        </div>
                    ))}
                </div>
                {/* Rows */}
                {heatmapData.map((row, dayIdx) => (
                    <div key={dayIdx} className="heatmap-row">
                        <div className="heatmap-day-label">{dayLabels[dayIdx]}</div>
                        {row.map((val, hourIdx) => (
                            <div
                                key={hourIdx}
                                className="heatmap-cell"
                                style={{ backgroundColor: getHeatColor(val) }}
                                title={`${dayLabels[dayIdx]} ${hourIdx}:00 — ${val} events`}
                            />
                        ))}
                    </div>
                ))}
            </div>
            <div className="heatmap-legend">
                <span>Less</span>
                <div className="legend-block" style={{ backgroundColor: 'rgba(71, 85, 105, 0.2)' }} />
                <div className="legend-block" style={{ backgroundColor: 'rgba(139, 92, 246, 0.15)' }} />
                <div className="legend-block" style={{ backgroundColor: 'rgba(139, 92, 246, 0.35)' }} />
                <div className="legend-block" style={{ backgroundColor: 'rgba(139, 92, 246, 0.6)' }} />
                <div className="legend-block" style={{ backgroundColor: 'rgba(139, 92, 246, 0.9)' }} />
                <span>More</span>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface MetricCardProps {
    icon: ReactNode;
    label: string;
    value: string | number;
    change?: number;
    color?: string;
}

function MetricCard({ icon, label, value, change, color = 'blue' }: MetricCardProps) {
    return (
        <div className={`metric-card ${color}`}>
            <div className="metric-icon">{icon}</div>
            <div className="metric-content">
                <span className="metric-value">{value}</span>
                <span className="metric-label">{label}</span>
                {change !== undefined && (
                    <span className={`metric-change ${change >= 0 ? 'positive' : 'negative'}`}>
                        {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {Math.abs(change).toFixed(1)}%
                    </span>
                )}
            </div>
        </div>
    );
}

interface TimeRangeSelectorProps {
    value: TimeRange;
    onChange: (range: TimeRange) => void;
}

function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
    const ranges: { value: TimeRange; label: string }[] = [
        { value: '1h', label: '1 Hour' },
        { value: '6h', label: '6 Hours' },
        { value: '24h', label: '24 Hours' },
        { value: '7d', label: '7 Days' },
        { value: '30d', label: '30 Days' },
    ];

    return (
        <div className="time-range-selector">
            {ranges.map(r => (
                <button
                    key={r.value}
                    className={`range-btn ${value === r.value ? 'active' : ''}`}
                    onClick={() => onChange(r.value)}
                >
                    {r.label}
                </button>
            ))}
        </div>
    );
}

interface SparklineChartProps {
    data: number[];
    height?: number;
    color?: string;
}

function SparklineChart({ data, height = 40, color = '#8b5cf6' }: SparklineChartProps) {
    if (data.length === 0) return null;

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;

    const points = data.map((value, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = height - ((value - min) / range) * height;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg className="sparkline-chart" viewBox={`0 0 100 ${height}`} preserveAspectRatio="none">
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                points={points}
            />
        </svg>
    );
}

interface BarChartProps {
    data: { label: string; value: number; color?: string }[];
    height?: number;
    onClick?: () => void;
}

function BarChart({ data, height = 200, onClick }: BarChartProps) {
    const max = Math.max(...data.map(d => d.value)) || 1;

    return (
        <div
            className={`bar-chart ${onClick ? 'clickable' : ''}`}
            style={{ height }}
            onClick={onClick}
        >
            {data.map((item, i) => (
                <div key={i} className="bar-item">
                    <div
                        className="bar"
                        style={{
                            height: `${(item.value / max) * 100}%`,
                            backgroundColor: item.color || '#8b5cf6',
                        }}
                    >
                        <span className="bar-value">{item.value}</span>
                    </div>
                    <span className="bar-label">{item.label}</span>
                </div>
            ))}
        </div>
    );
}

interface DonutChartProps {
    data: { label: string; value: number; color: string }[];
    size?: number;
    onClick?: () => void;
}

function DonutChart({ data, size = 160, onClick }: DonutChartProps) {
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    let currentAngle = 0;

    const segments = data.map(item => {
        const angle = (item.value / total) * 360;
        const startAngle = currentAngle;
        currentAngle += angle;
        return { ...item, startAngle, angle };
    });

    return (
        <div
            className={`donut-chart ${onClick ? 'clickable' : ''}`}
            style={{ width: size, height: size }}
            onClick={onClick}
        >
            <svg viewBox="0 0 100 100">
                {segments.map((seg, i) => {
                    const startRad = (seg.startAngle - 90) * (Math.PI / 180);
                    const endRad = (seg.startAngle + seg.angle - 90) * (Math.PI / 180);
                    const largeArc = seg.angle > 180 ? 1 : 0;

                    const x1 = 50 + 40 * Math.cos(startRad);
                    const y1 = 50 + 40 * Math.sin(startRad);
                    const x2 = 50 + 40 * Math.cos(endRad);
                    const y2 = 50 + 40 * Math.sin(endRad);

                    return (
                        <path
                            key={i}
                            d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                            fill={seg.color}
                            stroke="#1e293b"
                            strokeWidth="1"
                        />
                    );
                })}
                <circle cx="50" cy="50" r="25" fill="#1e293b" />
            </svg>
            <div className="donut-legend">
                {data.map((item, i) => (
                    <div key={i} className="legend-item">
                        <span className="legend-color" style={{ backgroundColor: item.color }} />
                        <span className="legend-label">{item.label}</span>
                        <span className="legend-value">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

interface EventFeedProps {
    events: EventHistoryItem[];
}

function EventFeed({ events }: EventFeedProps) {
    return (
        <div className="event-feed">
            <h3><Radio size={18} /> Live Events</h3>
            <div className="event-list">
                {events.slice(0, 10).map(event => (
                    <div key={event.id} className="event-item">
                        <span className="event-type">{event.event_type}</span>
                        <span className="event-channel">{event.channel}</span>
                        <span className="event-time">
                            {new Date(event.timestamp).toLocaleTimeString()}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AnalyticsPage() {
    const [overview, setOverview] = useState<DashboardOverview | null>(null);
    const [events, setEvents] = useState<EventHistoryItem[]>([]);
    const [cpuData, setCpuData] = useState<TimeSeriesDataPoint[]>([]);
    const [memData, setMemData] = useState<TimeSeriesDataPoint[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState<TimeRange>('24h');

    // Phase 3: Drill-down state
    const [drillDown, setDrillDown] = useState<{
        title: string;
        data: { label: string; value: number; color?: string }[];
    } | null>(null);

    // Phase 3: Export dropdown
    const [showExport, setShowExport] = useState(false);

    // Fetch data — getDashboardOverview now handles all normalization internally
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);

            const [ov, ev, cpu, mem] = await Promise.all([
                getDashboardOverview(),
                getEventHistory({ limit: 50 }).catch(() => []),
                getTimeSeriesMetrics('cpu', timeRange).catch(() => []),
                getTimeSeriesMetrics('memory', timeRange).catch(() => []),
            ]);

            setOverview(ov);
            setEvents(ev);
            setCpuData(cpu);
            setMemData(mem);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    }, [timeRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-refresh
    useEffect(() => {
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Drill-down data helpers
    const executionStatusData = useMemo(() => {
        if (!overview) return [];
        return overview.executions.executions_by_status.map(s => ({
            label: s.status,
            value: s.count,
            color: s.status === 'completed' ? '#22c55e' :
                s.status === 'failed' ? '#ef4444' : '#fbbf24',
        }));
    }, [overview]);

    const severityData = useMemo(() => {
        if (!overview) return [];
        return overview.issues.by_severity.map(s => ({
            label: s.severity,
            value: s.count,
            color: s.severity === 'critical' ? '#ef4444' :
                s.severity === 'high' ? '#f59e0b' :
                    s.severity === 'medium' ? '#eab308' : '#22c55e',
        }));
    }, [overview]);

    const categoryData = useMemo(() => {
        if (!overview) return [];
        return overview.issues.by_category.slice(0, 5).map(c => ({
            label: (c.category ?? 'N/A').substring(0, 8),
            value: c.count,
            color: '#8b5cf6',
        }));
    }, [overview]);

    // Loading state
    if (loading && !overview) {
        return (
            <div className="analytics-page loading">
                <div className="loading-content">
                    <div className="loading-spinner large" />
                    <p>Loading analytics...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error && !overview) {
        return (
            <div className="analytics-page error">
                <div className="error-content">
                    <span className="error-icon"><AlertTriangle size={48} /></span>
                    <h2>Failed to Load</h2>
                    <p>{error}</p>
                    <button onClick={fetchData}>Retry</button>
                </div>
            </div>
        );
    }

    const { system, executions, issues, events: eventStats, workflows } = overview!;
    const successRate = executions.total_executions > 0
        ? (executions.successful_executions / executions.total_executions) * 100
        : 0;

    return (
        <div className="analytics-page">
            {/* Header */}
            <header className="analytics-header">
                <div className="header-left">
                    <h1><LayoutDashboard size={24} /> Analytics Dashboard</h1>
                </div>
                <div className="header-right">
                    <TimeRangeSelector value={timeRange} onChange={setTimeRange} />

                    {/* Phase 3: Export Button */}
                    <div className="export-dropdown">
                        <button
                            className="btn-export"
                            onClick={() => setShowExport(!showExport)}
                        >
                            <Download size={16} /> Export
                        </button>
                        {showExport && (
                            <div className="export-menu">
                                <button onClick={() => { exportDashboard(overview!, 'csv'); setShowExport(false); }}>
                                    Export CSV
                                </button>
                                <button onClick={() => { exportDashboard(overview!, 'json'); setShowExport(false); }}>
                                    Export JSON
                                </button>
                            </div>
                        )}
                    </div>

                    <button className="btn-refresh" onClick={fetchData}>
                        <RefreshCw size={16} /> Refresh
                    </button>
                </div>
            </header>

            {/* Overview Cards */}
            <div className="overview-cards">
                <MetricCard
                    icon={<Cpu size={24} />}
                    label="CPU Usage"
                    value={formatPercent(system.cpu_usage)}
                    color={getMetricColor(system.cpu_usage, { warn: 70, critical: 90 })}
                />
                <MetricCard
                    icon={<MemoryStick size={24} />}
                    label="Memory Usage"
                    value={formatPercent(system.memory_usage)}
                    color={getMetricColor(system.memory_usage, { warn: 75, critical: 90 })}
                />
                <MetricCard
                    icon={<FileText size={24} />}
                    label="Total Executions"
                    value={executions.total_executions.toLocaleString()}
                    change={5.2}
                    color="purple"
                />
                <MetricCard
                    icon={<CheckCircle size={24} />}
                    label="Success Rate"
                    value={formatPercent(successRate)}
                    color="green"
                />
                <MetricCard
                    icon={<Flame size={24} />}
                    label="Active Issues"
                    value={issues.total_detected - issues.total_resolved}
                    color={issues.total_detected - issues.total_resolved > 10 ? 'red' : 'yellow'}
                />
                <MetricCard
                    icon={<Zap size={24} />}
                    label="Events/min"
                    value={eventStats.events_per_minute}
                    color="blue"
                />
            </div>

            {/* Charts Grid */}
            <div className="charts-grid">
                {/* CPU & Memory Sparklines */}
                <div className="chart-card wide">
                    <h3><Activity size={18} /> System Performance</h3>
                    <div className="sparkline-container">
                        <div className="sparkline-item">
                            <span className="sparkline-label">CPU</span>
                            <SparklineChart data={cpuData.map(d => d.value)} color="#8b5cf6" />
                            <span className="sparkline-value">{formatPercent(system.cpu_usage)}</span>
                        </div>
                        <div className="sparkline-item">
                            <span className="sparkline-label">Memory</span>
                            <SparklineChart data={memData.map(d => d.value)} color="#3b82f6" />
                            <span className="sparkline-value">{formatPercent(system.memory_usage)}</span>
                        </div>
                    </div>
                </div>

                {/* Execution by Status — Phase 3: clickable */}
                <div className="chart-card">
                    <h3><BarChart3 size={18} /> Execution Status</h3>
                    <DonutChart
                        data={executionStatusData}
                        onClick={() => setDrillDown({ title: 'Execution Status', data: executionStatusData })}
                    />
                    <p className="chart-hint">Click chart to drill down</p>
                </div>

                {/* Issues by Severity — Phase 3: clickable */}
                <div className="chart-card">
                    <h3><Flame size={18} /> Issues by Severity</h3>
                    <BarChart
                        data={severityData}
                        onClick={() => setDrillDown({ title: 'Issues by Severity', data: severityData })}
                    />
                    <p className="chart-hint">Click chart to drill down</p>
                </div>

                {/* Issues by Category — Phase 3: clickable */}
                <div className="chart-card">
                    <h3><FolderOpen size={18} /> Issues by Category</h3>
                    <BarChart
                        data={categoryData}
                        onClick={() => setDrillDown({ title: 'Issues by Category', data: categoryData })}
                    />
                    <p className="chart-hint">Click chart to drill down</p>
                </div>

                {/* Workflows */}
                <div className="chart-card">
                    <h3><Zap size={18} /> Top Workflows</h3>
                    <div className="workflow-list">
                        {workflows.most_executed.map((wf, i) => (
                            <div key={wf.workflow_id} className="workflow-item">
                                <span className="workflow-rank">#{i + 1}</span>
                                <span className="workflow-name">{wf.name}</span>
                                <span className="workflow-count">{wf.count} runs</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Event Feed */}
                <div className="chart-card">
                    <EventFeed events={events} />
                </div>
            </div>

            {/* Phase 3: Event Heatmap */}
            <div className="chart-card full-width">
                <EventHeatmap events={events} />
            </div>

            {/* Phase 3: Drill-down Modal */}
            {drillDown && (
                <DrillDownModal
                    title={drillDown.title}
                    data={drillDown.data}
                    onClose={() => setDrillDown(null)}
                />
            )}
        </div>
    );
}
