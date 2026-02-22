/**
 * Alerts Page — FULLY REAL, ZERO MOCKS
 * 
 * Real-time monitoring alerts wired to Brain backend:
 * - GET /api/active-alerts → real active alerts + history from PostgreSQL
 * - POST /api/diagnose-alert → real AI diagnosis via Cerebras
 * - POST /api/create-incident → create real incident from alert
 * - POST /api/reject-alert → reject alert remediation
 * 
 * Features:
 * - Active alerts vs History tabs
 * - AI-powered alert diagnosis
 * - One-click: Approve (→ creates incident) or Reject
 * - Severity-based visual hierarchy
 */

import { useState, useCallback } from 'react';
import { useApiCall } from '../hooks/useApiCall';
import {
    Bell,
    AlertTriangle,
    AlertCircle,
    AlertOctagon,
    CheckCircle,
    XCircle,
    RefreshCw,
    Clock,
    Loader2,
    Bot,
    Zap,
    Info,
} from '../components/Icons';
import './Alerts.css';

const BRAIN_API = 'http://localhost:8000';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ActiveAlert {
    id: string;
    metric_name: string;
    severity: string;
    current_value: number;
    threshold: number;
    category: string;
    description?: string;
    remediation_proposed?: string;
    triggered_at: string;
    resolved: boolean;
}

interface HistoryAlert {
    id: string;
    metric_name: string;
    description?: string;
    remediation_proposed?: string;
    status: string;
    triggered_at: string;
}

