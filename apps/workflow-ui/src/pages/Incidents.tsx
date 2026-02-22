/**
 * Incidents Page — FULLY REAL, ZERO MOCKS
 * 
 * Full incident lifecycle management wired to Brain backend:
 * - GET /incidents → real incident list from PostgreSQL
 * - GET /incidents/{id}/rca → real AI-generated Root Cause Analysis
 * - POST /incidents/{id}/status → real status transitions
 * 
 * Features:
 * - Incident list with severity + status filtering
 * - Stats dashboard (active, investigating, mitigating, resolved)
 * - Detail modal with AI Root Cause Analysis
 * - Status transitions (Investigate → Mitigate → Resolve)
 */

import { useState, useCallback } from 'react';
import { useApiCall } from '../hooks/useApiCall';
import {
    AlertTriangle,
    AlertCircle,
    AlertOctagon,
    CheckCircle,
    XCircle,
    Search,
    Eye,
    RefreshCw,
    Clock,
    Loader2,
    Bot,
    X,
    Zap,
} from '../components/Icons';
import './Incidents.css';

const BRAIN_API = 'http://localhost:8000';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface Incident {
    id: string;
    title: string;
    description?: string;
    severity: string;
    status: string;
    root_cause?: string;
    resolution?: string;
    created_at: string;
    closed_at?: string;
    source?: string;
    services_affected?: string[];
    timeline?: TimelineEvent[];
}

