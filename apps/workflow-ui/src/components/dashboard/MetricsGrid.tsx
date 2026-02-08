/**
 * Metrics Grid - Key performance indicators
 */

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

export default function MetricsGrid({ stats }: MetricsGridProps) {
    const metrics = [
        {
            label: 'Active Workflows',
            value: stats.activeWorkflows,
            total: stats.totalWorkflows,
            icon: '📋',
            color: '#8b5cf6',
            format: (v: number, t?: number) => `${v}/${t}`,
        },
        {
            label: 'Issues Detected',
            value: stats.issuesDetected,
            icon: '🔥',
            color: '#ef4444',
            trend: stats.issuesDetected > 0 ? 'up' : 'stable',
        },
        {
            label: 'Issues Resolved',
            value: stats.issuesResolved,
            icon: '✅',
            color: '#10b981',
        },
        {
            label: 'Avg Resolution',
            value: stats.avgResolutionTime,
            icon: '⏱️',
            color: '#f59e0b',
            format: (v: number) => v > 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`,
        },
        {
            label: 'Remediations',
            value: stats.remediationsExecuted,
            icon: '🔧',
            color: '#3b82f6',
        },
        {
            label: 'Success Rate',
            value: stats.successRate,
            icon: '📈',
            color: stats.successRate >= 90 ? '#10b981' : stats.successRate >= 70 ? '#f59e0b' : '#ef4444',
            format: (v: number) => `${v.toFixed(1)}%`,
        },
        {
            label: 'Uptime',
            value: stats.uptime,
            icon: '🟢',
            color: '#10b981',
            format: (v: number) => `${v.toFixed(2)}%`,
        },
    ];

    return (
        <div className="metrics-grid">
            {metrics.map((metric, idx) => (
                <div
                    key={idx}
                    className="metric-card"
                    style={{ borderTopColor: metric.color }}
                >
                    <div className="metric-header">
                        <span className="metric-icon">{metric.icon}</span>
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
                            {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '→'}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
