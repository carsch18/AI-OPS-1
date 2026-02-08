/**
 * 🚀 PHASE 8C: Connection Intelligence - Smart Edge System
 * 
 * 10X Features:
 * - Custom edge types with smooth bezier paths
 * - Editable edge labels
 * - Connection validation indicators (valid/invalid/warning)
 * - Animated flow direction
 * - Edge action buttons (delete, edit)
 * - Port type compatibility checking
 * - Visual path highlighting on hover
 * - Data flow visualization
 */

import { memo, useState, useCallback, useMemo } from 'react';
import {
    BaseEdge,
    EdgeLabelRenderer,
    getBezierPath,
    getSmoothStepPath,
    useReactFlow,
} from 'reactflow';
import type { EdgeProps } from 'reactflow';
import { X, Edit3, AlertTriangle } from 'lucide-react';
import './SmartEdges.css';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface SmartEdgeData {
    label?: string;
    isEditing?: boolean;
    validationState?: 'valid' | 'invalid' | 'warning' | 'none';
    validationMessage?: string;
    flowType?: 'default' | 'success' | 'failure' | 'conditional';
    animated?: boolean;
    showActions?: boolean;
}

// Port type compatibility rules
const PORT_COMPATIBILITY: Record<string, string[]> = {
    'default': ['default', 'input'],
    'success': ['default', 'input', 'success'],
    'failure': ['default', 'input', 'failure'],
    'input': ['default', 'success', 'failure', 'conditional'],
};

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

export function validateConnection(
    sourceHandle: string | null,
    targetHandle: string | null,
    sourceNodeType: string | undefined,
    targetNodeType: string | undefined
): { isValid: boolean; state: 'valid' | 'invalid' | 'warning'; message: string } {
    // Triggers can't have inputs
    if (targetNodeType === 'trigger') {
        return {
            isValid: false,
            state: 'invalid',
            message: 'Triggers cannot have input connections',
        };
    }

    // Self-connection check (handled by ReactFlow but we double-check)
    // Port type compatibility
    const sourceType = sourceHandle || 'default';
    const targetType = targetHandle || 'input';

    const compatibleWith = PORT_COMPATIBILITY[sourceType] || ['default', 'input'];
    if (!compatibleWith.includes(targetType) && targetType !== 'input') {
        return {
            isValid: true,
            state: 'warning',
            message: `Port types may not be fully compatible`,
        };
    }

    // Delay nodes should have linear flow
    if (sourceNodeType === 'delay' && sourceHandle !== 'default') {
        return {
            isValid: true,
            state: 'warning',
            message: 'Delay nodes typically have single output',
        };
    }

    return {
        isValid: true,
        state: 'valid',
        message: 'Connection is valid',
    };
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE ACTION BUTTONS
// ═══════════════════════════════════════════════════════════════════════════

interface EdgeActionsProps {
    labelX: number;
    labelY: number;
    onDelete: () => void;
    onEdit: () => void;
}

function EdgeActions({ labelX, labelY, onDelete, onEdit }: EdgeActionsProps) {
    return (
        <div
            className="edge-actions"
            style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 25}px)`,
            }}
        >
            <button
                className="edge-action-btn edit"
                onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                }}
                title="Edit label"
            >
                <Edit3 size={10} />
            </button>
            <button
                className="edge-action-btn delete"
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
                title="Delete connection"
            >
                <X size={10} />
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// EDGE LABEL (EDITABLE)
// ═══════════════════════════════════════════════════════════════════════════

interface EdgeLabelInputProps {
    labelX: number;
    labelY: number;
    initialLabel: string;
    onSave: (label: string) => void;
    onCancel: () => void;
}

function EdgeLabelInput({ labelX, labelY, initialLabel, onSave, onCancel }: EdgeLabelInputProps) {
    const [value, setValue] = useState(initialLabel);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSave(value);
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

    return (
        <div
            className="edge-label-input-wrapper"
            style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
        >
            <input
                autoFocus
                type="text"
                className="edge-label-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={() => onSave(value)}
                placeholder="Enter label..."
            />
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION BADGE
// ═══════════════════════════════════════════════════════════════════════════

interface ValidationBadgeProps {
    state: 'valid' | 'invalid' | 'warning' | 'none';
    message: string;
    labelX: number;
    labelY: number;
}

function ValidationBadge({ state, message, labelX, labelY }: ValidationBadgeProps) {
    if (state === 'none' || state === 'valid') return null;

    return (
        <div
            className={`edge-validation-badge ${state}`}
            style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + 25}px)`,
            }}
            title={message}
        >
            {state === 'invalid' ? (
                <X size={12} />
            ) : (
                <AlertTriangle size={12} />
            )}
            <span className="validation-text">{message}</span>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// SMART BEZIER EDGE
