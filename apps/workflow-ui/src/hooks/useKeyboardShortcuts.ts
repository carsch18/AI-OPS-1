/**
 * useKeyboardShortcuts — Global keyboard shortcut system
 * 
 * Phase 4 feature providing:
 * - ⌘+K / Ctrl+K: Open command palette
 * - Esc: Close modals/drawers
 * - ⌘+/ / Ctrl+/: Toggle sidebar
 */

import { useEffect, useCallback } from 'react';

interface ShortcutHandlers {
    onCommandPalette?: () => void;
    onEscape?: () => void;
    onToggleSidebar?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        const isMod = e.metaKey || e.ctrlKey;

        // ⌘+K — Command Palette
        if (isMod && e.key === 'k') {
            e.preventDefault();
            handlers.onCommandPalette?.();
            return;
        }

        // ⌘+/ — Toggle Sidebar
        if (isMod && e.key === '/') {
            e.preventDefault();
            handlers.onToggleSidebar?.();
            return;
        }

        // Esc — Close
        if (e.key === 'Escape') {
            handlers.onEscape?.();
            return;
        }
    }, [handlers]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);
}

export default useKeyboardShortcuts;
