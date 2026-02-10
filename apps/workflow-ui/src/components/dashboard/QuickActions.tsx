/**
 * Quick Actions - One-click operations panel
 */

import { useState } from 'react';
import {
    Zap,
    Search,
    Activity,
    Power,
    RefreshCw,
    CheckCircle,
    XCircle,
    Loader2,
} from '../Icons';
import './Dashboard.css';

const API_BASE = 'http://localhost:8001';

interface ActionItem {
    id: string;
    label: string;
    icon: React.ReactNode;
    description: string;
    endpoint: string;
    method: string;
    danger?: boolean;
}

export default function QuickActions() {
    const [loading, setLoading] = useState<string | null>(null);
    const [lastAction, setLastAction] = useState<{ success: boolean; message: string } | null>(null);

    const actions: ActionItem[] = [
        {
            id: 'detect',
            label: 'Run Detection',
            icon: <Search size={18} />,
            description: 'Trigger issue detection',
            endpoint: '/api/issues/detect',
            method: 'POST',
        },
        {
            id: 'health',
            label: 'Health Check',
            icon: <Activity size={18} />,
            description: 'Run system health check',
            endpoint: '/health',
            method: 'GET',
        },
        {
            id: 'kill-switch',
            label: 'Kill Switch',
            icon: <Power size={18} />,
            description: 'Emergency stop all',
            endpoint: '/api/autonomous/kill-switch',
            method: 'POST',
            danger: true,
        },
        {
            id: 'reload',
            label: 'Reload Triggers',
            icon: <RefreshCw size={18} />,
            description: 'Reload trigger configs',
            endpoint: '/api/trigger/reload',
            method: 'POST',
        },
    ];

    async function executeAction(action: ActionItem) {
        setLoading(action.id);
        try {
            const response = await fetch(`${API_BASE}${action.endpoint}`, {
                method: action.method,
                headers: { 'Content-Type': 'application/json' },
            });

            if (response.ok) {
                setLastAction({ success: true, message: `${action.label} completed` });
            } else {
                setLastAction({ success: false, message: `${action.label} failed` });
            }
        } catch (error) {
            setLastAction({ success: false, message: `${action.label} error` });
        } finally {
            setLoading(null);
            setTimeout(() => setLastAction(null), 3000);
        }
    }

    return (
        <div className="quick-actions">
            <h3><Zap size={18} /> Quick Actions</h3>

            <div className="actions-grid">
                {actions.map(action => (
                    <button
                        key={action.id}
                        className={`action-button ${action.danger ? 'danger' : ''} ${loading === action.id ? 'loading' : ''}`}
                        onClick={() => executeAction(action)}
                        disabled={loading !== null}
                        title={action.description}
                    >
                        <span className="action-icon">
                            {loading === action.id ? <Loader2 size={18} className="spin" /> : action.icon}
                        </span>
                        <span className="action-label">{action.label}</span>
                    </button>
                ))}
            </div>

            {lastAction && (
                <div className={`action-feedback ${lastAction.success ? 'success' : 'error'}`}>
                    {lastAction.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    {lastAction.message}
                </div>
            )}
        </div>
    );
}
