/**
 * Health Overview - System health status panel
 * 
 * PHASE 3: Expanded from 4 static services to 6 real services:
 * - API (Engine on 8001)
 * - Brain API (on 8000)  
 * - Database (from engine health)
 * - SSH Executor (from getExecutorOverview)
 * - Docker Executor (from getExecutorOverview)
 * - WebSocket (from real-time connection state)
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
    Bot,
    Wifi,
} from '../Icons';
import './Dashboard.css';

interface SystemHealth {
    database: string;
    ssh: string;
    docker: string;
    api: string;
    brain?: string;
    websocket?: string;
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
        { key: 'api', label: 'Engine API', icon: <Globe size={20} />, status: health.api },
        { key: 'brain', label: 'Brain API', icon: <Bot size={20} />, status: health.brain ?? 'checking' },
        { key: 'database', label: 'Database', icon: <Database size={20} />, status: health.database },
        { key: 'ssh', label: 'SSH Executor', icon: <Terminal size={20} />, status: health.ssh },
        { key: 'docker', label: 'Docker', icon: <Container size={20} />, status: health.docker },
        { key: 'websocket', label: 'WebSocket', icon: <Wifi size={20} />, status: health.websocket ?? 'checking' },
    ];

    const healthyCount = services.filter(s => s.status === 'healthy').length;
    const checkingCount = services.filter(s => s.status === 'checking').length;

    const overallHealth = healthyCount === services.length ? 'All Systems Operational' :
        checkingCount > 0 && healthyCount + checkingCount === services.length ? 'Checking Services...' :
            healthyCount >= services.length / 2 ? 'Partial Degradation' :
                'System Issues Detected';

    const overallColor = healthyCount === services.length ? '#10b981' :
        checkingCount > 0 && healthyCount + checkingCount === services.length ? '#f59e0b' :
            healthyCount >= services.length / 2 ? '#f59e0b' : '#ef4444';

    return (
        <div className="health-overview">
            <h3><Activity size={18} /> System Health</h3>

            <div className="health-summary">
                <div
                    className="health-indicator"
                    style={{
                        background: `${overallColor}20`,
                        color: overallColor,
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
