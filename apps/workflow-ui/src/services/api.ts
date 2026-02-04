/**
 * API Service - Workflow Engine Client
 * Handles all communication with the workflow-engine microservice
 */

const API_BASE = 'http://localhost:8001';

export interface ApiWorkflow {
    id: string;
    name: string;
    description?: string;
    trigger_type: string;
    trigger_config: Record<string, any>;
    is_active: boolean;
    created_at: string;
    updated_at: string;
    created_by?: string;
    version: number;
}

export interface ApiNode {
    id: string;
    workflow_id: string;
    node_type: string;
    node_subtype: string;
    label: string;
    position_x: number;
    position_y: number;
    config: Record<string, any>;
    is_start_node: boolean;
}

export interface ApiEdge {
    id: string;
    workflow_id: string;
    source_node_id: string;
    target_node_id: string;
    source_handle: string;
    condition?: Record<string, any>;
}

export interface ApiWorkflowWithNodes extends ApiWorkflow {
    nodes: ApiNode[];
    edges: ApiEdge[];
}

export interface ApiExecution {
    id: string;
    workflow_id: string;
    workflow_name: string;
    status: string;
    started_at: string;
    completed_at?: string;
    error_message?: string;
}

export interface ApiApprovalRequest {
    id: string;
    execution_id: string;
    workflow_id: string;
    workflow_name: string;
    node_label: string;
    requested_at: string;
    expires_at: string;
    approvers: string[];
    description: string;
    context: Record<string, any>;
}

class WorkflowApiService {
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE) {
        this.baseUrl = baseUrl;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const url = `${this.baseUrl}${endpoint}`;

        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(error.detail || `API Error: ${response.status}`);
        }

        return response.json();
    }

    // ========================================
    // Health
    // ========================================

    async checkHealth(): Promise<{ status: string; database: string }> {
        return this.request('/health');
    }

    // ========================================
    // Workflows
    // ========================================

    async listWorkflows(activeOnly = false): Promise<{ workflows: ApiWorkflow[]; total: number }> {
        return this.request(`/api/workflows?active_only=${activeOnly}`);
    }

    async getWorkflow(id: string): Promise<ApiWorkflowWithNodes> {
        return this.request(`/api/workflows/${id}`);
    }

    async createWorkflow(data: {
        name: string;
        description?: string;
        trigger_type: string;
        trigger_config?: Record<string, any>;
        is_active?: boolean;
        nodes: Array<{
            node_type: string;
            node_subtype: string;
            label: string;
            position_x: number;
            position_y: number;
            config?: Record<string, any>;
            is_start_node?: boolean;
        }>;
        edges: Array<{
            source_node_id: string;
            target_node_id: string;
            source_handle?: string;
            condition?: Record<string, any>;
        }>;
    }): Promise<ApiWorkflowWithNodes> {
        return this.request('/api/workflows', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateWorkflow(
        id: string,
        data: Partial<{
            name: string;
            description: string;
            trigger_type: string;
            trigger_config: Record<string, any>;
            is_active: boolean;
        }>
    ): Promise<ApiWorkflow> {
        return this.request(`/api/workflows/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteWorkflow(id: string): Promise<void> {
        return this.request(`/api/workflows/${id}`, {
            method: 'DELETE',
        });
    }

    // ========================================
    // Nodes
    // ========================================

    async addNode(
        workflowId: string,
        data: {
            node_type: string;
            node_subtype: string;
            label: string;
            position_x: number;
            position_y: number;
            config?: Record<string, any>;
            is_start_node?: boolean;
        }
    ): Promise<ApiNode> {
        return this.request(`/api/workflows/${workflowId}/nodes`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async updateNode(
        nodeId: string,
        data: Partial<{
            label: string;
            position_x: number;
            position_y: number;
            config: Record<string, any>;
        }>
    ): Promise<ApiNode> {
        return this.request(`/api/nodes/${nodeId}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    async deleteNode(nodeId: string): Promise<void> {
        return this.request(`/api/nodes/${nodeId}`, {
            method: 'DELETE',
        });
    }

    // ========================================
    // Edges
    // ========================================

    async addEdge(
        workflowId: string,
        data: {
            source_node_id: string;
            target_node_id: string;
            source_handle?: string;
            condition?: Record<string, any>;
        }
    ): Promise<ApiEdge> {
        return this.request(`/api/workflows/${workflowId}/edges`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    async deleteEdge(edgeId: string): Promise<void> {
        return this.request(`/api/edges/${edgeId}`, {
            method: 'DELETE',
        });
    }

    // ========================================
    // Executions
    // ========================================

    async executeWorkflow(
        workflowId: string,
        triggerData: Record<string, any> = {}
    ): Promise<ApiExecution> {
        return this.request(`/api/workflows/${workflowId}/execute`, {
            method: 'POST',
            body: JSON.stringify({ trigger_data: triggerData }),
        });
    }

    async listExecutions(workflowId: string): Promise<{ executions: ApiExecution[]; total: number }> {
        return this.request(`/api/workflows/${workflowId}/executions`);
    }

    async getExecution(executionId: string): Promise<ApiExecution> {
        return this.request(`/api/executions/${executionId}`);
    }

    // ========================================
    // Approvals (Updated to use new endpoints)
    // ========================================

    async getPendingApprovals(): Promise<{ approvals: ApiApprovalRequest[]; count: number }> {
        return this.request('/api/approvals/pending');
    }

    async approveExecution(requestId: string, comment?: string): Promise<void> {
        return this.request(`/api/approvals/${requestId}/approve?approved_by=user${comment ? `&comment=${encodeURIComponent(comment)}` : ''}`, {
            method: 'POST',
        });
    }

    async rejectExecution(requestId: string, reason?: string): Promise<void> {
        return this.request(`/api/approvals/${requestId}/reject?rejected_by=user${reason ? `&reason=${encodeURIComponent(reason)}` : ''}`, {
            method: 'POST',
        });
    }

    async getApprovalHistory(workflowId?: string, limit = 50): Promise<{ history: any[]; count: number }> {
        let url = `/api/approvals/history?limit=${limit}`;
        if (workflowId) url += `&workflow_id=${workflowId}`;
        return this.request(url);
    }

    // ========================================
    // Validation
    // ========================================

    async validateWorkflow(workflowId: string): Promise<{
        is_valid: boolean;
        error_count: number;
        warning_count: number;
        errors: any[];
        warnings: any[];
    }> {
        return this.request(`/api/workflows/${workflowId}/validate`);
    }

    // ========================================
    // Templates
    // ========================================

    async getTemplates(): Promise<{ templates: any[]; total: number }> {
        return this.request('/api/templates');
    }

    async createFromTemplate(templateId: string, name: string): Promise<ApiWorkflowWithNodes> {
        return this.request(`/api/templates/${templateId}/create?name=${encodeURIComponent(name)}`, {
            method: 'POST',
        });
    }

    // ========================================
    // Node Types
    // ========================================

    async getNodeTypes(): Promise<{ nodes: any[]; categories: string[]; total: number }> {
        return this.request('/api/node-types');
    }

    async getPlaybooks(): Promise<{ playbooks: any[]; total: number }> {
        return this.request('/api/playbooks');
    }
}

// Export singleton instance
export const workflowApi = new WorkflowApiService();
export default workflowApi;
