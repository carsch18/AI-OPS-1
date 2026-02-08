/**
 * Issues Page - MAANG-Grade Issue Management Interface
 * 
 * Features:
 * - Real-time issue list with severity-based ordering
 * - Advanced filtering by severity, category, status, host
 * - Full-text search across all issue fields
 * - Issue detail modal with timeline and actions
 * - One-click acknowledge, execute, resolve, auto-remediate
 * - Detection on-demand trigger
 * - Beautiful glass-morphism design
 */

import { useState, useCallback } from 'react';
import { useIssues } from '../hooks/useIssues';
import type { Issue, IssueSeverity, IssueCategory, IssueStatus } from '../hooks/useIssues';
import {
    getSeverityColor,
    getSeverityText,
    getCategoryIcon,
    getStatusIcon,
    formatAge,
    formatTimestamp,
} from '../services/issueApi';
import './Issues.css';

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

interface IssueStatsBarProps {
    stats: {
        total: number;
        by_severity: Record<IssueSeverity, number>;
        by_status: Record<IssueStatus, number>;
    } | null;
    onRunDetection: () => void;
    detecting: boolean;
}

function IssueStatsBar({ stats, onRunDetection, detecting }: IssueStatsBarProps) {
    if (!stats) return null;

    return (
        <div className="issue-stats-bar">
            <div className="stats-summary">
                <div className="stat-item total">
                    <span className="stat-value">{stats.total ?? 0}</span>
                    <span className="stat-label">Active Issues</span>
                </div>
                <div className="stat-divider" />
                <div className="stat-item critical">
                    <span className="stat-value">{stats.by_severity?.P0_CRITICAL ?? 0}</span>
                    <span className="stat-label">Critical</span>
                </div>
                <div className="stat-item high">
                    <span className="stat-value">{stats.by_severity?.P1_HIGH ?? 0}</span>
                    <span className="stat-label">High</span>
                </div>
                <div className="stat-item medium">
                    <span className="stat-value">{stats.by_severity?.P2_MEDIUM ?? 0}</span>
                    <span className="stat-label">Medium</span>
                </div>
                <div className="stat-item low">
                    <span className="stat-value">{stats.by_severity?.P3_LOW ?? 0}</span>
                    <span className="stat-label">Low</span>
                </div>
            </div>
            <div className="stats-actions">
                <button
                    className="btn-detect"
                    onClick={onRunDetection}
                    disabled={detecting}
                >
                    {detecting ? (
                        <>
                            <span className="spinner" />
                            Detecting...
                        </>
                    ) : (
                        <>
                            🔍 Run Detection
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}

interface IssueFiltersBarProps {
    searchQuery: string;
    onSearchChange: (query: string) => void;
    severity: IssueSeverity | undefined;
    onSeverityChange: (severity: IssueSeverity | undefined) => void;
    category: IssueCategory | undefined;
    onCategoryChange: (category: IssueCategory | undefined) => void;
    status: IssueStatus | undefined;
    onStatusChange: (status: IssueStatus | undefined) => void;
    onClearFilters: () => void;
    hasFilters: boolean;
}

function IssueFiltersBar({
    searchQuery,
    onSearchChange,
    severity,
    onSeverityChange,
    category,
    onCategoryChange,
    status,
    onStatusChange,
    onClearFilters,
    hasFilters,
}: IssueFiltersBarProps) {
    return (
        <div className="issue-filters-bar">
            <div className="search-box">
                <span className="search-icon">🔎</span>
                <input
                    type="text"
                    placeholder="Search issues..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                />
                {searchQuery && (
                    <button className="clear-search" onClick={() => onSearchChange('')}>
                        ✕
                    </button>
                )}
            </div>

            <div className="filter-group">
                <select
                    value={severity || ''}
                    onChange={(e) => onSeverityChange(e.target.value as IssueSeverity || undefined)}
                    className={severity ? 'active' : ''}
                >
                    <option value="">All Severities</option>
                    <option value="P0_CRITICAL">🔴 Critical</option>
                    <option value="P1_HIGH">🟠 High</option>
                    <option value="P2_MEDIUM">🟡 Medium</option>
                    <option value="P3_LOW">🟢 Low</option>
                </select>

                <select
                    value={category || ''}
                    onChange={(e) => onCategoryChange(e.target.value as IssueCategory || undefined)}
                    className={category ? 'active' : ''}
                >
                    <option value="">All Categories</option>
                    <option value="compute">🖥️ Compute</option>
                    <option value="storage">💾 Storage</option>
                    <option value="network">🌐 Network</option>
                    <option value="application">📱 Application</option>
                    <option value="security">🔒 Security</option>
                    <option value="container">🐳 Container</option>
                    <option value="compliance">📋 Compliance</option>
                    <option value="business">💼 Business</option>
                </select>

                <select
                    value={status || ''}
                    onChange={(e) => onStatusChange(e.target.value as IssueStatus || undefined)}
                    className={status ? 'active' : ''}
                >
                    <option value="">All Statuses</option>
                    <option value="detected">🔴 Detected</option>
                    <option value="acknowledged">🟡 Acknowledged</option>
                    <option value="remediating">🔄 Remediating</option>
                    <option value="resolved">✅ Resolved</option>
                    <option value="escalated">🚨 Escalated</option>
                </select>

                {hasFilters && (
                    <button className="btn-clear-filters" onClick={onClearFilters}>
                        Clear Filters
                    </button>
                )}
            </div>
        </div>
    );
}

interface IssueCardProps {
    issue: Issue;
    onSelect: (issueId: string) => void;
    onAcknowledge: (issueId: string) => void;
    onExecute: (issueId: string) => void;
    onResolve: (issueId: string) => void;
    isSelected: boolean;
}

function IssueCard({ issue, onSelect, onAcknowledge, onExecute, onResolve, isSelected }: IssueCardProps) {
    const severityClass = getSeverityColor(issue.severity);

    return (
        <div
            className={`issue-card ${severityClass} ${isSelected ? 'selected' : ''}`}
            onClick={() => onSelect(issue.id)}
        >
            <div className="issue-card-header">
                <div className="issue-severity-badge">
                    <span className="severity-icon">{issue.icon}</span>
                    <span className="severity-text">{getSeverityText(issue.severity)}</span>
                </div>
                <div className="issue-status">
                    <span className="status-icon">{getStatusIcon(issue.status)}</span>
                    <span className="status-text">{issue.status}</span>
                </div>
            </div>

            <div className="issue-card-body">
                <h3 className="issue-title">{issue.pattern_name}</h3>
                <p className="issue-message">{issue.message}</p>

                <div className="issue-meta">
                    <span className="meta-item host">
                        <span className="meta-icon">🖥️</span>
                        {issue.host}
                    </span>
                    <span className="meta-item category">
                        <span className="meta-icon">{getCategoryIcon(issue.category)}</span>
                        {issue.category}
                    </span>
                    <span className="meta-item time">
                        <span className="meta-icon">⏱️</span>
                        {formatAge(issue.age_seconds)}
                    </span>
                </div>

                <div className="issue-metric">
                    <span className="metric-label">Value:</span>
                    <span className="metric-value">{issue.metric_value}</span>
                    <span className="metric-threshold">/ {issue.threshold}</span>
                </div>
            </div>

            <div className="issue-card-actions" onClick={(e) => e.stopPropagation()}>
                {issue.status === 'detected' && (
                    <button
                        className="btn-action acknowledge"
                        onClick={() => onAcknowledge(issue.id)}
                    >
                        👁️ Acknowledge
                    </button>
                )}

                {(issue.status === 'detected' || issue.status === 'acknowledged') && (
                    <button
                        className="btn-action execute"
                        onClick={() => onExecute(issue.id)}
                    >
                        {issue.auto_remediate ? '🤖 Auto-Fix' : '▶️ Execute'}
                    </button>
                )}

                {issue.status !== 'resolved' && (
                    <button
                        className="btn-action resolve"
                        onClick={() => onResolve(issue.id)}
                    >
                        ✅ Resolve
                    </button>
                )}
            </div>
        </div>
    );
}

interface IssueDetailModalProps {
    issue: Issue;
    onClose: () => void;
    onAcknowledge: (issueId: string) => void;
    onExecute: (issueId: string) => void;
    onAutoRemediate: (issueId: string) => void;
    onResolve: (issueId: string) => void;
}

function IssueDetailModal({
    issue,
    onClose,
    onAcknowledge,
    onExecute,
    onAutoRemediate,
    onResolve
}: IssueDetailModalProps) {
    return (
        <div className="issue-modal-overlay" onClick={onClose}>
            <div className="issue-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-title-section">
                        <span className="modal-icon">{issue.icon}</span>
                        <div className="modal-title-text">
                            <h2>{issue.pattern_name}</h2>
                            <span className={`severity-badge ${getSeverityColor(issue.severity)}`}>
                                {getSeverityText(issue.severity)}
                            </span>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    <div className="modal-section">
                        <h3>📝 Description</h3>
                        <p className="issue-description">{issue.message}</p>
                    </div>

                    <div className="modal-section">
                        <h3>📊 Details</h3>
                        <div className="detail-grid">
                            <div className="detail-item">
                                <span className="detail-label">Status</span>
                                <span className={`detail-value status-${issue.status}`}>
                                    {getStatusIcon(issue.status)} {issue.status}
                                </span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">Host</span>
                                <span className="detail-value">{issue.host}</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">Category</span>
                                <span className="detail-value">
                                    {getCategoryIcon(issue.category)} {issue.category}
                                </span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">Pattern ID</span>
                                <span className="detail-value code">{issue.pattern_id}</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">Metric Value</span>
                                <span className="detail-value highlight">{issue.metric_value}</span>
                            </div>
                            <div className="detail-item">
                                <span className="detail-label">Threshold</span>
                                <span className="detail-value">{issue.threshold}</span>
                            </div>
                        </div>
                    </div>

                    <div className="modal-section">
                        <h3>🕐 Timeline</h3>
                        <div className="timeline">
                            <div className="timeline-item">
                                <span className="timeline-dot detected" />
                                <span className="timeline-label">Detected</span>
                                <span className="timeline-time">{formatTimestamp(issue.detected_at)}</span>
                            </div>
                            {issue.acknowledged_at && (
                                <div className="timeline-item">
                                    <span className="timeline-dot acknowledged" />
                                    <span className="timeline-label">Acknowledged</span>
                                    <span className="timeline-time">{formatTimestamp(issue.acknowledged_at)}</span>
                                </div>
                            )}
                            {issue.remediation_started && (
                                <div className="timeline-item">
                                    <span className="timeline-dot remediating" />
                                    <span className="timeline-label">Remediation Started</span>
                                    <span className="timeline-time">In Progress</span>
                                </div>
                            )}
                            {issue.resolved_at && (
                                <div className="timeline-item">
                                    <span className="timeline-dot resolved" />
                                    <span className="timeline-label">Resolved</span>
                                    <span className="timeline-time">{formatTimestamp(issue.resolved_at)}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {issue.suggested_workflow_id && (
                        <div className="modal-section">
                            <h3>💡 Suggested Remediation</h3>
                            <div className="suggested-workflow">
                                <span className="workflow-icon">📋</span>
                                <span className="workflow-id">{issue.suggested_workflow_id}</span>
                                {issue.auto_remediate && (
                                    <span className="auto-badge">Auto-Remediate Available</span>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="modal-footer">
                    {issue.status === 'detected' && (
                        <button
                            className="btn-modal acknowledge"
                            onClick={() => onAcknowledge(issue.id)}
                        >
                            👁️ Acknowledge
                        </button>
                    )}

                    {issue.auto_remediate && issue.status !== 'resolved' && (
                        <button
                            className="btn-modal auto-remediate"
                            onClick={() => onAutoRemediate(issue.id)}
                        >
                            🤖 Auto-Remediate
                        </button>
                    )}

                    {issue.suggested_workflow_id && issue.status !== 'resolved' && (
                        <button
                            className="btn-modal execute"
                            onClick={() => onExecute(issue.id)}
                        >
                            ▶️ Execute Workflow
                        </button>
                    )}

                    {issue.status !== 'resolved' && (
                        <button
                            className="btn-modal resolve"
                            onClick={() => onResolve(issue.id)}
                        >
                            ✅ Mark Resolved
                        </button>
                    )}

                    <button className="btn-modal cancel" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function IssuesPage() {
    const [detecting, setDetecting] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    const {
        filteredIssues,
        stats,
        loading,
        refreshing,
        error,
        searchQuery,
        setSearchQuery,
        filters,
        setFilters,
        selectedIssue,
        selectIssue,
        acknowledge,
        execute,
        resolve,
        autoRemediate,
        runDetection,
    } = useIssues({ autoRefresh: true, refreshInterval: 15000 });

    // Detection handler
    const handleRunDetection = useCallback(async () => {
        setDetecting(true);
        try {
            await runDetection();
        } finally {
            setDetecting(false);
        }
    }, [runDetection]);

    // Action handlers
    const handleAcknowledge = useCallback(async (issueId: string) => {
        setActionLoading(issueId);
        await acknowledge(issueId);
        setActionLoading(null);
    }, [acknowledge]);

    const handleExecute = useCallback(async (issueId: string) => {
        setActionLoading(issueId);
        await execute(issueId);
        setActionLoading(null);
    }, [execute]);

    const handleAutoRemediate = useCallback(async (issueId: string) => {
        setActionLoading(issueId);
        await autoRemediate(issueId);
        setActionLoading(null);
    }, [autoRemediate]);

    const handleResolve = useCallback(async (issueId: string) => {
        setActionLoading(issueId);
        await resolve(issueId);
        selectIssue(null);
        setActionLoading(null);
    }, [resolve, selectIssue]);

    // Filter handlers
    const handleSeverityChange = useCallback((severity: IssueSeverity | undefined) => {
        setFilters({ ...filters, severity });
    }, [filters, setFilters]);

    const handleCategoryChange = useCallback((category: IssueCategory | undefined) => {
        setFilters({ ...filters, category });
    }, [filters, setFilters]);

    const handleStatusChange = useCallback((status: IssueStatus | undefined) => {
        setFilters({ ...filters, status });
    }, [filters, setFilters]);

    const handleClearFilters = useCallback(() => {
        setFilters({});
        setSearchQuery('');
    }, [setFilters, setSearchQuery]);

    const hasFilters = !!(filters.severity || filters.category || filters.status || searchQuery);

    // Loading state
    if (loading) {
        return (
            <div className="issues-page loading">
                <div className="loading-content">
                    <div className="loading-spinner large" />
                    <p>Loading issues...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="issues-page error">
                <div className="error-content">
                    <span className="error-icon">⚠️</span>
                    <h2>Failed to Load Issues</h2>
                    <p>{error}</p>
                    <button onClick={handleRunDetection}>Try Again</button>
                </div>
            </div>
        );
    }

    return (
        <div className="issues-page">
            {/* Header */}
            <header className="issues-header">
                <div className="header-left">
                    <h1>🔍 Issue Detection</h1>
                    {refreshing && <span className="refreshing-badge">Refreshing...</span>}
                </div>
            </header>

            {/* Stats Bar */}
            <IssueStatsBar
                stats={stats}
                onRunDetection={handleRunDetection}
                detecting={detecting}
            />

            {/* Filters */}
            <IssueFiltersBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                severity={filters.severity}
                onSeverityChange={handleSeverityChange}
                category={filters.category}
                onCategoryChange={handleCategoryChange}
                status={filters.status}
                onStatusChange={handleStatusChange}
                onClearFilters={handleClearFilters}
                hasFilters={hasFilters}
            />

            {/* Issues List */}
            <div className="issues-content">
                {filteredIssues.length === 0 ? (
                    <div className="empty-state">
                        <span className="empty-icon">🎉</span>
                        <h2>{hasFilters ? 'No Matching Issues' : 'All Clear!'}</h2>
                        <p>
                            {hasFilters
                                ? 'No issues match your current filters.'
                                : 'No active issues detected. Your infrastructure is healthy!'}
                        </p>
                        {hasFilters && (
                            <button onClick={handleClearFilters}>Clear Filters</button>
                        )}
                    </div>
                ) : (
                    <div className="issues-grid">
                        {filteredIssues.map((issue) => (
                            <IssueCard
                                key={issue.id}
                                issue={issue}
                                isSelected={selectedIssue?.id === issue.id}
                                onSelect={selectIssue}
                                onAcknowledge={handleAcknowledge}
                                onExecute={handleExecute}
                                onResolve={handleResolve}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Issue Detail Modal */}
            {selectedIssue && (
                <IssueDetailModal
                    issue={selectedIssue}
                    onClose={() => selectIssue(null)}
                    onAcknowledge={handleAcknowledge}
                    onExecute={handleExecute}
                    onAutoRemediate={handleAutoRemediate}
                    onResolve={handleResolve}
                />
            )}

            {/* Action Loading Overlay */}
            {actionLoading && (
                <div className="action-loading-overlay">
                    <div className="loading-spinner" />
                    <p>Processing...</p>
                </div>
            )}
        </div>
    );
}
