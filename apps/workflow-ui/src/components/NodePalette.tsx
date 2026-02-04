/**
 * Node Palette - Draggable node list
 * Left sidebar with all available node types
 */

import { useState, useMemo } from 'react';
import type { DragEvent } from 'react';
import { Search } from 'lucide-react';
import { getNodesByCategory } from '../types/nodeTypes';
import type { NodeTypeDefinition } from '../types/nodeTypes';

interface NodePaletteProps {
    onDragStart?: (event: DragEvent, nodeType: NodeTypeDefinition) => void;
}

const NodePalette = ({ onDragStart }: NodePaletteProps) => {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter nodes by search query
    const filteredNodes = useMemo(() => {
        if (!searchQuery.trim()) {
            return {
                triggers: getNodesByCategory('trigger'),
                actions: getNodesByCategory('action'),
                flow: getNodesByCategory('flow'),
            };
        }

        const query = searchQuery.toLowerCase();
        const filterFn = (node: NodeTypeDefinition) =>
            node.label.toLowerCase().includes(query) ||
            node.description.toLowerCase().includes(query);

        return {
            triggers: getNodesByCategory('trigger').filter(filterFn),
            actions: getNodesByCategory('action').filter(filterFn),
            flow: getNodesByCategory('flow').filter(filterFn),
        };
    }, [searchQuery]);

    const handleDragStart = (event: DragEvent, nodeType: NodeTypeDefinition) => {
        event.dataTransfer.setData('application/reactflow', JSON.stringify(nodeType));
        event.dataTransfer.effectAllowed = 'move';
        onDragStart?.(event, nodeType);
    };

    const renderCategory = (
        title: string,
        icon: string,
        nodes: NodeTypeDefinition[],
        categoryClass: string
    ) => {
        if (nodes.length === 0) return null;

        return (
            <div className="palette-category">
                <div className="category-title">
                    <span className="category-icon">{icon}</span>
                    {title}
                </div>
                <div className="palette-nodes">
                    {nodes.map((node) => (
                        <div
                            key={node.subtype}
                            className="palette-node"
                            draggable
                            onDragStart={(e) => handleDragStart(e, node)}
                        >
                            <div className={`palette-node-icon ${categoryClass}`}>
                                {node.icon}
                            </div>
                            <div className="palette-node-info">
                                <div className="palette-node-label">{node.label}</div>
                                <div className="palette-node-desc">{node.description}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="node-palette">
            <div className="palette-header">
                <div className="palette-title">Nodes</div>
                <div style={{ position: 'relative' }}>
                    <Search
                        size={16}
                        style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#666',
                            pointerEvents: 'none',
                        }}
                    />
                    <input
                        type="text"
                        className="palette-search"
                        placeholder="Search nodes..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{ paddingLeft: '36px' }}
                    />
                </div>
            </div>

            <div className="palette-content">
                {renderCategory('Triggers', '🎯', filteredNodes.triggers, 'trigger')}
                {renderCategory('Actions', '⚡', filteredNodes.actions, 'action')}
                {renderCategory('Flow Control', '🔀', filteredNodes.flow, 'flow')}

                {filteredNodes.triggers.length === 0 &&
                    filteredNodes.actions.length === 0 &&
                    filteredNodes.flow.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
                            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🔍</div>
                            <div>No nodes found</div>
                        </div>
                    )}
            </div>
        </div>
    );
};

export default NodePalette;
