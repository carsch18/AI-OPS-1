/**
 * Active Executions - Real-time workflow execution tracker
 */

import type { WebSocketEvent } from '../../hooks/useWebSocket';
import { EventTypes } from '../../hooks/useRealtimeEvents';
import {
    Zap,
    Play,
    CheckCircle,
    XCircle,
    Pause,
    RotateCw,
    FileText,
    Moon,
} from '../Icons';
import './Dashboard.css';

interface ActiveExecutionsProps {
    executions: WebSocketEvent[];
}

interface ExecutionState {
    id: string;
    workflowName: string;
    status: 'running' | 'completed' | 'failed';
    currentNode?: string;
    progress: number;
    startTime: Date;
    nodes: { id: string; label: string; status: string }[];
}

export default function ActiveExecutions({ executions }: ActiveExecutionsProps) {
    // Group events by execution ID
    const executionMap = new Map<string, ExecutionState>();

    executions.forEach(event => {
        const execId = event.data.execution_id;
        if (!execId) return;

        if (!executionMap.has(execId)) {
            executionMap.set(execId, {
                id: execId,
                workflowName: event.data.workflow_name || 'Unknown Workflow',
                status: 'running',
                progress: 0,
                startTime: new Date(event.timestamp),
                nodes: [],
            });
        }

        const state = executionMap.get(execId)!;

        switch (event.event_type) {
            case EventTypes.EXECUTION_STARTED:
                state.status = 'running';
                state.workflowName = event.data.workflow_name || state.workflowName;
                break;
            case EventTypes.EXECUTION_PROGRESS:
                state.currentNode = event.data.node_label;
                state.progress = event.data.progress_percent || state.progress;
                break;
            case EventTypes.NODE_STARTED:
                state.currentNode = event.data.node_label;
                state.nodes.push({
                    id: event.data.node_id,
                    label: event.data.node_label,
                    status: 'running',
                });
                break;
            case EventTypes.NODE_COMPLETED:
                const node = state.nodes.find(n => n.id === event.data.node_id);
                if (node) node.status = 'completed';
                break;
            case EventTypes.NODE_FAILED:
                const failedNode = state.nodes.find(n => n.id === event.data.node_id);
                if (failedNode) failedNode.status = 'failed';
                break;
            case EventTypes.EXECUTION_COMPLETED:
                state.status = 'completed';
                state.progress = 100;
                break;
            case EventTypes.EXECUTION_FAILED:
                state.status = 'failed';
                break;
        }
    });

    // Get active (running) executions
    const activeExecutions = Array.from(executionMap.values())
        .filter(e => e.status === 'running')
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Get recent completed/failed
    const recentCompleted = Array.from(executionMap.values())
        .filter(e => e.status !== 'running')
        .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        .slice(0, 5);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'running': return <Play size={16} color="#3b82f6" />;
            case 'completed': return <CheckCircle size={16} color="#10b981" />;
            case 'failed': return <XCircle size={16} color="#ef4444" />;
            default: return <Pause size={16} color="#6b7280" />;
        }
    };

    return (
        <div className="active-executions">
            <h3><Zap size={18} /> Active Executions</h3>

            {activeExecutions.length === 0 && recentCompleted.length === 0 ? (
                <div className="empty-state">
                    <span className="empty-icon"><Moon size={48} color="#6b7280" /></span>
                    <p>No active executions</p>
                    <span className="empty-subtitle">Workflows will appear here when running</span>
                </div>
            ) : (
                <>
                    {/* Active Executions */}
                    {activeExecutions.length > 0 && (
                        <div className="execution-section">
                            <h4><RotateCw size={16} /> Running</h4>
                            <div className="execution-list">
                                {activeExecutions.map(exec => (
                                    <div key={exec.id} className="execution-card running">
                                        <div className="execution-header">
                                            <span className="execution-icon">{getStatusIcon(exec.status)}</span>
                                            <span className="execution-name">{exec.workflowName}</span>
                                        </div>

                                        <div className="execution-progress">
                                            <div
                                                className="progress-bar"
                                                style={{ width: `${exec.progress}%` }}
                                            />
                                        </div>

                                        {exec.currentNode && (
                                            <div className="execution-node">
                                                <span className="node-label">Current: {exec.currentNode}</span>
                                            </div>
                                        )}

                                        <div className="execution-footer">
                                            <span className="execution-time">
                                                Started {exec.startTime.toLocaleTimeString()}
                                            </span>
                                            <span className="execution-id">
                                                {exec.id.slice(0, 8)}...
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Recent Completed */}
                    {recentCompleted.length > 0 && (
                        <div className="execution-section">
                            <h4><FileText size={16} /> Recent</h4>
                            <div className="execution-list mini">
                                {recentCompleted.map(exec => (
                                    <div key={exec.id} className={`execution-card mini ${exec.status}`}>
                                        <span className="execution-icon">{getStatusIcon(exec.status)}</span>
                                        <span className="execution-name">{exec.workflowName}</span>
                                        <span className="execution-time">
                                            {exec.startTime.toLocaleTimeString()}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
