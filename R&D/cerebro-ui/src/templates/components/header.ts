/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Header Component
   Top navigation bar with search, notifications, and user actions
   ═══════════════════════════════════════════════════════════════════════════════ */

import { icons } from '../../lib/html';

export function header(title: string): string {
  return `
    <header class="header">
      <!-- Left: Menu toggle & Title -->
      <div class="header-left">
        <button class="header-btn" id="sidebar-toggle" title="Toggle sidebar">
          ${icons.menu}
        </button>
        <h1 class="header-title">${title}</h1>
      </div>

      <!-- Center: Search -->
      <div class="header-center">
        <div class="search-box">
          <span class="search-icon">${icons.search}</span>
          <input 
            type="text" 
            class="search-input" 
            placeholder="Search services, alerts, runbooks..."
            id="global-search"
          >
          <span class="search-shortcut">⌘K</span>
        </div>
      </div>

      <!-- Right: Actions -->
      <div class="header-right">
        <!-- Theme Toggle -->
        <button class="header-btn" id="theme-toggle" title="Toggle theme">
          ${icons.sun}
        </button>
        
        <!-- Notifications -->
        <button class="header-btn" id="notifications-btn" title="Notifications">
          ${icons.alerts}
          <span class="notification-dot"></span>
        </button>
        
        <!-- AI Chat Toggle -->
        <button class="header-btn" id="chat-toggle" title="AI Assistant">
          ${icons.chat}
        </button>
        
        <!-- User Avatar -->
        <button class="header-btn" id="header-user" title="Account">
          <div class="avatar" style="width: 28px; height: 28px; font-size: var(--text-xs);">JD</div>
        </button>
      </div>
    </header>
  `;
}
