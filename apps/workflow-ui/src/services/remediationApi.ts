/**
 * Remediation API Service - Phase 7D
 * 
 * Connects to remediation workflow backend APIs:
 * - List, get, create, update, delete workflows
 * - Clone system templates
 * - Execute workflows (sync/async)
 * - Node type definitions for visual builder
 * - Execution history and status
 */

const API_BASE = 'http://localhost:8001';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type WorkflowCategory = 'general' | 'memory' | 'disk' | 'cpu' | 'network' | 'container' | 'database' | 'security' | 'kubernetes' | 'application';
export type WorkflowType = 'user' | 'system';
export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped' | 'waiting_approval';

export interface WorkflowNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
}

export interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    source_handle?: string;
    target_handle?: string;
    label?: string;
}

export interface WorkflowMetadata {
    category: WorkflowCategory;
    severity_match: string[];
    auto_trigger_enabled: boolean;
    confidence_threshold: number;
    estimated_duration_seconds: number;
    success_rate: number;
    execution_count: number;
    last_executed: string | null;
}

export interface RemediationWorkflow {
    id: string;
    name: string;
    description: string;
    workflow_type: WorkflowType;
    is_active: boolean;
    version: number;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    metadata: WorkflowMetadata;
    created_at: string;
    updated_at: string;
    created_by: string;
}

export interface NodeTypeDefinition {
    type: string;
    name: string;
    description: string;
    category: string;
    icon: string;
    color: string;
    config_schema: Record<string, unknown>;
    inputs: number;
    outputs: number;
}

export interface NodeExecutionResult {
    node_id: string;
    status: NodeStatus;
    output: string;
    error: string;
    started_at: string | null;
    completed_at: string | null;
    duration_ms: number;
    metrics: Record<string, unknown>;
}

export interface WorkflowExecution {
    execution_id: string;
    workflow_id: string;
    workflow_name: string;
    status: ExecutionStatus;
    started_at: string;
    completed_at: string | null;
    node_results: Record<string, NodeExecutionResult>;
    variables: Record<string, unknown>;
    current_node_id: string | null;
    error: string | null;
    progress_percent: number;
}

