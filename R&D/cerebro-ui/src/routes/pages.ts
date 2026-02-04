/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Page Routes
   Serves HTML pages with server-side rendering
   ═══════════════════════════════════════════════════════════════════════════════ */

import { Hono } from 'hono';
import { layout } from '../templates/layout';
import { dashboardPage } from '../templates/pages/dashboard';
import { loginPage } from '../templates/pages/login';

export const pagesRouter = new Hono();

// ─────────────────────────────────────────────────────────────────────────────
// PAGES
// ─────────────────────────────────────────────────────────────────────────────

// Dashboard (main page)
pagesRouter.get('/', (c) => {
  return c.html(layout({
    title: 'Dashboard',
    page: 'dashboard',
    content: dashboardPage(),
  }));
});

// Login page
pagesRouter.get('/login', (c) => {
  return c.html(loginPage());
});

// Services page
pagesRouter.get('/services', (c) => {
  return c.html(layout({
    title: 'Services',
    page: 'services',
    content: `
      <div class="page-header">
        <h1 class="page-title">Services</h1>
        <p class="page-subtitle">Monitor and manage your infrastructure services</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">🚧</div>
        <div class="coming-soon-text">Coming in Phase 5</div>
      </div>
    `,
  }));
});

// Topology page
pagesRouter.get('/topology', (c) => {
  return c.html(layout({
    title: 'Service Topology',
    page: 'topology',
    content: `
      <div class="page-header">
        <h1 class="page-title">Service Topology</h1>
        <p class="page-subtitle">Visualize service dependencies and connections</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">🗺️</div>
        <div class="coming-soon-text">Coming in Phase 5</div>
      </div>
    `,
  }));
});

// Incidents page
pagesRouter.get('/incidents', (c) => {
  return c.html(layout({
    title: 'Incidents',
    page: 'incidents',
    content: `
      <div class="page-header">
        <h1 class="page-title">Incidents</h1>
        <p class="page-subtitle">Track and manage active incidents</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">🚨</div>
        <div class="coming-soon-text">Coming in Phase 6</div>
      </div>
    `,
  }));
});

// Alerts page
pagesRouter.get('/alerts', (c) => {
  return c.html(layout({
    title: 'Alerts',
    page: 'alerts',
    content: `
      <div class="page-header">
        <h1 class="page-title">Alerts</h1>
        <p class="page-subtitle">View and acknowledge system alerts</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">🔔</div>
        <div class="coming-soon-text">Coming in Phase 6</div>
      </div>
    `,
  }));
});

// Runbooks page
pagesRouter.get('/runbooks', (c) => {
  return c.html(layout({
    title: 'Runbooks',
    page: 'runbooks',
    content: `
      <div class="page-header">
        <h1 class="page-title">Runbooks</h1>
        <p class="page-subtitle">Automation playbooks and procedures</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">📚</div>
        <div class="coming-soon-text">Coming in Phase 8</div>
      </div>
    `,
  }));
});

// Actions page
pagesRouter.get('/actions', (c) => {
  return c.html(layout({
    title: 'Pending Actions',
    page: 'actions',
    content: `
      <div class="page-header">
        <h1 class="page-title">Pending Actions</h1>
        <p class="page-subtitle">Review and approve automated actions</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">⚡</div>
        <div class="coming-soon-text">Coming in Phase 8</div>
      </div>
    `,
  }));
});

// Anomalies page
pagesRouter.get('/anomalies', (c) => {
  return c.html(layout({
    title: 'Anomaly Detection',
    page: 'anomalies',
    content: `
      <div class="page-header">
        <h1 class="page-title">Anomaly Detection</h1>
        <p class="page-subtitle">AI-powered anomaly detection and analysis</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">🔮</div>
        <div class="coming-soon-text">Coming in Phase 7</div>
      </div>
    `,
  }));
});

// Insights page
pagesRouter.get('/insights', (c) => {
  return c.html(layout({
    title: 'AI Insights',
    page: 'insights',
    content: `
      <div class="page-header">
        <h1 class="page-title">AI Insights</h1>
        <p class="page-subtitle">Intelligent analysis and recommendations</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">💡</div>
        <div class="coming-soon-text">Coming in Phase 7</div>
      </div>
    `,
  }));
});

// Audit log page
pagesRouter.get('/audit', (c) => {
  return c.html(layout({
    title: 'Audit Log',
    page: 'audit',
    content: `
      <div class="page-header">
        <h1 class="page-title">Audit Log</h1>
        <p class="page-subtitle">System activity and security events</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">📋</div>
        <div class="coming-soon-text">Coming in Phase 9</div>
      </div>
    `,
  }));
});

// Settings page
pagesRouter.get('/settings', (c) => {
  return c.html(layout({
    title: 'Settings',
    page: 'settings',
    content: `
      <div class="page-header">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Configure your preferences and integrations</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">⚙️</div>
        <div class="coming-soon-text">Coming in Phase 9</div>
      </div>
    `,
  }));
});

// Integrations page
pagesRouter.get('/integrations', (c) => {
  return c.html(layout({
    title: 'Integrations',
    page: 'integrations',
    content: `
      <div class="page-header">
        <h1 class="page-title">Integrations</h1>
        <p class="page-subtitle">Connect external services and tools</p>
      </div>
      <div class="coming-soon">
        <div class="coming-soon-icon">🔗</div>
        <div class="coming-soon-text">Coming in Phase 9</div>
      </div>
    `,
  }));
});
