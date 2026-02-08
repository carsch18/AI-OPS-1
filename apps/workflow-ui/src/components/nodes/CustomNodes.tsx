/**
 * Custom Workflow Nodes - React Flow
 * Beautiful, animated nodes with proper handles
 */

import { memo, useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { MoreVertical } from 'lucide-react';
import type { WorkflowNodeData } from '../../store/workflowStore';
import { getNodeDefinition } from '../../types/nodeTypes';

interface CustomNodeProps extends NodeProps<WorkflowNodeData> { }

// Base Node Component
const BaseNode = memo(({ data, selected }: CustomNodeProps) => {
    const nodeDefinition = useMemo(() => getNodeDefinition(data.subtype), [data.subtype]);

    const nodeTypeClass = data.type;
    const hasInputs = nodeDefinition?.inputs && nodeDefinition.inputs.length > 0;
    const outputs = nodeDefinition?.outputs || [{ name: 'default', label: 'Output', type: 'default' }];

    // Get config preview
    const configPreview = useMemo(() => {
        const config = data.config || {};
        const entries = Object.entries(config);
        if (entries.length === 0) return null;

        const firstEntry = entries[0];
        if (firstEntry[1]) {
            return `${firstEntry[0]}: ${String(firstEntry[1]).substring(0, 30)}...`;
        }
        return null;
    }, [data.config]);

    return (
        <div className={`workflow-node ${selected ? 'selected' : ''}`}>
            {/* Input Handle */}
            {hasInputs && (
                <Handle
                    type="target"
                    position={Position.Left}
                    id="input"
                    style={{ background: '#666' }}
                />
            )}

            {/* Header */}
            <div className="node-header">
                <div className={`node-icon ${nodeTypeClass}`}>
                    {data.icon}
                </div>
                <span className="node-title">{data.label}</span>
                <button className="node-menu-btn" onClick={(e) => e.stopPropagation()}>
                    <MoreVertical size={14} />
                </button>
            </div>

            {/* Body */}
            {(configPreview || data.description) && (
                <div className="node-body">
                    {configPreview && (
                        <div className="node-config-preview">
                            {configPreview}
                        </div>
                    )}
                </div>
            )}

            {/* Output Handles */}
            {outputs.map((output, index) => {
                const totalOutputs = outputs.length;
                const position = totalOutputs === 1
                    ? 50
                    : 20 + (index * (60 / (totalOutputs - 1)));

                return (
                    <Handle
                        key={output.name}
                        type="source"
                        position={Position.Right}
                        id={output.name}
                        style={{
                            top: `${position}%`,
                            background: output.type === 'success' ? '#10b981'
                                : output.type === 'failure' ? '#ef4444'
                                    : '#666'
                        }}
                    />
                );
            })}
        </div>
    );
});

// Trigger Node - Purple glow
export const TriggerNode = memo((props: CustomNodeProps) => {
    return (
        <div style={{
            filter: props.selected ? 'drop-shadow(0 0 8px rgba(139, 92, 246, 0.5))' : 'none',
            transition: 'filter 0.2s ease'
        }}>
            <BaseNode {...props} />
        </div>
    );
});

// Action Node - Green glow
export const ActionNode = memo((props: CustomNodeProps) => {
    return (
        <div style={{
            filter: props.selected ? 'drop-shadow(0 0 8px rgba(16, 185, 129, 0.5))' : 'none',
            transition: 'filter 0.2s ease'
        }}>
            <BaseNode {...props} />
        </div>
    );
});

// Approval Node - Orange glow with special styling
export const ApprovalNode = memo((props: CustomNodeProps) => {
    const { data } = props;

    return (
        <div style={{
            filter: props.selected ? 'drop-shadow(0 0 8px rgba(245, 158, 11, 0.5))' : 'none',
            transition: 'filter 0.2s ease'
        }}>
            <div className={`workflow-node ${props.selected ? 'selected' : ''}`}>
                {/* Input Handle */}
                <Handle
                    type="target"
                    position={Position.Left}
                    id="input"
                    style={{ background: '#666' }}
                />

                {/* Header */}
                <div className="node-header" style={{ borderBottom: '2px solid #f59e0b' }}>
                    <div className="node-icon approval">
                        {data.icon}
                    </div>
                    <span className="node-title">{data.label}</span>
                    <button className="node-menu-btn" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical size={14} />
                    </button>
                </div>

                {/* Body with approval info */}
                <div className="node-body">
                    <div className="node-config-preview">
                        ⏱️ Timeout: {String(data.config?.timeout_minutes ?? 30)}m
                    </div>
                </div>

                {/* Status */}
                <div className="node-status">
                    <span className="node-status-dot pending"></span>
                    Requires Human Approval
                </div>

                {/* Output Handles - Approved, Rejected, Timeout */}
                <Handle
                    type="source"
                    position={Position.Right}
                    id="approved"
                    style={{ top: '25%', background: '#10b981' }}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="rejected"
                    style={{ top: '50%', background: '#ef4444' }}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="timeout"
                    style={{ top: '75%', background: '#666' }}
                />
            </div>
        </div>
    );
});

// Condition Node - Blue glow with diamond shape indicator
export const ConditionNode = memo((props: CustomNodeProps) => {
    const { data } = props;

    return (
        <div style={{
            filter: props.selected ? 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))' : 'none',
            transition: 'filter 0.2s ease'
        }}>
            <div className={`workflow-node ${props.selected ? 'selected' : ''}`}>
                {/* Input Handle */}
                <Handle
                    type="target"
                    position={Position.Left}
                    id="input"
                    style={{ background: '#666' }}
                />

                {/* Header */}
                <div className="node-header" style={{ borderBottom: '2px solid #3b82f6' }}>
                    <div className="node-icon condition">
                        {data.icon}
                    </div>
                    <span className="node-title">{data.label}</span>
                    <button className="node-menu-btn" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical size={14} />
                    </button>
                </div>

                {/* Body with condition preview */}
                <div className="node-body">
                    <div className="node-config-preview">
                        {String(data.config?.left_value ?? '{{value}}')} {String(data.config?.condition_type ?? 'equals')} {String(data.config?.right_value ?? '?')}
                    </div>
                </div>

                {/* Output Handles - True / False */}
                <Handle
                    type="source"
                    position={Position.Right}
                    id="true"
                    style={{ top: '35%', background: '#10b981' }}
                />
                <Handle
                    type="source"
                    position={Position.Right}
                    id="false"
                    style={{ top: '65%', background: '#ef4444' }}
                />
            </div>
        </div>
    );
});

