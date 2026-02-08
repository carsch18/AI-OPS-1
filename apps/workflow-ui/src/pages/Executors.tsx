/**
 * Executors Page - MAANG-Grade Executor Management
 * 
 * Features:
 * - Three executor cards: SSH, Docker, API
 * - Health status with real-time updates
 * - Container management for Docker
 * - Host management for SSH
 * - Endpoint management for API
 */

import { useState, useEffect, useCallback } from 'react';
import {
    getExecutorOverview,
    getSSHStatus,
    getDockerStatus,
    getAPIStatus,
    containerAction as performContainerAction,
    testSSHConnection,
    testAPIEndpoint,
} from '../services/executorApi';
import type {
    ExecutorOverview,
    SSHHost,
    DockerContainer,
    APIEndpoint,
    ExecutorType,
    ExecutorStatus,
} from '../services/executorApi';
import {
    getExecutorIcon,
    getStatusIcon,
    getContainerStatusIcon,
    calculateOverallHealth,
} from '../services/executorApi';
import './Executors.css';

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface HealthBadgeProps {
    status: ExecutorStatus;
}

function HealthBadge({ status }: HealthBadgeProps) {
    return (
        <span className={`health-badge ${status}`}>
            {getStatusIcon(status)} {status}
        </span>
    );
}

interface ExecutorCardProps {
    type: ExecutorType;
    name: string;
    health: { status: ExecutorStatus; latency_ms: number };
    stats: Record<string, number | string | boolean>;
    onClick: () => void;
    selected: boolean;
}

function ExecutorCard({ type, name, health, stats, onClick, selected }: ExecutorCardProps) {
    return (
        <div className={`executor-card ${type} ${selected ? 'selected' : ''}`} onClick={onClick}>
            <div className="executor-card-header">
                <span className="executor-icon">{getExecutorIcon(type)}</span>
                <h3>{name}</h3>
                <HealthBadge status={health.status} />
            </div>

            <div className="executor-stats">
                {Object.entries(stats).slice(0, 4).map(([key, value]) => (
                    <div key={key} className="stat-item">
                        <span className="stat-value">
                            {typeof value === 'boolean' ? (value ? '✅' : '❌') : value}
                        </span>
                        <span className="stat-label">{key.replace(/_/g, ' ')}</span>
                    </div>
                ))}
            </div>

            <div className="executor-latency">
                <span className="latency-label">Latency:</span>
                <span className="latency-value">{health.latency_ms}ms</span>
            </div>
        </div>
    );
}

interface SSHDetailPanelProps {
    hosts: SSHHost[];
    onTest: (alias: string) => void;
    testing: string | null;
}

