/**
 * Property Panel - Node configuration sidebar
 * Right sidebar for editing selected node properties
 */

import { X, Settings, Trash2 } from 'lucide-react';
import type { Node } from 'reactflow';
import useWorkflowStore, { type WorkflowNodeData } from '../store/workflowStore';
import { getNodeDefinition, type ConfigField } from '../types/nodeTypes';

interface PropertyPanelProps {
    node: Node<WorkflowNodeData> | null;
    onClose: () => void;
}

const PropertyPanel = ({ node, onClose }: PropertyPanelProps) => {
    const { updateNodeData, updateNodeConfig, deleteNode } = useWorkflowStore();

    if (!node) {
        return (
            <div className="property-panel">
                <div className="panel-header">
                    <span className="panel-title">Properties</span>
                </div>
                <div className="panel-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <div style={{ textAlign: 'center', color: '#666' }}>
                        <Settings size={48} style={{ marginBottom: '16px', opacity: 0.3 }} />
                        <div>Select a node to edit its properties</div>
                    </div>
                </div>
            </div>
        );
    }

    const nodeDefinition = getNodeDefinition(node.data.subtype);
    const configFields = nodeDefinition?.config_fields || [];

    const handleLabelChange = (value: string) => {
        updateNodeData(node.id, { label: value });
    };

    const handleConfigChange = (fieldName: string, value: any) => {
        updateNodeConfig(node.id, { [fieldName]: value });
    };

    const handleDelete = () => {
        if (confirm('Are you sure you want to delete this node?')) {
            deleteNode(node.id);
            onClose();
        }
    };

    const renderField = (field: ConfigField) => {
        const value = node.data.config?.[field.name] ?? field.default ?? '';

        switch (field.type) {
            case 'select':
                return (
                    <select
                        className="form-select"
                        value={value}
                        onChange={(e) => handleConfigChange(field.name, e.target.value)}
                    >
                        {field.options?.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                );

            case 'number':
                return (
                    <input
                        type="number"
                        className="form-input"
                        value={value}
                        placeholder={field.placeholder}
                        onChange={(e) => handleConfigChange(field.name, parseInt(e.target.value) || 0)}
                    />
                );

            case 'boolean':
                return (
                    <div className="form-toggle">
                        <div
                            className={`toggle-switch ${value ? 'active' : ''}`}
                            onClick={() => handleConfigChange(field.name, !value)}
                        />
                        <span style={{ color: '#a3a3a3', fontSize: '14px' }}>
                            {value ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                );

            case 'code':
            case 'json':
                return (
                    <textarea
                        className="form-textarea"
                        value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                        placeholder={field.placeholder}
                        onChange={(e) => handleConfigChange(field.name, e.target.value)}
                    />
                );

            default:
                return (
                    <input
                        type="text"
                        className="form-input"
                        value={value}
                        placeholder={field.placeholder}
                        onChange={(e) => handleConfigChange(field.name, e.target.value)}
                    />
                );
        }
    };

    return (
        <div className="property-panel">
            <div className="panel-header">
                <span className="panel-title">
                    <span style={{ marginRight: '8px' }}>{node.data.icon}</span>
                    {nodeDefinition?.label || 'Node Properties'}
                </span>
                <button className="panel-close" onClick={onClose}>
                    <X size={18} />
                </button>
            </div>

            <div className="panel-content">
                {/* Node Label */}
                <div className="form-group">
                    <label className="form-label">
                        Node Name
                        <span className="form-required">*</span>
                    </label>
                    <input
                        type="text"
                        className="form-input"
                        value={node.data.label}
                        onChange={(e) => handleLabelChange(e.target.value)}
                    />
                </div>

                {/* Divider */}
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    margin: '20px 0',
                    position: 'relative'
                }}>
                    <span style={{
                        position: 'absolute',
                        top: '-10px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#1a1a1a',
                        padding: '0 12px',
                        color: '#666',
                        fontSize: '12px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                    }}>
                        Configuration
                    </span>
                </div>

                {/* Config Fields */}
                {configFields.map((field) => (
                    <div key={field.name} className="form-group">
                        <label className="form-label">
                            {field.label}
                            {field.required && <span className="form-required">*</span>}
                        </label>
                        {renderField(field)}
                        {field.description && (
                            <div className="form-hint">{field.description}</div>
                        )}
                    </div>
                ))}

                {configFields.length === 0 && (
                    <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: '#666',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '8px'
                    }}>
                        No configuration options for this node
                    </div>
                )}

                {/* Delete Button */}
                <div style={{ marginTop: '32px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <button
                        className="btn"
                        onClick={handleDelete}
                        style={{
                            width: '100%',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            justifyContent: 'center'
                        }}
                    >
                        <Trash2 size={16} />
                        Delete Node
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PropertyPanel;
