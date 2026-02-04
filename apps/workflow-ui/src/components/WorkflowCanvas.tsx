/**
 * Workflow Builder - Main Canvas Component
 * The heart of the visual workflow editor
 */

import { useCallback, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import ReactFlow, {
    Background,
    Controls,
    MiniMap,
    ReactFlowProvider,
    BackgroundVariant,
} from 'reactflow';
import type { Node, ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';

import useWorkflowStore, { type WorkflowNodeData } from '../store/workflowStore';
import { nodeTypes } from './nodes/CustomNodes';
import type { NodeTypeDefinition } from '../types/nodeTypes';

interface WorkflowCanvasProps {
    onNodeSelect: (node: Node<WorkflowNodeData> | null) => void;
}

const WorkflowCanvas = ({ onNodeSelect }: WorkflowCanvasProps) => {
    const reactFlowWrapper = useRef<HTMLDivElement>(null);
    const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

    const {
        nodes,
        edges,
        onNodesChange,
        onEdgesChange,
        onConnect,
        addNode,
        selectNode,
    } = useWorkflowStore();

    const onInit = useCallback((instance: ReactFlowInstance) => {
        setReactFlowInstance(instance);
    }, []);

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

            const position = reactFlowInstance.project({
                x: event.clientX - reactFlowBounds.left,
                y: event.clientY - reactFlowBounds.top,
            });

            const newNode: Node<WorkflowNodeData> = {
                id: `${nodeType.subtype}-${Date.now()}`,
                type: nodeType.type,
                position,
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
        [reactFlowInstance, addNode]
    );

    const onNodeClick = useCallback(
        (_: React.MouseEvent, node: Node<WorkflowNodeData>) => {
            selectNode(node);
            onNodeSelect(node);
        },
        [selectNode, onNodeSelect]
    );

    const onPaneClick = useCallback(() => {
        selectNode(null);
        onNodeSelect(null);
    }, [selectNode, onNodeSelect]);

    return (
        <div className="canvas-wrapper" ref={reactFlowWrapper}>
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
                nodeTypes={nodeTypes}
                fitView
                snapToGrid
                snapGrid={[15, 15]}
                defaultEdgeOptions={{
                    type: 'smoothstep',
                    animated: true,
                    style: { stroke: '#666', strokeWidth: 2 },
                }}
                proOptions={{ hideAttribution: true }}
            >
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1}
                    color="#333"
                />
                <Controls />
                <MiniMap
                    nodeColor={(node) => {
                        switch (node.type) {
                            case 'trigger':
                                return '#8b5cf6';
                            case 'action':
                                return '#10b981';
                            case 'approval':
                                return '#f59e0b';
                            case 'condition':
                                return '#3b82f6';
                            case 'delay':
                                return '#06b6d4';
                            default:
                                return '#666';
                        }
                    }}
                    maskColor="rgba(0, 0, 0, 0.8)"
                />
            </ReactFlow>

            {/* Empty state */}
            {nodes.length === 0 && (
                <div className="empty-canvas">
                    <div className="empty-icon">🎨</div>
                    <div className="empty-title">Start Building Your Workflow</div>
                    <div className="empty-desc">
                        Drag nodes from the left panel onto this canvas to create your automation workflow
                    </div>
                </div>
            )}
        </div>
    );
};

// Wrap with provider
const WorkflowCanvasWithProvider = (props: WorkflowCanvasProps) => (
    <ReactFlowProvider>
        <WorkflowCanvas {...props} />
    </ReactFlowProvider>
);

export default WorkflowCanvasWithProvider;
