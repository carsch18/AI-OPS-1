/**
 * Header Component - Top navigation bar
 */

import { useState } from 'react';
import {
    Save,
    Play,
    Settings,
    Upload,
    Download,
    Power
} from 'lucide-react';
import useWorkflowStore from '../store/workflowStore';

interface HeaderProps {
    onSave: () => void;
    onExecute: () => void;
}

const Header = ({ onSave, onExecute }: HeaderProps) => {
    const { workflowName, setWorkflowName, isActive, setIsActive, isSaved } = useWorkflowStore();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    return (
        <header className="header">
            <div className="header-left">
                {/* Logo */}
                <div className="logo">
                    <div className="logo-icon">⚡</div>
                    <span>AIOps Workflows</span>
                </div>

                {/* Divider */}
                <div style={{
                    width: '1px',
                    height: '24px',
                    background: 'rgba(255,255,255,0.1)',
                    margin: '0 8px'
                }} />

                {/* Workflow Name */}
                <input
                    type="text"
                    className="workflow-name"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    placeholder="Workflow Name"
                />

                {/* Unsaved indicator */}
                {!isSaved && (
                    <span style={{
                        color: '#f59e0b',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        <span style={{
                            width: '6px',
                            height: '6px',
                            background: '#f59e0b',
                            borderRadius: '50%'
                        }} />
                        Unsaved
                    </span>
                )}
            </div>

            <div className="header-right">
                {/* Active Toggle */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 12px',
                        background: isActive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                    }}
                    onClick={() => setIsActive(!isActive)}
                >
                    <Power size={16} color={isActive ? '#10b981' : '#666'} />
                    <span style={{
                        fontSize: '13px',
                        color: isActive ? '#10b981' : '#666',
                        fontWeight: 500
                    }}>
                        {isActive ? 'Active' : 'Inactive'}
                    </span>
                </div>

                {/* Save Button */}
                <button className="btn btn-secondary" onClick={onSave}>
                    <Save size={16} />
                    Save
                </button>

                {/* Execute Button */}
                <button className="btn btn-success" onClick={onExecute}>
                    <Play size={16} />
                    Test Run
                </button>

                {/* More Options */}
                <div style={{ position: 'relative' }}>
                    <button
                        className="btn btn-icon"
                        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    >
                        <Settings size={18} />
                    </button>

                    {isDropdownOpen && (
                        <div style={{
                            position: 'absolute',
                            top: '100%',
                            right: 0,
                            marginTop: '8px',
                            background: '#1a1a1a',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: '8px',
                            padding: '8px',
                            minWidth: '180px',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                            zIndex: 1000
                        }}>
                            <button style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                width: '100%',
                                padding: '10px 12px',
                                background: 'none',
                                border: 'none',
                                color: '#a3a3a3',
                                fontSize: '14px',
                                cursor: 'pointer',
                                borderRadius: '6px',
                                transition: 'all 0.15s ease'
                            }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.background = '#2a2a2a';
                                    e.currentTarget.style.color = '#fff';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.background = 'none';
                                    e.currentTarget.style.color = '#a3a3a3';
                                }}
                            >
                                <Download size={16} />
                                Export Workflow
                            </button>
                            <button style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                width: '100%',
                                padding: '10px 12px',
                                background: 'none',
                                border: 'none',
                                color: '#a3a3a3',
                                fontSize: '14px',
                                cursor: 'pointer',
                                borderRadius: '6px',
                                transition: 'all 0.15s ease'
                            }}
                                onMouseOver={(e) => {
                                    e.currentTarget.style.background = '#2a2a2a';
                                    e.currentTarget.style.color = '#fff';
                                }}
                                onMouseOut={(e) => {
                                    e.currentTarget.style.background = 'none';
                                    e.currentTarget.style.color = '#a3a3a3';
                                }}
                            >
                                <Upload size={16} />
                                Import Workflow
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

export default Header;
