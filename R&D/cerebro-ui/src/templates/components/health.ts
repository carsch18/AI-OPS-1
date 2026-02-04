/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Health Score Component
   Circular progress ring showing system health
   ═══════════════════════════════════════════════════════════════════════════════ */

export function healthScore(score: number = 94): string {
  const circumference = 2 * Math.PI * 60;
  const offset = circumference - (score / 100) * circumference;
  
  let status: string;
  let statusColor: string;
  
  if (score >= 90) {
    status = 'Excellent';
    statusColor = 'var(--color-success)';
  } else if (score >= 70) {
    status = 'Good';
    statusColor = 'var(--accent-primary)';
  } else if (score >= 50) {
    status = 'Degraded';
    statusColor = 'var(--color-warning)';
  } else {
    status = 'Critical';
    statusColor = 'var(--color-error)';
  }

  return `
    <div class="health-score">
      <div class="health-ring">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle 
            class="health-ring-bg" 
            cx="70" 
            cy="70" 
            r="60"
          />
          <circle 
            class="health-ring-progress" 
            cx="70" 
            cy="70" 
            r="60"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${offset}"
            style="stroke: ${statusColor};"
          />
        </svg>
        <div class="health-ring-value" style="color: ${statusColor};" id="health-value">${score}</div>
      </div>
      <div class="health-label">System Health</div>
      <div class="health-status" style="color: ${statusColor};" id="health-status">${status}</div>
    </div>
  `;
}
