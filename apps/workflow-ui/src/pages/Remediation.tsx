/**
 * Remediation Page - MAANG-Grade Remediation Library
 * 
 * PHASE 3 ENHANCEMENTS:
 * - Text search across workflow names and descriptions
 * - Execution detail modal with per-node output/errors/timing
 * - Live progress tracking via WebSocket execution events
 * - Active execution count in header badge
 * 
 * Existing features preserved:
 * - Template gallery with category filtering
 * - System vs User workflow tabs
 * - Workflow cards with execution stats
 * - Clone, execute, and manage workflows
 * - Execution history view
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    listWorkflows,
    executeWorkflowAsync,
    cloneWorkflow,
    deleteWorkflow,
    getExecutionHistory,
    getExecutionStatus,
} from '../services/remediationApi';
import type {
    RemediationWorkflow,
    WorkflowExecution,
    NodeExecutionResult,
} from '../services/remediationApi';
import {
    getExecutionStatusColor,
    formatDuration,
    calculateWorkflowStats,
} from '../services/remediationApi';
import useRealtimeEvents from '../hooks/useRealtimeEvents';
import { EventTypes } from '../hooks/useRealtimeEvents';
import {
    Wrench,
    History,
    FileText,
    User,
    BarChart3,
    CheckCircle,
    Clock,
    Bot,
    Play,
    Copy,
    Trash2,
    Inbox,
    X,
    Loader2,
    Search,
    XCircle,
    AlertCircle,
    CategoryIcons,
    ExecutionStatusIcons,
    ICON_SIZE,
} from '../components/Icons';
import './Remediation.css';

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION DETAIL MODAL (Phase 3 — node-level output)
// ═══════════════════════════════════════════════════════════════════════════

interface ExecutionDetailModalProps {
    executionId: string;
    onClose: () => void;
}

function ExecutionDetailModal({ executionId, onClose }: ExecutionDetailModalProps) {
    const [execution, setExecution] = useState<WorkflowExecution | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchDetail = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getExecutionStatus(executionId);
            setExecution(result);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load execution details');
        } finally {
            setLoading(false);
        }
    }, [executionId]);

    useEffect(() => {
        fetchDetail();
        // Auto-refresh while running
        const interval = setInterval(() => {
            if (execution?.status === 'running') fetchDetail();
        }, 3000);
        return () => clearInterval(interval);
    }, [fetchDetail, execution?.status]);

    const nodeResults = execution?.node_results
        ? Object.entries(execution.node_results) as [string, NodeExecutionResult][]
        : [];

    const getNodeStatusIcon = (status: string) => {
        switch (status) {
            case 'completed': return <CheckCircle size={14} />;
            case 'failed': return <XCircle size={14} />;
            case 'running': return <Loader2 size={14} className="spin" />;
            case 'skipped': return <AlertCircle size={14} />;
            default: return <Clock size={14} />;
        }
    };

    const getNodeStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return '#10b981';
            case 'failed': return '#ef4444';
            case 'running': return '#3b82f6';
            case 'skipped': return '#64748b';
            default: return '#f59e0b';
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content execution-detail-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>
                        {execution?.status === 'running'
                            ? <Loader2 size={20} className="spin" />
                            : <History size={20} />
                        }
                        {' '}Execution Detail
                    </h2>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                {loading && !execution ? (
                    <div className="modal-loading">
                        <Loader2 size={32} className="spin" />
                        <p>Loading execution details...</p>
                    </div>
                ) : error ? (
                    <div className="modal-error">
                        <AlertCircle size={20} />
                        <p>{error}</p>
                        <button onClick={fetchDetail}>Retry</button>
                    </div>
                ) : execution ? (
                    <div className="execution-detail-body">
                        {/* Summary */}
                        <div className="exec-summary">
                            <div className="exec-summary-item">
                                <span className="label">Workflow</span>
                                <span className="value">{execution.workflow_name}</span>
                            </div>
                            <div className="exec-summary-item">
                                <span className="label">Status</span>
                                <span className={`value status-${execution.status}`}>
                                    {execution.status}
                                </span>
                            </div>
                            <div className="exec-summary-item">
                                <span className="label">Progress</span>
                                <span className="value">{execution.progress_percent}%</span>
                            </div>
                            <div className="exec-summary-item">
                                <span className="label">Started</span>
                                <span className="value">{new Date(execution.started_at).toLocaleString()}</span>
                            </div>
                            {execution.completed_at && (
                                <div className="exec-summary-item">
                                    <span className="label">Completed</span>
                                    <span className="value">{new Date(execution.completed_at).toLocaleString()}</span>
                                </div>
                            )}
                        </div>

                        {/* Progress Bar */}
                        <div className="exec-progress-bar-container">
                            <div
                                className="exec-progress-bar-fill"
                                style={{
                                    width: `${execution.progress_percent}%`,
                                    backgroundColor: `var(--color-${getExecutionStatusColor(execution.status)}, #3b82f6)`,
                                }}
                            />
                        </div>

                        {execution.error && (
                            <div className="exec-error-banner">
                                <AlertCircle size={14} />
                                {execution.error}
                            </div>
                        )}

                        {/* Node Results */}
                        <h3 className="nodes-title">Node Results ({nodeResults.length})</h3>
                        <div className="node-results-list">
                            {nodeResults.map(([nodeId, result]) => (
                                <div key={nodeId} className={`node-result-item status-${result.status}`}>
                                    <div className="node-result-header">
                                        <span
                                            className="node-status-icon"
                                            style={{ color: getNodeStatusColor(result.status) }}
                                        >
                                            {getNodeStatusIcon(result.status)}
                                        </span>
                                        <span className="node-id">{nodeId}</span>
                                        {result.duration_ms > 0 && (
                                            <span className="node-duration">{result.duration_ms}ms</span>
                                        )}
                                    </div>
                                    {result.output && (
                                        <pre className="node-output">{result.output}</pre>
                                    )}
                                    {result.error && (
                                        <pre className="node-error">{result.error}</pre>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

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
            {categories.map(cat => {
                const IconComp = CategoryIcons[cat as keyof typeof CategoryIcons] || FileText;
                return (
                    <button
                        key={cat}
                        className={`category-btn ${selected === cat ? 'active' : ''}`}
                        onClick={() => onChange(cat)}
                    >
                        <IconComp size={14} /> {cat}
                    </button>
                );
            })}
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
    const metadata = workflow.metadata ?? {} as any;

    return (
        <div className={`workflow-card ${workflow.workflow_type}`}>
            <div className="workflow-card-header">
                <span className="workflow-icon">
                    {(() => {
                        const IconComp = CategoryIcons[metadata?.category as keyof typeof CategoryIcons] || FileText;
                        return <IconComp size={ICON_SIZE.lg} />;
                    })()}
                </span>
                <div className="workflow-type-badge">
                    {workflow.workflow_type === 'system' ? <><FileText size={14} /> System</> : <><User size={14} /> Custom</>}
                </div>
            </div>

            <div className="workflow-card-body">
                <h3 className="workflow-name">{workflow.name}</h3>
                <p className="workflow-description">{workflow.description}</p>

                <div className="workflow-meta">
                    <span className="meta-item">
                        <BarChart3 size={14} className="meta-icon" />
                        {metadata.execution_count ?? 0} runs
                    </span>
                    <span className="meta-item">
                        <CheckCircle size={14} className="meta-icon" />
                        {Math.round((metadata.success_rate ?? 0) * 100)}% success
                    </span>
                    <span className="meta-item">
                        <Clock size={14} className="meta-icon" />
                        ~{formatDuration(metadata.estimated_duration_seconds ?? 0)}
                    </span>
                </div>

                <div className="workflow-severity">
                    {(metadata.severity_match ?? []).map((sev: string) => (
                        <span key={sev} className={`severity-chip ${sev}`}>
                            {sev}
                        </span>
                    ))}
                </div>

                {metadata.auto_trigger_enabled && (
                    <div className="auto-trigger-badge">
                        <Bot size={14} /> Auto-Trigger Enabled
                    </div>
                )}
            </div>

            <div className="workflow-card-actions">
                <button
                    className="btn-action execute"
                    onClick={() => onExecute(workflow.id)}
                    disabled={executing}
                >
                    {executing ? <Loader2 size={14} className="spin" /> : <Play size={14} />} Execute
                </button>
                <button
                    className="btn-action clone"
                    onClick={() => onClone(workflow.id)}
                >
                    <Copy size={14} /> Clone
                </button>
                {workflow.workflow_type === 'user' && (
                    <button
                        className="btn-action delete"
                        onClick={() => onDelete(workflow.id)}
                    >
                        <Trash2 size={14} />
                    </button>
                )}
            </div>
        </div>
    );
}

interface ExecutionHistoryModalProps {
    executions: WorkflowExecution[];
    onClose: () => void;
    onViewDetail: (executionId: string) => void;
}

function ExecutionHistoryModal({ executions, onClose, onViewDetail }: ExecutionHistoryModalProps) {
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content execution-history-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2><History size={20} /> Execution History</h2>
                    <button className="modal-close" onClick={onClose}><X size={18} /></button>
                </div>

                <div className="modal-body">
                    {executions.length === 0 ? (
                        <div className="empty-state">
                            <Inbox size={48} className="empty-icon" />
                            <p>No executions yet</p>
                        </div>
                    ) : (
                        <div className="execution-list">
                            {executions.map(exec => (
                                <div
                                    key={exec.execution_id}
                                    className={`execution-item ${exec.status}`}
                                    onClick={() => onViewDetail(exec.execution_id)}
                                    title="Click to see details"
                                >
                                    <div className="execution-status">
                                        {(() => {
                                            const IconComp = ExecutionStatusIcons[exec.status as keyof typeof ExecutionStatusIcons] || Clock;
                                            return <IconComp size={18} />;
                                        })()}
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
    const [searchQuery, setSearchQuery] = useState('');

    // Phase 3: Execution detail modal
    const [detailExecutionId, setDetailExecutionId] = useState<string | null>(null);

    // Phase 3: Live progress from WebSocket
    const realtime = useRealtimeEvents({
        enabled: true,
        channels: ['executions'],
    });

    // Refresh executions when execution events arrive
    useEffect(() => {
        const executionEvents = realtime.events.filter(e =>
            e.event_type === EventTypes.EXECUTION_COMPLETED ||
            e.event_type === EventTypes.EXECUTION_FAILED
        );
        if (executionEvents.length > 0) {
            getExecutionHistory({ limit: 50 }).then(setExecutions).catch(() => { /* ignore */ });
        }
    }, [realtime.events]);

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
    const categories = [...new Set(workflows.map(w => w.metadata?.category).filter(Boolean))] as string[];

    const filteredWorkflows = useMemo(() => {
        return workflows.filter(wf => {
            if (selectedCategory && wf.metadata?.category !== selectedCategory) return false;
            if (workflowType !== 'all' && wf.workflow_type !== workflowType) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchesName = wf.name.toLowerCase().includes(q);
                const matchesDesc = wf.description.toLowerCase().includes(q);
                const matchesCat = (wf.metadata?.category ?? '').toLowerCase().includes(q);
                if (!matchesName && !matchesDesc && !matchesCat) return false;
            }
            return true;
        });
    }, [workflows, selectedCategory, workflowType, searchQuery]);

    const runningCount = executions.filter(e => e.status === 'running').length;

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
                    <h1><Wrench size={24} /> Remediation Library</h1>
                </div>
                <div className="header-right">
                    <button className="btn-history" onClick={() => setShowHistory(true)}>
                        <History size={16} /> History
                        {runningCount > 0 && (
                            <span className="running-badge">{runningCount} running</span>
                        )}
                    </button>
                </div>
            </header>

            {/* Stats Bar */}
            <StatsBar stats={stats} />

            {/* Search + Filters */}
            <div className="remediation-filters">
                <div className="search-and-tabs">
                    {/* Phase 3: Search bar */}
                    <div className="search-bar">
                        <Search size={16} />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search workflows..."
                        />
                        {searchQuery && (
                            <button className="search-clear" onClick={() => setSearchQuery('')}>
                                <X size={14} />
                            </button>
                        )}
                    </div>

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
                            <FileText size={14} /> System Templates
                        </button>
                        <button
                            className={`tab ${workflowType === 'user' ? 'active' : ''}`}
                            onClick={() => setWorkflowType('user')}
                        >
                            <User size={14} /> Custom Workflows
                        </button>
                    </div>
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
                        <Inbox size={48} className="empty-icon" />
                        <h2>No Workflows Found</h2>
                        <p>{searchQuery ? `No results for "${searchQuery}"` : 'No workflows match your current filters.'}</p>
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
                    onViewDetail={(id) => {
                        setShowHistory(false);
                        setDetailExecutionId(id);
                    }}
                />
            )}

            {/* Phase 3: Execution Detail Modal */}
            {detailExecutionId && (
                <ExecutionDetailModal
                    executionId={detailExecutionId}
                    onClose={() => setDetailExecutionId(null)}
                />
            )}
        </div>
    );
}
