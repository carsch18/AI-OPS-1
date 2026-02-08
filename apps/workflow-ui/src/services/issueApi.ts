/**
 * Issue API Service - MAANG-Grade Issue Detection Integration
 * 
 * Connects to all 15+ issue detection backend APIs:
 * - List, filter, and search issues
 * - Trigger detection cycles
 * - Acknowledge, execute, resolve issues
 * - Auto-remediation integration
 * - Suggested workflow retrieval
 */

const API_BASE = 'http://localhost:8001';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export type IssueSeverity = 'P0_CRITICAL' | 'P1_HIGH' | 'P2_MEDIUM' | 'P3_LOW';
export type IssueCategory = 'compute' | 'storage' | 'network' | 'application' | 'security' | 'container' | 'compliance' | 'business';
export type IssueStatus = 'detected' | 'acknowledged' | 'remediating' | 'resolved' | 'escalated';

export interface Issue {
    id: string;
    pattern_id: string;
    pattern_name: string;
    category: IssueCategory;
    severity: IssueSeverity;
    severity_level: number;  // 0 = P0, 3 = P3
    status: IssueStatus;
    host: string;
    metric_value: number;
    threshold: number;
    message: string;
    detected_at: string;
    acknowledged_at: string | null;
    resolved_at: string | null;
    suggested_workflow_id: string;
    auto_remediate: boolean;
    remediation_started: boolean;
    icon: string;
    age_seconds: number;
}

export interface IssueListResponse {
    issues: Issue[];
    count: number;
    filters: {
        severity: string | null;
        category: string | null;
    };
}

export interface IssueStats {
    total: number;
    by_severity: Record<IssueSeverity, number>;
    by_category: Record<IssueCategory, number>;
    by_status: Record<IssueStatus, number>;
    resolved: number;
    avg_resolution_ms: number;
    total_detected_24h: number;
    avg_resolution_time_24h: number;
}

export interface DetectionPattern {
    id: string;
    name: string;
    description: string;
    category: IssueCategory;
    severity: IssueSeverity;
    metric_key: string;
    condition: string;
    threshold: number;
    duration_seconds: number;
    suggested_workflow_id: string;
    auto_remediate: boolean;
    icon: string;
    tags: string[];
    cooldown_seconds: number;
}

export interface SuggestedWorkflow {
    workflow_id: string;
    workflow_name: string;
    description: string;
    confidence: number;
    estimated_time_seconds: number;
    steps: string[];
}

export interface IssueFilters {
    severity?: IssueSeverity;
    category?: IssueCategory;
    status?: IssueStatus;
    host?: string;
    search?: string;
    limit?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * List all active issues with optional filters
 */
export async function listIssues(filters: IssueFilters = {}): Promise<IssueListResponse> {
    const params = new URLSearchParams();
    if (filters.severity) params.append('severity', filters.severity);
    if (filters.category) params.append('category', filters.category);
    if (filters.limit) params.append('limit', filters.limit.toString());

    const url = `${API_BASE}/api/issues?${params.toString()}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch issues: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get a single issue by ID
 */
export async function getIssue(issueId: string): Promise<Issue> {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}`);

    if (!response.ok) {
        throw new Error(`Failed to fetch issue: ${response.statusText}`);
    }

    const data = await response.json();
    return data.issue;
}

/**
 * Get issue statistics
 */
