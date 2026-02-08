/**
 * Toast Notifications Component
 * 
 * Beautiful, animated toast notifications for real-time events.
 * Integrates with the event bus for automatic notifications.
 */

import { useState, useEffect, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { useRealtimeEvents, EventTypes } from '../hooks/useRealtimeEvents';
import type { WebSocketEvent } from '../hooks/useWebSocket';

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'execution' | 'issue' | 'approval';

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message: string;
    timestamp: Date;
    duration?: number;
    persistent?: boolean;
    actionLabel?: string;
    onAction?: () => void;
}

// Context
interface ToastContextValue {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id' | 'timestamp'>) => void;
    removeToast: (id: string) => void;
    clearToasts: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const useToasts = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToasts must be used within a ToastProvider');
    }
    return context;
};

// Toast Provider
interface ToastProviderProps {
    children: ReactNode;
    maxToasts?: number;
    defaultDuration?: number;
}

export function ToastProvider({ children, maxToasts = 5, defaultDuration = 5000 }: ToastProviderProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((toast: Omit<Toast, 'id' | 'timestamp'>) => {
        const newToast: Toast = {
            ...toast,
            id: `toast_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            timestamp: new Date(),
            duration: toast.duration ?? defaultDuration,
        };

        setToasts(prev => [newToast, ...prev].slice(0, maxToasts));

        // Auto-remove after duration (unless persistent)
        if (!toast.persistent && newToast.duration) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== newToast.id));
            }, newToast.duration);
        }
    }, [maxToasts, defaultDuration]);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const clearToasts = useCallback(() => {
        setToasts([]);
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast, clearToasts }}>
            {children}
        </ToastContext.Provider>
    );
}

// Individual Toast Component
interface ToastItemProps {
    toast: Toast;
    onClose: () => void;
}

function ToastItem({ toast, onClose }: ToastItemProps) {
    const getIcon = () => {
        switch (toast.type) {
            case 'success': return '✅';
            case 'error': return '❌';
            case 'warning': return '⚠️';
            case 'info': return 'ℹ️';
            case 'execution': return '▶️';
            case 'issue': return '🔥';
            case 'approval': return '👤';
            default: return '📢';
        }
    };

    const getTypeClass = () => {
        switch (toast.type) {
            case 'success': return 'toast-success';
            case 'error': return 'toast-error';
            case 'warning': return 'toast-warning';
            case 'info': return 'toast-info';
            case 'execution': return 'toast-execution';
            case 'issue': return 'toast-issue';
            case 'approval': return 'toast-approval';
            default: return '';
        }
    };

    return (
        <div className={`toast-item ${getTypeClass()}`}>
            <div className="toast-icon">{getIcon()}</div>
            <div className="toast-content">
                <div className="toast-title">{toast.title}</div>
                <div className="toast-message">{toast.message}</div>
            </div>
            {toast.actionLabel && toast.onAction && (
                <button className="toast-action" onClick={toast.onAction}>
                    {toast.actionLabel}
                </button>
            )}
            <button className="toast-close" onClick={onClose}>×</button>
        </div>
    );
}

// Toast Container Component
export function ToastContainer() {
    const { toasts, removeToast } = useToasts();

    return (
        <div className="toast-container">
            {toasts.map(toast => (
                <ToastItem
                    key={toast.id}
                    toast={toast}
                    onClose={() => removeToast(toast.id)}
                />
            ))}
        </div>
    );
}

// Auto-generate toasts from real-time events
interface EventToastBridgeProps {
    enabledEvents?: string[];
}

export function EventToastBridge({ enabledEvents }: EventToastBridgeProps) {
    const { lastEvent } = useRealtimeEvents();
    const { addToast } = useToasts();

    // Default events to show toasts for
    const defaultEnabledEvents = [
        EventTypes.EXECUTION_STARTED,
        EventTypes.EXECUTION_COMPLETED,
        EventTypes.EXECUTION_FAILED,
        EventTypes.ISSUE_DETECTED,
        EventTypes.APPROVAL_REQUESTED,
        EventTypes.ALERT_FIRED,
        EventTypes.AUTONOMOUS_TRIGGERED,
    ];

    const eventsToNotify = enabledEvents || defaultEnabledEvents;

    useEffect(() => {
        if (!lastEvent || !eventsToNotify.includes(lastEvent.event_type)) {
            return;
        }

        const toast = eventToToast(lastEvent);
        if (toast) {
            addToast(toast);
        }
    }, [lastEvent, eventsToNotify, addToast]);

    return null; // This is a behavior-only component
}

// Convert platform event to toast
function eventToToast(event: WebSocketEvent): Omit<Toast, 'id' | 'timestamp'> | null {
    switch (event.event_type) {
        case EventTypes.EXECUTION_STARTED:
            return {
                type: 'execution',
                title: 'Workflow Started',
                message: event.data.workflow_name || 'Workflow execution started',
            };

        case EventTypes.EXECUTION_COMPLETED:
            return {
                type: 'success',
                title: 'Workflow Completed',
                message: `${event.data.workflow_name || 'Workflow'} completed successfully in ${event.data.duration_ms}ms`,
            };

        case EventTypes.EXECUTION_FAILED:
            return {
                type: 'error',
                title: 'Workflow Failed',
                message: event.data.error || 'Workflow execution failed',
                persistent: true,
            };

        case EventTypes.ISSUE_DETECTED:
            return {
                type: 'issue',
                title: `${event.data.severity} Issue Detected`,
                message: event.data.message || event.data.issue_type,
                persistent: event.data.severity === 'critical',
            };

        case EventTypes.APPROVAL_REQUESTED:
            return {
                type: 'approval',
                title: 'Approval Required',
                message: `${event.data.workflow_name}: ${event.data.node_label}`,
                persistent: true,
                actionLabel: 'Review',
            };

        case EventTypes.ALERT_FIRED:
            return {
                type: 'warning',
                title: event.data.title || 'Alert',
                message: event.data.message,
                persistent: event.data.severity === 'critical',
            };

        case EventTypes.AUTONOMOUS_TRIGGERED:
            return {
                type: 'info',
                title: 'Auto-Remediation Triggered',
                message: `${event.data.workflow_name} triggered automatically`,
            };

        default:
            return null;
    }
}

export default ToastContainer;