export interface CategorySummary {
    category: WorkflowCategory;
    count: number;
    active_count: number;
    execution_count: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List all remediation workflows
 */
export async function listWorkflows(options: {
    workflow_type?: WorkflowType;
    category?: WorkflowCategory;
    include_system?: boolean;
} = {}): Promise<RemediationWorkflow[]> {
    try {
        const params = new URLSearchParams();
        if (options.workflow_type) params.append('workflow_type', options.workflow_type);
        if (options.category) params.append('category', options.category);
        if (options.include_system !== undefined) params.append('include_system', String(options.include_system));

        const response = await fetch(`${API_BASE}/api/remediation/workflows?${params.toString()}`);
        if (!response.ok) throw new Error(`Failed to fetch workflows: ${response.statusText}`);

        const data = await response.json();
        return data.workflows;
    } catch {
        // Return mock data when backend is unavailable
        return generateMockWorkflows();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK DATA GENERATORS (for demo when backend not available)
// ═══════════════════════════════════════════════════════════════════════════

function generateMockWorkflows(): RemediationWorkflow[] {
    const now = new Date().toISOString();
    return [
        {
            id: 'wf-memory-1',
            name: 'Memory Crisis Recovery',
            description: 'Automatically free memory by killing non-essential processes and clearing caches',
            workflow_type: 'system',
            is_active: true,
            version: 3,
            nodes: [],
            edges: [],
            metadata: {
                category: 'memory',
                severity_match: ['P0_CRITICAL', 'P1_HIGH'],
                auto_trigger_enabled: true,
                confidence_threshold: 0.85,
                estimated_duration_seconds: 45,
                success_rate: 0.94,
                execution_count: 234,
                last_executed: now,
            },
            created_at: now,
            updated_at: now,
            created_by: 'system',
        },
        {
            id: 'wf-disk-1',
            name: 'Disk Cleanup Automation',
            description: 'Clean temp files, old logs, and unused Docker images to free disk space',
            workflow_type: 'system',
            is_active: true,
            version: 2,
            nodes: [],
            edges: [],
            metadata: {
                category: 'disk',
                severity_match: ['P1_HIGH', 'P2_MEDIUM'],
                auto_trigger_enabled: true,
                confidence_threshold: 0.9,
                estimated_duration_seconds: 120,
                success_rate: 0.97,
                execution_count: 189,
                last_executed: now,
            },
            created_at: now,
            updated_at: now,
            created_by: 'system',
        },
        {
            id: 'wf-container-1',
            name: 'Container Restart Handler',
            description: 'Gracefully restart crashed containers with health checks and rollback',
            workflow_type: 'system',
            is_active: true,
            version: 5,
            nodes: [],
            edges: [],
            metadata: {
                category: 'container',
                severity_match: ['P0_CRITICAL', 'P1_HIGH'],
                auto_trigger_enabled: true,
                confidence_threshold: 0.8,
                estimated_duration_seconds: 30,
                success_rate: 0.91,
                execution_count: 156,
                last_executed: now,
            },
            created_at: now,
            updated_at: now,
            created_by: 'system',
        },
        {
            id: 'wf-cpu-1',
            name: 'CPU Throttle Response',
            description: 'Identify and throttle runaway processes consuming excessive CPU',
            workflow_type: 'system',
            is_active: true,
            version: 2,
            nodes: [],
            edges: [],
            metadata: {
                category: 'cpu',
                severity_match: ['P1_HIGH', 'P2_MEDIUM'],
                auto_trigger_enabled: false,
                confidence_threshold: 0.75,
                estimated_duration_seconds: 15,
                success_rate: 0.88,
                execution_count: 78,
                last_executed: now,
            },
            created_at: now,
            updated_at: now,
            created_by: 'system',
        },
        {
            id: 'wf-network-1',
            name: 'Network Connectivity Restore',
            description: 'Diagnose and restore network connectivity issues with automatic failover',
            workflow_type: 'system',
            is_active: true,
            version: 3,
            nodes: [],
            edges: [],
            metadata: {
                category: 'network',
                severity_match: ['P0_CRITICAL', 'P1_HIGH'],
                auto_trigger_enabled: true,
                confidence_threshold: 0.85,
                estimated_duration_seconds: 60,
                success_rate: 0.82,
                execution_count: 45,
                last_executed: now,
            },
            created_at: now,
            updated_at: now,
            created_by: 'system',
        },
        {
            id: 'wf-security-1',
            name: 'Security Incident Response',
            description: 'Isolate compromised hosts, collect forensics, and notify security team',
            workflow_type: 'system',
            is_active: true,
            version: 4,
            nodes: [],
            edges: [],
            metadata: {
                category: 'security',
                severity_match: ['P0_CRITICAL'],
                auto_trigger_enabled: false,
                confidence_threshold: 0.95,
                estimated_duration_seconds: 180,
                success_rate: 0.96,
                execution_count: 12,
                last_executed: now,
            },
            created_at: now,
            updated_at: now,
            created_by: 'system',
        },
        {
            id: 'wf-db-1',
            name: 'Database Connection Pool Reset',
            description: 'Clear stale connections and reset database connection pools',
            workflow_type: 'user',
            is_active: true,
            version: 1,
            nodes: [],
            edges: [],
            metadata: {
                category: 'database',
                severity_match: ['P1_HIGH', 'P2_MEDIUM'],
                auto_trigger_enabled: true,
                confidence_threshold: 0.85,
                estimated_duration_seconds: 25,
                success_rate: 0.93,
                execution_count: 67,
                last_executed: now,
            },
            created_at: now,
            updated_at: now,
            created_by: 'user@example.com',
        },
        {
            id: 'wf-k8s-1',
            name: 'Kubernetes Pod Eviction Handler',
            description: 'Reschedule evicted pods to healthy nodes with resource optimization',
            workflow_type: 'system',
            is_active: true,
            version: 2,
            nodes: [],
            edges: [],
            metadata: {
                category: 'kubernetes',
                severity_match: ['P1_HIGH', 'P2_MEDIUM'],
                auto_trigger_enabled: true,
                confidence_threshold: 0.8,
                estimated_duration_seconds: 90,
                success_rate: 0.89,
                execution_count: 34,
                last_executed: now,
            },
            created_at: now,
            updated_at: now,
            created_by: 'system',
        },
    ];
}

/**
 * Get a single workflow by ID
 */
export async function getWorkflow(workflowId: string): Promise<RemediationWorkflow> {
    const response = await fetch(`${API_BASE}/api/remediation/workflows/${workflowId}`);
    if (!response.ok) throw new Error(`Failed to fetch workflow: ${response.statusText}`);

    const data = await response.json();
    return data.workflow;
}

/**
 * Create a new workflow
 */
export async function createWorkflow(workflow: Partial<RemediationWorkflow>): Promise<RemediationWorkflow> {
    const response = await fetch(`${API_BASE}/api/remediation/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
    });

    if (!response.ok) throw new Error(`Failed to create workflow: ${response.statusText}`);
    return response.json();
}

/**
 * Update an existing workflow
 */
export async function updateWorkflow(workflowId: string, workflow: Partial<RemediationWorkflow>): Promise<RemediationWorkflow> {
    const response = await fetch(`${API_BASE}/api/remediation/workflows/${workflowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(workflow),
    });

    if (!response.ok) throw new Error(`Failed to update workflow: ${response.statusText}`);
    return response.json();
}

/**
 * Delete a workflow
 */
export async function deleteWorkflow(workflowId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/remediation/workflows/${workflowId}`, {
        method: 'DELETE',
    });

    if (!response.ok) throw new Error(`Failed to delete workflow: ${response.statusText}`);
}

/**
 * Clone a workflow (typically to customize a system template)
 */
export async function cloneWorkflow(workflowId: string, newName?: string): Promise<RemediationWorkflow> {
    const response = await fetch(`${API_BASE}/api/remediation/workflows/${workflowId}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: newName ? JSON.stringify({ new_name: newName }) : undefined,
    });

    if (!response.ok) throw new Error(`Failed to clone workflow: ${response.statusText}`);
    return response.json();
}

/**
 * Get all available node types
 */
export async function getNodeTypes(): Promise<NodeTypeDefinition[]> {
    const response = await fetch(`${API_BASE}/api/remediation/node-types`);
    if (!response.ok) throw new Error(`Failed to fetch node types: ${response.statusText}`);

    const data = await response.json();
    return data.node_types;
}

/**
 * Get category summary
 */
export async function getCategorySummary(): Promise<CategorySummary[]> {
    const response = await fetch(`${API_BASE}/api/remediation/categories`);
    if (!response.ok) throw new Error(`Failed to fetch categories: ${response.statusText}`);

    const data = await response.json();
    return data.categories;
}

/**
 * Execute a workflow (synchronous)
 */
export async function executeWorkflow(workflowId: string, options: {
    trigger_data?: Record<string, unknown>;
    dry_run?: boolean;
} = {}): Promise<WorkflowExecution> {
    const response = await fetch(`${API_BASE}/api/remediation/workflows/${workflowId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });

    if (!response.ok) throw new Error(`Failed to execute workflow: ${response.statusText}`);
    return response.json();
}

/**
 * Execute a workflow asynchronously
 */
export async function executeWorkflowAsync(workflowId: string, options: {
    trigger_data?: Record<string, unknown>;
    dry_run?: boolean;
} = {}): Promise<{ execution_id: string; message: string }> {
    const response = await fetch(`${API_BASE}/api/remediation/workflows/${workflowId}/execute-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });

