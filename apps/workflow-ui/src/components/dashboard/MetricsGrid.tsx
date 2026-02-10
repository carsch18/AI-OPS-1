/**
 * Metrics Grid - Key performance indicators
 */

import type { ReactNode } from 'react';
import {
    FileText,
    Flame,
    CheckCircle,
    Clock,
    Wrench,
    TrendingUp,
    Activity,
    TrendingDown,
    ArrowRight,
} from '../Icons';
import './Dashboard.css';

interface DashboardStats {
    totalWorkflows: number;
    activeWorkflows: number;
    issuesDetected: number;
    issuesResolved: number;
    avgResolutionTime: number;
    remediationsExecuted: number;
    successRate: number;
    uptime: number;
}

interface MetricsGridProps {
    stats: DashboardStats;
}

interface Metric {
    label: string;
    value: number;
    total?: number;
    icon: ReactNode;
    color: string;
    trend?: 'up' | 'down' | 'stable';
    format?: (v: number, t?: number) => string;
}

export default function MetricsGrid({ stats }: MetricsGridProps) {
    const metrics: Metric[] = [
        {
            label: 'Active Workflows',
            value: stats.activeWorkflows,
            total: stats.totalWorkflows,
            icon: <FileText size={20} />,
            color: '#8b5cf6',
            format: (v: number, t?: number) => `${v}/${t}`,
        },
        {
            label: 'Issues Detected',
            value: stats.issuesDetected,
            icon: <Flame size={20} />,
            color: '#ef4444',
            trend: stats.issuesDetected > 0 ? 'up' : 'stable',
        },
        {
            label: 'Issues Resolved',
            value: stats.issuesResolved,
            icon: <CheckCircle size={20} />,
            color: '#10b981',
        },
        {
            label: 'Avg Resolution',
            value: stats.avgResolutionTime,
            icon: <Clock size={20} />,
            color: '#f59e0b',
            format: (v: number) => v > 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`,
        },
        {
            label: 'Remediations',
            value: stats.remediationsExecuted,
            icon: <Wrench size={20} />,
            color: '#3b82f6',
        },
        {
            label: 'Success Rate',
            value: stats.successRate,
            icon: <TrendingUp size={20} />,
            color: stats.successRate >= 90 ? '#10b981' : stats.successRate >= 70 ? '#f59e0b' : '#ef4444',
            format: (v: number) => `${v.toFixed(1)}%`,
        },
        {
            label: 'Uptime',
            value: stats.uptime,
            icon: <Activity size={20} />,
            color: '#10b981',
            format: (v: number) => `${v.toFixed(2)}%`,
        },
    ];

    const getTrendIcon = (trend?: 'up' | 'down' | 'stable') => {
        switch (trend) {
            case 'up': return <TrendingUp size={14} />;
            case 'down': return <TrendingDown size={14} />;
            default: return <ArrowRight size={14} />;
        }
    };

    return (
        <div className="metrics-grid">
            {metrics.map((metric, idx) => (
                <div
                    key={idx}
                    className="metric-card"
                    style={{ borderTopColor: metric.color }}
                >
                    <div className="metric-header">
                        <span className="metric-icon" style={{ color: metric.color }}>{metric.icon}</span>
                        <span className="metric-label">{metric.label}</span>
                    </div>
                    <div className="metric-value" style={{ color: metric.color }}>
                        {metric.format ?
                            metric.format(metric.value, metric.total) :
                            metric.value.toLocaleString()
                        }
                    </div>
                    {metric.trend && (
                        <div className={`metric-trend ${metric.trend}`}>
                            {getTrendIcon(metric.trend)}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
