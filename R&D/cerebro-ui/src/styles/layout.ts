/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Layout
   App shell, grid system, and structural components
   ═══════════════════════════════════════════════════════════════════════════════ */

export const cssLayout = `
/* ═══════════════════════════════════════════════════════════════════════════════
   LAYOUT
   ═══════════════════════════════════════════════════════════════════════════════ */

/* App Shell */
.app {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-primary);
}

/* ─────────────────────────────────────────────────────────────────────────────
   SIDEBAR
   ───────────────────────────────────────────────────────────────────────────── */

.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width var(--transition-slow);
  z-index: var(--z-fixed);
  position: relative;
}

.sidebar.collapsed {
  width: var(--sidebar-collapsed);
}

.sidebar-header {
  height: var(--header-height);
  padding: 0 var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.sidebar-nav {
  flex: 1;
  padding: var(--space-4);
  overflow-y: auto;
}

.sidebar-footer {
  padding: var(--space-4);
  border-top: 1px solid var(--border-subtle);
}

/* Logo */
.logo {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.logo-icon {
  width: 36px;
  height: 36px;
  background: linear-gradient(135deg, var(--accent-primary), var(--pink-600));
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-lg);
  box-shadow: var(--shadow-glow);
  flex-shrink: 0;
}

.logo-text {
  font-size: var(--text-lg);
  font-weight: var(--font-bold);
  letter-spacing: var(--tracking-wide);
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.sidebar.collapsed .logo-text,
.sidebar.collapsed .nav-label,
.sidebar.collapsed .nav-section-title,
.sidebar.collapsed .user-info,
.sidebar.collapsed .nav-badge {
  display: none;
}

/* Navigation */
.nav-section {
  margin-bottom: var(--space-6);
}

.nav-section-title {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  padding: 0 var(--space-3);
  margin-bottom: var(--space-2);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  color: var(--text-tertiary);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  margin-bottom: var(--space-1);
  cursor: pointer;
  position: relative;
}

.nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-secondary);
}

.nav-item.active {
  background: var(--accent-subtle);
  color: var(--accent-primary);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--accent-primary);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  box-shadow: var(--shadow-glow);
}

.nav-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.nav-label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
}

.nav-badge {
  margin-left: auto;
  padding: 2px 8px;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  background: var(--color-error);
  color: var(--text-primary);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-glow-error);
}

/* User menu */
.user-menu {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.user-menu:hover {
  background: var(--bg-hover);
}

.user-info {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-role {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* ─────────────────────────────────────────────────────────────────────────────
   MAIN CONTENT
   ───────────────────────────────────────────────────────────────────────────── */

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

/* Header */
.header {
  height: var(--header-height);
  padding: 0 var(--space-6);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.header-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
}

.header-center {
  flex: 1;
  max-width: 500px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Search */
.search-box {
  position: relative;
  width: 100%;
}

.search-input {
  width: 100%;
  height: 36px;
  padding: 0 var(--space-4) 0 var(--space-10);
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  color: var(--text-primary);
  transition: all var(--transition-fast);
}

.search-input:hover {
  border-color: var(--border-default);
}

.search-input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

.search-icon {
  position: absolute;
  left: var(--space-4);
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search-shortcut {
  position: absolute;
  right: var(--space-3);
  top: 50%;
  transform: translateY(-50%);
  padding: 2px 6px;
  font-size: var(--text-xs);
  font-family: var(--font-mono);
  color: var(--text-muted);
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
}

/* Header button */
.header-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-tertiary);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  position: relative;
}

.header-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.header-btn .notification-dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  background: var(--color-error);
  border-radius: var(--radius-full);
  border: 2px solid var(--bg-secondary);
}

/* Content */
.content {
  flex: 1;
  padding: var(--space-6);
  overflow-y: auto;
  overflow-x: hidden;
}

.page-header {
  margin-bottom: var(--space-6);
}

.page-title {
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  margin-bottom: var(--space-1);
}

.page-subtitle {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
}

/* ─────────────────────────────────────────────────────────────────────────────
   GRID SYSTEM
   ───────────────────────────────────────────────────────────────────────────── */

.grid {
  display: grid;
  gap: var(--space-4);
}

.grid-cols-1 { grid-template-columns: repeat(1, 1fr); }
.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }
.grid-cols-4 { grid-template-columns: repeat(4, 1fr); }
.grid-cols-6 { grid-template-columns: repeat(6, 1fr); }
.grid-cols-12 { grid-template-columns: repeat(12, 1fr); }

.col-span-1 { grid-column: span 1; }
.col-span-2 { grid-column: span 2; }
.col-span-3 { grid-column: span 3; }
.col-span-4 { grid-column: span 4; }
.col-span-5 { grid-column: span 5; }
.col-span-6 { grid-column: span 6; }
.col-span-7 { grid-column: span 7; }
.col-span-8 { grid-column: span 8; }
.col-span-9 { grid-column: span 9; }
.col-span-10 { grid-column: span 10; }
.col-span-11 { grid-column: span 11; }
.col-span-12 { grid-column: span 12; }

.row-span-2 { grid-row: span 2; }
.row-span-3 { grid-row: span 3; }

.gap-2 { gap: var(--space-2); }
.gap-3 { gap: var(--space-3); }
.gap-4 { gap: var(--space-4); }
.gap-6 { gap: var(--space-6); }

/* ─────────────────────────────────────────────────────────────────────────────
   FLEXBOX UTILITIES
   ───────────────────────────────────────────────────────────────────────────── */

.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.items-end { align-items: flex-end; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.flex-1 { flex: 1; }
.flex-shrink-0 { flex-shrink: 0; }

/* ─────────────────────────────────────────────────────────────────────────────
   SPACING UTILITIES
   ───────────────────────────────────────────────────────────────────────────── */

.m-0 { margin: 0; }
.m-1 { margin: var(--space-1); }
.m-2 { margin: var(--space-2); }
.m-3 { margin: var(--space-3); }
.m-4 { margin: var(--space-4); }

.mt-0 { margin-top: 0; }
.mt-1 { margin-top: var(--space-1); }
.mt-2 { margin-top: var(--space-2); }
.mt-3 { margin-top: var(--space-3); }
.mt-4 { margin-top: var(--space-4); }
.mt-6 { margin-top: var(--space-6); }

.mb-0 { margin-bottom: 0; }
.mb-1 { margin-bottom: var(--space-1); }
.mb-2 { margin-bottom: var(--space-2); }
.mb-3 { margin-bottom: var(--space-3); }
.mb-4 { margin-bottom: var(--space-4); }
.mb-6 { margin-bottom: var(--space-6); }

.ml-auto { margin-left: auto; }

.p-0 { padding: 0; }
.p-2 { padding: var(--space-2); }
.p-3 { padding: var(--space-3); }
.p-4 { padding: var(--space-4); }
.p-6 { padding: var(--space-6); }

/* ─────────────────────────────────────────────────────────────────────────────
   CHAT PANEL
   ───────────────────────────────────────────────────────────────────────────── */

.chat-panel {
  position: fixed;
  right: 0;
  top: 0;
  width: var(--chat-width);
  height: 100vh;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  transform: translateX(100%);
  transition: transform var(--transition-slow);
  z-index: var(--z-fixed);
}

.chat-panel.open {
  transform: translateX(0);
}

/* ─────────────────────────────────────────────────────────────────────────────
   COMING SOON PLACEHOLDER
   ───────────────────────────────────────────────────────────────────────────── */

.coming-soon {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  background: var(--bg-secondary);
  border: 1px dashed var(--border-default);
  border-radius: var(--radius-xl);
}

.coming-soon-icon {
  font-size: 48px;
  margin-bottom: var(--space-4);
}

.coming-soon-text {
  color: var(--text-tertiary);
  font-size: var(--text-lg);
}

/* ─────────────────────────────────────────────────────────────────────────────
   RESPONSIVE
   ───────────────────────────────────────────────────────────────────────────── */

@media (max-width: 1200px) {
  .col-span-3 { grid-column: span 4; }
  .col-span-4 { grid-column: span 6; }
}

@media (max-width: 992px) {
  .col-span-3 { grid-column: span 6; }
  .col-span-6 { grid-column: span 12; }
}

@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    transform: translateX(-100%);
  }
  
  .sidebar.open {
    transform: translateX(0);
  }
  
  .col-span-3,
  .col-span-4,
  .col-span-6 {
    grid-column: span 12;
  }
  
  .header-center {
    display: none;
  }
}
`;