// Delay Node - Cyan glow
export const DelayNode = memo((props: CustomNodeProps) => {
    const { data } = props;

    return (
        <div style={{
            filter: props.selected ? 'drop-shadow(0 0 8px rgba(6, 182, 212, 0.5))' : 'none',
            transition: 'filter 0.2s ease'
        }}>
            <div className={`workflow-node ${props.selected ? 'selected' : ''}`}>
                {/* Input Handle */}
                <Handle
                    type="target"
                    position={Position.Left}
                    id="input"
                    style={{ background: '#666' }}
                />

                {/* Header */}
                <div className="node-header" style={{ borderBottom: '2px solid #06b6d4' }}>
                    <div className="node-icon delay">
                        {data.icon}
                    </div>
                    <span className="node-title">{data.label}</span>
                    <button className="node-menu-btn" onClick={(e) => e.stopPropagation()}>
                        <MoreVertical size={14} />
                    </button>
                </div>

                {/* Body */}
                <div className="node-body">
                    <div className="node-config-preview">
                        ⏳ Wait {String(data.config?.duration_seconds ?? 10)} seconds
                    </div>
                </div>

                {/* Output Handle */}
                <Handle
                    type="source"
                    position={Position.Right}
                    id="default"
                    style={{ background: '#666' }}
                />
            </div>
        </div>
    );
});

// Node type mapping for React Flow
export const nodeTypes = {
    trigger: TriggerNode,
    action: ActionNode,
    approval: ApprovalNode,
    condition: ConditionNode,
    delay: DelayNode,
};

export default nodeTypes;