interface TimelineEvent {
    timestamp: string;
    event: string;
    detail: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function IncidentsPage() {
    const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>('ALL');
    const [searchQuery, setSearchQuery] = useState('');
    const [rcaContent, setRcaContent] = useState<string | null>(null);
    const [rcaLoading, setRcaLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Fetch REAL incidents from Brain
    const { data: incidentsData, loading, error, refresh } = useApiCall(
        () => fetch(`${BRAIN_API}/incidents`).then(async res => {
            if (!res.ok) throw new Error(`Incidents unavailable: ${res.status}`);
            return res.json();
        }),
        { refreshInterval: 30000 }
    );

    const incidents: Incident[] = incidentsData?.incidents || [];

    // Derived stats
    const stats = {
        total: incidents.length,
        open: incidents.filter(i => i.status === 'OPEN').length,
        investigating: incidents.filter(i => i.status === 'INVESTIGATING').length,
        mitigating: incidents.filter(i => i.status === 'MITIGATING').length,
        resolved: incidents.filter(i => ['RESOLVED', 'CLOSED'].includes(i.status)).length,
    };

    // Filter incidents
    const filtered = incidents.filter(inc => {
        if (statusFilter !== 'ALL' && inc.status !== statusFilter) return false;
        if (searchQuery && !inc.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        return true;
    });

    const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || null;

    // Fetch AI Root Cause Analysis
    const fetchRCA = useCallback(async (incidentId: string) => {
        setRcaLoading(true);
        setRcaContent(null);
        try {
            const res = await fetch(`${BRAIN_API}/incidents/${incidentId}/rca`);
            if (!res.ok) throw new Error(`RCA unavailable`);
            const data = await res.json();
            setRcaContent(typeof data.rca === 'string' ? data.rca : JSON.stringify(data.rca, null, 2));
        } catch {
            setRcaContent('RCA generation failed — Brain service may not have enough context for this incident.');
        } finally {
            setRcaLoading(false);
        }
    }, []);

    // Update incident status
    const updateStatus = useCallback(async (incidentId: string, newStatus: string) => {
        setActionLoading(true);
        try {
            const res = await fetch(`${BRAIN_API}/incidents/${incidentId}/status?status=${newStatus}&note=Updated from UI`, {
                method: 'POST',
            });
            if (!res.ok) throw new Error(`Status update failed`);
            refresh();
        } catch (err) {
            console.error('Status update error:', err);
        } finally {
            setActionLoading(false);
        }
    }, [refresh]);

    // Open detail modal
    const openDetail = useCallback((incident: Incident) => {
        setSelectedIncidentId(incident.id);
        setRcaContent(null);
    }, []);

    const formatDate = (iso: string) => {
        try {
            return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return iso; }
    };

    return (
        <div className="incidents-page">
            {/* ─── Header ─── */}
            <div className="incidents-page-header">
                <h1>
                    <AlertTriangle size={22} className="icon" />
                    Incident Management
                </h1>
                <button className="incident-filter-btn" onClick={refresh}>
                    <RefreshCw size={14} /> Refresh
                </button>
            </div>

            {/* ─── Stats Row ─── */}
            <div className="incident-stats-row">
                <div className="incident-stat-card active">
                    <span className="stat-value">{stats.open}</span>
                    <span className="stat-label">Open</span>
                </div>
                <div className="incident-stat-card warning">
                    <span className="stat-value">{stats.investigating}</span>
                    <span className="stat-label">Investigating</span>
                </div>
                <div className="incident-stat-card critical">
                    <span className="stat-value">{stats.mitigating}</span>
                    <span className="stat-label">Mitigating</span>
                </div>
                <div className="incident-stat-card resolved">
                    <span className="stat-value">{stats.resolved}</span>
                    <span className="stat-label">Resolved</span>
                </div>
            </div>

            {/* ─── Filters ─── */}
            <div className="incident-filters">
                {['ALL', 'OPEN', 'INVESTIGATING', 'MITIGATING', 'RESOLVED', 'CLOSED'].map(s => (
                    <button
                        key={s}
                        className={`incident-filter-btn ${statusFilter === s ? 'active' : ''}`}
                        onClick={() => setStatusFilter(s)}
                    >
                        {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
                    </button>
                ))}

                <div style={{ flex: 1 }} />

                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <Search size={14} style={{ position: 'absolute', left: 10, color: '#64748b' }} />
                    <input
                        type="text"
                        placeholder="Search incidents..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{
                            padding: '8px 12px 8px 32px',
                            borderRadius: 8,
                            border: '1px solid rgba(255,255,255,0.08)',
                            background: 'rgba(255,255,255,0.03)',
                            color: '#f0f0f5',
                            fontSize: 13,
                            outline: 'none',
                            width: 200,
                        }}
                    />
                </div>
            </div>

            {/* ─── Content ─── */}
            {loading && !incidentsData ? (
                <div className="incidents-list">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="incident-skeleton" />
                    ))}
                </div>
            ) : error ? (
                <div className="incidents-error">
                    <p className="error-text">{error}</p>
                    <button className="retry-btn" onClick={refresh}>Retry</button>
                </div>
            ) : filtered.length === 0 ? (
                <div className="incidents-empty">
                    <CheckCircle size={40} className="empty-icon" />
                    <h3>{incidents.length === 0 ? 'No Incidents Recorded' : 'No Matching Incidents'}</h3>
                    <p>{incidents.length === 0 ? 'The system is running clean — no incidents detected.' : 'Try adjusting your filters.'}</p>
                </div>
            ) : (
                <div className="incidents-list">
                    {filtered.map(incident => (
                        <div
                            key={incident.id}
                            className="incident-card"
                            onClick={() => openDetail(incident)}
                        >
                            <div className={`incident-severity-dot ${incident.severity}`} />
                            <div className="incident-card-body">
                                <div className="incident-card-title">{incident.title}</div>
                                <div className="incident-card-meta">
                                    <span>{incident.severity}</span>
                                    <span>·</span>
                                    <Clock size={12} />
                                    <span>{formatDate(incident.created_at)}</span>
                                    {incident.source && (
                                        <>
                                            <span>·</span>
                                            <span>Source: {incident.source}</span>
                                        </>
                                    )}
                                </div>
                            </div>
                            <span className={`incident-status-badge ${incident.status}`}>
                                {incident.status}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── Detail Modal ─── */}
            {selectedIncident && (
                <div className="incident-modal-overlay" onClick={() => setSelectedIncidentId(null)}>
                    <div className="incident-modal" onClick={e => e.stopPropagation()}>
                        <div className="incident-modal-header">
                            <div className="incident-modal-title">
                                <span className={`incident-severity-dot ${selectedIncident.severity}`} style={{ display: 'inline-block', marginRight: 10 }} />
                                {selectedIncident.title}
                            </div>
                            <button className="incident-modal-close" onClick={() => setSelectedIncidentId(null)}>
                                <X size={16} />
                            </button>
                        </div>

                        <div className="incident-detail-section">
                            <h3>Status & Severity</h3>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <span className={`incident-status-badge ${selectedIncident.status}`}>{selectedIncident.status}</span>
                                <span style={{ fontSize: 13, color: '#94a3b8' }}>Severity: {selectedIncident.severity}</span>
                                <span style={{ fontSize: 13, color: '#64748b' }}>· Created {formatDate(selectedIncident.created_at)}</span>
                            </div>
                        </div>

                        {selectedIncident.description && (
                            <div className="incident-detail-section">
                                <h3>Description</h3>
                                <p>{selectedIncident.description}</p>
                            </div>
                        )}

                        {selectedIncident.root_cause && (
                            <div className="incident-detail-section">
                                <h3>Root Cause</h3>
                                <p>{selectedIncident.root_cause}</p>
                            </div>
                        )}

                        {/* AI Root Cause Analysis */}
                        <div className="incident-detail-section">
                            <h3>
                                <Bot size={14} style={{ marginRight: 6 }} />
                                AI Root Cause Analysis
                            </h3>
                            {rcaContent ? (
                                <div className="incident-rca-content">{rcaContent}</div>
                            ) : rcaLoading ? (
                                <div className="incident-rca-loading">
                                    <Loader2 size={16} />
                                    Generating AI analysis with Cerebras...
                                </div>
                            ) : (
                                <button
                                    className="incident-action-btn"
                                    onClick={() => fetchRCA(selectedIncident.id)}
                                >
                                    <Zap size={14} />
                                    Generate AI RCA
                                </button>
                            )}
                        </div>

                        {/* Status Actions */}
                        <div className="incident-actions-row">
                            {selectedIncident.status === 'OPEN' && (
                                <button
                                    className="incident-action-btn"
                                    onClick={() => updateStatus(selectedIncident.id, 'INVESTIGATING')}
                                    disabled={actionLoading}
                                >
                                    <Eye size={14} /> Start Investigation
                                </button>
                            )}
                            {selectedIncident.status === 'INVESTIGATING' && (
                                <button
                                    className="incident-action-btn"
                                    onClick={() => updateStatus(selectedIncident.id, 'MITIGATING')}
                                    disabled={actionLoading}
                                >
                                    <RefreshCw size={14} /> Move to Mitigating
                                </button>
                            )}
                            {['INVESTIGATING', 'MITIGATING'].includes(selectedIncident.status) && (
                                <button
                                    className="incident-action-btn resolve"
                                    onClick={() => updateStatus(selectedIncident.id, 'RESOLVED')}
                                    disabled={actionLoading}
                                >
                                    <CheckCircle size={14} /> Resolve Incident
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
