/**
 * Health Overview - System health status panel
 */

import type { ReactNode } from 'react';
import {
    Activity,
    Globe,
    Database,
    Container,
    Terminal,
    CheckCircle,
    XCircle,
    Loader2,
    HelpCircle,
} from '../Icons';
import './Dashboard.css';

interface SystemHealth {
    database: string;
    ssh: string;
    docker: string;
    api: string;
}

interface HealthOverviewProps {
    health: SystemHealth;
}

export default function HealthOverview({ health }: HealthOverviewProps) {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'healthy': return '#10b981';
            case 'unhealthy': return '#ef4444';
            case 'checking': return '#f59e0b';
            default: return '#6b7280';
        }
    };

    const getStatusIcon = (status: string): ReactNode => {
        switch (status) {
            case 'healthy': return <CheckCircle size={14} />;
            case 'unhealthy': return <XCircle size={14} />;
            case 'checking': return <Loader2 size={14} className="spin" />;
            default: return <HelpCircle size={14} />;
        }
    };

    const services: { key: string; label: string; icon: ReactNode; status: string }[] = [
        { key: 'api', label: 'API Server', icon: <Globe size={20} />, status: health.api },
        { key: 'database', label: 'Database', icon: <Database size={20} />, status: health.database },
        { key: 'docker', label: 'Docker', icon: <Container size={20} />, status: health.docker },
        { key: 'ssh', label: 'SSH', icon: <Terminal size={20} />, status: health.ssh },
    ];

    const healthyCount = services.filter(s => s.status === 'healthy').length;
    const overallHealth = healthyCount === services.length ? 'All Systems Operational' :
        healthyCount >= services.length / 2 ? 'Partial Degradation' :
            'System Issues Detected';

    return (
        <div className="health-overview">
            <h3><Activity size={18} /> System Health</h3>

            <div className="health-summary">
                <div
                    className="health-indicator"
                    style={{
                        background: healthyCount === services.length ?
                            'rgba(16, 185, 129, 0.2)' :
                            healthyCount >= 2 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.2)',
                        color: healthyCount === services.length ? '#10b981' :
                            healthyCount >= 2 ? '#f59e0b' : '#ef4444'
                    }}
                >
                    {overallHealth}
                </div>
                <span className="health-count">{healthyCount}/{services.length} healthy</span>
            </div>

            <div className="health-grid">
                {services.map(service => (
                    <div
                        key={service.key}
                        className={`health-item ${service.status}`}
                    >
                        <div className="health-icon-row">
                            <span className="service-icon" style={{ color: getStatusColor(service.status) }}>{service.icon}</span>
                            <span
                                className="status-badge"
                                style={{
                                    background: `${getStatusColor(service.status)}20`,
                                    color: getStatusColor(service.status)
                                }}
                            >
                                {getStatusIcon(service.status)}
                            </span>
                        </div>
                        <span className="service-label">{service.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
