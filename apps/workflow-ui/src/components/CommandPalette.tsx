/**
 * CommandPalette — Spotlight-style quick navigation
 * 
 * Phase 4 feature: ⌘+K opens a fuzzy search overlay to
 * jump between any page, with keyboard arrow navigation.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import './CommandPalette.css';

interface PaletteItem {
    label: string;
    path: string;
    icon: string;
    keywords: string;
}

const ALL_ITEMS: PaletteItem[] = [
    { label: 'Command Center', path: '/', icon: '📊', keywords: 'dashboard home overview' },
    { label: 'AI Chat', path: '/ai-chat', icon: '🤖', keywords: 'assistant copilot chat' },
    { label: 'Incidents', path: '/incidents', icon: '⚠️', keywords: 'incident alert page' },
    { label: 'Alerts', path: '/alerts', icon: '🔔', keywords: 'alert notification' },
    { label: 'Autonomous Ops', path: '/autonomous', icon: '🛰️', keywords: 'auto autonomous remediation' },
    { label: 'Workflow Builder', path: '/workflows', icon: '🔗', keywords: 'workflow builder canvas' },
    { label: 'Issues', path: '/issues', icon: '🔥', keywords: 'issue bug flame' },
    { label: 'Remediation', path: '/remediation', icon: '🔧', keywords: 'remediation fix workflow' },
    { label: 'Executors', path: '/executors', icon: '💻', keywords: 'ssh docker api executor' },
    { label: 'Analytics', path: '/analytics', icon: '📈', keywords: 'analytics metrics chart' },
    { label: 'Settings', path: '/settings', icon: '⚙️', keywords: 'settings preferences config' },
];

interface CommandPaletteProps {
    open: boolean;
    onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const navigate = useNavigate();

    // Filter items by fuzzy match
    const filtered = useMemo(() => {
        if (!query.trim()) return ALL_ITEMS;
        const q = query.toLowerCase();
        return ALL_ITEMS.filter(
            item =>
                item.label.toLowerCase().includes(q) ||
                item.keywords.includes(q)
        );
    }, [query]);

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setQuery('');
            setSelected(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Keyboard navigation
    useEffect(() => {
        if (!open) return;

        function handleKey(e: KeyboardEvent) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected(s => Math.min(s + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected(s => Math.max(s - 1, 0));
            } else if (e.key === 'Enter' && filtered[selected]) {
                e.preventDefault();
                navigate(filtered[selected].path);
                onClose();
            }
        }

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [open, filtered, selected, navigate, onClose]);

    // Reset selection when query changes
    useEffect(() => {
        setSelected(0);
    }, [query]);

    if (!open) return null;

    return (
        <div className="cp-overlay" onClick={onClose}>
            <div className="cp-modal" onClick={e => e.stopPropagation()}>
                <div className="cp-search-row">
                    <span className="cp-search-icon">🔍</span>
                    <input
                        ref={inputRef}
                        className="cp-input"
                        type="text"
                        placeholder="Jump to page…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <kbd className="cp-kbd">esc</kbd>
                </div>
                <div className="cp-results">
                    {filtered.length === 0 ? (
                        <div className="cp-empty">No results found</div>
                    ) : (
                        filtered.map((item, i) => (
                            <button
                                key={item.path}
                                className={`cp-item ${i === selected ? 'cp-item-active' : ''}`}
                                onClick={() => {
                                    navigate(item.path);
                                    onClose();
                                }}
                                onMouseEnter={() => setSelected(i)}
                            >
                                <span className="cp-item-icon">{item.icon}</span>
                                <span className="cp-item-label">{item.label}</span>
                                <span className="cp-item-shortcut">↵</span>
                            </button>
                        ))
                    )}
                </div>
                <div className="cp-footer">
                    <span><kbd>↑↓</kbd> navigate</span>
                    <span><kbd>↵</kbd> open</span>
                    <span><kbd>esc</kbd> close</span>
                </div>
            </div>
        </div>
    );
}

export default CommandPalette;
