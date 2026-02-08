/**
 * Quick Actions - One-click operations panel
 */

import { useState } from 'react';
import './Dashboard.css';

const API_BASE = 'http://localhost:8001';

export default function QuickActions() {
    const [loading, setLoading] = useState<string | null>(null);
    const [lastAction, setLastAction] = useState<string | null>(null);

    const actions = [
        {
            id: 'detect',
            label: 'Run Detection',
            icon: '🔍',
            description: 'Trigger issue detection',
            endpoint: '/api/issues/detect',
            method: 'POST',
        },
        {
            id: 'health',
            label: 'Health Check',
            icon: '🏥',
            description: 'Run system health check',
            endpoint: '/health',
            method: 'GET',
        },
        {
            id: 'kill-switch',
            label: 'Kill Switch',
            icon: '🛑',
            description: 'Emergency stop all',
            endpoint: '/api/autonomous/kill-switch',
            method: 'POST',
            danger: true,
        },
        {
            id: 'reload',
            label: 'Reload Triggers',
            icon: '🔄',
            description: 'Reload trigger configs',
            endpoint: '/api/trigger/reload',
            method: 'POST',
        },
    ];

    async function executeAction(action: typeof actions[0]) {
        setLoading(action.id);
        try {
            const response = await fetch(`${API_BASE}${action.endpoint}`, {
                method: action.method,
                headers: { 'Content-Type': 'application/json' },
            });

            if (response.ok) {
                setLastAction(`✅ ${action.label} completed`);
            } else {
                setLastAction(`❌ ${action.label} failed`);
            }
        } catch (error) {
            setLastAction(`❌ ${action.label} error`);
        } finally {
            setLoading(null);
            setTimeout(() => setLastAction(null), 3000);
        }
    }

    return (
        <div className="quick-actions">
            <h3>⚡ Quick Actions</h3>

            <div className="actions-grid">
                {actions.map(action => (
                    <button
                        key={action.id}
                        className={`action-button ${action.danger ? 'danger' : ''} ${loading === action.id ? 'loading' : ''}`}
                        onClick={() => executeAction(action)}
                        disabled={loading !== null}
                        title={action.description}
                    >
                        <span className="action-icon">{action.icon}</span>
                        <span className="action-label">{action.label}</span>
                    </button>
                ))}
            </div>

            {lastAction && (
                <div className="action-feedback">
                    {lastAction}
                </div>
            )}
        </div>
    );
}
