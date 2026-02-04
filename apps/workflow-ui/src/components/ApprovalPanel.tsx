/**
 * Approval Panel - Human Approval Gate UI
 * Shows pending approvals and allows approve/reject actions
 */

import { useState, useEffect } from 'react';
import { Check, X, Clock, Shield, RefreshCw, User, AlertTriangle } from 'lucide-react';
import workflowApi, { type ApiApprovalRequest } from '../services/api';

interface ApprovalPanelProps {
    onApprovalComplete?: () => void;
}

const ApprovalPanel = ({ onApprovalComplete }: ApprovalPanelProps) => {
    const [approvals, setApprovals] = useState<ApiApprovalRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedApproval, setSelectedApproval] = useState<ApiApprovalRequest | null>(null);
    const [comment, setComment] = useState('');
    const [processing, setProcessing] = useState(false);

    const fetchApprovals = async () => {
        try {
            setLoading(true);
            const response = await workflowApi.getPendingApprovals();
            setApprovals(response.approvals || []);
        } catch (error) {
            console.error('Failed to fetch approvals:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchApprovals();
        // Poll for new approvals every 30 seconds
        const interval = setInterval(fetchApprovals, 30000);
        return () => clearInterval(interval);
    }, []);

    const handleApprove = async (approval: ApiApprovalRequest) => {
        try {
            setProcessing(true);
            await workflowApi.approveExecution(approval.execution_id, comment);
            setApprovals(approvals.filter(a => a.id !== approval.id));
            setSelectedApproval(null);
            setComment('');
            onApprovalComplete?.();
        } catch (error) {
            console.error('Failed to approve:', error);
            alert('Failed to approve. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    const handleReject = async (approval: ApiApprovalRequest) => {
        try {
            setProcessing(true);
            await workflowApi.rejectExecution(approval.execution_id, comment);
            setApprovals(approvals.filter(a => a.id !== approval.id));
            setSelectedApproval(null);
            setComment('');
            onApprovalComplete?.();
        } catch (error) {
            console.error('Failed to reject:', error);
            alert('Failed to reject. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    const getTimeRemaining = (expiresAt: string): string => {
        const now = new Date();
        const expires = new Date(expiresAt);
        const diff = expires.getTime() - now.getTime();

        if (diff < 0) return 'Expired';

        const minutes = Math.floor(diff / 60000);
        if (minutes < 60) return `${minutes}m remaining`;

        const hours = Math.floor(minutes / 60);
        return `${hours}h ${minutes % 60}m remaining`;
    };

    const isUrgent = (expiresAt: string): boolean => {
        const now = new Date();
        const expires = new Date(expiresAt);
        const diff = expires.getTime() - now.getTime();
        return diff < 600000; // Less than 10 minutes
    };

    return (
        <div className="approval-panel">
            <div className="approval-header">
                <div className="approval-title">
                    <Shield size={20} />
                    Pending Approvals
                    {approvals.length > 0 && (
                        <span className="approval-badge">{approvals.length}</span>
                    )}
                </div>
                <button className="btn btn-icon" onClick={fetchApprovals} disabled={loading}>
                    <RefreshCw size={16} className={loading ? 'spin' : ''} />
                </button>
            </div>

            <div className="approval-content">
                {loading && approvals.length === 0 && (
                    <div className="approval-loading">
                        <RefreshCw size={24} className="spin" />
                        <span>Loading approvals...</span>
                    </div>
                )}

                {!loading && approvals.length === 0 && (
                    <div className="approval-empty">
                        <Check size={48} />
                        <div className="approval-empty-title">All Clear!</div>
                        <div className="approval-empty-desc">No pending approvals at this time</div>
                    </div>
                )}

                {approvals.map((approval) => (
                    <div
                        key={approval.id}
                        className={`approval-card ${isUrgent(approval.expires_at) ? 'urgent' : ''} ${selectedApproval?.id === approval.id ? 'selected' : ''}`}
                        onClick={() => setSelectedApproval(approval)}
                    >
                        <div className="approval-card-header">
                            <div className="approval-workflow-name">{approval.workflow_name}</div>
                            <div className={`approval-timer ${isUrgent(approval.expires_at) ? 'urgent' : ''}`}>
                                <Clock size={14} />
                                {getTimeRemaining(approval.expires_at)}
                            </div>
                        </div>

                        <div className="approval-card-body">
                            <div className="approval-node-label">
                                <AlertTriangle size={14} />
                                {approval.node_label}
                            </div>
                            {approval.description && (
                                <div className="approval-description">{approval.description}</div>
                            )}
                        </div>

                        <div className="approval-card-footer">
                            <div className="approval-approvers">
                                <User size={14} />
                                {approval.approvers.join(', ')}
                            </div>
                            <div className="approval-actions">
                                <button
                                    className="btn btn-approve"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleApprove(approval);
                                    }}
                                    disabled={processing}
                                >
                                    <Check size={16} />
                                    Approve
                                </button>
                                <button
                                    className="btn btn-reject"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleReject(approval);
                                    }}
                                    disabled={processing}
                                >
                                    <X size={16} />
                                    Reject
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Detail Modal */}
            {selectedApproval && (
                <div className="approval-modal-overlay" onClick={() => setSelectedApproval(null)}>
                    <div className="approval-modal" onClick={e => e.stopPropagation()}>
                        <div className="approval-modal-header">
                            <h3>Review Approval Request</h3>
                            <button className="btn btn-icon" onClick={() => setSelectedApproval(null)}>
                                <X size={18} />
                            </button>
                        </div>

                        <div className="approval-modal-body">
                            <div className="approval-detail">
                                <label>Workflow</label>
                                <div>{selectedApproval.workflow_name}</div>
                            </div>

                            <div className="approval-detail">
                                <label>Action</label>
                                <div>{selectedApproval.node_label}</div>
                            </div>

                            <div className="approval-detail">
                                <label>Execution ID</label>
                                <div className="mono">{selectedApproval.execution_id}</div>
                            </div>

                            <div className="approval-detail">
                                <label>Requested</label>
                                <div>{new Date(selectedApproval.requested_at).toLocaleString()}</div>
                            </div>

                            <div className="approval-detail">
                                <label>Expires</label>
                                <div className={isUrgent(selectedApproval.expires_at) ? 'urgent-text' : ''}>
                                    {new Date(selectedApproval.expires_at).toLocaleString()}
                                    ({getTimeRemaining(selectedApproval.expires_at)})
                                </div>
                            </div>

                            {selectedApproval.description && (
                                <div className="approval-detail">
                                    <label>Description</label>
                                    <div>{selectedApproval.description}</div>
                                </div>
                            )}

                            {Object.keys(selectedApproval.context).length > 0 && (
                                <div className="approval-detail">
                                    <label>Context</label>
                                    <pre className="approval-context">
                                        {JSON.stringify(selectedApproval.context, null, 2)}
                                    </pre>
                                </div>
                            )}

                            <div className="approval-comment">
                                <label>Comment (optional)</label>
                                <textarea
                                    value={comment}
                                    onChange={(e) => setComment(e.target.value)}
                                    placeholder="Add a comment for the audit log..."
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="approval-modal-footer">
                            <button
                                className="btn btn-reject"
                                onClick={() => handleReject(selectedApproval)}
                                disabled={processing}
                            >
                                <X size={16} />
                                Reject
                            </button>
                            <button
                                className="btn btn-approve"
                                onClick={() => handleApprove(selectedApproval)}
                                disabled={processing}
                            >
                                <Check size={16} />
                                Approve & Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ApprovalPanel;
