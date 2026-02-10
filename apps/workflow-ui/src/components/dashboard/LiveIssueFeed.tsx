/**
 * Live Issue Feed - Real-time issue stream
 */

import type { WebSocketEvent } from '../../hooks/useWebSocket';
import { EventTypes } from '../../hooks/useRealtimeEvents';
import {
    Flame,
    AlertCircle,
    CheckCircle,
    Cpu,
    MemoryStick,
    HardDrive,
    Clock,
    Plug,
    Shield,
    AlertTriangle,
    ArrowRight,
} from '../Icons';
import './Dashboard.css';

interface LiveIssueFeedProps {
    issues: WebSocketEvent[];
}

export default function LiveIssueFeed({ issues }: LiveIssueFeedProps) {
    const getSeverityColor = (severity: string) => {
        switch (severity?.toLowerCase()) {
            case 'critical': return '#ef4444';
            case 'high': return '#f97316';
            case 'medium': return '#f59e0b';
            case 'low': return '#10b981';
            default: return '#6b7280';
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'site_downtime': return <AlertCircle size={16} color="#ef4444" />;
            case 'http_5xx_spike': return <Flame size={16} color="#f97316" />;
            case 'high_cpu': return <Cpu size={16} color="#8b5cf6" />;
            case 'high_memory': return <MemoryStick size={16} color="#3b82f6" />;
            case 'disk_full': return <HardDrive size={16} color="#f59e0b" />;
            case 'latency_spike': return <Clock size={16} color="#f59e0b" />;
            case 'connection_pool_exhausted': return <Plug size={16} color="#ef4444" />;
            case 'ddos_attack': return <Shield size={16} color="#dc2626" />;
            default: return <AlertTriangle size={16} color="#6b7280" />;
        }
    };

    // Filter to only issue detected events
    const detectedIssues = issues.filter(i => i.event_type === EventTypes.ISSUE_DETECTED);

    return (
        <div className="live-issue-feed">
            <h3><Flame size={18} /> Live Issues</h3>

            {detectedIssues.length === 0 ? (
                <div className="empty-state">
                    <span className="empty-icon"><CheckCircle size={48} color="#10b981" /></span>
                    <p>All systems operational</p>
                    <span className="empty-subtitle">No active issues detected</span>
                </div>
            ) : (
                <div className="issue-list">
                    {detectedIssues.slice(0, 10).map((issue, idx) => (
                        <div
                            key={idx}
                            className="issue-card"
                            style={{ borderLeftColor: getSeverityColor(issue.data.severity) }}
                        >
                            <div className="issue-header">
                                <span className="issue-icon">{getIcon(issue.data.issue_type)}</span>
                                <span className="issue-type">{issue.data.issue_type?.replace(/_/g, ' ')}</span>
                                <span
                                    className="issue-severity"
                                    style={{
                                        background: `${getSeverityColor(issue.data.severity)}20`,
                                        color: getSeverityColor(issue.data.severity)
                                    }}
                                >
                                    {issue.data.severity}
                                </span>
                            </div>

                            <p className="issue-message">{issue.data.message}</p>

                            <div className="issue-footer">
                                <span className="issue-time">
                                    {new Date(issue.timestamp).toLocaleTimeString()}
                                </span>
                                <button className="issue-action">Remediate <ArrowRight size={14} /></button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
