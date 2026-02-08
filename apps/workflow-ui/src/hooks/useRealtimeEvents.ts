/**
 * useRealtimeEvents - High-level hook for real-time platform events
 * 
 * Provides filtered event streams for specific domains:
 * - Executions
 * - Issues
 * - Remediation
 * - Approvals
 * - System health
 */

import { useMemo, useCallback, useState } from 'react';
import { useWebSocket } from './useWebSocket';
import type { WebSocketEvent } from './useWebSocket';

// Event type constants
export const EventTypes = {
    // Execution events
    EXECUTION_STARTED: 'execution.started',
    EXECUTION_PROGRESS: 'execution.progress',
    EXECUTION_COMPLETED: 'execution.completed',
    EXECUTION_FAILED: 'execution.failed',
    NODE_STARTED: 'node.started',
    NODE_COMPLETED: 'node.completed',
    NODE_FAILED: 'node.failed',

    // Issue events
    ISSUE_DETECTED: 'issue.detected',
    ISSUE_ACKNOWLEDGED: 'issue.acknowledged',
    ISSUE_RESOLVED: 'issue.resolved',
    ISSUE_ESCALATED: 'issue.escalated',

    // Remediation events
    REMEDIATION_STARTED: 'remediation.started',
    REMEDIATION_COMPLETED: 'remediation.completed',
    REMEDIATION_FAILED: 'remediation.failed',
    AUTONOMOUS_TRIGGERED: 'autonomous.triggered',

    // Approval events
    APPROVAL_REQUESTED: 'approval.requested',
    APPROVAL_GRANTED: 'approval.granted',
    APPROVAL_REJECTED: 'approval.rejected',
    APPROVAL_TIMEOUT: 'approval.timeout',

    // System events
    SYSTEM_HEALTH: 'system.health',
    EXECUTOR_STATUS: 'executor.status',
    ALERT_FIRED: 'alert.fired',

    // Infrastructure events
    CONTAINER_STARTED: 'container.started',
    CONTAINER_STOPPED: 'container.stopped',
    SSH_CONNECTED: 'ssh.connected',
    SSH_DISCONNECTED: 'ssh.disconnected',
} as const;

export type EventTypeName = typeof EventTypes[keyof typeof EventTypes];

// Hook types
export interface ExecutionEvent {
    execution_id: string;
    workflow_id: string;
    workflow_name?: string;
    status?: string;
    node_id?: string;
    node_label?: string;
    progress_percent?: number;
    success?: boolean;
    duration_ms?: number;
}

export interface IssueEvent {
    issue_id: string;
    issue_type: string;
    severity: string;
    message: string;
    source?: string;
}

export interface ApprovalEvent {
    request_id: string;
    execution_id: string;
    workflow_name: string;
    node_label: string;
    requested_at: string;
    expires_at?: string;
    approved_by?: string;
    rejected_by?: string;
}

export interface AlertEvent {
    alert_id: string;
    alert_type: string;
    severity: string;
    title: string;
    message: string;
}

export interface UseRealtimeEventsOptions {
    enabled?: boolean;
    channels?: string[];
}

export interface UseRealtimeEventsReturn {
    isConnected: boolean;
    connectionState: string;

    // All events
    events: WebSocketEvent[];
    lastEvent: WebSocketEvent | null;

    // Filtered events by type
    executionEvents: WebSocketEvent[];
    issueEvents: WebSocketEvent[];
    approvalEvents: WebSocketEvent[];
    alertEvents: WebSocketEvent[];

    // Counters for badges
    newIssuesCount: number;
    pendingApprovalsCount: number;
    activeExecutionsCount: number;

    // Actions
    clearEvents: () => void;
    markIssuesSeen: () => void;
    markApprovalsSeen: () => void;
    subscribe: (channel: string) => void;
    unsubscribe: (channel: string) => void;
}

export function useRealtimeEvents(options: UseRealtimeEventsOptions = {}): UseRealtimeEventsReturn {
    const { enabled = true, channels = ['global', 'issues', 'alerts'] } = options;

    // Track "seen" counts for badge purposes
    const [seenIssuesCount, setSeenIssuesCount] = useState(0);
    const [_seenApprovalsCount, setSeenApprovalsCount] = useState(0);

    const {
        isConnected,
        connectionState,
        events,
        lastEvent,
        clearEvents,
        subscribe,
        unsubscribe,
    } = useWebSocket({
        channels,
        autoConnect: enabled,
    });

    // Filter events by type
    const executionEvents = useMemo(() =>
        events.filter(e => e.event_type.startsWith('execution.') || e.event_type.startsWith('node.')),
        [events]
    );

    const issueEvents = useMemo(() =>
        events.filter(e => e.event_type.startsWith('issue.')),
        [events]
    );

    const approvalEvents = useMemo(() =>
        events.filter(e => e.event_type.startsWith('approval.')),
        [events]
    );

    const alertEvents = useMemo(() =>
        events.filter(e => e.event_type === EventTypes.ALERT_FIRED),
        [events]
    );

    // Calculate "new" counts (unseen)
    const newIssuesCount = useMemo(() =>
        Math.max(0, issueEvents.filter(e => e.event_type === EventTypes.ISSUE_DETECTED).length - seenIssuesCount),
        [issueEvents, seenIssuesCount]
    );

    const pendingApprovalsCount = useMemo(() =>
        approvalEvents.filter(e => e.event_type === EventTypes.APPROVAL_REQUESTED).length -
        approvalEvents.filter(e =>
            e.event_type === EventTypes.APPROVAL_GRANTED ||
            e.event_type === EventTypes.APPROVAL_REJECTED
        ).length,
        [approvalEvents]
    );

    const activeExecutionsCount = useMemo(() => {
        const started = new Set(
            executionEvents
                .filter(e => e.event_type === EventTypes.EXECUTION_STARTED)
                .map(e => e.data.execution_id)
        );
        const completed = new Set(
            executionEvents
                .filter(e =>
                    e.event_type === EventTypes.EXECUTION_COMPLETED ||
                    e.event_type === EventTypes.EXECUTION_FAILED
                )
                .map(e => e.data.execution_id)
        );
        return [...started].filter(id => !completed.has(id)).length;
    }, [executionEvents]);

    // Mark as seen functions
    const markIssuesSeen = useCallback(() => {
        setSeenIssuesCount(issueEvents.filter(e => e.event_type === EventTypes.ISSUE_DETECTED).length);
    }, [issueEvents]);

    const markApprovalsSeen = useCallback(() => {
        setSeenApprovalsCount(approvalEvents.length);
    }, [approvalEvents]);

    // Clear all
    const handleClearEvents = useCallback(() => {
        clearEvents();
        setSeenIssuesCount(0);
        setSeenApprovalsCount(0);
    }, [clearEvents]);

    return {
        isConnected,
        connectionState,
        events,
        lastEvent,
        executionEvents,
        issueEvents,
        approvalEvents,
        alertEvents,
        newIssuesCount,
        pendingApprovalsCount,
        activeExecutionsCount,
        clearEvents: handleClearEvents,
        markIssuesSeen,
        markApprovalsSeen,
        subscribe,
        unsubscribe,
    };
}

export default useRealtimeEvents;
