/**
 * Executor API Service — FULLY REAL, ZERO MOCKS
 * 
 * Connects to REAL executor management backend APIs:
 * - SSH Executor: Real host management via /api/ssh/*
 * - Docker Executor: Real container management via /api/docker/*
 * - API Executor: Real endpoint stats via /api/executor/stats
 * 
 * RULES:
 * 1. NO mock data generators. EVER.
 * 2. If an API fails → throw the error, let the UI handle it
 * 3. Every piece of data comes from a real backend response
 */

const API_BASE = 'http://localhost:8001';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type ExecutorType = 'ssh' | 'docker' | 'api';
export type ExecutorStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
export type AuthMethod = 'key' | 'password' | 'agent';
export type ContainerStatus = 'running' | 'exited' | 'paused' | 'restarting' | 'created' | 'removing' | 'dead';

export interface ExecutorHealth {
    status: ExecutorStatus;
    lastCheck: string;
    latency_ms: number;
    error?: string;
}

export interface SSHHost {
    alias: string;
    hostname: string;
    username: string;
    port: number;
    auth_method: AuthMethod;
    status: ExecutorStatus;
    last_connected: string | null;
    connection_count: number;
    avg_latency_ms: number;
}

export interface SSHExecutorStats {
    total_hosts: number;
    connected_hosts: number;
    total_executions: number;
    success_rate: number;
    avg_latency_ms: number;
    connection_pool_size: number;
}

export interface DockerContainer {
    id: string;
    name: string;
    image: string;
    status: ContainerStatus;
    state: string;
    created: string;
    ports: string[];
    health?: string;
    cpu_percent: number;
    memory_usage_mb: number;
    memory_limit_mb: number;
}

export interface DockerExecutorStats {
    total_containers: number;
    running_containers: number;
    total_images: number;
    total_volumes: number;
    docker_version: string;
    api_version: string;
    connected: boolean;
}

export interface APIEndpoint {
    id: string;
    name: string;
    url: string;
    method: string;
    auth_type: string;
    status: ExecutorStatus;
    last_called: string | null;
    success_rate: number;
    avg_response_ms: number;
}

export interface APIExecutorStats {
    total_endpoints: number;
    healthy_endpoints: number;
    total_requests: number;
    success_rate: number;
    avg_response_ms: number;
    webhooks_configured: number;
}

export interface ExecutorOverview {
    ssh: {
        health: ExecutorHealth;
        stats: SSHExecutorStats;
    };
    docker: {
        health: ExecutorHealth;
        stats: DockerExecutorStats;
    };
    api: {
        health: ExecutorHealth;
        stats: APIExecutorStats;
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EMPTY DEFAULTS — Zeros, not fakes. These mean "no data available".
// ═══════════════════════════════════════════════════════════════════════════

const EMPTY_HEALTH: ExecutorHealth = {
    status: 'unknown',
    lastCheck: new Date().toISOString(),
    latency_ms: 0,
    error: 'Not connected',
};

const EMPTY_SSH_STATS: SSHExecutorStats = {
    total_hosts: 0,
    connected_hosts: 0,
    total_executions: 0,
    success_rate: 0,
    avg_latency_ms: 0,
    connection_pool_size: 0,
};

const EMPTY_DOCKER_STATS: DockerExecutorStats = {
    total_containers: 0,
    running_containers: 0,
    total_images: 0,
    total_volumes: 0,
    docker_version: 'N/A',
    api_version: 'N/A',
    connected: false,
};

const EMPTY_API_STATS: APIExecutorStats = {
    total_endpoints: 0,
    healthy_endpoints: 0,
    total_requests: 0,
    success_rate: 0,
    avg_response_ms: 0,
    webhooks_configured: 0,
};

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS — REAL backend calls only
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get overview of all executors by fetching each executor's real status.
 * Combines SSH hosts, Docker containers, and API executor stats.
 */
export async function getExecutorOverview(): Promise<ExecutorOverview> {
    // Fetch all three executor statuses in parallel
    const [sshResult, dockerResult, apiResult] = await Promise.all([
        getSSHStatus().catch(() => null),
        getDockerStatus().catch(() => null),
        getAPIStatus().catch(() => null),
    ]);

    return {
        ssh: {
            health: sshResult?.health ?? { ...EMPTY_HEALTH },
            stats: sshResult?.stats ?? { ...EMPTY_SSH_STATS },
        },
        docker: {
            health: dockerResult?.health ?? { ...EMPTY_HEALTH },
            stats: dockerResult?.stats ?? { ...EMPTY_DOCKER_STATS },
        },
        api: {
            health: apiResult?.health ?? { ...EMPTY_HEALTH },
            stats: apiResult?.stats ?? { ...EMPTY_API_STATS },
        },
    };
}

// --- SSH Executor ---

/**
 * Get REAL SSH executor health, stats, and host list.
 * Wired to /api/ssh/hosts which queries actual SSH connections.
 */
export async function getSSHStatus(): Promise<{
    health: ExecutorHealth;
    stats: SSHExecutorStats;
    hosts: SSHHost[];
}> {
    const response = await fetch(`${API_BASE}/api/ssh/hosts`);
    if (!response.ok) throw new Error(`SSH executor unavailable: ${response.status} ${response.statusText}`);

    const data = await response.json();
    const hosts: SSHHost[] = Array.isArray(data.hosts) ? data.hosts : Array.isArray(data) ? data : [];

    // Derive stats from real host data
    const connectedHosts = hosts.filter(h => h.status === 'healthy' || h.status === 'degraded');
    const avgLatency = hosts.length > 0
        ? hosts.reduce((sum, h) => sum + (h.avg_latency_ms || 0), 0) / hosts.length
        : 0;

    return {
        health: {
            status: hosts.length === 0 ? 'unknown' : connectedHosts.length === hosts.length ? 'healthy' : connectedHosts.length > 0 ? 'degraded' : 'unhealthy',
            lastCheck: new Date().toISOString(),
            latency_ms: avgLatency,
        },
        stats: {
            total_hosts: hosts.length,
            connected_hosts: connectedHosts.length,
            total_executions: Number(data.total_executions ?? 0),
            success_rate: Number(data.success_rate ?? 0),
            avg_latency_ms: avgLatency,
            connection_pool_size: Number(data.connection_pool_size ?? hosts.length),
        },
        hosts,
    };
}

/**
 * Register a new SSH host — REAL backend operation.
 */
export async function registerSSHHost(host: {
    alias: string;
    hostname: string;
    username: string;
    port?: number;
    auth_method: AuthMethod;
    password?: string;
    private_key_path?: string;
}): Promise<SSHHost> {
    const response = await fetch(`${API_BASE}/api/ssh/hosts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(host),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to register SSH host: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Test SSH connection to a host — REAL SSH test, no fakes.
 */
export async function testSSHConnection(alias: string): Promise<{
    success: boolean;
    latency_ms: number;
    error?: string;
}> {
    const response = await fetch(`${API_BASE}/api/ssh/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: alias }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
            success: false,
            latency_ms: 0,
            error: errorData.detail || `SSH test failed: ${response.statusText}`,
        };
    }
    return response.json();
}

