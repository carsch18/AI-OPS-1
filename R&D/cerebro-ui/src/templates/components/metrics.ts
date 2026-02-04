/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Metrics Components
   Metric cards with sparklines and change indicators
   ═══════════════════════════════════════════════════════════════════════════════ */

interface MetricCardOptions {
  label: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  color?: 'pink' | 'cyan' | 'yellow' | 'red';
  sparklineId?: string;
}

export function metricCard({ 
  label, 
  value, 
  change, 
  changeType = 'neutral',
  color = 'pink',
  sparklineId
}: MetricCardOptions): string {
  const changeIcon = changeType === 'positive' ? '↑' : changeType === 'negative' ? '↓' : '→';
  
  return `
    <div class="metric-card">
      <div class="metric-label">${label}</div>
      <div class="metric-value ${color}">${value}</div>
      ${change ? `
        <div class="metric-change ${changeType}">
          <span>${changeIcon}</span>
          <span>${change}</span>
        </div>
      ` : ''}
      ${sparklineId ? `<canvas class="metric-sparkline" id="${sparklineId}"></canvas>` : ''}
    </div>
  `;
}

export function metricsGrid(): string {
  return `
    <div class="grid grid-cols-4 gap-4">
      ${metricCard({
        label: 'CPU Usage',
        value: '67.2%',
        change: '+5.3% from avg',
        changeType: 'negative',
        color: 'pink',
        sparklineId: 'sparkline-cpu'
      })}
      ${metricCard({
        label: 'Memory',
        value: '54.8%',
        change: 'Stable',
        changeType: 'neutral',
        color: 'cyan',
        sparklineId: 'sparkline-memory'
      })}
      ${metricCard({
        label: 'Requests/s',
        value: '12.4K',
        change: '+12% from yesterday',
        changeType: 'positive',
        color: 'pink',
        sparklineId: 'sparkline-requests'
      })}
      ${metricCard({
        label: 'Error Rate',
        value: '0.42%',
        change: '+0.1% from avg',
        changeType: 'negative',
        color: 'yellow',
        sparklineId: 'sparkline-errors'
      })}
    </div>
  `;
}
