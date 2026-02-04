/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO COMPONENTS
   Reusable UI component functions
   ═══════════════════════════════════════════════════════════════════════════════ */

const Components = {
  // ─────────────────────────────────────────────────────────────────────────────
  // METRIC CARD
  // ─────────────────────────────────────────────────────────────────────────────
  metricCard({ label, value, change, changeType, sparklineData, color = 'pink' }) {
    const changeClass = changeType === 'positive' ? 'positive' : changeType === 'negative' ? 'negative' : 'neutral';
    const changeIcon = changeType === 'positive' ? '↑' : changeType === 'negative' ? '↓' : '→';
    
    return `
      <div class="metric-card">
        <div class="metric-label">${label}</div>
        <div class="metric-value ${color}">${value}</div>
        <div class="metric-change ${changeClass}">
          <span>${changeIcon}</span>
          <span>${change}</span>
        </div>
        ${sparklineData ? `<canvas class="metric-sparkline" data-sparkline='${JSON.stringify(sparklineData)}' data-color="${color}"></canvas>` : ''}
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // HEALTH SCORE RING
  // ─────────────────────────────────────────────────────────────────────────────
  healthScore(score) {
    const circumference = 2 * Math.PI * 70;
    const offset = circumference - (score / 100) * circumference;
    const status = score >= 90 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Degraded' : 'Critical';
    const statusColor = score >= 90 ? 'var(--color-success)' : score >= 70 ? 'var(--accent-primary)' : score >= 50 ? 'var(--color-warning)' : 'var(--color-error)';
    
    return `
      <div class="health-score">
        <div class="health-ring">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle class="health-ring-bg" cx="80" cy="80" r="70"/>
            <circle class="health-ring-progress" cx="80" cy="80" r="70"
              stroke-dasharray="${circumference}"
              stroke-dashoffset="${offset}"
              style="stroke: ${statusColor}"/>
          </svg>
          <div class="health-ring-value" style="color: ${statusColor}">${score}</div>
        </div>
        <div class="health-label">System Health</div>
        <div class="health-status" style="color: ${statusColor}">${status}</div>
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ALERT ITEM
  // ─────────────────────────────────────────────────────────────────────────────
  alertItem({ id, severity, title, service, time }) {
    return `
      <div class="alert-item ${severity}" data-id="${id}">
        <div class="status-dot ${severity} pulse"></div>
        <div class="alert-content">
          <div class="alert-title">${title}</div>
          <div class="alert-meta">
            <span class="alert-service">${service}</span>
            <span class="alert-time">${Utils.formatRelativeTime(time)}</span>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm">View</button>
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SERVICE ITEM
  // ─────────────────────────────────────────────────────────────────────────────
  serviceItem({ name, status, latency, requests, errors }) {
    return `
      <div class="service-item">
        <div class="status-dot ${status}"></div>
        <div class="service-info">
          <div class="service-name">${name}</div>
          <div class="service-meta">${requests} req/s • ${errors}% errors</div>
        </div>
        <div class="service-metrics">
          <div>
            <div class="service-metric">${latency}ms</div>
            <div class="service-metric-label">P99 Latency</div>
          </div>
        </div>
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CHART CARD
  // ─────────────────────────────────────────────────────────────────────────────
  chartCard({ id, title, subtitle }) {
    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">${title}</div>
            ${subtitle ? `<div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: 2px;">${subtitle}</div>` : ''}
          </div>
          <div class="dropdown">
            <button class="btn btn-ghost btn-sm btn-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="chart-container">
          <canvas id="${id}" class="chart-canvas"></canvas>
        </div>
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // PENDING ACTION CARD
  // ─────────────────────────────────────────────────────────────────────────────
  pendingAction({ id, action, service, risk, reason, time }) {
    const riskColors = {
      low: 'var(--color-success)',
      medium: 'var(--color-warning)',
      high: 'var(--color-error)'
    };
    
    return `
      <div class="card card-glow" style="border-left: 3px solid ${riskColors[risk]}">
        <div class="card-header">
          <div class="status-badge ${risk === 'high' ? 'critical' : risk === 'medium' ? 'warning' : 'healthy'}">
            ${risk.toUpperCase()} RISK
          </div>
          <span style="font-size: var(--text-xs); color: var(--text-muted)">
            ${Utils.formatRelativeTime(time)}
          </span>
        </div>
        <h3 style="font-size: var(--text-base); margin-bottom: var(--space-2);">${action}</h3>
        <p style="font-size: var(--text-sm); color: var(--text-tertiary); margin-bottom: var(--space-4);">
          Service: <strong style="color: var(--text-secondary)">${service}</strong><br>
          ${reason}
        </p>
        <div style="display: flex; gap: var(--space-2);">
          <button class="btn btn-success btn-sm" onclick="App.approveAction('${id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20,6 9,17 4,12"/>
            </svg>
            Approve
          </button>
          <button class="btn btn-danger btn-sm" onclick="App.rejectAction('${id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
            Reject
          </button>
          <button class="btn btn-secondary btn-sm" onclick="App.viewActionDetails('${id}')">
            Details
          </button>
        </div>
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // CHAT MESSAGE
  // ─────────────────────────────────────────────────────────────────────────────
  chatMessage({ role, content, time, tools }) {
    const isUser = role === 'user';
    let toolsHtml = '';
    
    if (tools && tools.length > 0) {
      toolsHtml = `
        <div style="margin-top: var(--space-3); padding: var(--space-3); background: var(--bg-secondary); border-radius: var(--radius-md); font-size: var(--text-xs);">
          <div style="color: var(--accent-primary); margin-bottom: var(--space-2);">🔧 Tools Used:</div>
          ${tools.map(t => `<div style="color: var(--text-tertiary);">• ${t}</div>`).join('')}
        </div>
      `;
    }
    
    return `
      <div class="chat-message ${role}">
        ${!isUser ? '<div class="avatar avatar-sm" style="background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));">🧠</div>' : ''}
        <div class="chat-message-content">
          ${content}
          ${toolsHtml}
          <div style="font-size: var(--text-xs); color: var(--text-muted); margin-top: var(--space-2);">
            ${Utils.formatRelativeTime(time)}
          </div>
        </div>
        ${isUser ? '<div class="avatar avatar-sm">JD</div>' : ''}
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // INCIDENT CARD
  // ─────────────────────────────────────────────────────────────────────────────
  incidentCard({ id, title, severity, status, services, startTime, assignee }) {
    const severityColors = {
      critical: 'var(--color-error)',
      high: 'var(--color-warning)',
      medium: 'var(--accent-primary)',
      low: 'var(--color-info)'
    };
    
    return `
      <div class="card card-interactive" onclick="App.viewIncident('${id}')">
        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-3);">
          <div class="status-badge ${severity === 'critical' ? 'critical' : severity === 'high' ? 'warning' : 'info'}">
            ${severity.toUpperCase()}
          </div>
          <span class="status-badge ${status === 'active' ? 'critical' : status === 'investigating' ? 'warning' : 'healthy'}">
            ${status.toUpperCase()}
          </span>
        </div>
        <h3 style="font-size: var(--text-base); margin-bottom: var(--space-2);">${title}</h3>
        <div style="display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3);">
          ${services.map(s => `<span style="padding: 2px 8px; background: var(--bg-hover); border-radius: var(--radius-sm); font-size: var(--text-xs);">${s}</span>`).join('')}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--text-muted);">
          <span>Started ${Utils.formatRelativeTime(startTime)}</span>
          <span>Assigned to ${assignee}</span>
        </div>
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // STAT GRID
  // ─────────────────────────────────────────────────────────────────────────────
  statGrid(stats) {
    return `
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4);">
        ${stats.map(s => `
          <div style="text-align: center; padding: var(--space-4); background: var(--bg-secondary); border-radius: var(--radius-lg);">
            <div style="font-family: var(--font-mono); font-size: var(--text-3xl); font-weight: bold; color: ${s.color || 'var(--text-primary)'};">
              ${s.value}
            </div>
            <div style="font-size: var(--text-xs); color: var(--text-tertiary); margin-top: var(--space-1);">
              ${s.label}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // QUICK ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  quickActions() {
    const actions = [
      { icon: '🔄', label: 'Restart Service', color: 'var(--color-info)' },
      { icon: '📊', label: 'Run Diagnostics', color: 'var(--accent-primary)' },
      { icon: '🚀', label: 'Scale Up', color: 'var(--color-success)' },
      { icon: '⏪', label: 'Rollback', color: 'var(--color-warning)' }
    ];
    
    return `
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3);">
        ${actions.map(a => `
          <button class="btn btn-secondary" style="height: auto; padding: var(--space-3); flex-direction: column; gap: var(--space-2);">
            <span style="font-size: var(--text-xl);">${a.icon}</span>
            <span style="font-size: var(--text-xs);">${a.label}</span>
          </button>
        `).join('')}
      </div>
    `;
  }
};

window.Components = Components;
