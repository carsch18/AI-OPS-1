/**
 * 🚀 PHASE 8B: Smart Node System - Enhanced Node Palette
 * 
 * 10X Features:
 * - Intelligent fuzzy search with relevance ranking
 * - Favorites system (persisted to localStorage)
 * - Recently used nodes section
 * - Keyboard navigation (arrow keys + Enter)
 * - Collapsible categories with memory
 * - Node preview cards with config hints
 * - Quick actions bar (most common nodes)
 * - Drag ghost preview
 * - Search highlighting
 */

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { DragEvent, KeyboardEvent } from 'react';
import {
    Search,
    Star,
    Clock,
    ChevronDown,
    ChevronRight,
    Zap,
    Sparkles,
    GripVertical
} from 'lucide-react';
import { NODE_TYPES, getNodesByCategory } from '../types/nodeTypes';
import type { NodeTypeDefinition } from '../types/nodeTypes';
import './SmartNodePalette.css';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SmartNodePaletteProps {
    onDragStart?: (event: DragEvent, nodeType: NodeTypeDefinition) => void;
    onNodeDoubleClick?: (nodeType: NodeTypeDefinition) => void;
}

interface SearchResult {
    node: NodeTypeDefinition;
    score: number;
    matchedFields: string[];
}

type CategoryKey = 'favorites' | 'recent' | 'trigger' | 'action' | 'flow';

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENCE HELPERS
// ═══════════════════════════════════════════════════════════════════════════

const FAVORITES_KEY = 'aiops_node_favorites';
const RECENT_KEY = 'aiops_node_recent';
const COLLAPSED_KEY = 'aiops_palette_collapsed';

const loadFavorites = (): string[] => {
    try {
        return JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    } catch {
        return [];
    }
};

const saveFavorites = (favorites: string[]) => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
};

const loadRecent = (): string[] => {
    try {
        return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    } catch {
        return [];
    }
};

const saveRecent = (recent: string[]) => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 8))); // Keep last 8
};

const loadCollapsed = (): Record<string, boolean> => {
    try {
        return JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}');
    } catch {
        return {};
    }
};

const saveCollapsed = (collapsed: Record<string, boolean>) => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
};

// ═══════════════════════════════════════════════════════════════════════════
// FUZZY SEARCH
// ═══════════════════════════════════════════════════════════════════════════

const fuzzySearch = (query: string, nodes: NodeTypeDefinition[]): SearchResult[] => {
    if (!query.trim()) return [];

    const terms = query.toLowerCase().split(/\s+/);
    const results: SearchResult[] = [];

    for (const node of nodes) {
        let totalScore = 0;
        const matchedFields: string[] = [];

        const fields = [
            { name: 'label', value: node.label.toLowerCase(), weight: 3 },
            { name: 'subtype', value: node.subtype.toLowerCase(), weight: 2 },
            { name: 'description', value: node.description.toLowerCase(), weight: 1 },
            { name: 'category', value: node.category.toLowerCase(), weight: 0.5 },
        ];

        for (const term of terms) {
            for (const field of fields) {
                if (field.value.includes(term)) {
                    // Exact match at start gets bonus
                    const startsWithBonus = field.value.startsWith(term) ? 2 : 0;
                    totalScore += (field.weight + startsWithBonus);
                    if (!matchedFields.includes(field.name)) {
                        matchedFields.push(field.name);
                    }
                }
            }
        }

        if (totalScore > 0) {
            results.push({ node, score: totalScore, matchedFields });
        }
    }

    return results.sort((a, b) => b.score - a.score);
};

// ═══════════════════════════════════════════════════════════════════════════
// HIGHLIGHT TEXT
// ═══════════════════════════════════════════════════════════════════════════

