/**
 * Command Center - MAANG-Grade Operations Dashboard
 * 
 * The central nervous system of the AIOps platform.
 * Real-time overview of all operations in one place.
 */

import { useState, useEffect } from 'react';
import { useRealtimeEvents } from '../hooks/useRealtimeEvents';
import type { WebSocketEvent } from '../hooks/useWebSocket';
import LiveIssueFeed from '../components/dashboard/LiveIssueFeed';
import ActiveExecutions from '../components/dashboard/ActiveExecutions';
import HealthOverview from '../components/dashboard/HealthOverview';
import QuickActions from '../components/dashboard/QuickActions';
import MetricsGrid from '../components/dashboard/MetricsGrid';
import { LayoutDashboard, Bot, User } from '../components/Icons';
import './CommandCenter.css';

// API client
const API_BASE = 'http://localhost:8001';

interface DashboardStats {
    totalWorkflows: number;
    activeWorkflows: number;
    issuesDetected: number;
    issuesResolved: number;
    avgResolutionTime: number;
    remediationsExecuted: number;
    successRate: number;
    uptime: number;
}

interface SystemHealth {
    database: string;
    ssh: string;
    docker: string;
    api: string;
}

export default function CommandCenter() {
    const [stats, setStats] = useState<DashboardStats>({
        totalWorkflows: 0,
        activeWorkflows: 0,
        issuesDetected: 0,
        issuesResolved: 0,
        avgResolutionTime: 0,
        remediationsExecuted: 0,
        successRate: 0,
        uptime: 99.9,
    });

    const [health, setHealth] = useState<SystemHealth>({
        database: 'checking',
        ssh: 'checking',
        docker: 'checking',
        api: 'checking',
    });

    const [loading, setLoading] = useState(true);
    const [autonomousMode, setAutonomousMode] = useState(false);

    // Real-time events
    const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        isConnected: _isConnected,
        connectionState,
        newIssuesCount,
        pendingApprovalsCount,
        activeExecutionsCount,
        issueEvents,
        executionEvents,
        alertEvents,
    } = useRealtimeEvents();

    // Fetch initial data
    useEffect(() => {
        async function fetchDashboardData() {
            try {
                // Fetch workflows
                const workflowsRes = await fetch(`${API_BASE}/api/workflows`);
                const workflowsData = await workflowsRes.json();

                // Fetch issues stats
                const issuesStatsRes = await fetch(`${API_BASE}/api/issues/stats`);
                const issuesStats = await issuesStatsRes.json();

                // Fetch remediation stats
                const remediationRes = await fetch(`${API_BASE}/api/remediation/stats`);
                const remediationStats = await remediationRes.json();

                // Fetch autonomous status
                const autonomousRes = await fetch(`${API_BASE}/api/autonomous/status`);
                const autonomousStatus = await autonomousRes.json();

                // Update stats
                setStats({
                    totalWorkflows: workflowsData.total || 0,
                    activeWorkflows: workflowsData.workflows?.filter((w: any) => w.is_active).length || 0,
                    issuesDetected: issuesStats.total || 0,
                    issuesResolved: issuesStats.resolved || 0,
                    avgResolutionTime: issuesStats.avg_resolution_ms || 0,
                    remediationsExecuted: remediationStats.total_executions || 0,
                    successRate: remediationStats.success_rate || 0,
                    uptime: 99.9,
                });

                setAutonomousMode(autonomousStatus.enabled || false);

                // Check system health
                await checkSystemHealth();

            } catch (error) {
                console.error('Failed to fetch dashboard data:', error);
            } finally {
                setLoading(false);
            }
        }

        fetchDashboardData();
    }, []);

    // Check system health
    async function checkSystemHealth() {
        try {
            // Backend health
            const healthRes = await fetch(`${API_BASE}/health`);
            const healthData = await healthRes.json();

            setHealth({
                database: healthData.database === 'connected' ? 'healthy' : 'unhealthy',
                ssh: 'healthy', // Will be updated when SSH is available
                docker: 'healthy', // Will be updated when Docker is available
                api: healthData.status === 'healthy' ? 'healthy' : 'unhealthy',
            });
        } catch (error) {
            setHealth({
                database: 'unhealthy',
                ssh: 'unknown',
                docker: 'unknown',
                api: 'unhealthy',
            });
        }
    }

    // Toggle autonomous mode
    async function toggleAutonomousMode() {
        try {
            const endpoint = autonomousMode ? '/api/autonomous/disable' : '/api/autonomous/enable';
            await fetch(`${API_BASE}${endpoint}`, { method: 'POST' });
            setAutonomousMode(!autonomousMode);
        } catch (error) {
            console.error('Failed to toggle autonomous mode:', error);
        }
    }

    if (loading) {
        return (
            <div className="command-center-loading">
                <div className="loading-spinner"></div>
                <p>Initializing Command Center...</p>
            </div>
        );
    }

    return (
        <div className="command-center">
            {/* Header */}
            <header className="cc-header">
                <div className="cc-header-left">
                    <h1><LayoutDashboard size={24} /> Command Center</h1>
                    <div className={`connection-status ${connectionState}`}>
                        <span className="status-dot"></span>
                        {connectionState === 'connected' ? 'Live' : connectionState}
                    </div>
                </div>

                <div className="cc-header-right">
                    {/* Autonomous Mode Toggle */}
                    <button
                        className={`autonomous-toggle ${autonomousMode ? 'active' : ''}`}
                        onClick={toggleAutonomousMode}
                    >
                        <span className="toggle-icon">{autonomousMode ? <Bot size={18} /> : <User size={18} />}</span>
                        <span className="toggle-label">
                            {autonomousMode ? 'Autonomous ON' : 'Manual Mode'}
                        </span>
                    </button>

                    {/* Notification badges */}
                    <div className="notification-badges">
                        {newIssuesCount > 0 && (
                            <span className="badge badge-issue">{newIssuesCount} Issues</span>
                        )}
                        {pendingApprovalsCount > 0 && (
                            <span className="badge badge-approval">{pendingApprovalsCount} Pending</span>
                        )}
                        {activeExecutionsCount > 0 && (
                            <span className="badge badge-execution">{activeExecutionsCount} Running</span>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Grid */}
            <div className="cc-grid">
                {/* Top Row - Metrics */}
                <MetricsGrid stats={stats} />

                {/* Middle Row - Main Content */}
                <div className="cc-middle-row">
                    {/* Left Column - Live Issues */}
                    <div className="cc-panel cc-issues">
                        <LiveIssueFeed issues={issueEvents} />
                    </div>

                    {/* Center Column - Active Executions */}
                    <div className="cc-panel cc-executions">
                        <ActiveExecutions executions={executionEvents} />
                    </div>

                    {/* Right Column - Health & Quick Actions */}
                    <div className="cc-right-column">
                        <div className="cc-panel cc-health">
                            <HealthOverview health={health} />
                        </div>
                        <div className="cc-panel cc-actions">
                            <QuickActions />
                        </div>
                    </div>
                </div>

                {/* Bottom Row - Recent Alerts */}
                <div className="cc-bottom-row">
                    <div className="cc-panel cc-alerts">
                        <h3>🔔 Recent Alerts</h3>
                        <div className="alerts-list">
                            {alertEvents.length === 0 ? (
                                <p className="no-alerts">No recent alerts</p>
                            ) : (
                                alertEvents.slice(0, 5).map((alert: WebSocketEvent, idx: number) => (
                                    <div key={idx} className={`alert-item severity-${alert.data.severity}`}>
                                        <span className="alert-time">
                                            {new Date(alert.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className="alert-title">{alert.data.title}</span>
                                        <span className={`alert-severity ${alert.data.severity}`}>
                                            {alert.data.severity}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
