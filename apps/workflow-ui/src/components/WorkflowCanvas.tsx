/**
 * 🚀 PHASE 8A: Canvas Revolution - Enhanced Workflow Canvas
 * 
 * 10X Features:
 * - Infinite canvas with smooth pan/zoom
 * - Enhanced minimap with interactive navigation
 * - Smart grid with magnetic snap & alignment guides
 * - Box selection (rubber band) for multi-select
 * - Keyboard shortcuts (Cmd+Z, Cmd+C, etc.)
 * - Context menu for quick actions
 * - Canvas toolbar with view controls
 * - Empty state with animated hints
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    ReactFlowProvider,
    BackgroundVariant,
    Panel,
    SelectionMode,
    useReactFlow,
    MarkerType,
} from 'reactflow';
import type { Node, ReactFlowInstance, Viewport, OnSelectionChangeParams } from 'reactflow';
import 'reactflow/dist/style.css';

import useWorkflowStore, { type WorkflowNodeData } from '../store/workflowStore';
import { nodeTypes } from './nodes/CustomNodes';
import type { NodeTypeDefinition } from '../types/nodeTypes';
import { edgeTypes } from './edges/SmartEdges';
import './WorkflowCanvas.css';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface WorkflowCanvasProps {
    onNodeSelect: (node: Node<WorkflowNodeData> | null) => void;
}

interface ContextMenuState {
    isOpen: boolean;
    x: number;
    y: number;
    nodeId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Canvas Toolbar - View controls and actions
 */
