/**
 * Executors Page - MAANG-Grade Executor Management
 * 
 * PHASE 3 ENHANCEMENTS:
 * - SSH host registration modal (POST /api/ssh/hosts)
 * - SSH host removal with confirmation (DELETE /api/ssh/hosts/{alias})
 * - Container log viewer drawer (GET /api/docker/container/{name}/logs)
 * - Container health indicator from real Docker data
 * - API endpoint test result display with response time
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
    registerSSHHost,
    removeSSHHost,
    getContainerLogs,
} from '../services/executorApi';
import type {
    ExecutorOverview,
    SSHHost,
    DockerContainer,
    APIEndpoint,
    ExecutorType,
    ExecutorStatus,
    AuthMethod,
} from '../services/executorApi';
import {
    calculateOverallHealth,
} from '../services/executorApi';
import {
    Terminal,
    Key,
    Container,
    Globe,
    RefreshCw,
    CheckCircle,
    XCircle,
    Play,
    Square,
    RotateCw,
    Plug,
    Loader2,
    HelpCircle,
    Plus,
    Trash2,
    FileText,
    X,
    HealthStatusIcons,
    ExecutorTypeIcons,
    ContainerStatusIcons,
    ICON_SIZE,
} from '../components/Icons';
import './Executors.css';

// ═══════════════════════════════════════════════════════════════════════════
// SSH HOST REGISTRATION MODAL
// ═══════════════════════════════════════════════════════════════════════════

interface SSHRegisterModalProps {
    open: boolean;
    onClose: () => void;
    onRegistered: () => void;
}

function SSHRegisterModal({ open, onClose, onRegistered }: SSHRegisterModalProps) {
    const [alias, setAlias] = useState('');
    const [hostname, setHostname] = useState('');
    const [username, setUsername] = useState('');
    const [port, setPort] = useState(22);
    const [authMethod, setAuthMethod] = useState<AuthMethod>('key');
    const [password, setPassword] = useState('');
    const [keyPath, setKeyPath] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resetForm = useCallback(() => {
        setAlias('');
        setHostname('');
        setUsername('');
        setPort(22);
        setAuthMethod('key');
        setPassword('');
        setKeyPath('');
        setError(null);
    }, []);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!alias || !hostname || !username) {
            setError('Alias, hostname, and username are required');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            await registerSSHHost({
                alias,
                hostname,
                username,
                port,
                auth_method: authMethod,
                ...(authMethod === 'password' ? { password } : {}),
                ...(authMethod === 'key' ? { private_key_path: keyPath || undefined } : {}),
            });
            resetForm();
            onRegistered();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
        } finally {
            setSubmitting(false);
        }
    }, [alias, hostname, username, port, authMethod, password, keyPath, resetForm, onRegistered, onClose]);

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content register-ssh-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><Key size={20} /> Register SSH Host</h2>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                <form onSubmit={handleSubmit} className="register-form">
                    {error && (
                        <div className="form-error">
                            <XCircle size={14} /> {error}
                        </div>
                    )}

                    <div className="form-row">
                        <div className="form-field">
                            <label htmlFor="ssh-alias">Alias</label>
                            <input
                                id="ssh-alias"
                                type="text"
                                value={alias}
                                onChange={e => setAlias(e.target.value)}
                                placeholder="prod-web-01"
                                required
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="ssh-port">Port</label>
                            <input
                                id="ssh-port"
                                type="number"
                                value={port}
                                onChange={e => setPort(Number(e.target.value))}
                                min={1}
                                max={65535}
                            />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-field">
                            <label htmlFor="ssh-hostname">Hostname / IP</label>
                            <input
                                id="ssh-hostname"
                                type="text"
                                value={hostname}
                                onChange={e => setHostname(e.target.value)}
                                placeholder="192.168.1.100"
                                required
                            />
                        </div>
                        <div className="form-field">
                            <label htmlFor="ssh-username">Username</label>
                            <input
                                id="ssh-username"
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="root"
                                required
                            />
                        </div>
                    </div>

                    <div className="form-field">
                        <label htmlFor="ssh-auth">Authentication Method</label>
                        <select
                            id="ssh-auth"
                            value={authMethod}
                            onChange={e => setAuthMethod(e.target.value as AuthMethod)}
                        >
                            <option value="key">SSH Key</option>
                            <option value="password">Password</option>
                        </select>
                    </div>

                    {authMethod === 'password' ? (
                        <div className="form-field">
                            <label htmlFor="ssh-password">Password</label>
                            <input
                                id="ssh-password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="••••••••"
                            />
                        </div>
                    ) : (
                        <div className="form-field">
                            <label htmlFor="ssh-keypath">Private Key Path</label>
                            <input
                                id="ssh-keypath"
                                type="text"
                                value={keyPath}
                                onChange={e => setKeyPath(e.target.value)}
                                placeholder="~/.ssh/id_ed25519"
                            />
                        </div>
                    )}

                    <div className="form-actions">
                        <button type="button" className="btn-cancel" onClick={onClose}>Cancel</button>
                        <button type="submit" className="btn-register" disabled={submitting}>
                            {submitting ? <Loader2 size={14} className="spin" /> : <Plus size={14} />}
                            {submitting ? 'Registering...' : 'Register Host'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTAINER LOG VIEWER DRAWER
// ═══════════════════════════════════════════════════════════════════════════

interface LogViewerProps {
    containerName: string;
    open: boolean;
    onClose: () => void;
}

function ContainerLogViewer({ containerName, open, onClose }: LogViewerProps) {
    const [logs, setLogs] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [tailLines, setTailLines] = useState(100);

    const fetchLogs = useCallback(async () => {
        if (!containerName) return;
        setLoading(true);
        setError(null);
        try {
            const result = await getContainerLogs(containerName, { tail: tailLines });
            setLogs(result.logs || 'No logs available');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to fetch logs');
        } finally {
            setLoading(false);
        }
    }, [containerName, tailLines]);

    useEffect(() => {
        if (open && containerName) {
            fetchLogs();
        }
    }, [open, containerName, fetchLogs]);

    if (!open) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="log-viewer-drawer" onClick={e => e.stopPropagation()}>
                <div className="log-header">
                    <h3><FileText size={18} /> Logs: {containerName}</h3>
                    <div className="log-controls">
                        <select
                            value={tailLines}
                            onChange={e => setTailLines(Number(e.target.value))}
                            className="tail-select"
                        >
                            <option value={50}>Last 50 lines</option>
                            <option value={100}>Last 100 lines</option>
                            <option value={500}>Last 500 lines</option>
                            <option value={1000}>Last 1000 lines</option>
                        </select>
                        <button className="btn-refresh-logs" onClick={fetchLogs} disabled={loading}>
                            {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
                        </button>
                        <button className="btn-close-logs" onClick={onClose}><X size={16} /></button>
                    </div>
                </div>

                <div className="log-content">
                    {loading && !logs ? (
                        <div className="log-loading">Loading logs...</div>
                    ) : error ? (
                        <div className="log-error">{error}</div>
                    ) : (
                        <pre className="log-output">{logs}</pre>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface HealthBadgeProps {
    status: ExecutorStatus;
}

function HealthBadge({ status }: HealthBadgeProps) {
    const IconComp = HealthStatusIcons[status as keyof typeof HealthStatusIcons] || HelpCircle;
    return (
        <span className={`health-badge ${status}`}>
            <IconComp size={14} /> {status}
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
    const IconComp = ExecutorTypeIcons[type as keyof typeof ExecutorTypeIcons] || Terminal;
    return (
        <div className={`executor-card ${type} ${selected ? 'selected' : ''}`} onClick={onClick}>
            <div className="executor-card-header">
                <span className="executor-icon"><IconComp size={ICON_SIZE.xl} /></span>
                <h3>{name}</h3>
                <HealthBadge status={health.status} />
            </div>

            <div className="executor-stats">
                {Object.entries(stats).slice(0, 4).map(([key, value]) => (
                    <div key={key} className="stat-item">
                        <span className="stat-value">
                            {typeof value === 'boolean' ? (value ? <CheckCircle size={14} /> : <XCircle size={14} />) : value}
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
    onRemove: (alias: string) => void;
    onRegister: () => void;
    testing: string | null;
    removing: string | null;
}

function SSHDetailPanel({ hosts, onTest, onRemove, onRegister, testing, removing }: SSHDetailPanelProps) {
    return (
        <div className="detail-panel ssh-panel">
            <div className="panel-header-row">
                <h3><Key size={18} /> SSH Hosts</h3>
                <button className="btn-add-host" onClick={onRegister}>
                    <Plus size={14} /> Register Host
                </button>
            </div>

            {hosts.length === 0 ? (
                <div className="empty-state small">
                    <p>No SSH hosts configured</p>
                    <button className="btn-add-host" onClick={onRegister}>
                        <Plus size={14} /> Register your first host
                    </button>
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
                                    {testing === host.alias ? <Loader2 size={14} className="spin" /> : <Plug size={14} />} Test
                                </button>
                                <button
                                    className="btn-remove"
                                    onClick={() => onRemove(host.alias)}
                                    disabled={removing === host.alias}
                                    title="Remove host"
                                >
                                    {removing === host.alias ? <Loader2 size={14} className="spin" /> : <Trash2 size={14} />}
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
    onViewLogs: (name: string) => void;
    actionLoading: string | null;
}

function DockerDetailPanel({ containers, onAction, onViewLogs, actionLoading }: DockerDetailPanelProps) {
    return (
        <div className="detail-panel docker-panel">
            <h3><Container size={18} /> Containers</h3>

            {containers.length === 0 ? (
                <div className="empty-state small">
                    <p>No containers found</p>
                </div>
            ) : (
                <div className="container-list">
                    {containers.map(container => (
                        <div key={container.id} className={`container-item ${container.status}`}>
                            <div className="container-status">
                                {(() => {
                                    const IconComp = ContainerStatusIcons[container.status as keyof typeof ContainerStatusIcons] || HelpCircle;
                                    return <IconComp size={16} />;
                                })()}
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
                                <button
                                    className="btn-action logs"
                                    onClick={() => onViewLogs(container.name)}
                                    title="View logs"
                                >
                                    <FileText size={14} />
                                </button>
                                {container.status === 'running' ? (
                                    <>
                                        <button
                                            className="btn-action"
                                            onClick={() => onAction(container.id, 'restart')}
                                            disabled={actionLoading === container.id}
                                        >
                                            <RotateCw size={14} />
                                        </button>
                                        <button
                                            className="btn-action stop"
                                            onClick={() => onAction(container.id, 'stop')}
                                            disabled={actionLoading === container.id}
                                        >
                                            <Square size={14} />
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        className="btn-action start"
                                        onClick={() => onAction(container.id, 'start')}
                                        disabled={actionLoading === container.id}
                                    >
                                        <Play size={14} />
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
    testResults: Record<string, { success: boolean; latency_ms: number; status_code?: number }>;
}

function APIDetailPanel({ endpoints, onTest, testing, testResults }: APIDetailPanelProps) {
    return (
        <div className="detail-panel api-panel">
            <h3><Globe size={18} /> API Endpoints</h3>

            {endpoints.length === 0 ? (
                <div className="empty-state small">
                    <p>No API endpoints configured</p>
                </div>
            ) : (
                <div className="endpoint-list">
                    {endpoints.map(endpoint => {
                        const result = testResults[endpoint.id];
                        return (
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
                                {result && (
                                    <div className={`test-result ${result.success ? 'success' : 'failure'}`}>
                                        {result.success ? <CheckCircle size={12} /> : <XCircle size={12} />}
                                        <span>{result.latency_ms}ms</span>
                                        {result.status_code && <span className="status-code">{result.status_code}</span>}
                                    </div>
                                )}
                                <div className="endpoint-actions">
                                    <button
                                        className="btn-test"
                                        onClick={() => onTest(endpoint.id)}
                                        disabled={testing === endpoint.id}
                                    >
                                        {testing === endpoint.id ? <Loader2 size={14} className="spin" /> : <Plug size={14} />} Test
                                    </button>
                                </div>
                            </div>
                        );
                    })}
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
    const [removingHost, setRemovingHost] = useState<string | null>(null);

    // Phase 3: New state
    const [showRegisterModal, setShowRegisterModal] = useState(false);
    const [logViewerContainer, setLogViewerContainer] = useState<string | null>(null);
    const [apiTestResults, setApiTestResults] = useState<Record<string, { success: boolean; latency_ms: number; status_code?: number }>>({});

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

    const handleRemoveHost = useCallback(async (alias: string) => {
        if (!confirm(`Remove SSH host "${alias}"? This cannot be undone.`)) return;
        setRemovingHost(alias);
        try {
            await removeSSHHost(alias);
            await fetchData();
        } catch (err) {
            console.error('Host removal failed:', err);
        } finally {
            setRemovingHost(null);
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
        const start = performance.now();
        try {
            const result = await testAPIEndpoint(id);
            const latency = Math.round(performance.now() - start);
            setApiTestResults(prev => ({
                ...prev,
                [id]: {
                    success: result.success,
                    latency_ms: latency,
                    status_code: result.status_code,
                },
            }));
            await fetchData();
        } catch (err) {
            const latency = Math.round(performance.now() - start);
            setApiTestResults(prev => ({
                ...prev,
                [id]: { success: false, latency_ms: latency },
            }));
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
                    <h1><Terminal size={24} /> Executors</h1>
                    <HealthBadge status={overallHealth} />
                </div>
                <div className="header-right">
                    <button className="btn-refresh" onClick={fetchData}>
                        <RefreshCw size={16} /> Refresh
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
                        onRemove={handleRemoveHost}
                        onRegister={() => setShowRegisterModal(true)}
                        testing={testingSSH}
                        removing={removingHost}
                    />
                )}
                {selectedExecutor === 'docker' && (
                    <DockerDetailPanel
                        containers={containers}
                        onAction={handleContainerAction}
                        onViewLogs={(name) => setLogViewerContainer(name)}
                        actionLoading={containerActionLoading}
                    />
                )}
                {selectedExecutor === 'api' && (
                    <APIDetailPanel
                        endpoints={apiEndpoints}
                        onTest={handleTestAPI}
                        testing={testingAPI}
                        testResults={apiTestResults}
                    />
                )}
            </div>

            {/* SSH Registration Modal */}
            <SSHRegisterModal
                open={showRegisterModal}
                onClose={() => setShowRegisterModal(false)}
                onRegistered={fetchData}
            />

            {/* Container Log Viewer */}
            <ContainerLogViewer
                containerName={logViewerContainer || ''}
                open={logViewerContainer !== null}
                onClose={() => setLogViewerContainer(null)}
            />
        </div>
    );
}