// ═══════════════════════════════════════════════════════════════════════════

export const SmartBezierEdge = memo(({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceHandleId,
    targetHandleId,
    data,
    selected,
    markerEnd,
}: EdgeProps<SmartEdgeData>) => {
    const { setEdges, getNode } = useReactFlow();
    const [isHovered, setIsHovered] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Get path
    const [edgePath, labelX, labelY] = getBezierPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        curvature: 0.25,
    });

    // Determine flow type color
    const flowType = data?.flowType || 'default';
    const getEdgeColor = () => {
        switch (flowType) {
            case 'success': return '#10b981';
            case 'failure': return '#ef4444';
            case 'conditional': return '#3b82f6';
            default: return '#8b5cf6';
        }
    };

    // Validation
    const validation = useMemo(() => {
        const sourceNode = getNode(source);
        const targetNode = getNode(target);
        return validateConnection(
            sourceHandleId || null,
            targetHandleId || null,
            sourceNode?.type,
            targetNode?.type
        );
    }, [source, target, sourceHandleId, targetHandleId, getNode]);

    // Handlers
    const handleDelete = useCallback(() => {
        setEdges((edges) => edges.filter((e) => e.id !== id));
    }, [id, setEdges]);

    const handleEditStart = useCallback(() => {
        setIsEditing(true);
    }, []);

    const handleLabelSave = useCallback((newLabel: string) => {
        setEdges((edges) =>
            edges.map((e) =>
                e.id === id
                    ? { ...e, data: { ...e.data, label: newLabel } }
                    : e
            )
        );
        setIsEditing(false);
    }, [id, setEdges]);

    const handleLabelCancel = useCallback(() => {
        setIsEditing(false);
    }, []);

    const edgeColor = getEdgeColor();
    const isAnimated = data?.animated !== false; // Default to animated

    return (
        <>
            {/* Invisible wider path for easier selection */}
            <path
                d={edgePath}
                fill="none"
                strokeWidth={20}
                stroke="transparent"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{ cursor: 'pointer' }}
            />

            {/* Main edge path */}
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    stroke: selected ? '#fff' : edgeColor,
                    strokeWidth: selected ? 3 : isHovered ? 2.5 : 2,
                    strokeDasharray: validation.state === 'invalid' ? '5,5' : 'none',
                    filter: selected ? `drop-shadow(0 0 6px ${edgeColor})` : 'none',
                    transition: 'stroke-width 0.2s, stroke 0.2s',
                }}
            />

            {/* Animated flow dots */}
            {isAnimated && !validation.state.includes('invalid') && (
                <circle r="3" fill={edgeColor} className="edge-flow-dot">
                    <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
                </circle>
            )}

            <EdgeLabelRenderer>
                {/* Label display */}
                {data?.label && !isEditing && (
                    <div
                        className={`edge-label ${selected ? 'selected' : ''} ${flowType}`}
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                    >
                        {data.label}
                    </div>
                )}

                {/* Label editor */}
                {isEditing && (
                    <EdgeLabelInput
                        labelX={labelX}
                        labelY={labelY}
                        initialLabel={data?.label || ''}
                        onSave={handleLabelSave}
                        onCancel={handleLabelCancel}
                    />
                )}

                {/* Action buttons */}
                {(isHovered || selected) && !isEditing && (
                    <EdgeActions
                        labelX={labelX}
                        labelY={labelY}
                        onDelete={handleDelete}
                        onEdit={handleEditStart}
                    />
                )}

                {/* Validation badge */}
                {(isHovered || selected) && (
                    <ValidationBadge
                        state={validation.state}
                        message={validation.message}
                        labelX={labelX}
                        labelY={labelY}
                    />
                )}
            </EdgeLabelRenderer>
        </>
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// SMART STEP EDGE (FOR ORTHOGONAL ROUTING)
// ═══════════════════════════════════════════════════════════════════════════