export async function getIssueStats(): Promise<IssueStats> {
    const response = await fetch(`${API_BASE}/api/issues/stats`);

    if (!response.ok) {
        throw new Error(`Failed to fetch issue stats: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get all detection patterns
 */
export async function getDetectionPatterns(): Promise<DetectionPattern[]> {
    const response = await fetch(`${API_BASE}/api/issues/patterns`);

    if (!response.ok) {
        throw new Error(`Failed to fetch detection patterns: ${response.statusText}`);
    }

    const data = await response.json();
    return data.patterns;
}

/**
 * Trigger a detection cycle
 */
export async function triggerDetection(hosts?: string[]): Promise<{
    success: boolean;
    new_issues_found: number;
    issues: Issue[];
    message: string;
}> {
    const response = await fetch(`${API_BASE}/api/issues/detect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: hosts ? JSON.stringify({ hosts }) : undefined,
    });

    if (!response.ok) {
        throw new Error(`Failed to trigger detection: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Acknowledge an issue
 */
export async function acknowledgeIssue(issueId: string): Promise<{
    success: boolean;
    issue: Issue;
    message: string;
}> {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}/acknowledge`, {
        method: 'POST',
    });

    if (!response.ok) {
        throw new Error(`Failed to acknowledge issue: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Execute remediation for an issue
 */
export async function executeRemediation(issueId: string, workflowId?: string): Promise<{
    success: boolean;
    execution_id: string;
    workflow_id: string;
    message: string;
}> {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: workflowId ? JSON.stringify({ workflow_id: workflowId }) : undefined,
    });

    if (!response.ok) {
        throw new Error(`Failed to execute remediation: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Resolve an issue manually
 */
export async function resolveIssue(issueId: string, resolution?: string): Promise<{
    success: boolean;
    issue: Issue;
    message: string;
}> {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: resolution ? JSON.stringify({ resolution }) : undefined,
    });

    if (!response.ok) {
        throw new Error(`Failed to resolve issue: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Get suggested workflow for an issue
 */
export async function getSuggestedWorkflow(issueId: string): Promise<SuggestedWorkflow | null> {
    try {
        const response = await fetch(`${API_BASE}/api/issues/${issueId}/suggested-workflow`);

        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.workflow;
    } catch {
        return null;
    }
}

/**
 * Get remediation options for an issue
 */
export async function getRemediationOptions(issueId: string): Promise<{
    suggested_workflow: SuggestedWorkflow | null;
    alternative_workflows: SuggestedWorkflow[];
    auto_remediate_available: boolean;
}> {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}/remediation`);

    if (!response.ok) {
        throw new Error(`Failed to get remediation options: ${response.statusText}`);
    }

    return response.json();
}

/**
 * Trigger auto-remediation for an issue
 */
export async function autoRemediateIssue(issueId: string): Promise<{
    success: boolean;
    execution_id: string;
    confidence: number;
    message: string;
}> {
    const response = await fetch(`${API_BASE}/api/issues/${issueId}/auto-remediate`, {
        method: 'POST',
    });

    if (!response.ok) {
        throw new Error(`Failed to auto-remediate issue: ${response.statusText}`);
    }

    return response.json();
}

// ═══════════════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get severity color class
 */
export function getSeverityColor(severity: IssueSeverity): string {
    switch (severity) {
        case 'P0_CRITICAL': return 'critical';
        case 'P1_HIGH': return 'high';
        case 'P2_MEDIUM': return 'medium';
        case 'P3_LOW': return 'low';
        default: return 'unknown';
    }
}

/**
 * Get severity display text
 */
export function getSeverityText(severity: IssueSeverity): string {
    switch (severity) {
        case 'P0_CRITICAL': return 'Critical';
        case 'P1_HIGH': return 'High';
        case 'P2_MEDIUM': return 'Medium';
        case 'P3_LOW': return 'Low';
        default: return severity;
    }
}

/**
 * Get category icon
 */
export function getCategoryIcon(category: IssueCategory): string {
    const icons: Record<IssueCategory, string> = {
        compute: '🖥️',
        storage: '💾',
        network: '🌐',
        application: '📱',
        security: '🔒',
        container: '🐳',
        compliance: '📋',
        business: '💼',
    };
    return icons[category] || '⚠️';
}

/**
 * Get status icon
 */
export function getStatusIcon(status: IssueStatus): string {
    const icons: Record<IssueStatus, string> = {
        detected: '🔴',
        acknowledged: '🟡',
        remediating: '🔄',
        resolved: '✅',
        escalated: '🚨',
    };
    return icons[status] || '⚪';
}

/**
 * Format age in human-readable form
 */
export function formatAge(seconds: number): string {
    if (seconds < 60) return `${Math.floor(seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Format timestamp in human-readable form
 */
export function formatTimestamp(isoString: string): string {
    const date = new Date(isoString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default {
    listIssues,
    getIssue,
    getIssueStats,
    getDetectionPatterns,
    triggerDetection,
    acknowledgeIssue,
    executeRemediation,
    resolveIssue,
    getSuggestedWorkflow,
    getRemediationOptions,
    autoRemediateIssue,
    getSeverityColor,
    getSeverityText,
    getCategoryIcon,
    getStatusIcon,
    formatAge,
    formatTimestamp,
};
