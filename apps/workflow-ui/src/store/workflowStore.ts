/**
 * 🚀 PHASE 8A: Canvas Revolution - Enhanced Workflow Store
 * 
 * 10X Features:
 * - Full Undo/Redo with branching history
 * - Multi-select with box selection support
 * - Clipboard operations (copy, cut, paste)
 * - Group operations (align, distribute, lock)
 * - Viewport state management
 * - Keyboard shortcuts state
 */

import type {
    Connection,
    Edge,
    EdgeChange,
    Node,
    NodeChange,
    Viewport,
} from 'reactflow';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from 'reactflow';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════════════════════════════

export interface NodeConfig {
    [key: string]: unknown;
}

export interface WorkflowNodeData {
    label: string;
    type: 'trigger' | 'action' | 'approval' | 'condition' | 'delay';
    subtype: string;
    icon: string;
    config: NodeConfig;
    description?: string;
    isLocked?: boolean;
}

// History entry for undo/redo
interface HistoryEntry {
    nodes: Node<WorkflowNodeData>[];
    edges: Edge[];
    timestamp: number;
    action: string;
}

// Clipboard entry
interface ClipboardEntry {
    nodes: Node<WorkflowNodeData>[];
    edges: Edge[];
    timestamp: number;
}

// Alignment options
export type AlignmentType = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';
export type DistributionType = 'horizontal' | 'vertical';

// Canvas interaction modes
export type CanvasMode = 'select' | 'pan' | 'connect' | 'multiselect';

export interface WorkflowState {
    // ═══════════════════════════════════════════════════════════════════════
    // WORKFLOW METADATA
    // ═══════════════════════════════════════════════════════════════════════
    workflowId: string | null;
    workflowName: string;
    isActive: boolean;
    isSaved: boolean;

    // ═══════════════════════════════════════════════════════════════════════
    // REACT FLOW STATE
    // ═══════════════════════════════════════════════════════════════════════
    nodes: Node<WorkflowNodeData>[];
    edges: Edge[];
    selectedNode: Node<WorkflowNodeData> | null;
    selectedNodes: string[]; // Multi-select support
    selectedEdges: string[]; // Edge selection support
    viewport: Viewport;

    // ═══════════════════════════════════════════════════════════════════════
    // CANVAS MODE & INTERACTION
    // ═══════════════════════════════════════════════════════════════════════
    canvasMode: CanvasMode;
    isGridVisible: boolean;
    isSnapToGridEnabled: boolean;
    gridSize: number;
    isMinimapVisible: boolean;
    zoomLevel: number;

    // ═══════════════════════════════════════════════════════════════════════
    // HISTORY (UNDO/REDO)
    // ═══════════════════════════════════════════════════════════════════════
    history: HistoryEntry[];
    historyIndex: number;
    maxHistorySize: number;

    // ═══════════════════════════════════════════════════════════════════════
    // CLIPBOARD
    // ═══════════════════════════════════════════════════════════════════════
    clipboard: ClipboardEntry | null;

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS - METADATA
    // ═══════════════════════════════════════════════════════════════════════
    setWorkflowId: (id: string | null) => void;
    setWorkflowName: (name: string) => void;
    setIsActive: (active: boolean) => void;

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS - REACT FLOW
    // ═══════════════════════════════════════════════════════════════════════
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    setNodes: (nodes: Node<WorkflowNodeData>[]) => void;
    setEdges: (edges: Edge[]) => void;
    addNode: (node: Node<WorkflowNodeData>) => void;
    updateNodeData: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
    deleteNode: (nodeId: string) => void;
    selectNode: (node: Node<WorkflowNodeData> | null) => void;
    updateNodeConfig: (nodeId: string, config: NodeConfig) => void;

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS - MULTI-SELECT
    // ═══════════════════════════════════════════════════════════════════════
    selectNodes: (nodeIds: string[]) => void;
    addToSelection: (nodeId: string) => void;
    removeFromSelection: (nodeId: string) => void;
    toggleNodeSelection: (nodeId: string) => void;
    selectAllNodes: () => void;
    clearSelection: () => void;
    selectEdges: (edgeIds: string[]) => void;
    selectNodesInBox: (box: { x: number; y: number; width: number; height: number }) => void;

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS - HISTORY (UNDO/REDO)
    // ═══════════════════════════════════════════════════════════════════════
    pushHistory: (action: string) => void;
    undo: () => void;
    redo: () => void;
    canUndo: () => boolean;
    canRedo: () => boolean;
    clearHistory: () => void;

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS - CLIPBOARD
    // ═══════════════════════════════════════════════════════════════════════
    copySelectedNodes: () => void;
    cutSelectedNodes: () => void;
    pasteNodes: (offset?: { x: number; y: number }) => void;
    duplicateSelectedNodes: () => void;

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS - GROUP OPERATIONS
    // ═══════════════════════════════════════════════════════════════════════
    alignNodes: (alignment: AlignmentType) => void;
    distributeNodes: (distribution: DistributionType) => void;
    lockSelectedNodes: () => void;
    unlockSelectedNodes: () => void;
    deleteSelectedNodes: () => void;

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS - VIEWPORT & CANVAS
    // ═══════════════════════════════════════════════════════════════════════
    setViewport: (viewport: Viewport) => void;
    setCanvasMode: (mode: CanvasMode) => void;
    setZoomLevel: (zoom: number) => void;
    toggleGrid: () => void;
    toggleSnapToGrid: () => void;
    setGridSize: (size: number) => void;
    toggleMinimap: () => void;
    fitView: () => void;
    centerOnNode: (nodeId: string) => void;

