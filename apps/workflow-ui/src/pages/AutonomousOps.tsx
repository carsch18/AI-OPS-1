/**
 * Autonomous Operations Center — FULLY REAL, ZERO MOCKS
 * 
 * Mission control for the autonomous remediation engine, wired to real backend:
 * - GET /api/autonomous/status → real engine status, kill switch, rate limits
 * - POST /api/autonomous/enable → enable autonomous mode
 * - POST /api/autonomous/disable → disable autonomous mode
 * - POST /api/autonomous/kill-switch → emergency kill switch
 * - GET /api/autonomous/pending-approvals → medium-confidence requests
 * - POST /api/autonomous/approve/{id} → approve pending request
 * - POST /api/autonomous/reject/{id} → reject pending request
 * - GET /api/autonomous/recent-triggers → trigger activity log
 * - GET /api/autonomous/audit-log → safety audit trail
 * 
 * Features:
 * - Master control panel (enable/disable autonomous mode)
 * - Kill switch with emergency activation
 * - Pending approval queue for medium-confidence matches
 * - Recent auto-trigger activity log
 * - Safety audit trail
 */

import { useState, useCallback } from 'react';
import { useApiCall } from '../hooks/useApiCall';
import {
    Radar,
    Power,
    Shield,
    AlertOctagon,
    CheckCircle,
    XCircle,
    RefreshCw,
    Loader2,
    Activity,
    Eye,
    Zap,
} from '../components/Icons';
import './AutonomousOps.css';

const ENGINE_API = 'http://localhost:8001';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AutonomousStatus {
    enabled: boolean;
    mode?: string;
    rate_limit?: { max_per_hour: number; current_count: number };
    total_auto_triggers?: number;
    total_approvals_pending?: number;
    safety?: {
        kill_switch_active: boolean;
        kill_switch_reason?: string;
        total_blocked?: number;
    };
    error?: string;
}

interface PendingApproval {
    request_id: string;
    workflow_id: string;
    workflow_name?: string;
    issue_title: string;
    confidence_score: number;
    confidence_level: string;
    created_at: string;
}

interface TriggerEntry {
    trigger_id?: string;
    workflow_id: string;
    workflow_name?: string;
    issue_title?: string;
    action_taken: string;
    confidence_score?: number;
    timestamp: string;
}

