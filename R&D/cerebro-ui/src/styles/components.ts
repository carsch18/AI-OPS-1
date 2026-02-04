/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Component Styles
   Reusable UI component styling
   ═══════════════════════════════════════════════════════════════════════════════ */

export const cssComponents = `
/* ═══════════════════════════════════════════════════════════════════════════════
   COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────
   BUTTONS
   ───────────────────────────────────────────────────────────────────────────── */

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-4);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: var(--accent-primary);
  color: var(--text-primary);
  box-shadow: 0 0 20px var(--accent-glow);
}

.btn-primary:hover {
  background: var(--accent-primary-hover);
  box-shadow: var(--shadow-glow);
  transform: translateY(-1px);
}

.btn-primary:active {
  background: var(--accent-primary-active);
  transform: translateY(0);
}

.btn-secondary {
  background: var(--bg-hover);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
}

.btn-secondary:hover {
  background: var(--bg-active);
  border-color: var(--accent-primary);
}

.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
}

.btn-ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.btn-success {
  background: var(--color-success);
  color: var(--text-inverse);
}

.btn-success:hover {
  box-shadow: var(--shadow-glow-success);
}

.btn-danger {
  background: var(--color-error);
  color: var(--text-primary);
}

.btn-danger:hover {
  box-shadow: var(--shadow-glow-error);
}

.btn-sm {
  height: 28px;
  padding: 0 var(--space-3);
  font-size: var(--text-xs);
}

.btn-lg {
  height: 44px;
  padding: 0 var(--space-6);
  font-size: var(--text-base);
}

.btn-icon {
  width: 36px;
  padding: 0;
}

.btn-icon.btn-sm { width: 28px; }
.btn-icon.btn-lg { width: 44px; }

/* ─────────────────────────────────────────────────────────────────────────────
   CARDS
   ───────────────────────────────────────────────────────────────────────────── */

.card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--space-3);
  margin-bottom: var(--space-3);
  border-bottom: 1px solid var(--border-subtle);
}

.card-title {
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.card-glow {
  box-shadow: 0 0 40px rgba(255, 0, 128, 0.1);
  border-color: rgba(255, 0, 128, 0.2);
}

.card-interactive {
  cursor: pointer;
  transition: all var(--transition-base);
}

.card-interactive:hover {
  border-color: var(--accent-primary);
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg), 0 0 30px var(--accent-glow);
}

/* ─────────────────────────────────────────────────────────────────────────────
   METRIC CARDS
   ───────────────────────────────────────────────────────────────────────────── */

.metric-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.metric-label {
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
}

.metric-value {
  font-family: var(--font-mono);
  font-size: var(--text-3xl);
  font-weight: var(--font-bold);
  color: var(--text-primary);
  line-height: var(--leading-none);
}

.metric-value.pink { color: var(--accent-primary); text-shadow: 0 0 20px var(--accent-glow); }
.metric-value.cyan { color: var(--color-success); }
.metric-value.yellow { color: var(--color-warning); }
.metric-value.red { color: var(--color-error); }

.metric-change {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  font-weight: var(--font-medium);
}

.metric-change.positive { color: var(--color-success); }
.metric-change.negative { color: var(--color-error); }
.metric-change.neutral { color: var(--text-tertiary); }

.metric-sparkline {
  height: 32px;
  margin-top: var(--space-2);
}

/* ─────────────────────────────────────────────────────────────────────────────
   STATUS INDICATORS
   ───────────────────────────────────────────────────────────────────────────── */

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.status-dot.healthy { background: var(--color-success); box-shadow: 0 0 8px var(--color-success-glow); }
.status-dot.warning { background: var(--color-warning); box-shadow: 0 0 8px var(--color-warning-glow); }
.status-dot.critical { background: var(--color-error); box-shadow: 0 0 8px var(--color-error-glow); }
.status-dot.unknown { background: var(--text-tertiary); }

.status-dot.pulse {
  animation: pulse 2s ease-in-out infinite;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}

.status-badge.healthy { background: var(--color-success-bg); color: var(--color-success); }
.status-badge.warning { background: var(--color-warning-bg); color: var(--color-warning); }
.status-badge.critical { background: var(--color-error-bg); color: var(--color-error); }
.status-badge.info { background: var(--color-info-bg); color: var(--color-info); }
.status-badge.pink { background: var(--accent-subtle); color: var(--accent-primary); }

/* ─────────────────────────────────────────────────────────────────────────────
   INPUTS
   ───────────────────────────────────────────────────────────────────────────── */

.input {
  width: 100%;
  height: 36px;
  padding: 0 var(--space-3);
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--text-primary);
  transition: all var(--transition-fast);
}

.input:hover {
  border-color: var(--border-strong);
}

.input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-subtle);
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* ─────────────────────────────────────────────────────────────────────────────
   ALERTS & NOTIFICATIONS
   ───────────────────────────────────────────────────────────────────────────── */

.alert-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border-left: 3px solid transparent;
  transition: all var(--transition-fast);
}

.alert-item:hover {
  background: var(--bg-hover);
}

.alert-item.critical { border-left-color: var(--color-error); }
.alert-item.warning { border-left-color: var(--color-warning); }
.alert-item.info { border-left-color: var(--color-info); }

.alert-content {
  flex: 1;
  min-width: 0;
}

.alert-title {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  margin-bottom: var(--space-1);
  color: var(--text-primary);
}

.alert-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ─────────────────────────────────────────────────────────────────────────────
   SERVICE LIST
   ───────────────────────────────────────────────────────────────────────────── */

.service-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  transition: all var(--transition-fast);
  cursor: pointer;
}

.service-item:hover {
  background: var(--bg-hover);
}

.service-name {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-primary);
}

.service-meta {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.service-metrics {
  margin-left: auto;
  text-align: right;
}

.service-metric {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.service-metric-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
}

/* ─────────────────────────────────────────────────────────────────────────────
   HEALTH SCORE RING
   ───────────────────────────────────────────────────────────────────────────── */

.health-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-6);
  text-align: center;
}

.health-ring {
  position: relative;
  width: 140px;
  height: 140px;
  margin-bottom: var(--space-4);
}

.health-ring svg {
  transform: rotate(-90deg);
  filter: drop-shadow(0 0 10px var(--accent-glow));
}

.health-ring-bg {
  fill: none;
  stroke: var(--bg-hover);
  stroke-width: 8;
}

.health-ring-progress {
  fill: none;
  stroke: var(--accent-primary);
  stroke-width: 8;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s ease;
}

.health-ring-value {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-mono);
  font-size: var(--text-4xl);
  font-weight: var(--font-bold);
  color: var(--accent-primary);
  text-shadow: 0 0 30px var(--accent-glow);
}

.health-label {
  font-size: var(--text-sm);
  color: var(--text-tertiary);
  margin-bottom: var(--space-1);
}

.health-status {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
  color: var(--color-success);
}

/* ─────────────────────────────────────────────────────────────────────────────
   CHART CONTAINER
   ───────────────────────────────────────────────────────────────────────────── */

.chart-container {
  position: relative;
  height: 100%;
  min-height: 200px;
}

.chart-canvas {
  width: 100%;
  height: 100%;
}

/* ─────────────────────────────────────────────────────────────────────────────
   AVATAR
   ───────────────────────────────────────────────────────────────────────────── */

.avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--accent-primary), var(--pink-600));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  color: var(--text-primary);
  flex-shrink: 0;
}

.avatar-sm { width: 24px; height: 24px; font-size: var(--text-xs); }
.avatar-lg { width: 40px; height: 40px; font-size: var(--text-base); }

/* ─────────────────────────────────────────────────────────────────────────────
   TOAST
   ───────────────────────────────────────────────────────────────────────────── */

.toast-container {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.toast {
  min-width: 300px;
  padding: var(--space-4);
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  animation: slideIn 0.3s var(--ease-out);
}

.toast.success { border-left: 3px solid var(--color-success); }
.toast.error { border-left: 3px solid var(--color-error); }
.toast.warning { border-left: 3px solid var(--color-warning); }
.toast.info { border-left: 3px solid var(--color-info); }

/* ─────────────────────────────────────────────────────────────────────────────
   MODAL
   ───────────────────────────────────────────────────────────────────────────── */

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  backdrop-filter: blur(4px);
  z-index: var(--z-modal-backdrop);
  animation: fadeIn 0.2s ease;
}

.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl), var(--shadow-glow);
  z-index: var(--z-modal);
  animation: modalIn 0.3s var(--ease-out);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
}

.modal-title {
  font-size: var(--text-lg);
  font-weight: var(--font-semibold);
}

.modal-body {
  padding: var(--space-5);
  overflow-y: auto;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  border-top: 1px solid var(--border-subtle);
}

/* ─────────────────────────────────────────────────────────────────────────────
   SPINNER
   ───────────────────────────────────────────────────────────────────────────── */

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-default);
  border-top-color: var(--accent-primary);
  border-radius: var(--radius-full);
  animation: spin 0.8s linear infinite;
}

.spinner-lg {
  width: 32px;
  height: 32px;
  border-width: 3px;
}

/* ─────────────────────────────────────────────────────────────────────────────
   SKELETON LOADING
   ───────────────────────────────────────────────────────────────────────────── */

.skeleton {
  background: linear-gradient(90deg, var(--bg-hover) 25%, var(--bg-active) 50%, var(--bg-hover) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: var(--radius-md);
}

/* ─────────────────────────────────────────────────────────────────────────────
   HITL PANEL
   ───────────────────────────────────────────────────────────────────────────── */

.hitl-card {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  border-left: 3px solid var(--color-warning);
}

.hitl-card.low { border-left-color: var(--color-success); }
.hitl-card.medium { border-left-color: var(--color-warning); }
.hitl-card.high { border-left-color: var(--color-error); }

.hitl-actions {
  display: flex;
  gap: var(--space-2);
  margin-top: var(--space-4);
}
`;
