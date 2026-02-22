/**
 * Remediation API Service — FULLY REAL, ZERO MOCKS
 * 
 * Connects to REAL remediation workflow backend APIs:
 * - List, get, create, update, delete workflows via /api/remediation/*
 * - Clone system templates
 * - Execute workflows (sync/async)
 * - Node type definitions for visual builder
 * - Execution history and status from real DB
 * 
 * RULES:
 * 1. NO mock data generators. EVER.
 * 2. If backend fails → throw error, let UI handle it
 * 3. Every workflow and execution comes from the real database
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
 * List all remediation workflows from the REAL backend.
 * No mock fallback — if backend is down, error propagates to UI.
 */
export async function listWorkflows(options: {
    workflow_type?: WorkflowType;
    category?: WorkflowCategory;
    include_system?: boolean;
} = {}): Promise<RemediationWorkflow[]> {
    const params = new URLSearchParams();
    if (options.workflow_type) params.append('workflow_type', options.workflow_type);
    if (options.category) params.append('category', options.category);
    if (options.include_system !== undefined) params.append('include_system', String(options.include_system));

    const response = await fetch(`${API_BASE}/api/remediation/templates?${params.toString()}`);
    if (!response.ok) throw new Error(`Remediation workflows unavailable: ${response.status} ${response.statusText}`);

    const data = await response.json();
    return Array.isArray(data.templates) ? data.templates : Array.isArray(data.workflows) ? data.workflows : Array.isArray(data) ? data : [];
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
 * Get REAL execution history from the backend.
 * No mock fallback — if backend is down, error propagates to UI.
 */
export async function getExecutionHistory(options: {
    workflow_id?: string;
    status?: ExecutionStatus;
    limit?: number;
} = {}): Promise<WorkflowExecution[]> {
    const params = new URLSearchParams();
    if (options.workflow_id) params.append('workflow_id', options.workflow_id);
    if (options.status) params.append('status', options.status);
    if (options.limit) params.append('limit', String(options.limit));

    const response = await fetch(`${API_BASE}/api/remediation/executions?${params.toString()}`);
    if (!response.ok) throw new Error(`Execution history unavailable: ${response.status} ${response.statusText}`);

    const data = await response.json();
    return Array.isArray(data.executions) ? data.executions : Array.isArray(data) ? data : [];
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
        const cat = wf.metadata?.category ?? 'uncategorized';
        stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
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