interface DiagnosisResult {
    analysis: string;
    root_cause: string;
    remediation: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getSeverityIcon(severity: string) {
    switch (severity?.toUpperCase()) {
        case 'CRITICAL': return <AlertOctagon size={16} />;
        case 'HIGH':
        case 'WARNING': return <AlertTriangle size={16} />;
        case 'MEDIUM': return <AlertCircle size={16} />;
        default: return <Info size={16} />;
    }
}

function formatTime(iso: string) {
    try {
        return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AlertsPage() {
    const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
    const [diagnosing, setDiagnosing] = useState<string | null>(null);
    const [diagnoses, setDiagnoses] = useState<Record<string, DiagnosisResult>>({});
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    // Fetch REAL alerts from Brain
    const { data: alertsData, loading, error, refresh } = useApiCall(
        () => fetch(`${BRAIN_API}/api/active-alerts`).then(async res => {
            if (!res.ok) throw new Error(`Alerts unavailable: ${res.status}`);
            return res.json();
        }),
        { refreshInterval: 15000 }
    );

    const activeAlerts: ActiveAlert[] = alertsData?.active || [];
    const historyAlerts: HistoryAlert[] = alertsData?.history || [];

    // Stats
    const stats = {
        active: activeAlerts.length,
        critical: activeAlerts.filter(a => a.severity?.toUpperCase() === 'CRITICAL').length,
        resolved: historyAlerts.length,
    };

    // Diagnose an alert with AI
    const diagnoseAlert = useCallback(async (alert: ActiveAlert) => {
        setDiagnosing(alert.id);
        try {
            const res = await fetch(`${BRAIN_API}/api/diagnose-alert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    alert_id: alert.id,
                    metric_name: alert.metric_name,
                    current_value: alert.current_value,
                    threshold: alert.threshold,
                    metadata: { category: alert.category },
                }),
            });
            if (!res.ok) throw new Error('Diagnosis failed');
            const data: DiagnosisResult = await res.json();
            setDiagnoses(prev => ({ ...prev, [alert.id]: data }));
        } catch {
            setDiagnoses(prev => ({
                ...prev,
                [alert.id]: {
                    analysis: 'AI diagnosis unavailable',
                    root_cause: 'Unable to reach Brain AI service',
                    remediation: 'Check if Brain service is running on port 8000',
                },
            }));
        } finally {
            setDiagnosing(null);
        }
    }, []);

    // Approve alert → creates real incident
    const approveAlert = useCallback(async (alert: ActiveAlert) => {
        setActionLoading(alert.id);
        try {
            const diagnosis = diagnoses[alert.id];
            const res = await fetch(`${BRAIN_API}/api/create-incident`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: alert.metric_name,
                    description: `${alert.description || ''}\nValue: ${alert.current_value}, Threshold: ${alert.threshold}`,
                    severity: alert.severity || 'WARNING',
                    alert_id: alert.id,
                    remediation_plan: diagnosis?.remediation || alert.remediation_proposed || 'Manual investigation required',
                }),
            });
            if (!res.ok) throw new Error('Failed to create incident');
            refresh();
        } catch (err) {
            console.error('Approve error:', err);
        } finally {
            setActionLoading(null);
        }
    }, [diagnoses, refresh]);

    // Reject alert
    const rejectAlert = useCallback(async (alert: ActiveAlert) => {
        setActionLoading(alert.id);
        try {
            const res = await fetch(`${BRAIN_API}/api/reject-alert`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    alert_id: alert.id,
                    metric_name: alert.metric_name,
                    reason: 'Rejected from Alerts dashboard',
                    description: alert.description,
                }),
            });
            if (!res.ok) throw new Error('Reject failed');
            refresh();
        } catch (err) {
            console.error('Reject error:', err);
        } finally {
            setActionLoading(null);
        }
    }, [refresh]);

    return (
        <div className="alerts-page">
            {/* ─── Header ─── */}
            <div className="alerts-page-header">
                <h1>
                    <Bell size={22} className="icon" />
                    Monitoring Alerts
                </h1>
                <div className="alerts-header-actions">
                    <button className="alert-action-btn" onClick={refresh}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
            </div>

            {/* ─── Stats ─── */}
            <div className="alerts-stats-row">
                <div className="alert-stat-card critical">
                    <span className="stat-value">{stats.critical}</span>
                    <span className="stat-label">Critical</span>
                </div>
                <div className="alert-stat-card active">
                    <span className="stat-value">{stats.active}</span>
                    <span className="stat-label">Active Alerts</span>
                </div>
                <div className="alert-stat-card history">
                    <span className="stat-value">{stats.resolved}</span>
                    <span className="stat-label">Resolved (History)</span>
                </div>
            </div>

            {/* ─── Tabs ─── */}
            <div className="alerts-tabs">
                <button
                    className={`alerts-tab ${activeTab === 'active' ? 'active' : ''}`}
                    onClick={() => setActiveTab('active')}
                >
                    Active ({activeAlerts.length})
                </button>
                <button
                    className={`alerts-tab ${activeTab === 'history' ? 'active' : ''}`}
                    onClick={() => setActiveTab('history')}
                >
                    History ({historyAlerts.length})
                </button>
            </div>

            {/* ─── Content ─── */}
            {loading && !alertsData ? (
                <div className="alerts-list">
                    {[1, 2, 3].map(i => <div key={i} className="alert-skeleton" />)}
                </div>
            ) : error ? (
                <div className="alerts-error">
                    <p className="error-text">{error}</p>
                    <button className="retry-btn" onClick={refresh}>Retry</button>
                </div>
            ) : activeTab === 'active' ? (
                activeAlerts.length === 0 ? (
                    <div className="alerts-empty">
                        <CheckCircle size={40} className="empty-icon" />
                        <h3>All Clear</h3>
                        <p>No active alerts — all systems operating normally.</p>
                    </div>
                ) : (
                    <div className="alerts-list">
                        {activeAlerts.map(alert => (
                            <div key={alert.id} className="alert-card">
                                <div className="alert-card-header">
                                    <span className={`alert-severity-icon ${alert.severity?.toUpperCase() || 'INFO'}`}>
                                        {getSeverityIcon(alert.severity)}
                                    </span>
                                    <span className="alert-card-title">{alert.metric_name}</span>
                                    <span className="alert-card-time">
                                        <Clock size={12} /> {formatTime(alert.triggered_at)}
                                    </span>
                                </div>

                                <div className="alert-card-details">
                                    <span className="alert-card-detail">Value: {alert.current_value?.toFixed?.(1) ?? alert.current_value}</span>
                                    <span className="alert-card-detail">Threshold: {alert.threshold}</span>
                                    <span className="alert-card-detail">Category: {alert.category}</span>
                                </div>

                                {/* Diagnosis */}
                                {diagnoses[alert.id] && (
                                    <div className="alert-diagnosis">
                                        <div className="alert-diagnosis-header">
                                            <Bot size={12} /> AI Diagnosis
                                        </div>
                                        <div><strong>Analysis:</strong> {diagnoses[alert.id].analysis}</div>
                                        <div><strong>Root Cause:</strong> {diagnoses[alert.id].root_cause}</div>
                                        <div><strong>Remediation:</strong> {diagnoses[alert.id].remediation}</div>
                                    </div>
                                )}

                                <div className="alert-card-actions">
                                    {!diagnoses[alert.id] && (
                                        <button
                                            className="alert-action-btn"
                                            onClick={() => diagnoseAlert(alert)}
                                            disabled={diagnosing === alert.id}
                                        >
                                            {diagnosing === alert.id ? <Loader2 size={12} /> : <Zap size={12} />}
                                            Diagnose with AI
                                        </button>
                                    )}
                                    <button
                                        className="alert-action-btn approve"
                                        onClick={() => approveAlert(alert)}
                                        disabled={actionLoading === alert.id}
                                    >
                                        {actionLoading === alert.id ? <Loader2 size={12} /> : <CheckCircle size={12} />}
                                        Approve → Incident
                                    </button>
                                    <button
                                        className="alert-action-btn reject"
                                        onClick={() => rejectAlert(alert)}
                                        disabled={actionLoading === alert.id}
                                    >
                                        <XCircle size={12} /> Reject
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )
            ) : (
                /* ─── History Tab ─── */
                historyAlerts.length === 0 ? (
                    <div className="alerts-empty">
                        <Info size={40} className="empty-icon" />
                        <h3>No Alert History</h3>
                        <p>Resolved and rejected alerts will appear here.</p>
                    </div>
                ) : (
                    <div className="alerts-list">
                        {historyAlerts.map(alert => (
                            <div key={alert.id} className="alert-card resolved">
                                <div className="alert-card-header">
                                    <span className="alert-severity-icon INFO">
                                        <CheckCircle size={16} />
                                    </span>
                                    <span className="alert-card-title">{alert.metric_name}</span>
                                    <span className="alert-card-time">
                                        <Clock size={12} /> {formatTime(alert.triggered_at)}
                                    </span>
                                </div>
                                <div className="alert-card-details">
                                    <span className="alert-card-detail">Status: {alert.status}</span>
                                    {alert.description && <span className="alert-card-detail">{alert.description}</span>}
                                </div>
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
}
