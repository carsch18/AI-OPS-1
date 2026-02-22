/**
 * Metrics Grid - Key performance indicators
 * 
 * PHASE 3: Added count-up animation on value changes and real trend indicators.
 * Trend is computed by comparing current value to previous snapshot.
 */

import { useEffect, useRef, useState } from 'react';
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

/** Animated counter that smoothly counts up to its target value */
function AnimatedValue({ value, format }: { value: number; format?: (v: number) => string }) {
    const [displayed, setDisplayed] = useState(0);
    const prevRef = useRef(0);
    const rafRef = useRef<number>();

    useEffect(() => {
        const start = prevRef.current;
        const end = value;
        const duration = 600; // ms
        const startTime = performance.now();

        const animate = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = start + (end - start) * eased;
            setDisplayed(current);

            if (progress < 1) {
                rafRef.current = requestAnimationFrame(animate);
            } else {
                prevRef.current = end;
            }
        };

        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [value]);

    if (format) return <>{format(displayed)}</>;
    return <>{Math.round(displayed).toLocaleString()}</>;
}

export default function MetricsGrid({ stats }: MetricsGridProps) {
    // Track previous stats for trend calculation
    const prevStatsRef = useRef<DashboardStats | null>(null);
    const [trends, setTrends] = useState<Record<string, 'up' | 'down' | 'stable'>>({});

    useEffect(() => {
        if (prevStatsRef.current) {
            const prev = prevStatsRef.current;
            setTrends({
                issuesDetected: stats.issuesDetected > prev.issuesDetected ? 'up' :
                    stats.issuesDetected < prev.issuesDetected ? 'down' : 'stable',
                issuesResolved: stats.issuesResolved > prev.issuesResolved ? 'up' :
                    stats.issuesResolved < prev.issuesResolved ? 'down' : 'stable',
                successRate: stats.successRate > prev.successRate ? 'up' :
                    stats.successRate < prev.successRate ? 'down' : 'stable',
                remediations: stats.remediationsExecuted > prev.remediationsExecuted ? 'up' :
                    stats.remediationsExecuted < prev.remediationsExecuted ? 'down' : 'stable',
            });
        }
        prevStatsRef.current = { ...stats };
    }, [stats]);

    const metrics: Metric[] = [
        {
            label: 'Active Workflows',
            value: stats.activeWorkflows,
            total: stats.totalWorkflows,
            icon: <FileText size={20} />,
            color: '#8b5cf6',
            format: (v: number, t?: number) => `${Math.round(v)}/${t}`,
        },
        {
            label: 'Issues Detected',
            value: stats.issuesDetected,
            icon: <Flame size={20} />,
            color: '#ef4444',
            trend: trends.issuesDetected ?? (stats.issuesDetected > 0 ? 'up' : 'stable'),
        },
        {
            label: 'Issues Resolved',
            value: stats.issuesResolved,
            icon: <CheckCircle size={20} />,
            color: '#10b981',
            trend: trends.issuesResolved,
        },
        {
            label: 'Avg Resolution',
            value: stats.avgResolutionTime,
            icon: <Clock size={20} />,
            color: '#f59e0b',
            format: (v: number) => v > 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`,
        },
        {
            label: 'Remediations',
            value: stats.remediationsExecuted,
            icon: <Wrench size={20} />,
            color: '#3b82f6',
            trend: trends.remediations,
        },
        {
            label: 'Success Rate',
            value: stats.successRate,
            icon: <TrendingUp size={20} />,
            color: stats.successRate >= 90 ? '#10b981' : stats.successRate >= 70 ? '#f59e0b' : '#ef4444',
            format: (v: number) => `${v.toFixed(1)}%`,
            trend: trends.successRate,
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
                        {metric.format ? (
                            <AnimatedValue
                                value={metric.value}
                                format={(v) => metric.format!(v, metric.total)}
                            />
                        ) : (
                            <AnimatedValue value={metric.value} />
                        )}
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
