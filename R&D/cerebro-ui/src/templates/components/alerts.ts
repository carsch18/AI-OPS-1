/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Alert Components
   Alert list items and alert panels
   ═══════════════════════════════════════════════════════════════════════════════ */

import { formatRelativeTime } from '../../lib/html';

interface Alert {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  service: string;
  time: number;
}

export function alertItem(alert: Alert): string {
  return `
    <div class="alert-item ${alert.severity}" data-id="${alert.id}">
      <div class="status-dot ${alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'warning' : 'healthy'} pulse"></div>
      <div class="alert-content">
        <div class="alert-title">${alert.title}</div>
        <div class="alert-meta">
          <span class="alert-service">${alert.service}</span>
          <span>•</span>
          <span class="alert-time">${formatRelativeTime(alert.time)}</span>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm">View</button>
    </div>
  `;
}

export function alertList(alerts: Alert[]): string {
  if (alerts.length === 0) {
    return `
      <div style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: var(--space-2);">✓</div>
        <div>No active alerts</div>
      </div>
    `;
  }
  
  return `
    <div class="alert-list" style="display: flex; flex-direction: column; gap: var(--space-2); max-height: 400px; overflow-y: auto;">
      ${alerts.map(alert => alertItem(alert)).join('')}
    </div>
  `;
}

// Sample alerts for demo
export const sampleAlerts: Alert[] = [
  { id: 'a1', severity: 'critical', title: 'High CPU usage on api-gateway', service: 'api-gateway', time: Date.now() - 120000 },
  { id: 'a2', severity: 'warning', title: 'Memory pressure on checkout-service', service: 'checkout', time: Date.now() - 300000 },
  { id: 'a3', severity: 'critical', title: 'Database connection pool exhausted', service: 'postgres', time: Date.now() - 180000 },
  { id: 'a4', severity: 'warning', title: 'Latency spike detected', service: 'payment-api', time: Date.now() - 600000 },
  { id: 'a5', severity: 'info', title: 'Deployment completed successfully', service: 'frontend', time: Date.now() - 900000 },
];
