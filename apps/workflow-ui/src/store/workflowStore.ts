/**
 * Workflow Builder Store - Zustand
 * Manages workflow state, nodes, edges, and selections
 */

import type {
    Connection,
    Edge,
    EdgeChange,
    Node,
    NodeChange,
    OnNodesChange,
    OnEdgesChange,
    OnConnect,
} from 'reactflow';
import {
    create,
} from 'zustand';
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from 'reactflow';

// Node type definitions matching backend
export interface NodeConfig {
    [key: string]: any;
}

export interface WorkflowNodeData {
    label: string;
    type: 'trigger' | 'action' | 'approval' | 'condition' | 'delay';
    subtype: string;
    icon: string;
    config: NodeConfig;
    description?: string;
}

export interface WorkflowState {
    // Workflow metadata
    workflowId: string | null;
    workflowName: string;
    isActive: boolean;
    isSaved: boolean;

    // React Flow state
    nodes: Node<WorkflowNodeData>[];
    edges: Edge[];
    selectedNode: Node<WorkflowNodeData> | null;

    // Actions
    setWorkflowId: (id: string | null) => void;
    setWorkflowName: (name: string) => void;
    setIsActive: (active: boolean) => void;
    onNodesChange: OnNodesChange;
    onEdgesChange: OnEdgesChange;
    onConnect: OnConnect;
    setNodes: (nodes: Node<WorkflowNodeData>[]) => void;
    setEdges: (edges: Edge[]) => void;
    addNode: (node: Node<WorkflowNodeData>) => void;
    updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
    deleteNode: (nodeId: string) => void;
    selectNode: (node: Node<WorkflowNodeData> | null) => void;
    updateNodeConfig: (nodeId: string, config: NodeConfig) => void;
    clearWorkflow: () => void;
    markSaved: () => void;
    markUnsaved: () => void;
}

const useWorkflowStore = create<WorkflowState>((set, get) => ({
    // Initial state
    workflowId: null,
    workflowName: 'Untitled Workflow',
    isActive: false,
    isSaved: true,
    nodes: [],
    edges: [],
    selectedNode: null,

    // Setters
    setWorkflowId: (id) => set({ workflowId: id }),
    setWorkflowName: (name) => set({ workflowName: name, isSaved: false }),
    setIsActive: (active) => set({ isActive: active, isSaved: false }),

    // React Flow handlers
    onNodesChange: (changes: NodeChange[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
            isSaved: false,
        });
    },

    onEdgesChange: (changes: EdgeChange[]) => {
        set({
            edges: applyEdgeChanges(changes, get().edges),
            isSaved: false,
        });
    },

    onConnect: (connection: Connection) => {
        const newEdge: Edge = {
            ...connection,
            id: `edge-${connection.source}-${connection.target}-${Date.now()}`,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#8b5cf6', strokeWidth: 2 },
        } as Edge;

        set({
            edges: addEdge(newEdge, get().edges),
            isSaved: false,
        });
    },

    setNodes: (nodes) => set({ nodes }),
    setEdges: (edges) => set({ edges }),

    addNode: (node) => {
        set({
            nodes: [...get().nodes, node],
            isSaved: false,
        });
    },

    updateNodeData: (nodeId, data) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, ...data } }
                    : node
            ),
            isSaved: false,
        });
    },

    deleteNode: (nodeId) => {
        set({
            nodes: get().nodes.filter((node) => node.id !== nodeId),
            edges: get().edges.filter(
                (edge) => edge.source !== nodeId && edge.target !== nodeId
            ),
            selectedNode: get().selectedNode?.id === nodeId ? null : get().selectedNode,
            isSaved: false,
        });
    },

    selectNode: (node) => set({ selectedNode: node }),

    updateNodeConfig: (nodeId, config) => {
        set({
            nodes: get().nodes.map((node) =>
                node.id === nodeId
                    ? { ...node, data: { ...node.data, config: { ...node.data.config, ...config } } }
                    : node
            ),
            isSaved: false,
        });

        // Update selected node if it's the one being modified
        const selectedNode = get().selectedNode;
        if (selectedNode?.id === nodeId) {
            set({
                selectedNode: {
                    ...selectedNode,
                    data: { ...selectedNode.data, config: { ...selectedNode.data.config, ...config } },
                },
            });
        }
    },

    clearWorkflow: () => set({
        workflowId: null,
        workflowName: 'Untitled Workflow',
        isActive: false,
        isSaved: true,
        nodes: [],
        edges: [],
        selectedNode: null,
    }),

    markSaved: () => set({ isSaved: true }),
    markUnsaved: () => set({ isSaved: false }),
}));

export default useWorkflowStore;
