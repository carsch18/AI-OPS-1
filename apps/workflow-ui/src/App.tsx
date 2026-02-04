/**
 * AIOps Workflow Builder - Main App
 * Epic visual workflow automation interface
 */

import { useState, useCallback } from 'react';
import type { Node } from 'reactflow';

import Header from './components/Header';
import NodePalette from './components/NodePalette';
import WorkflowCanvas from './components/WorkflowCanvas';
import PropertyPanel from './components/PropertyPanel';
import useWorkflowStore from './store/workflowStore';
import type { WorkflowNodeData } from './store/workflowStore';
import workflowApi from './services/api';

import './index.css';

function App() {
  const [selectedNode, setSelectedNode] = useState<Node<WorkflowNodeData> | null>(null);
  const [showPropertyPanel, setShowPropertyPanel] = useState(true);

  const {
    workflowId,
    workflowName,
    isActive,
    nodes,
    edges,
    markSaved,
    setWorkflowId
  } = useWorkflowStore();

  const handleNodeSelect = useCallback((node: Node<WorkflowNodeData> | null) => {
    setSelectedNode(node);
    if (node) {
      setShowPropertyPanel(true);
    }
  }, []);

  const handleSave = useCallback(async () => {
    try {
      // Find trigger node to determine trigger type
      const triggerNode = nodes.find(n => n.type === 'trigger');
      const triggerType = triggerNode?.data.subtype || 'manual';

      // Convert React Flow nodes to API format
      const apiNodes = nodes.map(node => ({
        node_type: node.type!,
        node_subtype: node.data.subtype,
        label: node.data.label,
        position_x: node.position.x,
        position_y: node.position.y,
        config: node.data.config || {},
        is_start_node: node.type === 'trigger',
      }));

      // Convert edges - need to map to new node IDs after save
      // For now, we'll create without edges and add them separately
      /* const apiEdges = edges.map(edge => ({
        source_node_id: edge.source,
        target_node_id: edge.target,
        source_handle: edge.sourceHandle || 'default',
        condition: null,
      })); */

      if (workflowId) {
        // Update existing workflow
        await workflowApi.updateWorkflow(workflowId, {
          name: workflowName,
          is_active: isActive,
          trigger_type: triggerType,
        });
      } else {
        // Create new workflow
        const newWorkflow = await workflowApi.createWorkflow({
          name: workflowName,
          trigger_type: triggerType,
          trigger_config: triggerNode?.data.config || {},
          is_active: isActive,
          nodes: apiNodes,
          edges: [], // Edges reference temp IDs, need proper mapping
        });
        setWorkflowId(newWorkflow.id);
      }

      markSaved();
      console.log('✅ Workflow saved successfully!');
    } catch (error) {
      console.error('❌ Failed to save workflow:', error);
      alert('Failed to save workflow. Is the workflow-engine running?');
    }
  }, [workflowId, workflowName, isActive, nodes, edges, markSaved, setWorkflowId]);

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
    <div className="app-container">
      <Header onSave={handleSave} onExecute={handleExecute} />

      <div className="main-content">
        <NodePalette />

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

export default App;