function HighlightedText({ text, query }: { text: string; query: string }) {
    if (!query.trim()) return <>{text}</>;

    const terms = query.toLowerCase().split(/\s+/);
    let result = text;

    for (const term of terms) {
        const regex = new RegExp(`(${term})`, 'gi');
        result = result.replace(regex, '###$1###');
    }

    const parts = result.split('###');

    return (
        <>
            {parts.map((part, i) => {
                const isMatch = terms.some(t => part.toLowerCase() === t);
                return isMatch ? (
                    <mark key={i} className="search-highlight">{part}</mark>
                ) : (
                    <span key={i}>{part}</span>
                );
            })}
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// NODE CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface NodeCardProps {
    node: NodeTypeDefinition;
    query: string;
    isFavorite: boolean;
    isSelected: boolean;
    onDragStart: (e: DragEvent, node: NodeTypeDefinition) => void;
    onToggleFavorite: (subtype: string) => void;
    onDoubleClick?: (node: NodeTypeDefinition) => void;
    onNodeUsed: (subtype: string) => void;
}

function NodeCard({
    node,
    query,
    isFavorite,
    isSelected,
    onDragStart,
    onToggleFavorite,
    onDoubleClick,
    onNodeUsed,
}: NodeCardProps) {
    const handleDragStart = (e: DragEvent) => {
        onNodeUsed(node.subtype);

        // Create custom drag preview
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = `
            <span class="ghost-icon">${node.icon}</span>
            <span class="ghost-label">${node.label}</span>
        `;
        ghost.style.position = 'absolute';
        ghost.style.top = '-1000px';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 20, 20);

        setTimeout(() => ghost.remove(), 0);

        onDragStart(e, node);
    };

    const handleDoubleClick = () => {
        onNodeUsed(node.subtype);
        onDoubleClick?.(node);
    };

    const configHint = useMemo(() => {
        const required = node.config_fields.filter(f => f.required).length;
        const total = node.config_fields.length;
        if (total === 0) return null;
        return required > 0 ? `${required} required field${required > 1 ? 's' : ''}` : `${total} optional field${total > 1 ? 's' : ''}`;
    }, [node.config_fields]);

    return (
        <div
            className={`smart-node-card ${node.category} ${isSelected ? 'selected' : ''}`}
            draggable
            onDragStart={handleDragStart}
            onDoubleClick={handleDoubleClick}
            tabIndex={0}
        >
            <div className="node-card-drag-handle">
                <GripVertical size={12} />
            </div>

            <div className={`node-card-icon ${node.category}`}>
                {node.icon}
            </div>

            <div className="node-card-content">
                <div className="node-card-label">
                    <HighlightedText text={node.label} query={query} />
                </div>
                <div className="node-card-desc">
                    <HighlightedText text={node.description} query={query} />
                </div>
                {configHint && (
                    <div className="node-card-config-hint">
                        {configHint}
                    </div>
                )}
            </div>

            <button
                className={`node-card-favorite ${isFavorite ? 'active' : ''}`}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(node.subtype);
                }}
                title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
                <Star size={14} fill={isFavorite ? '#fbbf24' : 'none'} />
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUICK ACTIONS BAR
// ═══════════════════════════════════════════════════════════════════════════

interface QuickActionsProps {
    onDragStart: (e: DragEvent, node: NodeTypeDefinition) => void;
    onNodeUsed: (subtype: string) => void;
}