    if (!response.ok) throw new Error(`Failed to start workflow: ${response.statusText}`);
    return response.json();
}

/**
 * Get execution history
 */
export async function getExecutionHistory(options: {
    workflow_id?: string;
    status?: ExecutionStatus;
    limit?: number;
} = {}): Promise<WorkflowExecution[]> {
    try {
        const params = new URLSearchParams();
        if (options.workflow_id) params.append('workflow_id', options.workflow_id);
        if (options.status) params.append('status', options.status);
        if (options.limit) params.append('limit', String(options.limit));

        const response = await fetch(`${API_BASE}/api/remediation/executions?${params.toString()}`);
        if (!response.ok) throw new Error(`Failed to fetch executions: ${response.statusText}`);

        const data = await response.json();
        return data.executions;
    } catch {
        // Return mock executions when backend unavailable
        return generateMockExecutions(options.limit || 10);
    }
}

function generateMockExecutions(limit: number): WorkflowExecution[] {
    const statuses: ExecutionStatus[] = ['completed', 'completed', 'running', 'failed', 'completed'];
    const workflows = [
        { id: 'wf-memory-1', name: 'Memory Crisis Recovery' },
        { id: 'wf-disk-1', name: 'Disk Cleanup Automation' },
        { id: 'wf-container-1', name: 'Container Restart Handler' },
    ];

    const executions: WorkflowExecution[] = [];
    for (let i = 0; i < Math.min(limit, 10); i++) {
        const workflow = workflows[i % workflows.length];
        const status = statuses[i % statuses.length];
        const started = new Date(Date.now() - i * 3600000);

        executions.push({
            execution_id: `exec-${i}-${Date.now()}`,
            workflow_id: workflow.id,
            workflow_name: workflow.name,
            status,
            started_at: started.toISOString(),
            completed_at: status !== 'running' ? new Date(started.getTime() + 45000).toISOString() : null,
            node_results: {},
            variables: {},
            current_node_id: status === 'running' ? 'node-1' : null,
            error: status === 'failed' ? 'Connection timeout' : null,
            progress_percent: status === 'completed' ? 100 : status === 'running' ? Math.floor(Math.random() * 80) + 10 : 0,
        });
    }
    return executions;
}

