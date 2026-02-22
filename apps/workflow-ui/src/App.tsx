/**
 * AIOps Platform - Main App with Routing
 * MAANG-grade unified operations platform
 * 
 * Phase 4: Production-hardened with connection status bar,
 * live sidebar badges, ErrorBoundary on all routes.
 */

import { useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import type { Node } from 'reactflow';

// Import NodeTypeDefinition for double-click handling
import type { NodeTypeDefinition } from './types/nodeTypes';

// Pages
import CommandCenter from './pages/CommandCenter';
import IssuesPage from './pages/Issues';
import RemediationPage from './pages/Remediation';
import ExecutorsPage from './pages/Executors';
import AnalyticsPage from './pages/Analytics';
import SettingsPage from './pages/Settings';
import AiChatPage from './pages/AiChat';
import IncidentsPage from './pages/Incidents';
import AlertsPage from './pages/Alerts';
import AutonomousOpsPage from './pages/AutonomousOps';

// Workflow Builder Components (existing)
import Header from './components/Header';
import SmartNodePalette from './components/SmartNodePalette';
import WorkflowCanvas from './components/WorkflowCanvas';
import PropertyPanel from './components/PropertyPanel';
import useWorkflowStore from './store/workflowStore';
import type { WorkflowNodeData } from './store/workflowStore';
import workflowApi from './services/api';

// Toast Notifications
import { ToastProvider, ToastContainer, EventToastBridge } from './components/ToastNotifications';

// Phase 4: Connection Status Bar
import { ConnectionStatusBar } from './components/ConnectionStatusBar';

// Phase 4: Command Palette + Keyboard Shortcuts
import { CommandPalette } from './components/CommandPalette';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Phase 4: Real-time event badges
import { useRealtimeEvents } from './hooks/useRealtimeEvents';

// Error Boundary for graceful crash handling
import { PageErrorBoundary } from './components/ErrorBoundary';
import './components/ErrorBoundary.css';

// Icons
import {
  Zap,
  LayoutDashboard,
  Workflow,
  Flame,
  Wrench,
  Terminal,
  BarChart3,
  Settings,
  Bot,
  AlertTriangle,
  Bell,
  Radar,
} from './components/Icons';

import './index.css';

// Sidebar Navigation Component — Phase 4: Real-time badge counters
function Sidebar() {
  const {
    newIssuesCount,
    pendingApprovalsCount,
    activeExecutionsCount,
    alertEvents,
  } = useRealtimeEvents({ enabled: true });

  const alertCount = alertEvents.length;

  const navItems: { path: string; icon: ReactNode; label: string; badge?: number }[] = [
    { path: '/', icon: <LayoutDashboard size={18} />, label: 'Command Center' },
    { path: '/ai-chat', icon: <Bot size={18} />, label: 'AI Chat' },
    { path: '/incidents', icon: <AlertTriangle size={18} />, label: 'Incidents' },
    { path: '/alerts', icon: <Bell size={18} />, label: 'Alerts', badge: alertCount },
    { path: '/autonomous', icon: <Radar size={18} />, label: 'Autonomous', badge: activeExecutionsCount },
    { path: '/workflows', icon: <Workflow size={18} />, label: 'Workflows' },
    { path: '/issues', icon: <Flame size={18} />, label: 'Issues', badge: newIssuesCount },
    { path: '/remediation', icon: <Wrench size={18} />, label: 'Remediation', badge: pendingApprovalsCount },
    { path: '/executors', icon: <Terminal size={18} />, label: 'Executors' },
    { path: '/analytics', icon: <BarChart3 size={18} />, label: 'Analytics' },
  ];

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon"><Zap size={24} /></span>
        <span className="logo-text">AIOps</span>
      </div>

      <div className="sidebar-nav">
        {navItems.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className="nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>
            )}
          </NavLink>
        ))}
      </div>

      <div className="sidebar-footer">
        <NavLink to="/settings" className="nav-item settings">
          <span className="nav-icon"><Settings size={18} /></span>
          <span className="nav-label">Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}