function SSHDetailPanel({ hosts, onTest, testing }: SSHDetailPanelProps) {
    return (
        <div className="detail-panel ssh-panel">
            <h3>🔐 SSH Hosts</h3>

            {hosts.length === 0 ? (
                <div className="empty-state small">
                    <p>No SSH hosts configured</p>
                </div>
            ) : (
                <div className="host-list">
                    {hosts.map(host => (
                        <div key={host.alias} className={`host-item ${host.status}`}>
                            <div className="host-info">
                                <span className="host-alias">{host.alias}</span>
                                <span className="host-address">
                                    {host.username}@{host.hostname}:{host.port}
                                </span>
                            </div>
                            <div className="host-stats">
                                <span className="stat">
                                    {host.connection_count} connections
                                </span>
                                <span className="stat">
                                    {host.avg_latency_ms}ms avg
                                </span>
                            </div>
                            <div className="host-actions">
                                <button
                                    className="btn-test"
                                    onClick={() => onTest(host.alias)}
                                    disabled={testing === host.alias}
                                >
                                    {testing === host.alias ? '⏳' : '🔌'} Test
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface DockerDetailPanelProps {
    containers: DockerContainer[];
    onAction: (id: string, action: 'start' | 'stop' | 'restart') => void;
    actionLoading: string | null;
}

function DockerDetailPanel({ containers, onAction, actionLoading }: DockerDetailPanelProps) {
    return (
        <div className="detail-panel docker-panel">
            <h3>🐳 Containers</h3>

            {containers.length === 0 ? (
                <div className="empty-state small">
                    <p>No containers found</p>
                </div>
            ) : (
                <div className="container-list">
                    {containers.map(container => (
                        <div key={container.id} className={`container-item ${container.status}`}>
                            <div className="container-status">
                                {getContainerStatusIcon(container.status)}
                            </div>
                            <div className="container-info">
                                <span className="container-name">{container.name}</span>
                                <span className="container-image">{container.image}</span>
                            </div>
                            <div className="container-metrics">
                                <span className="metric">
                                    CPU: {container.cpu_percent.toFixed(1)}%
                                </span>
                                <span className="metric">
                                    RAM: {container.memory_usage_mb}MB / {container.memory_limit_mb}MB
                                </span>
                            </div>
                            <div className="container-actions">
                                {container.status === 'running' ? (
                                    <>
                                        <button
                                            className="btn-action"
                                            onClick={() => onAction(container.id, 'restart')}
                                            disabled={actionLoading === container.id}
                                        >
                                            🔄
                                        </button>
                                        <button
                                            className="btn-action stop"
                                            onClick={() => onAction(container.id, 'stop')}
                                            disabled={actionLoading === container.id}
                                        >
                                            ⏹️
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        className="btn-action start"
                                        onClick={() => onAction(container.id, 'start')}
                                        disabled={actionLoading === container.id}
                                    >
                                        ▶️
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

interface APIDetailPanelProps {
    endpoints: APIEndpoint[];
    onTest: (id: string) => void;
    testing: string | null;
}

function APIDetailPanel({ endpoints, onTest, testing }: APIDetailPanelProps) {
    return (
        <div className="detail-panel api-panel">
            <h3>🌐 API Endpoints</h3>

            {endpoints.length === 0 ? (
                <div className="empty-state small">
                    <p>No API endpoints configured</p>
                </div>
            ) : (
                <div className="endpoint-list">
                    {endpoints.map(endpoint => (
                        <div key={endpoint.id} className={`endpoint-item ${endpoint.status}`}>
                            <div className="endpoint-method">
                                <span className={`method-badge ${endpoint.method.toLowerCase()}`}>
                                    {endpoint.method}
                                </span>
                            </div>
                            <div className="endpoint-info">
                                <span className="endpoint-name">{endpoint.name}</span>
                                <span className="endpoint-url">{endpoint.url}</span>
                            </div>
                            <div className="endpoint-stats">
                                <span className="stat">
                                    {Math.round(endpoint.success_rate * 100)}% success
                                </span>
                                <span className="stat">
                                    {endpoint.avg_response_ms}ms avg
                                </span>
                            </div>
                            <div className="endpoint-actions">
                                <button
                                    className="btn-test"
                                    onClick={() => onTest(endpoint.id)}
                                    disabled={testing === endpoint.id}
                                >
                                    {testing === endpoint.id ? '⏳' : '🔌'} Test
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function ExecutorsPage() {
    const [overview, setOverview] = useState<ExecutorOverview | null>(null);
    const [sshHosts, setSSHHosts] = useState<SSHHost[]>([]);
    const [containers, setContainers] = useState<DockerContainer[]>([]);
    const [apiEndpoints, setAPIEndpoints] = useState<APIEndpoint[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedExecutor, setSelectedExecutor] = useState<ExecutorType>('ssh');

    const [testingSSH, setTestingSSH] = useState<string | null>(null);
    const [testingAPI, setTestingAPI] = useState<string | null>(null);
    const [containerActionLoading, setContainerActionLoading] = useState<string | null>(null);

    // Fetch data
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [ov, ssh, docker, api] = await Promise.all([
                getExecutorOverview().catch(() => null),
                getSSHStatus().catch(() => ({ hosts: [] })),
                getDockerStatus().catch(() => ({ containers: [] })),
                getAPIStatus().catch(() => ({ endpoints: [] })),
            ]);

            setOverview(ov as ExecutorOverview);
            setSSHHosts(ssh.hosts || []);
            setContainers(docker.containers || []);
            setAPIEndpoints(api.endpoints || []);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load executors');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-refresh
    useEffect(() => {
        const interval = setInterval(fetchData, 10000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Actions
    const handleTestSSH = useCallback(async (alias: string) => {
        setTestingSSH(alias);
        try {
            await testSSHConnection(alias);
            await fetchData();
        } catch (err) {
            console.error('SSH test failed:', err);
        } finally {
            setTestingSSH(null);
        }
    }, [fetchData]);

    const handleContainerAction = useCallback(async (id: string, action: 'start' | 'stop' | 'restart') => {
        setContainerActionLoading(id);
        try {
            await performContainerAction(id, action);
            await fetchData();
        } catch (err) {
            console.error('Container action failed:', err);
        } finally {
            setContainerActionLoading(null);
        }
    }, [fetchData]);

    const handleTestAPI = useCallback(async (id: string) => {
        setTestingAPI(id);
        try {
            await testAPIEndpoint(id);
            await fetchData();
        } catch (err) {
            console.error('API test failed:', err);
        } finally {
            setTestingAPI(null);
        }
    }, [fetchData]);

    // Loading state
    if (loading) {
        return (
            <div className="executors-page loading">
                <div className="loading-content">
                    <div className="loading-spinner large" />
                    <p>Loading executors...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="executors-page error">
                <div className="error-content">
                    <span className="error-icon">⚠️</span>
                    <h2>Failed to Load</h2>
                    <p>{error}</p>
                    <button onClick={fetchData}>Retry</button>
                </div>
            </div>
        );
    }

    const overallHealth = overview ? calculateOverallHealth(overview) : 'unknown';

    return (
        <div className="executors-page">
            {/* Header */}
            <header className="executors-header">
                <div className="header-left">
                    <h1>💻 Executors</h1>
                    <HealthBadge status={overallHealth} />
                </div>
                <div className="header-right">
                    <button className="btn-refresh" onClick={fetchData}>
                        🔄 Refresh
                    </button>
                </div>
            </header>

            {/* Executor Cards */}
            <div className="executor-cards">
                {overview && (
                    <>
                        <ExecutorCard
                            type="ssh"
                            name="SSH Executor"
                            health={overview.ssh.health}
                            stats={overview.ssh.stats as unknown as Record<string, number | string | boolean>}
                            onClick={() => setSelectedExecutor('ssh')}
                            selected={selectedExecutor === 'ssh'}
                        />
                        <ExecutorCard
                            type="docker"
                            name="Docker Executor"
                            health={overview.docker.health}
                            stats={overview.docker.stats as unknown as Record<string, number | string | boolean>}
                            onClick={() => setSelectedExecutor('docker')}
                            selected={selectedExecutor === 'docker'}
                        />
                        <ExecutorCard
                            type="api"
                            name="API Executor"
                            health={overview.api.health}
                            stats={overview.api.stats as unknown as Record<string, number | string | boolean>}
                            onClick={() => setSelectedExecutor('api')}
                            selected={selectedExecutor === 'api'}
                        />
                    </>
                )}
            </div>

            {/* Detail Panel */}
            <div className="executor-details">
                {selectedExecutor === 'ssh' && (
                    <SSHDetailPanel
                        hosts={sshHosts}
                        onTest={handleTestSSH}
                        testing={testingSSH}
                    />
                )}
                {selectedExecutor === 'docker' && (
                    <DockerDetailPanel
                        containers={containers}
                        onAction={handleContainerAction}
                        actionLoading={containerActionLoading}
                    />
                )}
                {selectedExecutor === 'api' && (
                    <APIDetailPanel
                        endpoints={apiEndpoints}
                        onTest={handleTestAPI}
                        testing={testingAPI}
                    />
                )}
            </div>
        </div>
    );
}
