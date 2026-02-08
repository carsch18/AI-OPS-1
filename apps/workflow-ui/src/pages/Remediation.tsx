/**
 * Remediation Page - MAANG-Grade Remediation Library
 * 
 * Features:
 * - Template gallery with category filtering
 * - System vs User workflow tabs
 * - Workflow cards with execution stats
 * - Clone, execute, and manage workflows
 * - Execution history view
 */

import { useState, useEffect, useCallback } from 'react';
import {
    listWorkflows,
    executeWorkflowAsync,
    cloneWorkflow,
    deleteWorkflow,
    getExecutionHistory,
} from '../services/remediationApi';
import type {
    RemediationWorkflow,
    WorkflowExecution,
    WorkflowCategory,
} from '../services/remediationApi';
import {
    getCategoryIcon,
    getExecutionStatusIcon,
    getExecutionStatusColor,
    formatDuration,
    calculateWorkflowStats,
} from '../services/remediationApi';
import './Remediation.css';

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface StatsBarProps {
    stats: ReturnType<typeof calculateWorkflowStats>;
}

function StatsBar({ stats }: StatsBarProps) {
    return (
        <div className="remediation-stats-bar">
            <div className="stat-item">
                <span className="stat-value">{stats.total}</span>
                <span className="stat-label">Total Workflows</span>
            </div>
            <div className="stat-divider" />
            <div className="stat-item system">
                <span className="stat-value">{stats.system}</span>
                <span className="stat-label">System Templates</span>
            </div>
            <div className="stat-item user">
                <span className="stat-value">{stats.user}</span>
                <span className="stat-label">Custom Workflows</span>
            </div>
            <div className="stat-item active">
                <span className="stat-value">{stats.active}</span>
                <span className="stat-label">Active</span>
            </div>
        </div>
    );
}

interface CategoryFilterProps {
    categories: string[];
    selected: string | null;
    onChange: (category: string | null) => void;
}

function CategoryFilter({ categories, selected, onChange }: CategoryFilterProps) {
    return (
        <div className="category-filter">
            <button
                className={`category-btn ${!selected ? 'active' : ''}`}
                onClick={() => onChange(null)}
            >
                All
            </button>
            {categories.map(cat => (
                <button
                    key={cat}
                    className={`category-btn ${selected === cat ? 'active' : ''}`}
                    onClick={() => onChange(cat)}
                >
                    {getCategoryIcon(cat as WorkflowCategory)} {cat}
                </button>
            ))}
        </div>
    );
}

interface WorkflowCardProps {
    workflow: RemediationWorkflow;
    onExecute: (id: string) => void;
    onClone: (id: string) => void;
    onDelete: (id: string) => void;
    executing: boolean;
}

function WorkflowCard({ workflow, onExecute, onClone, onDelete, executing }: WorkflowCardProps) {
    const { metadata } = workflow;

    return (
        <div className={`workflow-card ${workflow.workflow_type}`}>
            <div className="workflow-card-header">
                <span className="workflow-icon">{getCategoryIcon(metadata.category)}</span>
                <div className="workflow-type-badge">
                    {workflow.workflow_type === 'system' ? '📋 System' : '👤 Custom'}
                </div>
            </div>

            <div className="workflow-card-body">
                <h3 className="workflow-name">{workflow.name}</h3>
                <p className="workflow-description">{workflow.description}</p>

                <div className="workflow-meta">
                    <span className="meta-item">
                        <span className="meta-icon">📊</span>
                        {metadata.execution_count} runs
                    </span>
                    <span className="meta-item">
                        <span className="meta-icon">✅</span>
                        {Math.round(metadata.success_rate * 100)}% success
                    </span>
                    <span className="meta-item">
                        <span className="meta-icon">⏱️</span>
                        ~{formatDuration(metadata.estimated_duration_seconds)}
                    </span>
                </div>

                <div className="workflow-severity">
                    {metadata.severity_match.map(sev => (
                        <span key={sev} className={`severity-chip ${sev}`}>
                            {sev}
                        </span>
                    ))}
                </div>

                {metadata.auto_trigger_enabled && (
                    <div className="auto-trigger-badge">
                        🤖 Auto-Trigger Enabled
                    </div>
                )}
            </div>

            <div className="workflow-card-actions">
                <button
                    className="btn-action execute"
                    onClick={() => onExecute(workflow.id)}
                    disabled={executing}
                >
                    {executing ? '⏳' : '▶️'} Execute
                </button>
                <button
                    className="btn-action clone"
                    onClick={() => onClone(workflow.id)}
                >
                    📋 Clone
                </button>
                {workflow.workflow_type === 'user' && (
                    <button
                        className="btn-action delete"
                        onClick={() => onDelete(workflow.id)}
                    >
                        🗑️
                    </button>
                )}
            </div>
        </div>
    );
}

interface ExecutionHistoryModalProps {
    executions: WorkflowExecution[];
    onClose: () => void;
}

