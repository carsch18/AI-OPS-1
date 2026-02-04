/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Sidebar Component
   Navigation sidebar with collapsible sections
   ═══════════════════════════════════════════════════════════════════════════════ */

import { icons } from '../../lib/html';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  href: string;
  badge?: number;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navigation: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: icons.dashboard, href: '/' },
      { id: 'services', label: 'Services', icon: icons.services, href: '/services' },
      { id: 'topology', label: 'Topology', icon: icons.topology, href: '/topology' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { id: 'incidents', label: 'Incidents', icon: icons.incidents, href: '/incidents', badge: 3 },
      { id: 'alerts', label: 'Alerts', icon: icons.alerts, href: '/alerts', badge: 12 },
      { id: 'runbooks', label: 'Runbooks', icon: icons.runbooks, href: '/runbooks' },
      { id: 'actions', label: 'Actions', icon: icons.actions, href: '/actions' },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { id: 'chat', label: 'AI Assistant', icon: icons.chat, href: '#', },
      { id: 'insights', label: 'Insights', icon: icons.insights, href: '/insights' },
      { id: 'anomalies', label: 'Anomalies', icon: icons.anomalies, href: '/anomalies' },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'integrations', label: 'Integrations', icon: icons.integrations, href: '/integrations' },
      { id: 'audit', label: 'Audit Log', icon: icons.audit, href: '/audit' },
      { id: 'settings', label: 'Settings', icon: icons.settings, href: '/settings' },
    ],
  },
];

export function sidebar(activePage: string): string {
  return `
    <aside class="sidebar" id="sidebar">
      <!-- Logo -->
      <div class="sidebar-header">
        <a href="/" class="logo">
          <div class="logo-icon">🧠</div>
          <span class="logo-text">CEREBRO</span>
        </a>
      </div>

      <!-- Navigation -->
      <nav class="sidebar-nav">
        ${navigation.map(section => `
          <div class="nav-section">
            <div class="nav-section-title">${section.title}</div>
            ${section.items.map(item => `
              <a 
                class="nav-item ${activePage === item.id ? 'active' : ''}" 
                href="${item.href}"
                ${item.id === 'chat' ? 'id="nav-chat"' : ''}
                data-page="${item.id}"
              >
                <span class="nav-icon">${item.icon}</span>
                <span class="nav-label">${item.label}</span>
                ${item.badge ? `<span class="nav-badge">${item.badge}</span>` : ''}
              </a>
            `).join('')}
          </div>
        `).join('')}
      </nav>

      <!-- User Menu -->
      <div class="sidebar-footer">
        <div class="user-menu" id="user-menu">
          <div class="avatar">JD</div>
          <div class="user-info">
            <div class="user-name">John Doe</div>
            <div class="user-role">SRE Engineer</div>
          </div>
          <span class="nav-icon" style="margin-left: auto; color: var(--text-muted);">
            ${icons.chevronRight}
          </span>
        </div>
      </div>
    </aside>
  `;
}
