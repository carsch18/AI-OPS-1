/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Service Components
   Service health cards and list items
   ═══════════════════════════════════════════════════════════════════════════════ */

interface Service {
  name: string;
  status: 'healthy' | 'warning' | 'critical';
  latency: number;
  requests: number;
  errors: number;
}

export function serviceItem(service: Service): string {
  return `
    <div class="service-item" data-service="${service.name}">
      <div class="status-dot ${service.status}"></div>
      <div style="flex: 1; min-width: 0;">
        <div class="service-name">${service.name}</div>
        <div class="service-meta">${service.requests.toLocaleString()} req/s • ${service.errors}% errors</div>
      </div>
      <div class="service-metrics">
        <div class="service-metric">${service.latency}ms</div>
        <div class="service-metric-label">P99 Latency</div>
      </div>
    </div>
  `;
}

export function serviceList(services: Service[]): string {
  return `
    <div style="display: flex; flex-direction: column; gap: var(--space-2);">
      ${services.map(service => serviceItem(service)).join('')}
    </div>
  `;
}

// Sample services for demo
export const sampleServices: Service[] = [
  { name: 'api-gateway', status: 'critical', latency: 245, requests: 12500, errors: 2.3 },
  { name: 'checkout-service', status: 'warning', latency: 189, requests: 3200, errors: 0.8 },
  { name: 'payment-api', status: 'healthy', latency: 45, requests: 1800, errors: 0.1 },
  { name: 'inventory-service', status: 'healthy', latency: 32, requests: 890, errors: 0.0 },
  { name: 'user-service', status: 'healthy', latency: 28, requests: 4500, errors: 0.2 },
  { name: 'notification-service', status: 'healthy', latency: 156, requests: 650, errors: 0.5 },
];
