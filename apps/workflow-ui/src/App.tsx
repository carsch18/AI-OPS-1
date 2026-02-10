/**
 * AIOps Platform - Main App with Routing
 * MAANG-grade unified operations platform
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
} from './components/Icons';

import './index.css';

// Sidebar Navigation Component
function Sidebar() {

  const navItems: { path: string; icon: ReactNode; label: string; badge?: number }[] = [
    { path: '/', icon: <LayoutDashboard size={18} />, label: 'Command Center' },
    { path: '/workflows', icon: <Workflow size={18} />, label: 'Workflows' },
    { path: '/issues', icon: <Flame size={18} />, label: 'Issues', badge: 0 },
    { path: '/remediation', icon: <Wrench size={18} />, label: 'Remediation' },
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
              <span className="nav-badge">{item.badge}</span>
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



// Main App with Router
function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <div className="app-root">
          <Sidebar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<CommandCenter />} />
              <Route path="/workflows" element={<WorkflowBuilder />} />
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
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
        <ToastContainer />
        <EventToastBridge />
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
