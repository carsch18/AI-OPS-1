/**
 * Live Issue Feed - Real-time issue stream
 */

import type { WebSocketEvent } from '../../hooks/useWebSocket';
import { EventTypes } from '../../hooks/useRealtimeEvents';
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
            case 'site_downtime': return '🔴';
            case 'http_5xx_spike': return '🔥';
            case 'high_cpu': return '💻';
            case 'high_memory': return '💾';
            case 'disk_full': return '📀';
            case 'latency_spike': return '⏱️';
            case 'connection_pool_exhausted': return '🔌';
            case 'ddos_attack': return '🛡️';
            default: return '⚠️';
        }
    };

    // Filter to only issue detected events
    const detectedIssues = issues.filter(i => i.event_type === EventTypes.ISSUE_DETECTED);

    return (
        <div className="live-issue-feed">
            <h3>🔥 Live Issues</h3>

            {detectedIssues.length === 0 ? (
                <div className="empty-state">
                    <span className="empty-icon">✅</span>
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
                                <button className="issue-action">Remediate →</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