    // ═══════════════════════════════════════════════════════════════════════
    // ACTIONS - WORKFLOW
    // ═══════════════════════════════════════════════════════════════════════
    clearWorkflow: () => void;
    markSaved: () => void;
    markUnsaved: () => void;
    loadWorkflow: (workflow: { nodes: Node<WorkflowNodeData>[]; edges: Edge[]; name: string }) => void;
}

// ═══════════════════════════════════════════════════════════════════════════
// STORE IMPLEMENTATION
// ═══════════════════════════════════════════════════════════════════════════

const useWorkflowStore = create<WorkflowState>()(
    subscribeWithSelector((set, get) => ({
        // ═══════════════════════════════════════════════════════════════════
        // INITIAL STATE
        // ═══════════════════════════════════════════════════════════════════
        workflowId: null,
        workflowName: 'Untitled Workflow',
        isActive: false,
        isSaved: true,
        nodes: [],
        edges: [],
        selectedNode: null,
        selectedNodes: [],
        selectedEdges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        canvasMode: 'select',
        isGridVisible: true,
        isSnapToGridEnabled: true,
        gridSize: 20,
        isMinimapVisible: true,
        zoomLevel: 1,
        history: [],
        historyIndex: -1,
        maxHistorySize: 50,
        clipboard: null,

        // ═══════════════════════════════════════════════════════════════════
        // METADATA ACTIONS
        // ═══════════════════════════════════════════════════════════════════
        setWorkflowId: (id) => set({ workflowId: id }),

        setWorkflowName: (name) => {
            get().pushHistory('Rename Workflow');
            set({ workflowName: name, isSaved: false });
        },

        setIsActive: (active) => set({ isActive: active, isSaved: false }),

        // ═══════════════════════════════════════════════════════════════════
        // REACT FLOW HANDLERS
        // ═══════════════════════════════════════════════════════════════════
        onNodesChange: (changes: NodeChange[]) => {
            const hasPositionChange = changes.some(c => c.type === 'position' && c.position);
            const hasRemove = changes.some(c => c.type === 'remove');

            if (hasPositionChange || hasRemove) {
                get().pushHistory(hasRemove ? 'Delete Node' : 'Move Node');
            }

            set({
                nodes: applyNodeChanges(changes, get().nodes),
                isSaved: false,
            });
        },

        onEdgesChange: (changes: EdgeChange[]) => {
            const hasRemove = changes.some(c => c.type === 'remove');
            if (hasRemove) {
                get().pushHistory('Delete Connection');
            }

            set({
                edges: applyEdgeChanges(changes, get().edges),
                isSaved: false,
            });
        },

        onConnect: (connection: Connection) => {
            get().pushHistory('Create Connection');

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
            get().pushHistory('Add Node');
            set({
                nodes: [...get().nodes, node],
                selectedNodes: [node.id],
                selectedNode: node,
                isSaved: false,
            });
        },

        updateNodeData: (nodeId, data) => {
            get().pushHistory('Update Node');
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
            get().pushHistory('Delete Node');
            set({
                nodes: get().nodes.filter((node) => node.id !== nodeId),
                edges: get().edges.filter(
                    (edge) => edge.source !== nodeId && edge.target !== nodeId
                ),
                selectedNode: get().selectedNode?.id === nodeId ? null : get().selectedNode,
                selectedNodes: get().selectedNodes.filter(id => id !== nodeId),
                isSaved: false,
            });
        },

        selectNode: (node) => set({
            selectedNode: node,
            selectedNodes: node ? [node.id] : [],
        }),

        updateNodeConfig: (nodeId, config) => {
            get().pushHistory('Update Node Config');

            set({
                nodes: get().nodes.map((node) =>
                    node.id === nodeId
                        ? { ...node, data: { ...node.data, config: { ...node.data.config, ...config } } }
                        : node
                ),
                isSaved: false,
            });

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

        // ═══════════════════════════════════════════════════════════════════
        // MULTI-SELECT ACTIONS
        // ═══════════════════════════════════════════════════════════════════
        selectNodes: (nodeIds) => {
            const nodes = get().nodes;
            const firstSelected = nodes.find(n => nodeIds.includes(n.id)) || null;
            set({
                selectedNodes: nodeIds,
                selectedNode: firstSelected,
            });
        },

        addToSelection: (nodeId) => {
            const current = get().selectedNodes;
            if (!current.includes(nodeId)) {
                set({ selectedNodes: [...current, nodeId] });
            }
        },

        removeFromSelection: (nodeId) => {
            set({
                selectedNodes: get().selectedNodes.filter(id => id !== nodeId),
                selectedNode: get().selectedNode?.id === nodeId ? null : get().selectedNode,
            });
        },

        toggleNodeSelection: (nodeId) => {
            const current = get().selectedNodes;
            if (current.includes(nodeId)) {
                get().removeFromSelection(nodeId);
            } else {
                get().addToSelection(nodeId);
            }
        },

        selectAllNodes: () => {
            const nodeIds = get().nodes.map(n => n.id);
            get().selectNodes(nodeIds);
        },

        clearSelection: () => {
            set({ selectedNodes: [], selectedEdges: [], selectedNode: null });
        },

        selectEdges: (edgeIds) => {
            set({ selectedEdges: edgeIds });
        },

        selectNodesInBox: (box) => {
            const nodes = get().nodes;
            const inBox = nodes.filter(node => {
                const nodeX = node.position.x;
                const nodeY = node.position.y;
                const nodeWidth = node.width || 200;
                const nodeHeight = node.height || 80;

                return (
                    nodeX < box.x + box.width &&
                    nodeX + nodeWidth > box.x &&
                    nodeY < box.y + box.height &&
                    nodeY + nodeHeight > box.y
                );
            });

            get().selectNodes(inBox.map(n => n.id));
        },

        // ═══════════════════════════════════════════════════════════════════
        // HISTORY (UNDO/REDO)
        // ═══════════════════════════════════════════════════════════════════
        pushHistory: (action: string) => {
            const { nodes, edges, history, historyIndex, maxHistorySize } = get();

            // Create new history entry
            const entry: HistoryEntry = {
                nodes: JSON.parse(JSON.stringify(nodes)),
                edges: JSON.parse(JSON.stringify(edges)),
                timestamp: Date.now(),
                action,
            };

            // Remove any future history if we're not at the end
            const newHistory = history.slice(0, historyIndex + 1);
            newHistory.push(entry);

            // Limit history size
            if (newHistory.length > maxHistorySize) {
                newHistory.shift();
            }

            set({
                history: newHistory,
                historyIndex: newHistory.length - 1,
            });
        },

        undo: () => {
            const { history, historyIndex } = get();
            if (historyIndex > 0) {
                const previousState = history[historyIndex - 1];
                set({
                    nodes: JSON.parse(JSON.stringify(previousState.nodes)),
                    edges: JSON.parse(JSON.stringify(previousState.edges)),
                    historyIndex: historyIndex - 1,
                    isSaved: false,
                    selectedNodes: [],
                    selectedNode: null,
                });
            }
        },

        redo: () => {
            const { history, historyIndex } = get();
            if (historyIndex < history.length - 1) {
                const nextState = history[historyIndex + 1];
                set({
                    nodes: JSON.parse(JSON.stringify(nextState.nodes)),
                    edges: JSON.parse(JSON.stringify(nextState.edges)),
                    historyIndex: historyIndex + 1,
                    isSaved: false,
                    selectedNodes: [],
                    selectedNode: null,
                });
            }
        },

        canUndo: () => get().historyIndex > 0,
        canRedo: () => get().historyIndex < get().history.length - 1,

        clearHistory: () => set({ history: [], historyIndex: -1 }),

        // ═══════════════════════════════════════════════════════════════════
        // CLIPBOARD
        // ═══════════════════════════════════════════════════════════════════
        copySelectedNodes: () => {
            const { nodes, edges, selectedNodes } = get();
            if (selectedNodes.length === 0) return;

            const selectedNodeObjects = nodes.filter(n => selectedNodes.includes(n.id));
            const selectedEdgeObjects = edges.filter(
                e => selectedNodes.includes(e.source) && selectedNodes.includes(e.target)
            );

            set({
                clipboard: {
                    nodes: JSON.parse(JSON.stringify(selectedNodeObjects)),
                    edges: JSON.parse(JSON.stringify(selectedEdgeObjects)),
                    timestamp: Date.now(),
                },
            });
        },

        cutSelectedNodes: () => {
            get().copySelectedNodes();
            get().deleteSelectedNodes();
        },

        pasteNodes: (offset = { x: 50, y: 50 }) => {
            const { clipboard } = get();
            if (!clipboard || clipboard.nodes.length === 0) return;

            get().pushHistory('Paste Nodes');

            // Create ID mapping for new nodes
            const idMap: Record<string, string> = {};
            const newNodes = clipboard.nodes.map(node => {
                const newId = `${node.data.subtype}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                idMap[node.id] = newId;
                return {
                    ...node,
                    id: newId,
                    position: {
                        x: node.position.x + offset.x,
                        y: node.position.y + offset.y,
                    },
                    selected: true,
                };
            });

            // Remap edge connections
            const newEdges = clipboard.edges.map(edge => ({
                ...edge,
                id: `edge-${idMap[edge.source]}-${idMap[edge.target]}-${Date.now()}`,
                source: idMap[edge.source],
                target: idMap[edge.target],
            }));

            set({
                nodes: [...get().nodes, ...newNodes],
                edges: [...get().edges, ...newEdges],
                selectedNodes: newNodes.map(n => n.id),
                isSaved: false,
            });
        },

        duplicateSelectedNodes: () => {
            get().copySelectedNodes();
            get().pasteNodes({ x: 100, y: 100 });
        },

        // ═══════════════════════════════════════════════════════════════════
        // GROUP OPERATIONS
        // ═══════════════════════════════════════════════════════════════════
        alignNodes: (alignment: AlignmentType) => {
            const { nodes, selectedNodes } = get();
            if (selectedNodes.length < 2) return;

            get().pushHistory(`Align ${alignment}`);

            const selected = nodes.filter(n => selectedNodes.includes(n.id));
            const positions = selected.map(n => n.position);

            let targetValue: number;
            switch (alignment) {
                case 'left':
                    targetValue = Math.min(...positions.map(p => p.x));
                    break;
                case 'center':
                    const minX = Math.min(...positions.map(p => p.x));
                    const maxX = Math.max(...positions.map(p => p.x + (nodes.find(n => n.position === p)?.width || 200)));
                    targetValue = (minX + maxX) / 2;
                    break;
                case 'right':
                    targetValue = Math.max(...positions.map(p => p.x));
                    break;
                case 'top':
                    targetValue = Math.min(...positions.map(p => p.y));
                    break;
                case 'middle':
                    const minY = Math.min(...positions.map(p => p.y));
                    const maxY = Math.max(...positions.map(p => p.y + (nodes.find(n => n.position === p)?.height || 80)));
                    targetValue = (minY + maxY) / 2;
                    break;
                case 'bottom':
                    targetValue = Math.max(...positions.map(p => p.y));
                    break;
            }

            const updatedNodes = nodes.map(node => {
                if (!selectedNodes.includes(node.id)) return node;

                const newPosition = { ...node.position };
                if (['left', 'center', 'right'].includes(alignment)) {
                    newPosition.x = targetValue;
                } else {
                    newPosition.y = targetValue;
                }

                return { ...node, position: newPosition };
            });

            set({ nodes: updatedNodes, isSaved: false });
        },

        distributeNodes: (distribution: DistributionType) => {
            const { nodes, selectedNodes } = get();
            if (selectedNodes.length < 3) return;

            get().pushHistory(`Distribute ${distribution}`);

            const selected = nodes
                .filter(n => selectedNodes.includes(n.id))
                .sort((a, b) =>
                    distribution === 'horizontal'
                        ? a.position.x - b.position.x
                        : a.position.y - b.position.y
                );

            const first = selected[0].position;
            const last = selected[selected.length - 1].position;
            const total = distribution === 'horizontal' ? last.x - first.x : last.y - first.y;
            const step = total / (selected.length - 1);

            const updatedNodes = nodes.map(node => {
                const index = selected.findIndex(s => s.id === node.id);
                if (index === -1) return node;

                const newPosition = { ...node.position };
                if (distribution === 'horizontal') {
                    newPosition.x = first.x + step * index;
                } else {
                    newPosition.y = first.y + step * index;
                }

                return { ...node, position: newPosition };
            });

            set({ nodes: updatedNodes, isSaved: false });
        },

        lockSelectedNodes: () => {
            const { nodes, selectedNodes } = get();
            get().pushHistory('Lock Nodes');

            set({
                nodes: nodes.map(node =>
                    selectedNodes.includes(node.id)
                        ? { ...node, data: { ...node.data, isLocked: true }, draggable: false }
                        : node
                ),
            });
        },

        unlockSelectedNodes: () => {
            const { nodes, selectedNodes } = get();
            get().pushHistory('Unlock Nodes');

            set({
                nodes: nodes.map(node =>
                    selectedNodes.includes(node.id)
                        ? { ...node, data: { ...node.data, isLocked: false }, draggable: true }
                        : node
                ),
            });
        },

        deleteSelectedNodes: () => {
            const { selectedNodes, selectedEdges } = get();
            if (selectedNodes.length === 0 && selectedEdges.length === 0) return;

            get().pushHistory('Delete Selected');

            set({
                nodes: get().nodes.filter(n => !selectedNodes.includes(n.id)),
                edges: get().edges.filter(e =>
                    !selectedEdges.includes(e.id) &&
                    !selectedNodes.includes(e.source) &&
                    !selectedNodes.includes(e.target)
                ),
                selectedNodes: [],
                selectedEdges: [],
                selectedNode: null,
                isSaved: false,
            });
        },

        // ═══════════════════════════════════════════════════════════════════
        // VIEWPORT & CANVAS
        // ═══════════════════════════════════════════════════════════════════
        setViewport: (viewport) => set({ viewport }),
        setCanvasMode: (mode) => set({ canvasMode: mode }),
        setZoomLevel: (zoom) => set({ zoomLevel: Math.max(0.1, Math.min(2, zoom)) }),
        toggleGrid: () => set({ isGridVisible: !get().isGridVisible }),
        toggleSnapToGrid: () => set({ isSnapToGridEnabled: !get().isSnapToGridEnabled }),
        setGridSize: (size) => set({ gridSize: Math.max(5, Math.min(50, size)) }),
        toggleMinimap: () => set({ isMinimapVisible: !get().isMinimapVisible }),

        fitView: () => {
            // This will be triggered from canvas component
            set({ zoomLevel: 1 });
        },

        centerOnNode: (nodeId: string) => {
            const node = get().nodes.find(n => n.id === nodeId);
            if (node) {
                set({
                    viewport: {
                        x: -node.position.x + 400,
                        y: -node.position.y + 300,
                        zoom: get().zoomLevel,
                    },
                });
            }
        },

        // ═══════════════════════════════════════════════════════════════════
        // WORKFLOW MANAGEMENT
        // ═══════════════════════════════════════════════════════════════════
        clearWorkflow: () => set({
            workflowId: null,
            workflowName: 'Untitled Workflow',
            isActive: false,
            isSaved: true,
            nodes: [],
            edges: [],
            selectedNode: null,
            selectedNodes: [],
            selectedEdges: [],
            history: [],
            historyIndex: -1,
            clipboard: null,
        }),

        markSaved: () => set({ isSaved: true }),
        markUnsaved: () => set({ isSaved: false }),

        loadWorkflow: (workflow) => {
            set({
                nodes: workflow.nodes,
                edges: workflow.edges,
                workflowName: workflow.name,
                selectedNodes: [],
                selectedNode: null,
                history: [],
                historyIndex: -1,
                isSaved: true,
            });
            // Push initial state to history
            get().pushHistory('Load Workflow');
        },
    }))
);

export default useWorkflowStore;