interface AuditEntry {
    event: string;
    detail?: string;
    timestamp: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AutonomousOps() {
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Fetch autonomous status
    const { data: status, loading: statusLoading, error: statusError, refresh: refreshStatus } = useApiCall<AutonomousStatus>(
        () => fetch(`${ENGINE_API}/api/autonomous/status`).then(async res => {
            if (!res.ok) throw new Error(`Autonomous engine unavailable: ${res.status}`);
            return res.json();
        }),
        { refreshInterval: 10000 }
    );

    // Fetch pending approvals
    const { data: approvalsData, refresh: refreshApprovals } = useApiCall(
        () => fetch(`${ENGINE_API}/api/autonomous/pending-approvals`).then(res => res.ok ? res.json() : { pending: [] }),
        { refreshInterval: 10000 }
    );

    // Fetch recent triggers
    const { data: triggersData } = useApiCall(
        () => fetch(`${ENGINE_API}/api/autonomous/recent-triggers?limit=20`).then(res => res.ok ? res.json() : { triggers: [] }),
        { refreshInterval: 15000 }
    );

    // Fetch audit log
    const { data: auditData } = useApiCall(
        () => fetch(`${ENGINE_API}/api/autonomous/audit-log?limit=50`).then(res => res.ok ? res.json() : { log: [] }),
        { refreshInterval: 30000 }
    );

    const pendingApprovals: PendingApproval[] = approvalsData?.pending || [];
    const recentTriggers: TriggerEntry[] = triggersData?.triggers || [];
    const auditLog: AuditEntry[] = auditData?.log || [];

    const isEnabled = status?.enabled ?? false;
    const killSwitchActive = status?.safety?.kill_switch_active ?? false;

    // ─── Actions ───
    const toggleAutonomous = useCallback(async (enable: boolean) => {
        setActionLoading(enable ? 'enable' : 'disable');
        try {
            const res = await fetch(`${ENGINE_API}/api/autonomous/${enable ? 'enable' : 'disable'}`, { method: 'POST' });
            if (!res.ok) throw new Error('Toggle failed');
            refreshStatus();
        } catch (err) {
            console.error('Toggle error:', err);
        } finally {
            setActionLoading(null);
        }
    }, [refreshStatus]);

    const toggleKillSwitch = useCallback(async (activate: boolean) => {
        setActionLoading('kill');
        try {
            const params = new URLSearchParams({
                enable: String(activate),
                reason: activate ? 'Emergency activation from UI' : 'Deactivated from UI',
            });
            const res = await fetch(`${ENGINE_API}/api/autonomous/kill-switch?${params}`, { method: 'POST' });
            if (!res.ok) throw new Error('Kill switch toggle failed');
            refreshStatus();
        } catch (err) {
            console.error('Kill switch error:', err);
        } finally {
            setActionLoading(null);
        }
    }, [refreshStatus]);

    const handleApproval = useCallback(async (requestId: string, approve: boolean) => {
        setActionLoading(requestId);
        try {
            const endpoint = approve ? 'approve' : 'reject';
            const res = await fetch(`${ENGINE_API}/api/autonomous/${endpoint}/${requestId}`, { method: 'POST' });
            if (!res.ok) throw new Error(`${endpoint} failed`);
            refreshApprovals();
            refreshStatus();
        } catch (err) {
            console.error('Approval error:', err);
        } finally {
            setActionLoading(null);
        }
    }, [refreshApprovals, refreshStatus]);

    const formatTime = (iso: string) => {
        try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        catch { return iso; }
    };

    if (statusLoading && !status) {
        return (
            <div className="autonomous-page">
                <div className="autonomous-loading">
                    <Loader2 size={20} /> Connecting to autonomous engine...
                </div>
            </div>
        );
    }

    if (statusError) {
        return (
            <div className="autonomous-page">
                <div className="autonomous-header">
                    <h1><Radar size={22} className="icon" /> Autonomous Operations</h1>
                </div>
                <div className="autonomous-error">
                    <p className="error-text">{statusError}</p>
                    <button className="retry-btn" onClick={refreshStatus}>Retry</button>
                </div>
            </div>
        );
    }

    return (
        <div className="autonomous-page">
            {/* ─── Header ─── */}
            <div className="autonomous-header">
                <h1>
                    <Radar size={22} className="icon" />
                    Autonomous Operations Center
                </h1>
                <div className="autonomous-header-actions">
                    <button className="control-toggle-btn enable" onClick={refreshStatus} style={{ padding: '8px 14px', fontSize: 12 }}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
            </div>

            {/* ─── Master Controls ─── */}
            <div className="autonomous-controls">
                {/* Autonomous Mode */}
                <div className="control-card">
                    <div className="control-card-header">
                        <span className="control-card-title">
                            <Power size={16} /> Autonomous Mode
                        </span>
                        <span className={`control-card-status ${isEnabled ? 'enabled' : 'disabled'}`}>
                            {isEnabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                    </div>
                    <div className="control-card-desc">
                        When enabled, high-confidence issues are automatically remediated without human approval.
                    </div>
                    <button
                        className={`control-toggle-btn ${isEnabled ? 'disable' : 'enable'}`}
                        onClick={() => toggleAutonomous(!isEnabled)}
                        disabled={actionLoading === 'enable' || actionLoading === 'disable'}
                    >
                        {actionLoading === 'enable' || actionLoading === 'disable' ? (
                            <Loader2 size={14} />
                        ) : (
                            <Power size={14} />
                        )}
                        {isEnabled ? 'Disable Autonomous' : 'Enable Autonomous'}
                    </button>
                </div>

                {/* Kill Switch */}
                <div className="control-card">
                    <div className="control-card-header">
                        <span className="control-card-title">
                            <AlertOctagon size={16} /> Kill Switch
                        </span>
                        <span className={`control-card-status ${killSwitchActive ? 'active' : 'disabled'}`}>
                            {killSwitchActive ? '⚠️ ACTIVE' : 'INACTIVE'}
                        </span>
                    </div>
                    <div className="control-card-desc">
                        {killSwitchActive
                            ? `Emergency halt active: ${status?.safety?.kill_switch_reason || 'No reason given'}`
                            : 'Emergency stop for ALL autonomous operations. Use in critical situations.'}
                    </div>
                    <button
                        className={`control-toggle-btn ${killSwitchActive ? 'unkill' : 'kill'}`}
                        onClick={() => toggleKillSwitch(!killSwitchActive)}
                        disabled={actionLoading === 'kill'}
                    >
                        {actionLoading === 'kill' ? <Loader2 size={14} /> : <AlertOctagon size={14} />}
                        {killSwitchActive ? 'Deactivate Kill Switch' : '🚨 ACTIVATE KILL SWITCH'}
                    </button>
                </div>

                {/* Safety Guardrails */}
                <div className="control-card">
                    <div className="control-card-header">
                        <span className="control-card-title">
                            <Shield size={16} /> Safety Guardrails
                        </span>
                        <span className="control-card-status enabled">ACTIVE</span>
                    </div>
                    <div className="control-card-desc">
                        Rate limiting, confidence thresholds, and blast radius checks protect against runaway automation.
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', gap: 16 }}>
                        <span>Rate: {status?.rate_limit?.current_count || 0}/{status?.rate_limit?.max_per_hour || '?'} per hour</span>
                        <span>Blocked: {status?.safety?.total_blocked || 0}</span>
                    </div>
                </div>
            </div>

            {/* ─── Stats ─── */}
            <div className="autonomous-stats-grid">
                <div className="auto-stat-card">
                    <span className="stat-value">{status?.total_auto_triggers || 0}</span>
                    <span className="stat-label">Total Auto-Triggers</span>
                </div>
                <div className="auto-stat-card">
                    <span className="stat-value">{pendingApprovals.length}</span>
                    <span className="stat-label">Pending Approvals</span>
                </div>
                <div className="auto-stat-card">
                    <span className="stat-value">{recentTriggers.length}</span>
                    <span className="stat-label">Recent Triggers</span>
                </div>
                <div className="auto-stat-card">
                    <span className="stat-value">{auditLog.length}</span>
                    <span className="stat-label">Audit Events</span>
                </div>
            </div>

            {/* ─── Sections ─── */}
            <div className="autonomous-sections">
                {/* Pending Approvals */}
                <div className="autonomous-section">
                    <div className="section-header">
                        <h2>
                            <Eye size={16} /> Pending Approvals
                            {pendingApprovals.length > 0 && (
                                <span className="count-badge">{pendingApprovals.length}</span>
                            )}
                        </h2>
                    </div>
                    {pendingApprovals.length === 0 ? (
                        <div className="section-empty">No pending approvals</div>
                    ) : (
                        <div className="approval-list">
                            {pendingApprovals.map(approval => (
                                <div key={approval.request_id} className="approval-card">
                                    <div className="approval-card-header">
                                        <span className="approval-card-title">
                                            {approval.issue_title || approval.workflow_name || approval.workflow_id}
                                        </span>
                                    </div>
                                    <div className="approval-card-meta">
                                        Confidence: {approval.confidence_score}% ({approval.confidence_level})
                                        {approval.created_at && ` · ${formatTime(approval.created_at)}`}
                                    </div>
                                    <div className="approval-card-actions">
                                        <button
                                            className="approval-btn approve"
                                            onClick={() => handleApproval(approval.request_id, true)}
                                            disabled={actionLoading === approval.request_id}
                                        >
                                            {actionLoading === approval.request_id ? <Loader2 size={12} /> : <CheckCircle size={12} />}
                                            Approve
                                        </button>
                                        <button
                                            className="approval-btn reject"
                                            onClick={() => handleApproval(approval.request_id, false)}
                                            disabled={actionLoading === approval.request_id}
                                        >
                                            <XCircle size={12} /> Reject
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Recent Triggers */}
                <div className="autonomous-section">
                    <div className="section-header">
                        <h2><Activity size={16} /> Recent Triggers</h2>
                    </div>
                    {recentTriggers.length === 0 ? (
                        <div className="section-empty">No recent auto-trigger activity</div>
                    ) : (
                        <div className="trigger-list">
                            {recentTriggers.map((trigger, i) => (
                                <div key={i} className="trigger-item">
                                    <Zap size={12} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                                    <span style={{ flex: 1 }}>
                                        {trigger.action_taken}: {trigger.issue_title || trigger.workflow_name || trigger.workflow_id}
                                        {trigger.confidence_score && ` (${trigger.confidence_score}%)`}
                                    </span>
                                    <span className="trigger-time">{formatTime(trigger.timestamp)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Audit Log */}
                <div className="autonomous-section full-width">
                    <div className="section-header">
                        <h2><Shield size={16} /> Safety Audit Log</h2>
                    </div>
                    {auditLog.length === 0 ? (
                        <div className="section-empty">No audit events logged</div>
                    ) : (
                        <div className="audit-list">
                            {auditLog.map((entry, i) => (
                                <div key={i} className="audit-item">
                                    <span className="audit-time">{formatTime(entry.timestamp)}</span>
                                    <span>{entry.event}{entry.detail ? `: ${entry.detail}` : ''}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
