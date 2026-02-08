/**
 * Analytics Page - MAANG-Grade Metrics Dashboard
 * 
 * Features:
 * - Overview cards with key metrics
 * - Time range selector
 * - Execution trends chart
 * - Issue breakdown charts
 * - Live event feed
 * - System health indicators
 */

import { useState, useEffect, useCallback } from 'react';
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
import './Analytics.css';

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface MetricCardProps {
    icon: string;
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
                        {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}%
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
}

function BarChart({ data, height = 200 }: BarChartProps) {
    const max = Math.max(...data.map(d => d.value)) || 1;

    return (
        <div className="bar-chart" style={{ height }}>
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
}

function DonutChart({ data, size = 160 }: DonutChartProps) {
    const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
    let currentAngle = 0;

    const segments = data.map(item => {
        const angle = (item.value / total) * 360;
        const startAngle = currentAngle;
        currentAngle += angle;
        return { ...item, startAngle, angle };
    });

    return (
        <div className="donut-chart" style={{ width: size, height: size }}>
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
            <h3>📡 Live Events</h3>
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

    // Fetch data
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [ov, ev, cpu, mem] = await Promise.all([
                getDashboardOverview(),
                getEventHistory({ limit: 50 }).catch(() => []),
                getTimeSeriesMetrics('cpu', timeRange),
                getTimeSeriesMetrics('memory', timeRange),
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
                    <span className="error-icon">⚠️</span>
                    <h2>Failed to Load</h2>
                    <p>{error}</p>
                    <button onClick={fetchData}>Retry</button>
                </div>
            </div>
        );
    }

    const { system, executions, issues, events: eventStats, workflows } = overview!;

    return (
        <div className="analytics-page">
            {/* Header */}
            <header className="analytics-header">
                <div className="header-left">
                    <h1>📊 Analytics Dashboard</h1>
                </div>
                <div className="header-right">
                    <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
                    <button className="btn-refresh" onClick={fetchData}>
                        🔄 Refresh
                    </button>
                </div>
            </header>

            {/* Overview Cards */}
            <div className="overview-cards">
                <MetricCard
                    icon="🖥️"
                    label="CPU Usage"
                    value={formatPercent(system.cpu_usage)}
                    color={getMetricColor(system.cpu_usage, { warn: 70, critical: 90 })}
                />
                <MetricCard
                    icon="🧠"
                    label="Memory Usage"
                    value={formatPercent(system.memory_usage)}
                    color={getMetricColor(system.memory_usage, { warn: 75, critical: 90 })}
                />
                <MetricCard
                    icon="📋"
                    label="Total Executions"
                    value={executions.total_executions.toLocaleString()}
                    change={5.2}
                    color="purple"
                />
                <MetricCard
                    icon="✅"
                    label="Success Rate"
                    value={formatPercent((executions.successful_executions / executions.total_executions) * 100)}
                    color="green"
                />
                <MetricCard
                    icon="🔥"
                    label="Active Issues"
                    value={issues.total_detected - issues.total_resolved}
                    color={issues.total_detected - issues.total_resolved > 10 ? 'red' : 'yellow'}
                />
                <MetricCard
                    icon="⚡"
                    label="Events/min"
                    value={eventStats.events_per_minute}
                    color="blue"
                />
            </div>

            {/* Charts Grid */}
            <div className="charts-grid">
                {/* CPU & Memory Sparklines */}
                <div className="chart-card wide">
                    <h3>🖥️ System Performance</h3>
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

                {/* Execution by Status */}
                <div className="chart-card">
                    <h3>📋 Execution Status</h3>
                    <DonutChart
                        data={executions.executions_by_status.map(s => ({
                            label: s.status,
                            value: s.count,
                            color: s.status === 'completed' ? '#22c55e' :
                                s.status === 'failed' ? '#ef4444' : '#fbbf24',
                        }))}
                    />
                </div>

                {/* Issues by Severity */}
                <div className="chart-card">
                    <h3>🔥 Issues by Severity</h3>
                    <BarChart
                        data={issues.by_severity.map(s => ({
                            label: s.severity,
                            value: s.count,
                            color: s.severity === 'critical' ? '#ef4444' :
                                s.severity === 'high' ? '#f59e0b' :
                                    s.severity === 'medium' ? '#eab308' : '#22c55e',
                        }))}
                    />
                </div>

                {/* Issues by Category */}
                <div className="chart-card">
                    <h3>📁 Issues by Category</h3>
                    <BarChart
                        data={issues.by_category.slice(0, 5).map(c => ({
                            label: c.category.substring(0, 8),
                            value: c.count,
                            color: '#8b5cf6',
                        }))}
                    />
                </div>

                {/* Workflows */}
                <div className="chart-card">
                    <h3>⚡ Top Workflows</h3>
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
        </div>
    );
}