function CanvasToolbar() {
    const {
        isGridVisible,
        isSnapToGridEnabled,
        isMinimapVisible,
        canUndo,
        canRedo,
        toggleGrid,
        toggleSnapToGrid,
        toggleMinimap,
        undo,
        redo,
        zoomLevel,
        selectedNodes,
        alignNodes,
        distributeNodes,
    } = useWorkflowStore();

    const { fitView, zoomIn, zoomOut } = useReactFlow();

    const hasMultipleSelected = selectedNodes.length >= 2;

    return (
        <div className="canvas-toolbar">
            {/* Zoom Controls */}
            <div className="toolbar-group">
                <button
                    className="toolbar-btn"
                    onClick={() => zoomOut()}
                    title="Zoom Out (Cmd+-)"
                >
                    ➖
                </button>
                <span className="zoom-level">{Math.round(zoomLevel * 100)}%</span>
                <button
                    className="toolbar-btn"
                    onClick={() => zoomIn()}
                    title="Zoom In (Cmd++)"
                >
                    ➕
                </button>
                <button
                    className="toolbar-btn"
                    onClick={() => fitView({ padding: 0.2 })}
                    title="Fit View (Cmd+0)"
                >
                    🎯
                </button>
            </div>

            <div className="toolbar-divider" />

            {/* View Toggles */}
            <div className="toolbar-group">
                <button
                    className={`toolbar-btn ${isGridVisible ? 'active' : ''}`}
                    onClick={toggleGrid}
                    title="Toggle Grid (G)"
                >
                    #
                </button>
                <button
                    className={`toolbar-btn ${isSnapToGridEnabled ? 'active' : ''}`}
                    onClick={toggleSnapToGrid}
                    title="Toggle Snap to Grid (S)"
                >
                    🧲
                </button>
                <button
                    className={`toolbar-btn ${isMinimapVisible ? 'active' : ''}`}
                    onClick={toggleMinimap}
                    title="Toggle Minimap (M)"
                >
                    🗺️
                </button>
            </div>

            <div className="toolbar-divider" />

            {/* History */}
            <div className="toolbar-group">
                <button
                    className="toolbar-btn"
                    onClick={undo}
                    disabled={!canUndo()}
                    title="Undo (Cmd+Z)"
                >
                    ↩️
                </button>
                <button
                    className="toolbar-btn"
                    onClick={redo}
                    disabled={!canRedo()}
                    title="Redo (Cmd+Shift+Z)"
                >
                    ↪️
                </button>
            </div>

            {/* Alignment (when multiple selected) */}
            {hasMultipleSelected && (
                <>
                    <div className="toolbar-divider" />
                    <div className="toolbar-group alignment-group">
                        <span className="group-label">Align:</span>
                        <button
                            className="toolbar-btn small"
                            onClick={() => alignNodes('left')}
                            title="Align Left"
                        >
                            ⬅️
                        </button>
                        <button
                            className="toolbar-btn small"
                            onClick={() => alignNodes('center')}
                            title="Align Center"
                        >
                            ↔️
                        </button>
                        <button
                            className="toolbar-btn small"
                            onClick={() => alignNodes('right')}
                            title="Align Right"
                        >
                            ➡️
                        </button>
                        <button
                            className="toolbar-btn small"
                            onClick={() => alignNodes('top')}
                            title="Align Top"
                        >
                            ⬆️
                        </button>
                        <button
                            className="toolbar-btn small"
                            onClick={() => alignNodes('bottom')}
                            title="Align Bottom"
                        >
                            ⬇️
                        </button>
                    </div>

                    {selectedNodes.length >= 3 && (
                        <div className="toolbar-group distribution-group">
                            <span className="group-label">Distribute:</span>
                            <button
                                className="toolbar-btn small"
                                onClick={() => distributeNodes('horizontal')}
                                title="Distribute Horizontally"
                            >
                                ⟷
                            </button>
                            <button
                                className="toolbar-btn small"
                                onClick={() => distributeNodes('vertical')}
                                title="Distribute Vertically"
                            >
                                ⟳
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/**
 * Context Menu - Right-click actions
 */
function ContextMenu({ state, onClose }: { state: ContextMenuState; onClose: () => void }) {
    const {
        copySelectedNodes,
        cutSelectedNodes,
        pasteNodes,
        duplicateSelectedNodes,
        deleteSelectedNodes,
        selectAllNodes,
        lockSelectedNodes,
        unlockSelectedNodes,
        selectedNodes,
    } = useWorkflowStore();

    useEffect(() => {
        const handleClickOutside = () => onClose();
        if (state.isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [state.isOpen, onClose]);

    if (!state.isOpen) return null;

    const hasSelection = selectedNodes.length > 0;

    return (
        <div
            className="canvas-context-menu"
            style={{ left: state.x, top: state.y }}
            onClick={(e) => e.stopPropagation()}
        >
            <button onClick={() => { selectAllNodes(); onClose(); }}>
                <span className="menu-icon">⌘A</span>
                Select All
            </button>

            <div className="menu-divider" />

            <button onClick={() => { copySelectedNodes(); onClose(); }} disabled={!hasSelection}>
                <span className="menu-icon">⌘C</span>
                Copy
            </button>
            <button onClick={() => { cutSelectedNodes(); onClose(); }} disabled={!hasSelection}>
                <span className="menu-icon">⌘X</span>
                Cut
            </button>
            <button onClick={() => { pasteNodes(); onClose(); }}>
                <span className="menu-icon">⌘V</span>
                Paste
            </button>
            <button onClick={() => { duplicateSelectedNodes(); onClose(); }} disabled={!hasSelection}>
                <span className="menu-icon">⌘D</span>
                Duplicate
            </button>

            <div className="menu-divider" />

            <button onClick={() => { lockSelectedNodes(); onClose(); }} disabled={!hasSelection}>
                <span className="menu-icon">🔒</span>
                Lock
            </button>
            <button onClick={() => { unlockSelectedNodes(); onClose(); }} disabled={!hasSelection}>
                <span className="menu-icon">🔓</span>
                Unlock
            </button>

            <div className="menu-divider" />

            <button
                onClick={() => { deleteSelectedNodes(); onClose(); }}
                disabled={!hasSelection}
                className="danger"
            >
                <span className="menu-icon">⌫</span>
                Delete
            </button>
        </div>
    );
}

/**
 * Selection Info Badge - Shows multi-select count
 */
function SelectionInfoBadge() {
    const { selectedNodes, selectedEdges } = useWorkflowStore();

    if (selectedNodes.length <= 1 && selectedEdges.length === 0) return null;

    return (
        <div className="selection-info-badge">
            {selectedNodes.length > 0 && (
                <span className="selection-count nodes">
                    {selectedNodes.length} nodes
                </span>
            )}
            {selectedEdges.length > 0 && (
                <span className="selection-count edges">
                    {selectedEdges.length} edges
                </span>
            )}
        </div>
    );
}

/**
 * Empty Canvas State - Animated onboarding
 */
function EmptyCanvasState() {
    return (
        <div className="empty-canvas-enhanced">
            <div className="empty-canvas-content">
                <div className="empty-icon-container">
                    <span className="empty-icon pulse">🎨</span>
                    <div className="icon-ring ring-1"></div>
                    <div className="icon-ring ring-2"></div>
                </div>
                <h2 className="empty-title">Build Your Automation Workflow</h2>
                <p className="empty-description">
                    Drag nodes from the left panel to create powerful automation sequences
                </p>
                <div className="empty-hints">
                    <div className="hint">
                        <span className="hint-icon">🖱️</span>
                        <span>Drag & drop nodes from the palette</span>
                    </div>
                    <div className="hint">
                        <span className="hint-icon">🔗</span>
                        <span>Connect nodes by dragging handles</span>
                    </div>
                    <div className="hint">
                        <span className="hint-icon">⌨️</span>
                        <span>Use Cmd+Z to undo, Cmd+D to duplicate</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

function WorkflowCanvas({ onNodeSelect }: WorkflowCanvasProps) {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
    const [contextMenu, setContextMenu] = useState<ContextMenuState>({ isOpen: false, x: 0, y: 0 });

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        selectNode,
        selectNodes,
        selectedNodes,
        isGridVisible,
        isSnapToGridEnabled,
        gridSize,
        isMinimapVisible,
        setViewport,
        setZoomLevel,
        copySelectedNodes,
        cutSelectedNodes,
        pasteNodes,
        duplicateSelectedNodes,
        deleteSelectedNodes,
        undo,
        redo,
        selectAllNodes,
        toggleGrid,
        toggleSnapToGrid,
        toggleMinimap,
    } = useWorkflowStore();

    // ─────────────────────────────────────────────────────────────────────────
    // KEYBOARD SHORTCUTS
    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            const isMeta = e.metaKey || e.ctrlKey;
            const isShift = e.shiftKey;

            // Prevent default for our shortcuts
            const shouldPrevent = (
                (isMeta && ['z', 'y', 'c', 'x', 'v', 'd', 'a', '0', '-', '+', '='].includes(e.key.toLowerCase())) ||
                ['Delete', 'Backspace', 'g', 's', 'm'].includes(e.key)
            );

            if (shouldPrevent && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
                // Undo
                if (isMeta && e.key.toLowerCase() === 'z' && !isShift) {
                    e.preventDefault();
                    undo();
                }
                // Redo
                if (isMeta && ((e.key.toLowerCase() === 'z' && isShift) || e.key.toLowerCase() === 'y')) {
                    e.preventDefault();
                    redo();
                }
                // Copy
                if (isMeta && e.key.toLowerCase() === 'c') {
                    e.preventDefault();
                    copySelectedNodes();
                }
                // Cut
                if (isMeta && e.key.toLowerCase() === 'x') {
                    e.preventDefault();
                    cutSelectedNodes();
                }
                // Paste
                if (isMeta && e.key.toLowerCase() === 'v') {
                    e.preventDefault();
                    pasteNodes();
                }
                // Duplicate
                if (isMeta && e.key.toLowerCase() === 'd') {
                    e.preventDefault();
                    duplicateSelectedNodes();
                }
                // Select All
                if (isMeta && e.key.toLowerCase() === 'a') {
                    e.preventDefault();
                    selectAllNodes();
                }
                // Fit View
                if (isMeta && e.key === '0') {
                    e.preventDefault();
                    reactFlowInstance?.fitView({ padding: 0.2 });
                }
                // Delete
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    deleteSelectedNodes();
                }
                // Toggle Grid
                if (e.key.toLowerCase() === 'g' && !isMeta) {
                    e.preventDefault();
                    toggleGrid();
                }
                // Toggle Snap
                if (e.key.toLowerCase() === 's' && !isMeta) {
                    e.preventDefault();
                    toggleSnapToGrid();
                }
                // Toggle Minimap
                if (e.key.toLowerCase() === 'm' && !isMeta) {
                    e.preventDefault();
                    toggleMinimap();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        undo, redo, copySelectedNodes, cutSelectedNodes, pasteNodes,
        duplicateSelectedNodes, deleteSelectedNodes, selectAllNodes,
        toggleGrid, toggleSnapToGrid, toggleMinimap, reactFlowInstance
    ]);

    // ─────────────────────────────────────────────────────────────────────────
    // REACTFLOW HANDLERS
    // ─────────────────────────────────────────────────────────────────────────
    const onInit = useCallback((instance: ReactFlowInstance) => {
        setReactFlowInstance(instance);
    }, []);

    const onMoveEnd = useCallback((_event: unknown, viewport: Viewport) => {
        setViewport(viewport);
        setZoomLevel(viewport.zoom);
    }, [setViewport, setZoomLevel]);

    const onDragOver = useCallback((event: DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: DragEvent) => {
            event.preventDefault();

            if (!reactFlowWrapper.current || !reactFlowInstance) return;

            const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
            const data = event.dataTransfer.getData('application/reactflow');

            if (!data) return;

            const nodeType: NodeTypeDefinition = JSON.parse(data);

            const position = reactFlowInstance.screenToFlowPosition({
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
            });

            // Snap to grid if enabled
            const snappedPosition = isSnapToGridEnabled ? {
                x: Math.round(position.x / gridSize) * gridSize,
                y: Math.round(position.y / gridSize) * gridSize,
            } : position;

            const newNode: Node<WorkflowNodeData> = {
                id: `${nodeType.subtype}-${Date.now()}`,
                type: nodeType.type,
                position: snappedPosition,
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
        },
        [reactFlowInstance, addNode, isSnapToGridEnabled, gridSize]
    );

    const onNodeClick = useCallback(
        (event: MouseEvent, node: Node<WorkflowNodeData>) => {
            const isMultiSelect = event.metaKey || event.ctrlKey || event.shiftKey;

            if (isMultiSelect) {
                // Toggle selection
                const isSelected = selectedNodes.includes(node.id);
                if (isSelected) {
                    selectNodes(selectedNodes.filter(id => id !== node.id));
                } else {
                    selectNodes([...selectedNodes, node.id]);
                }
            } else {
                // Single select
                selectNode(node);
            }

            onNodeSelect(node);
        },
        [selectNode, selectNodes, selectedNodes, onNodeSelect]
    );

    const onSelectionChange = useCallback(
        (params: OnSelectionChangeParams) => {
            const nodeIds = params.nodes.map(n => n.id);
            if (nodeIds.length > 0) {
                selectNodes(nodeIds);
            }
        },
        [selectNodes]
    );

    const onPaneClick = useCallback(() => {
        selectNode(null);
        onNodeSelect(null);
        setContextMenu({ isOpen: false, x: 0, y: 0 });
    }, [selectNode, onNodeSelect]);

    const onContextMenu = useCallback((event: MouseEvent) => {
        event.preventDefault();
        setContextMenu({
            isOpen: true,
            x: event.clientX,
            y: event.clientY,
        });
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // MINIMAP COLORS
    // ─────────────────────────────────────────────────────────────────────────
    const minimapNodeColor = useCallback((node: Node) => {
        const isSelected = selectedNodes.includes(node.id);
        if (isSelected) return '#ffffff';

        switch (node.type) {
            case 'trigger': return '#8b5cf6';
            case 'action': return '#10b981';
            case 'approval': return '#f59e0b';
            case 'condition': return '#3b82f6';
            case 'delay': return '#06b6d4';
            default: return '#666';
        }
    }, [selectedNodes]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div
            className="canvas-wrapper enhanced"
            ref={reactFlowWrapper}
            onContextMenu={onContextMenu}
        >
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={onInit}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onMoveEnd={onMoveEnd}
                onSelectionChange={onSelectionChange}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                snapToGrid={isSnapToGridEnabled}
                snapGrid={[gridSize, gridSize]}
                selectionMode={SelectionMode.Partial}
                selectionOnDrag
                panOnDrag={[1, 2]} // Left and middle mouse
                selectNodesOnDrag
                multiSelectionKeyCode="Meta"
                deleteKeyCode={null} // We handle delete ourselves
                defaultEdgeOptions={{
                    type: 'smartStep',
                    animated: false, // SmartEdges handle animation
                    style: { stroke: '#8b5cf6', strokeWidth: 2 },
                    markerEnd: {
                        type: 'arrowclosed' as MarkerType,
                        width: 20,
                        height: 20,
                        color: '#8b5cf6',
                    },
                }}
                proOptions={{ hideAttribution: true }}
                minZoom={0.1}
                maxZoom={4}
            >
                {/* Background Grid */}
                {isGridVisible && (
                    <Background
                        variant={BackgroundVariant.Dots}
                        gap={gridSize}
                        size={1}
                        color="rgba(139, 92, 246, 0.3)"
                    />
                )}

                {/* Top Toolbar */}
                <Panel position="top-center">
                    <CanvasToolbar />
                </Panel>

                {/* Selection Info */}
                <Panel position="bottom-center">
                    <SelectionInfoBadge />
                </Panel>

                {/* Controls */}
                <Controls
                    showZoom={false}
                    showFitView={false}
                    showInteractive={true}
                    position="bottom-left"
                />

                {/* Minimap */}
                {isMinimapVisible && (
                    <MiniMap
                        nodeColor={minimapNodeColor}
                        maskColor="rgba(0, 0, 0, 0.85)"
                        pannable
                        zoomable
                        position="bottom-right"
                    />
                )}
            </ReactFlow>

            {/* Context Menu */}
            <ContextMenu
                state={contextMenu}
                onClose={() => setContextMenu({ isOpen: false, x: 0, y: 0 })}
            />

            {/* Empty State */}
            {nodes.length === 0 && <EmptyCanvasState />}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// WRAPPED EXPORT
// ═══════════════════════════════════════════════════════════════════════════

function WorkflowCanvasWithProvider(props: WorkflowCanvasProps) {
    return (
        <ReactFlowProvider>
            <WorkflowCanvas {...props} />
        </ReactFlowProvider>
    );
}

export default WorkflowCanvasWithProvider;