/**
 * Get execution status
 */
export async function getExecutionStatus(executionId: string): Promise<WorkflowExecution> {
    const response = await fetch(`${API_BASE}/api/remediation/executions/${executionId}`);
    if (!response.ok) throw new Error(`Failed to fetch execution: ${response.statusText}`);

    return response.json();
}

/**
 * Cancel an execution
 */
export async function cancelExecution(executionId: string): Promise<void> {
    const response = await fetch(`${API_BASE}/api/remediation/executions/${executionId}/cancel`, {
        method: 'POST',
    });

    if (!response.ok) throw new Error(`Failed to cancel execution: ${response.statusText}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get category icon
 */
export function getCategoryIcon(category: WorkflowCategory): string {
    const icons: Record<WorkflowCategory, string> = {
        general: '📋',
        memory: '🧠',
        disk: '💾',
        cpu: '🖥️',
        network: '🌐',
        container: '🐳',
        database: '🗃️',
        security: '🔒',
        kubernetes: '☸️',
        application: '📱',
    };
    return icons[category] || '📋';
}

/**
 * Get execution status icon
 */
export function getExecutionStatusIcon(status: ExecutionStatus): string {
    const icons: Record<ExecutionStatus, string> = {
        pending: '⏳',
        running: '🔄',
        completed: '✅',
        failed: '❌',
        cancelled: '🚫',
        paused: '⏸️',
    };
    return icons[status] || '⚪';
}

/**
 * Get execution status color
 */
export function getExecutionStatusColor(status: ExecutionStatus): string {
    const colors: Record<ExecutionStatus, string> = {
        pending: 'yellow',
        running: 'blue',
        completed: 'green',
        failed: 'red',
        cancelled: 'gray',
        paused: 'orange',
    };
    return colors[status] || 'gray';
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

/**
 * Calculate workflow stats
 */
export function calculateWorkflowStats(workflows: RemediationWorkflow[]): {
    total: number;
    system: number;
    user: number;
    active: number;
    byCategory: Record<string, number>;
} {
    const stats = {
        total: workflows.length,
        system: workflows.filter(w => w.workflow_type === 'system').length,
        user: workflows.filter(w => w.workflow_type === 'user').length,
        active: workflows.filter(w => w.is_active).length,
        byCategory: {} as Record<string, number>,
    };

    for (const wf of workflows) {
        stats.byCategory[wf.metadata.category] = (stats.byCategory[wf.metadata.category] || 0) + 1;
    }

    return stats;
}

export default {
    listWorkflows,
    getWorkflow,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    cloneWorkflow,
    getNodeTypes,
    getCategorySummary,
    executeWorkflow,
    executeWorkflowAsync,
    getExecutionHistory,
    getExecutionStatus,
    cancelExecution,
    getCategoryIcon,
    getExecutionStatusIcon,
    getExecutionStatusColor,
    formatDuration,
    calculateWorkflowStats,
};
