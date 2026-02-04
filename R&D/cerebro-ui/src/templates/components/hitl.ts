/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - HITL (Human-in-the-Loop) Components
   Pending action cards requiring human approval
   ═══════════════════════════════════════════════════════════════════════════════ */

import { formatRelativeTime, icons } from '../../lib/html';

interface PendingAction {
  id: string;
  action: string;
  service: string;
  risk: 'low' | 'medium' | 'high';
  reason: string;
  time: number;
}

export function hitlCard(action: PendingAction): string {
  const riskBadgeClass: Record<string, string> = {
    low: 'healthy',
    medium: 'warning',
    high: 'critical'
  };

  return `
    <div class="hitl-card ${action.risk}" data-action-id="${action.id}">
      <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-3);">
        <span class="status-badge ${riskBadgeClass[action.risk]}">${action.risk.toUpperCase()} RISK</span>
        <span style="font-size: var(--text-xs); color: var(--text-muted);">${formatRelativeTime(action.time)}</span>
      </div>
      
      <h3 style="font-size: var(--text-base); font-weight: var(--font-semibold); margin-bottom: var(--space-2); color: var(--text-primary);">
        ${action.action}
      </h3>
      
      <p style="font-size: var(--text-sm); color: var(--text-tertiary); margin-bottom: var(--space-4); line-height: var(--leading-relaxed);">
        Service: <strong style="color: var(--text-secondary);">${action.service}</strong><br>
        ${action.reason}
      </p>
      
      <div class="hitl-actions">
        <button class="btn btn-success btn-sm" onclick="App.approveAction('${action.id}')">
          ${icons.check}
          Approve
        </button>
        <button class="btn btn-danger btn-sm" onclick="App.rejectAction('${action.id}')">
          ${icons.x}
          Reject
        </button>
        <button class="btn btn-secondary btn-sm" onclick="App.viewActionDetails('${action.id}')">
          Details
        </button>
      </div>
    </div>
  `;
}

export function hitlPanel(actions: PendingAction[]): string {
  if (actions.length === 0) {
    return `
      <div style="text-align: center; padding: var(--space-8); color: var(--text-muted);">
        <div style="font-size: 32px; margin-bottom: var(--space-2);">✓</div>
        <div>No pending actions</div>
      </div>
    `;
  }
  
  return `
    <div style="display: flex; flex-direction: column; gap: var(--space-3);">
      ${actions.map(action => hitlCard(action)).join('')}
    </div>
  `;
}

// Sample pending actions for demo
export const samplePendingActions: PendingAction[] = [
  { 
    id: 'pa1', 
    action: 'Restart api-gateway pods', 
    service: 'api-gateway', 
    risk: 'medium', 
    reason: 'High CPU detected. Restarting may resolve memory leak.', 
    time: Date.now() - 60000 
  },
  { 
    id: 'pa2', 
    action: 'Scale checkout-service to 5 replicas', 
    service: 'checkout', 
    risk: 'low', 
    reason: 'Traffic spike predicted in next 30 minutes.', 
    time: Date.now() - 120000 
  },
];
