/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Dashboard Page
   Main dashboard with metrics, charts, alerts, and service health
   ═══════════════════════════════════════════════════════════════════════════════ */

import { healthScore } from '../components/health';
import { metricsGrid } from '../components/metrics';
import { alertList, sampleAlerts } from '../components/alerts';
import { serviceList, sampleServices } from '../components/services';
import { hitlPanel, samplePendingActions } from '../components/hitl';

export function dashboardPage(): string {
  return `
    <div class="grid grid-cols-12 gap-4">
      
      <!-- Health Score -->
      <div class="col-span-3">
        <div class="card" style="height: 100%;">
          ${healthScore(94)}
        </div>
      </div>

      <!-- Key Metrics -->
      <div class="col-span-9">
        ${metricsGrid()}
      </div>

      <!-- CPU Chart -->
      <div class="col-span-6 row-span-2">
        <div class="card" style="height: 100%;">
          <div class="card-header">
            <span class="card-title">CPU Usage</span>
            <span style="font-size: var(--text-xs); color: var(--text-muted);">All nodes aggregated</span>
          </div>
          <div class="chart-container">
            <canvas id="chart-cpu"></canvas>
          </div>
        </div>
      </div>

      <!-- Memory Chart -->
      <div class="col-span-6 row-span-2">
        <div class="card" style="height: 100%;">
          <div class="card-header">
            <span class="card-title">Memory Usage</span>
            <span style="font-size: var(--text-xs); color: var(--text-muted);">All nodes aggregated</span>
          </div>
          <div class="chart-container">
            <canvas id="chart-memory"></canvas>
          </div>
        </div>
      </div>

      <!-- Pending Actions -->
      <div class="col-span-6">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Pending Actions</span>
            <span class="status-badge warning">${samplePendingActions.length} PENDING</span>
          </div>
          ${hitlPanel(samplePendingActions)}
        </div>
      </div>

      <!-- Active Alerts -->
      <div class="col-span-6">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Active Alerts</span>
            <button class="btn btn-ghost btn-sm">View All</button>
          </div>
          ${alertList(sampleAlerts)}
        </div>
      </div>

      <!-- Service Health -->
      <div class="col-span-6">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Service Health</span>
            <button class="btn btn-ghost btn-sm">View All</button>
          </div>
          ${serviceList(sampleServices)}
        </div>
      </div>

      <!-- Quick Actions + Stats -->
      <div class="col-span-3">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Quick Actions</span>
          </div>
          <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-3);">
            <button class="btn btn-secondary" style="height: auto; padding: var(--space-3); flex-direction: column; gap: var(--space-2);">
              <span style="font-size: var(--text-xl);">🔄</span>
              <span style="font-size: var(--text-xs);">Restart</span>
            </button>
            <button class="btn btn-secondary" style="height: auto; padding: var(--space-3); flex-direction: column; gap: var(--space-2);">
              <span style="font-size: var(--text-xl);">📊</span>
              <span style="font-size: var(--text-xs);">Diagnose</span>
            </button>
            <button class="btn btn-secondary" style="height: auto; padding: var(--space-3); flex-direction: column; gap: var(--space-2);">
              <span style="font-size: var(--text-xl);">🚀</span>
              <span style="font-size: var(--text-xs);">Scale Up</span>
            </button>
            <button class="btn btn-secondary" style="height: auto; padding: var(--space-3); flex-direction: column; gap: var(--space-2);">
              <span style="font-size: var(--text-xl);">⏪</span>
              <span style="font-size: var(--text-xs);">Rollback</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Stats Today -->
      <div class="col-span-3">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Stats Today</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: var(--space-3);">
            <div style="display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--text-tertiary); font-size: var(--text-sm);">Incidents</span>
              <span style="font-family: var(--font-mono); color: var(--color-error);">3 active</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--text-tertiary); font-size: var(--text-sm);">Auto-resolved</span>
              <span style="font-family: var(--font-mono); color: var(--color-success);">12</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: var(--space-2) 0; border-bottom: 1px solid var(--border-subtle);">
              <span style="color: var(--text-tertiary); font-size: var(--text-sm);">Deployments</span>
              <span style="font-family: var(--font-mono); color: var(--accent-primary);">7</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding: var(--space-2) 0;">
              <span style="color: var(--text-tertiary); font-size: var(--text-sm);">Avg MTTR</span>
              <span style="font-family: var(--font-mono); color: var(--color-success);">4.2m</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  `;
}