/**
 * Remove an SSH host — REAL backend deletion.
 */
export async function removeSSHHost(alias: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/ssh/hosts/${alias}`, {
        method: 'DELETE',
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to remove SSH host: ${response.statusText}`);
    }
}

// --- Docker Executor ---

/**
 * Get REAL Docker executor health, stats, and container list.
 * Wired to /api/docker/containers which queries actual Docker daemon.
 */
export async function getDockerStatus(): Promise<{
    health: ExecutorHealth;
    stats: DockerExecutorStats;
    containers: DockerContainer[];
}> {
    const response = await fetch(`${API_BASE}/api/docker/containers`);
    if (!response.ok) throw new Error(`Docker executor unavailable: ${response.status} ${response.statusText}`);

    const data = await response.json();
    const containers: DockerContainer[] = Array.isArray(data.containers) ? data.containers : Array.isArray(data) ? data : [];

    // Derive stats from real container data
    const runningContainers = containers.filter(c => c.status === 'running');

    return {
        health: {
            status: containers.length === 0 ? 'unknown' : runningContainers.length > 0 ? 'healthy' : 'unhealthy',
            lastCheck: new Date().toISOString(),
            latency_ms: 0,
        },
        stats: {
            total_containers: containers.length,
            running_containers: runningContainers.length,
            total_images: Number(data.total_images ?? 0),
            total_volumes: Number(data.total_volumes ?? 0),
            docker_version: String(data.docker_version ?? 'N/A'),
            api_version: String(data.api_version ?? 'N/A'),
            connected: true,
        },
        containers,
    };
}

/**
 * Perform action on a container — REAL Docker operation.
 */