function ExecutionHistoryModal({ executions, onClose }: ExecutionHistoryModalProps) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content execution-history-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>📜 Execution History</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    {executions.length === 0 ? (
                        <div className="empty-state">
                            <span className="empty-icon">📭</span>
                            <p>No executions yet</p>
                        </div>
                    ) : (
                        <div className="execution-list">
                            {executions.map(exec => (
                                <div key={exec.execution_id} className={`execution-item ${exec.status}`}>
                                    <div className="execution-status">
                                        {getExecutionStatusIcon(exec.status)}
                                    </div>
                                    <div className="execution-info">
                                        <span className="execution-name">{exec.workflow_name}</span>
                                        <span className="execution-id">{exec.execution_id.slice(0, 8)}</span>
                                    </div>
                                    <div className="execution-progress">
                                        <div
                                            className="progress-bar"
                                            style={{
                                                width: `${exec.progress_percent}%`,
                                                backgroundColor: `var(--color-${getExecutionStatusColor(exec.status)})`
                                            }}
                                        />
                                    </div>
                                    <div className="execution-time">
                                        {new Date(exec.started_at).toLocaleTimeString()}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function RemediationPage() {
    const [workflows, setWorkflows] = useState<RemediationWorkflow[]>([]);
    const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [executingId, setExecutingId] = useState<string | null>(null);

    // Filters
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [workflowType, setWorkflowType] = useState<'all' | 'system' | 'user'>('all');
    const [showHistory, setShowHistory] = useState(false);

    // Fetch data
    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [wf, ex] = await Promise.all([
                listWorkflows(),
                getExecutionHistory({ limit: 50 }).catch(() => []),
            ]);
            setWorkflows(wf);
            setExecutions(ex);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load workflows');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Auto-refresh executions
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const ex = await getExecutionHistory({ limit: 50 });
                setExecutions(ex);
            } catch {
                // Ignore refresh errors
            }
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    // Actions
    const handleExecute = useCallback(async (workflowId: string) => {
        setExecutingId(workflowId);
        try {
            await executeWorkflowAsync(workflowId);
            // Refresh executions after a short delay
            setTimeout(async () => {
                const ex = await getExecutionHistory({ limit: 50 });
                setExecutions(ex);
            }, 1000);
        } catch (err) {
            console.error('Failed to execute workflow:', err);
        } finally {
            setExecutingId(null);
        }
    }, []);

    const handleClone = useCallback(async (workflowId: string) => {
        try {
            const wf = workflows.find(w => w.id === workflowId);
            await cloneWorkflow(workflowId, wf ? `${wf.name} (Copy)` : undefined);
            await fetchData();
        } catch (err) {
            console.error('Failed to clone workflow:', err);
        }
    }, [workflows, fetchData]);

    const handleDelete = useCallback(async (workflowId: string) => {
        if (!confirm('Are you sure you want to delete this workflow?')) return;

        try {
            await deleteWorkflow(workflowId);
            await fetchData();
        } catch (err) {
            console.error('Failed to delete workflow:', err);
        }
    }, [fetchData]);

    // Computed
    const stats = calculateWorkflowStats(workflows);
    const categories = [...new Set(workflows.map(w => w.metadata.category))];

    const filteredWorkflows = workflows.filter(wf => {
        if (selectedCategory && wf.metadata.category !== selectedCategory) return false;
        if (workflowType !== 'all' && wf.workflow_type !== workflowType) return false;
        return true;
    });

    // Loading state
    if (loading) {
        return (
            <div className="remediation-page loading">
                <div className="loading-content">
                    <div className="loading-spinner large" />
                    <p>Loading workflows...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="remediation-page error">
                <div className="error-content">
                    <span className="error-icon">⚠️</span>
                    <h2>Failed to Load</h2>
                    <p>{error}</p>
                    <button onClick={fetchData}>Retry</button>
                </div>
            </div>
        );
    }

    return (
        <div className="remediation-page">
            {/* Header */}
            <header className="remediation-header">
                <div className="header-left">
                    <h1>🔧 Remediation Library</h1>
                </div>
                <div className="header-right">
                    <button className="btn-history" onClick={() => setShowHistory(true)}>
                        📜 History ({executions.filter(e => e.status === 'running').length} running)
                    </button>
                </div>
            </header>

            {/* Stats Bar */}
            <StatsBar stats={stats} />

            {/* Filters */}
            <div className="remediation-filters">
                <div className="type-tabs">
                    <button
                        className={`tab ${workflowType === 'all' ? 'active' : ''}`}
                        onClick={() => setWorkflowType('all')}
                    >
                        All
                    </button>
                    <button
                        className={`tab ${workflowType === 'system' ? 'active' : ''}`}
                        onClick={() => setWorkflowType('system')}
                    >
                        📋 System Templates
                    </button>
                    <button
                        className={`tab ${workflowType === 'user' ? 'active' : ''}`}
                        onClick={() => setWorkflowType('user')}
                    >
                        👤 Custom Workflows
                    </button>
                </div>

                <CategoryFilter
                    categories={categories}
                    selected={selectedCategory}
                    onChange={setSelectedCategory}
                />
            </div>

            {/* Workflow Grid */}
            <div className="workflows-content">
                {filteredWorkflows.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">📭</span>
                        <h2>No Workflows Found</h2>
                        <p>No workflows match your current filters.</p>
                    </div>
                ) : (
                    <div className="workflows-grid">
                        {filteredWorkflows.map(wf => (
                            <WorkflowCard
                                key={wf.id}
                                workflow={wf}
                                onExecute={handleExecute}
                                onClone={handleClone}
                                onDelete={handleDelete}
                                executing={executingId === wf.id}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Execution History Modal */}
            {showHistory && (
                <ExecutionHistoryModal
                    executions={executions}
                    onClose={() => setShowHistory(false)}
                />
            )}
        </div>
    );
}