function QuickActionsBar({ onDragStart, onNodeUsed }: QuickActionsProps) {
    const quickNodes = useMemo(() => {
        // Most commonly used node types
        return [
            NODE_TYPES.find(n => n.subtype === 'incident_created'),
            NODE_TYPES.find(n => n.subtype === 'run_playbook'),
            NODE_TYPES.find(n => n.subtype === 'if_else'),
            NODE_TYPES.find(n => n.subtype === 'human_approval'),
        ].filter(Boolean) as NodeTypeDefinition[];
    }, []);

    const handleDragStart = (e: DragEvent, node: NodeTypeDefinition) => {
        e.dataTransfer.setData('application/reactflow', JSON.stringify(node));
        e.dataTransfer.effectAllowed = 'move';
        onNodeUsed(node.subtype);
        onDragStart(e, node);
    };

    return (
        <div className="quick-actions-bar">
            <div className="quick-actions-label">
                <Zap size={12} />
                Quick Add
            </div>
            <div className="quick-actions-nodes">
                {quickNodes.map(node => (
                    <div
                        key={node.subtype}
                        className={`quick-action-chip ${node.category}`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, node)}
                        title={node.label}
                    >
                        {node.icon}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function SmartNodePalette({
    onDragStart: onDragStartProp,
    onNodeDoubleClick
}: SmartNodePaletteProps) {
    // State
    const [searchQuery, setSearchQuery] = useState('');
    const [favorites, setFavorites] = useState<string[]>(loadFavorites);
    const [recent, setRecent] = useState<string[]>(loadRecent);
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>(loadCollapsed);
    const [selectedIndex, setSelectedIndex] = useState(-1);

    const searchInputRef = useRef<HTMLInputElement>(null);
    const paletteRef = useRef<HTMLDivElement>(null);

    // ─────────────────────────────────────────────────────────────────────────
    // COMPUTE FILTERED NODES
    // ─────────────────────────────────────────────────────────────────────────
    const { searchResults, categories } = useMemo(() => {
        if (searchQuery.trim()) {
            const results = fuzzySearch(searchQuery, NODE_TYPES);
            return { searchResults: results, categories: null };
        }

        const favoriteNodes = NODE_TYPES.filter(n => favorites.includes(n.subtype));
        const recentNodes = recent
            .map(subtype => NODE_TYPES.find(n => n.subtype === subtype))
            .filter(Boolean) as NodeTypeDefinition[];

        return {
            searchResults: null,
            categories: {
                favorites: favoriteNodes,
                recent: recentNodes,
                trigger: getNodesByCategory('trigger'),
                action: getNodesByCategory('action'),
                flow: getNodesByCategory('flow'),
            }
        };
    }, [searchQuery, favorites, recent]);

    // ─────────────────────────────────────────────────────────────────────────
    // HANDLERS
    // ─────────────────────────────────────────────────────────────────────────
    const handleDragStart = useCallback((e: DragEvent, node: NodeTypeDefinition) => {
        e.dataTransfer.setData('application/reactflow', JSON.stringify(node));
        e.dataTransfer.effectAllowed = 'move';
        onDragStartProp?.(e, node);
    }, [onDragStartProp]);

    const handleToggleFavorite = useCallback((subtype: string) => {
        setFavorites(prev => {
            const next = prev.includes(subtype)
                ? prev.filter(s => s !== subtype)
                : [...prev, subtype];
            saveFavorites(next);
            return next;
        });
    }, []);

    const handleNodeUsed = useCallback((subtype: string) => {
        setRecent(prev => {
            const next = [subtype, ...prev.filter(s => s !== subtype)].slice(0, 8);
            saveRecent(next);
            return next;
        });
    }, []);

    const handleToggleCategory = useCallback((category: string) => {
        setCollapsed(prev => {
            const next = { ...prev, [category]: !prev[category] };
            saveCollapsed(next);
            return next;
        });
    }, []);

    // ─────────────────────────────────────────────────────────────────────────
    // KEYBOARD NAVIGATION
    // ─────────────────────────────────────────────────────────────────────────
    const allVisibleNodes = useMemo(() => {
        if (searchResults) {
            return searchResults.map(r => r.node);
        }
        if (!categories) return [];

        const nodes: NodeTypeDefinition[] = [];
        const keys: CategoryKey[] = ['favorites', 'recent', 'trigger', 'action', 'flow'];

        for (const key of keys) {
            if (!collapsed[key] && categories[key].length > 0) {
                nodes.push(...categories[key]);
            }
        }

        return nodes;
    }, [searchResults, categories, collapsed]);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (allVisibleNodes.length === 0) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev < allVisibleNodes.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev =>
                    prev > 0 ? prev - 1 : allVisibleNodes.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (selectedIndex >= 0 && selectedIndex < allVisibleNodes.length) {
                    const node = allVisibleNodes[selectedIndex];
                    handleNodeUsed(node.subtype);
                    onNodeDoubleClick?.(node);
                }
                break;
            case 'Escape':
                setSearchQuery('');
                setSelectedIndex(-1);
                searchInputRef.current?.blur();
                break;
        }
    }, [allVisibleNodes, selectedIndex, handleNodeUsed, onNodeDoubleClick]);

    // Focus search on Cmd+K
    useEffect(() => {
        const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                searchInputRef.current?.focus();
            }
        };

        window.addEventListener('keydown', handleGlobalKeyDown);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, []);

    // Reset selection when search changes
    useEffect(() => {
        setSelectedIndex(searchQuery ? 0 : -1);
    }, [searchQuery]);

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER CATEGORY SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const renderCategory = (
        key: CategoryKey,
        title: string,
        icon: React.ReactNode,
        nodes: NodeTypeDefinition[],
    ) => {
        if (nodes.length === 0) return null;

        const isCollapsed = collapsed[key];

        return (
            <div className={`palette-category ${isCollapsed ? 'collapsed' : ''}`} key={key}>
                <button
                    className="category-header"
                    onClick={() => handleToggleCategory(key)}
                >
                    <span className="category-icon">{icon}</span>
                    <span className="category-title">{title}</span>
                    <span className="category-count">{nodes.length}</span>
                    <span className="category-chevron">
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    </span>
                </button>

                {!isCollapsed && (
                    <div className="category-nodes">
                        {nodes.map(node => (
                            <NodeCard
                                key={node.subtype}
                                node={node}
                                query=""
                                isFavorite={favorites.includes(node.subtype)}
                                isSelected={allVisibleNodes[selectedIndex]?.subtype === node.subtype}
                                onDragStart={handleDragStart}
                                onToggleFavorite={handleToggleFavorite}
                                onDoubleClick={onNodeDoubleClick}
                                onNodeUsed={handleNodeUsed}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    // ─────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <div className="smart-node-palette" ref={paletteRef} onKeyDown={handleKeyDown}>
            {/* Header */}
            <div className="palette-header">
                <div className="palette-title">
                    <Sparkles size={16} />
                    Nodes
                </div>
                <div className="palette-search-wrapper">
                    <Search size={14} className="search-icon" />
                    <input
                        ref={searchInputRef}
                        type="text"
                        className="palette-search-input"
                        placeholder="Search nodes... (⌘K)"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button
                            className="search-clear"
                            onClick={() => setSearchQuery('')}
                        >
                            ×
                        </button>
                    )}
                </div>
            </div>

            {/* Quick Actions */}
            {!searchQuery && (
                <QuickActionsBar
                    onDragStart={handleDragStart}
                    onNodeUsed={handleNodeUsed}
                />
            )}

            {/* Content */}
            <div className="palette-content">
                {/* Search Results */}
                {searchResults && (
                    <div className="search-results">
                        <div className="search-results-header">
                            {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                        </div>
                        {searchResults.length === 0 ? (
                            <div className="no-results">
                                <div className="no-results-icon">🔍</div>
                                <div className="no-results-text">No nodes found</div>
                                <div className="no-results-hint">Try different keywords</div>
                            </div>
                        ) : (
                            <div className="search-results-list">
                                {searchResults.map((result, index) => (
                                    <NodeCard
                                        key={result.node.subtype}
                                        node={result.node}
                                        query={searchQuery}
                                        isFavorite={favorites.includes(result.node.subtype)}
                                        isSelected={index === selectedIndex}
                                        onDragStart={handleDragStart}
                                        onToggleFavorite={handleToggleFavorite}
                                        onDoubleClick={onNodeDoubleClick}
                                        onNodeUsed={handleNodeUsed}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Categories */}
                {categories && (
                    <>
                        {renderCategory('favorites', 'Favorites', <Star size={14} />, categories.favorites)}
                        {renderCategory('recent', 'Recent', <Clock size={14} />, categories.recent)}
                        {renderCategory('trigger', 'Triggers', '🎯', categories.trigger)}
                        {renderCategory('action', 'Actions', '⚡', categories.action)}
                        {renderCategory('flow', 'Flow Control', '🔀', categories.flow)}
                    </>
                )}
            </div>

            {/* Footer hint */}
            <div className="palette-footer">
                <span>Drag to canvas or double-click to add</span>
            </div>
        </div>
    );
}