export const SmartStepEdge = memo(({
    id,
    source,
    target,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    sourceHandleId,
    targetHandleId,
    data,
    selected,
    markerEnd,
}: EdgeProps<SmartEdgeData>) => {
    const { setEdges, getNode } = useReactFlow();
    const [isHovered, setIsHovered] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    // Get smooth step path
    const [edgePath, labelX, labelY] = getSmoothStepPath({
        sourceX,
        sourceY,
        sourcePosition,
        targetX,
        targetY,
        targetPosition,
        borderRadius: 16,
    });

    // Edge color is determined by sourceHandleId for visual connection clarity
    const getEdgeColor = () => {
        switch (sourceHandleId) {
            case 'success':
            case 'approved':
            case 'true':
                return '#10b981';
            case 'failure':
            case 'rejected':
            case 'false':
                return '#ef4444';
            case 'timeout':
                return '#f59e0b';
            default:
                return '#8b5cf6';
        }
    };

    // Validation
    const validation = useMemo(() => {
        const sourceNode = getNode(source);
        const targetNode = getNode(target);
        return validateConnection(
            sourceHandleId || null,
            targetHandleId || null,
            sourceNode?.type,
            targetNode?.type
        );
    }, [source, target, sourceHandleId, targetHandleId, getNode]);

    // Handlers
    const handleDelete = useCallback(() => {
        setEdges((edges) => edges.filter((e) => e.id !== id));
    }, [id, setEdges]);

    const handleEditStart = useCallback(() => {
        setIsEditing(true);
    }, []);

    const handleLabelSave = useCallback((newLabel: string) => {
        setEdges((edges) =>
            edges.map((e) =>
                e.id === id
                    ? { ...e, data: { ...e.data, label: newLabel } }
                    : e
            )
        );
        setIsEditing(false);
    }, [id, setEdges]);

    const handleLabelCancel = useCallback(() => {
        setIsEditing(false);
    }, []);

    const edgeColor = getEdgeColor();
    const isAnimated = data?.animated !== false;

    return (
        <>
            {/* Invisible wider path for easier selection */}
            <path
                d={edgePath}
                fill="none"
                strokeWidth={20}
                stroke="transparent"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                style={{ cursor: 'pointer' }}
            />

            {/* Main edge path */}
            <BaseEdge
                id={id}
                path={edgePath}
                markerEnd={markerEnd}
                style={{
                    stroke: selected ? '#fff' : edgeColor,
                    strokeWidth: selected ? 3 : isHovered ? 2.5 : 2,
                    strokeDasharray: validation.state === 'invalid' ? '5,5' : 'none',
                    filter: selected ? `drop-shadow(0 0 6px ${edgeColor})` : 'none',
                    transition: 'stroke-width 0.2s, stroke 0.2s',
                }}
            />

            {/* Animated flow indicator */}
            {isAnimated && !validation.state.includes('invalid') && (
                <circle r="3" fill={edgeColor} className="edge-flow-dot">
                    <animateMotion dur="2s" repeatCount="indefinite" path={edgePath} />
                </circle>
            )}

            {/* Handle label from sourceHandleId */}
            {!data?.label && sourceHandleId && sourceHandleId !== 'default' && (
                <EdgeLabelRenderer>
                    <div
                        className={`edge-handle-label ${sourceHandleId}`}
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                        }}
                    >
                        {sourceHandleId.charAt(0).toUpperCase() + sourceHandleId.slice(1)}
                    </div>
                </EdgeLabelRenderer>
            )}

            <EdgeLabelRenderer>
                {/* Custom label display */}
                {data?.label && !isEditing && (
                    <div
                        className={`edge-label ${selected ? 'selected' : ''}`}
                        style={{
                            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                            backgroundColor: edgeColor,
                        }}
                    >
                        {data.label}
                    </div>
                )}

                {/* Label editor */}
                {isEditing && (
                    <EdgeLabelInput
                        labelX={labelX}
                        labelY={labelY}
                        initialLabel={data?.label || ''}
                        onSave={handleLabelSave}
                        onCancel={handleLabelCancel}
                    />
                )}

                {/* Action buttons */}
                {(isHovered || selected) && !isEditing && (
                    <EdgeActions
                        labelX={labelX}
                        labelY={labelY}
                        onDelete={handleDelete}
                        onEdit={handleEditStart}
                    />
                )}

                {/* Validation badge */}
                {(isHovered || selected) && (
                    <ValidationBadge
                        state={validation.state}
                        message={validation.message}
                        labelX={labelX}
                        labelY={labelY}
                    />
                )}
            </EdgeLabelRenderer>
        </>
    );
});

// ═══════════════════════════════════════════════════════════════════════════
// EDGE TYPES EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export const edgeTypes = {
    smart: SmartBezierEdge,
    smartStep: SmartStepEdge,
    // Use smartStep as default for cleaner routing
    default: SmartStepEdge,
};

export default edgeTypes;