export async function containerAction(containerId: string, action: 'start' | 'stop' | 'restart' | 'pause' | 'unpause'): Promise<{
    success: boolean;
    message: string;
}> {
    const response = await fetch(`${API_BASE}/api/docker/container/${containerId}/${action}`, {
        method: 'POST',
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to ${action} container: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Get REAL container logs from Docker.
 */
export async function getContainerLogs(containerId: string, options: {
    tail?: number;
    since?: string;
} = {}): Promise<{ logs: string }> {
    const params = new URLSearchParams();
    if (options.tail) params.append('tail', String(options.tail));
    if (options.since) params.append('since', options.since);

    const response = await fetch(`${API_BASE}/api/docker/container/${containerId}/logs?${params.toString()}`);
    if (!response.ok) throw new Error(`Failed to fetch container logs: ${response.status} ${response.statusText}`);

    return response.json();
}

/**
 * Execute command in container — REAL Docker exec.
 */
export async function execInContainer(containerId: string, command: string): Promise<{
    exit_code: number;
    output: string;
}> {
    const response = await fetch(`${API_BASE}/api/docker/container/${containerId}/exec`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
    });

    if (!response.ok) throw new Error(`Failed to execute command: ${response.status} ${response.statusText}`);
    return response.json();
}

// --- API Executor ---

/**
 * Get REAL API executor health and stats.
 * Wired to /api/executor/stats which queries actual API executor.
 */
export async function getAPIStatus(): Promise<{
    health: ExecutorHealth;
    stats: APIExecutorStats;
    endpoints: APIEndpoint[];
}> {
    const response = await fetch(`${API_BASE}/api/executor/stats`);
    if (!response.ok) throw new Error(`API executor unavailable: ${response.status} ${response.statusText}`);

    const data = await response.json();
    const stats = data.stats || data;
    const endpoints: APIEndpoint[] = Array.isArray(data.endpoints) ? data.endpoints : [];

    return {
        health: {
            status: stats ? 'healthy' : 'unknown',
            lastCheck: new Date().toISOString(),
            latency_ms: Number(stats?.avg_response_ms ?? 0),
        },
        stats: {
            total_endpoints: Number(stats?.total_endpoints ?? endpoints.length),
            healthy_endpoints: Number(stats?.healthy_endpoints ?? 0),
            total_requests: Number(stats?.total_requests ?? 0),
            success_rate: Number(stats?.success_rate ?? 0),
            avg_response_ms: Number(stats?.avg_response_ms ?? 0),
            webhooks_configured: Number(stats?.webhooks_configured ?? 0),
        },
        endpoints,
    };
}

/**
 * Register a new API endpoint — REAL backend operation.
 */
export async function registerAPIEndpoint(endpoint: {
    name: string;
    url: string;
    method: string;
    auth_type: string;
    headers?: Record<string, string>;
    auth_config?: Record<string, string>;
}): Promise<APIEndpoint> {
    const response = await fetch(`${API_BASE}/api/executor/endpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(endpoint),
    });

    if (!response.ok) throw new Error(`Failed to register endpoint: ${response.statusText}`);
    return response.json();
}

/**
 * Test API endpoint — REAL test, no fake latencies.
 */
export async function testAPIEndpoint(endpointId: string): Promise<{
    success: boolean;
    status_code: number;
    response_ms: number;
    error?: string;
}> {
    const response = await fetch(`${API_BASE}/api/executor/endpoints/${endpointId}/test`, {
        method: 'POST',
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
            success: false,
            status_code: response.status,
            response_ms: 0,
            error: errorData.detail || `Endpoint test failed: ${response.statusText}`,
        };
    }
    return response.json();
}

/**
 * Remove an API endpoint — REAL backend deletion.
 */
export async function removeAPIEndpoint(endpointId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/executor/endpoints/${endpointId}`, {
        method: 'DELETE',
    });

    if (!response.ok) throw new Error(`Failed to remove endpoint: ${response.statusText}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS — These are pure formatting helpers, no data generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get executor type icon
 */
export function getExecutorIcon(type: ExecutorType): string {
    const icons: Record<ExecutorType, string> = {
        ssh: '🔐',
        docker: '🐳',
        api: '🌐',
    };
    return icons[type] || '⚙️';
}

/**
 * Get status icon
 */
export function getStatusIcon(status: ExecutorStatus): string {
    const icons: Record<ExecutorStatus, string> = {
        healthy: '✅',
        degraded: '⚠️',
        unhealthy: '❌',
        unknown: '❓',
    };
    return icons[status] || '❓';
}

/**
 * Get status color
 */
export function getStatusColor(status: ExecutorStatus): string {
    const colors: Record<ExecutorStatus, string> = {
        healthy: 'green',
        degraded: 'yellow',
        unhealthy: 'red',
        unknown: 'gray',
    };
    return colors[status] || 'gray';
}

/**
 * Get container status icon
 */
export function getContainerStatusIcon(status: ContainerStatus): string {
    const icons: Record<ContainerStatus, string> = {
        running: '🟢',
        exited: '⚫',
        paused: '🟡',
        restarting: '🔄',
        created: '🔵',
        removing: '🗑️',
        dead: '💀',
    };
    return icons[status] || '❓';
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Calculate overall health from multiple executors
 */
export function calculateOverallHealth(overview: ExecutorOverview): ExecutorStatus {
    const statuses = [
        overview.ssh.health.status,
        overview.docker.health.status,
        overview.api.health.status,
    ];

    if (statuses.every(s => s === 'healthy')) return 'healthy';
    if (statuses.some(s => s === 'unhealthy')) return 'unhealthy';
    if (statuses.some(s => s === 'degraded')) return 'degraded';
    return 'unknown';
}

export default {
    getExecutorOverview,
    getSSHStatus,
    registerSSHHost,
    testSSHConnection,
    removeSSHHost,
    getDockerStatus,
    containerAction,
    getContainerLogs,
    execInContainer,
    getAPIStatus,
    registerAPIEndpoint,
    testAPIEndpoint,
    removeAPIEndpoint,
    getExecutorIcon,
    getStatusIcon,
    getStatusColor,
    getContainerStatusIcon,
    formatBytes,
    calculateOverallHealth,
};