// Workflow Builder Page (existing App content)
function WorkflowBuilder() {
  const [selectedNode, setSelectedNode] = useState<Node<WorkflowNodeData> | null>(null);
  const [showPropertyPanel, setShowPropertyPanel] = useState(true);

  const {
    workflowId,
    workflowName,
    isActive,
    nodes,
    markSaved,
    setWorkflowId,
    addNode,
  } = useWorkflowStore();

  const handleNodeSelect = useCallback((node: Node<WorkflowNodeData> | null) => {
    setSelectedNode(node);
    if (node) {
      setShowPropertyPanel(true);
    }
  }, []);

  // Handle double-click from SmartNodePalette to add node to canvas
  const handleNodeDoubleClick = useCallback((nodeType: NodeTypeDefinition) => {
    // Add node at center of canvas (roughly)
    const newNode: Node<WorkflowNodeData> = {
      id: `${nodeType.subtype}-${Date.now()}`,
      type: nodeType.type,
      position: { x: 300 + Math.random() * 200, y: 200 + Math.random() * 100 },
      data: {
        label: nodeType.label,
        type: nodeType.type as 'trigger' | 'action' | 'approval' | 'condition' | 'delay',
        subtype: nodeType.subtype,
        icon: nodeType.icon,
        config: {},
        description: nodeType.description,
      },
    };
    addNode(newNode);
  }, [addNode]);

  const handleSave = useCallback(async () => {
    try {
      const triggerNode = nodes.find(n => n.type === 'trigger');
      const triggerType = triggerNode?.data.subtype || 'manual';

      const apiNodes = nodes.map(node => ({
        node_type: node.type!,
        node_subtype: node.data.subtype,
        label: node.data.label,
        position_x: node.position.x,
        position_y: node.position.y,
        config: node.data.config || {},
        is_start_node: node.type === 'trigger',
      }));

      if (workflowId) {
        await workflowApi.updateWorkflow(workflowId, {
          name: workflowName,
          is_active: isActive,
          trigger_type: triggerType,
        });
      } else {
        const newWorkflow = await workflowApi.createWorkflow({
          name: workflowName,
          trigger_type: triggerType,
          trigger_config: triggerNode?.data.config || {},
          is_active: isActive,
          nodes: apiNodes,
          edges: [],
        });
        setWorkflowId(newWorkflow.id);
      }

      markSaved();
      console.log('✅ Workflow saved successfully!');
    } catch (error) {
      console.error('❌ Failed to save workflow:', error);
      alert('Failed to save workflow. Is the workflow-engine running?');
    }
  }, [workflowId, workflowName, isActive, nodes, markSaved, setWorkflowId]);

  const handleExecute = useCallback(async () => {
    if (!workflowId) {
      alert('Please save the workflow first!');
      return;
    }

    try {
      const execution = await workflowApi.executeWorkflow(workflowId, {
        triggered_by: 'manual_ui',
        timestamp: new Date().toISOString(),
      });
      console.log('▶️ Execution started:', execution.id);
      alert(`Workflow execution started! ID: ${execution.id}`);
    } catch (error) {
      console.error('❌ Failed to execute workflow:', error);
      alert('Failed to execute workflow. Is the workflow-engine running?');
    }
  }, [workflowId]);

  return (
    <div className="workflow-builder">
      <Header onSave={handleSave} onExecute={handleExecute} />
      <div className="main-content">
        <SmartNodePalette
          onNodeDoubleClick={handleNodeDoubleClick}
        />
        <WorkflowCanvas onNodeSelect={handleNodeSelect} />
        {showPropertyPanel && (
          <PropertyPanel
            node={selectedNode}
            onClose={() => setShowPropertyPanel(false)}
          />
        )}
      </div>
    </div>
  );
}



// AppShell — inner component that has access to BrowserRouter context
function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useKeyboardShortcuts({
    onCommandPalette: () => setPaletteOpen(p => !p),
    onEscape: () => setPaletteOpen(false),
  });

  return (
    <>
      <div className="app-root">
        <Sidebar />
        <div className="app-main-wrapper">
          <ConnectionStatusBar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={
                <PageErrorBoundary pageName="Command Center">
                  <CommandCenter />
                </PageErrorBoundary>
              } />
              <Route path="/ai-chat" element={
                <PageErrorBoundary pageName="AI Chat">
                  <AiChatPage />
                </PageErrorBoundary>
              } />
              <Route path="/incidents" element={
                <PageErrorBoundary pageName="Incidents">
                  <IncidentsPage />
                </PageErrorBoundary>
              } />
              <Route path="/alerts" element={
                <PageErrorBoundary pageName="Alerts">
                  <AlertsPage />
                </PageErrorBoundary>
              } />
              <Route path="/autonomous" element={
                <PageErrorBoundary pageName="Autonomous Ops">
                  <AutonomousOpsPage />
                </PageErrorBoundary>
              } />
              <Route path="/workflows" element={
                <PageErrorBoundary pageName="Workflow Builder">
                  <WorkflowBuilder />
                </PageErrorBoundary>
              } />
              <Route path="/issues" element={
                <PageErrorBoundary pageName="Issues">
                  <IssuesPage />
                </PageErrorBoundary>
              } />
              <Route path="/remediation" element={
                <PageErrorBoundary pageName="Remediation">
                  <RemediationPage />
                </PageErrorBoundary>
              } />
              <Route path="/executors" element={
                <PageErrorBoundary pageName="Executors">
                  <ExecutorsPage />
                </PageErrorBoundary>
              } />
              <Route path="/analytics" element={
                <PageErrorBoundary pageName="Analytics">
                  <AnalyticsPage />
                </PageErrorBoundary>
              } />
              <Route path="/settings" element={
                <PageErrorBoundary pageName="Settings">
                  <SettingsPage />
                </PageErrorBoundary>
              } />
            </Routes>
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ToastContainer />
      <EventToastBridge />
    </>
  );
}

// Main App with Router — Phase 4: Hardened
function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
