/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - API Routes
   Proxy routes to Brain backend + local API endpoints
   ═══════════════════════════════════════════════════════════════════════════════ */

import { Hono } from 'hono';
import { config } from '../config';

export const apiRouter = new Hono();

// ─────────────────────────────────────────────────────────────────────────────
// PROXY HELPER
// ─────────────────────────────────────────────────────────────────────────────

async function proxyToBrain(path: string, options: RequestInit = {}): Promise<Response> {
  const url = `${config.brainUrl}${path}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    return response;
  } catch (error) {
    console.error(`  \x1b[31m✗ Brain API error:\x1b[0m ${error}`);
    return new Response(JSON.stringify({ 
      error: 'Brain service unavailable',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH & STATUS
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.get('/health', async (c) => {
  const brainHealth = await proxyToBrain('/health');
  const brainData = brainHealth.ok ? await brainHealth.json() : null;
  
  return c.json({
    ui: {
      status: 'healthy',
      version: config.appVersion,
    },
    brain: brainData || { status: 'unavailable' },
    timestamp: new Date().toISOString(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.post('/auth/login', async (c) => {
  const body = await c.req.json();
  const response = await proxyToBrain('/token', {
    method: 'POST',
    body: new URLSearchParams({
      username: body.email,
      password: body.password,
    }).toString(),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
  
  if (!response.ok) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  const data = await response.json();
  return c.json(data);
});

apiRouter.get('/auth/me', async (c) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader) {
    return c.json({ error: 'Not authenticated' }, 401);
  }
  
  const response = await proxyToBrain('/users/me', {
    headers: { Authorization: authHeader },
  });
  
  if (!response.ok) {
    return c.json({ error: 'Invalid token' }, 401);
  }
  
  return c.json(await response.json());
});

// ─────────────────────────────────────────────────────────────────────────────
// METRICS (Netdata proxy)
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.get('/metrics/cpu', async () => {
  return proxyToBrain('/tools/get_cpu_usage');
});

apiRouter.get('/metrics/memory', async () => {
  return proxyToBrain('/tools/get_memory_usage');
});

apiRouter.get('/metrics/network', async () => {
  return proxyToBrain('/tools/get_network_stats');
});

apiRouter.get('/metrics/disk', async () => {
  return proxyToBrain('/tools/get_disk_io');
});

apiRouter.get('/metrics/system-load', async () => {
  return proxyToBrain('/tools/get_system_load');
});

apiRouter.get('/metrics/processes', async () => {
  return proxyToBrain('/tools/get_top_processes');
});

// ─────────────────────────────────────────────────────────────────────────────
// ANOMALY DETECTION (Edge ML)
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.get('/anomaly/rate', async () => {
  return proxyToBrain('/tools/get_anomaly_rate');
});

apiRouter.get('/anomaly/by-type', async () => {
  return proxyToBrain('/tools/get_anomalies_by_type');
});

apiRouter.get('/anomaly/correlations', async () => {
  return proxyToBrain('/tools/get_metric_correlations');
});

apiRouter.get('/anomaly/cpu', async () => {
  return proxyToBrain('/tools/get_cpu_with_anomaly');
});

apiRouter.get('/anomaly/memory', async () => {
  return proxyToBrain('/tools/get_memory_with_anomaly');
});

// ─────────────────────────────────────────────────────────────────────────────
// CHAT (AI Assistant)
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.post('/chat', async (c) => {
  const body = await c.req.json();
  const authHeader = c.req.header('Authorization');
  
  return proxyToBrain('/chat', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

apiRouter.get('/chat/history', async (c) => {
  const authHeader = c.req.header('Authorization');
  return proxyToBrain('/chat/history', {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PENDING ACTIONS (HITL)
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.get('/actions/pending', async (c) => {
  const authHeader = c.req.header('Authorization');
  return proxyToBrain('/pending-actions', {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

apiRouter.post('/actions/:id/approve', async (c) => {
  const id = c.req.param('id');
  const authHeader = c.req.header('Authorization');
  
  return proxyToBrain(`/pending-actions/${id}/approve`, {
    method: 'POST',
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

apiRouter.post('/actions/:id/reject', async (c) => {
  const id = c.req.param('id');
  const authHeader = c.req.header('Authorization');
  
  return proxyToBrain(`/pending-actions/${id}/reject`, {
    method: 'POST',
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// INCIDENTS
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.get('/incidents', async (c) => {
  const authHeader = c.req.header('Authorization');
  return proxyToBrain('/incidents', {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

apiRouter.get('/incidents/:id', async (c) => {
  const id = c.req.param('id');
  const authHeader = c.req.header('Authorization');
  return proxyToBrain(`/incidents/${id}`, {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

apiRouter.post('/incidents', async (c) => {
  const body = await c.req.json();
  const authHeader = c.req.header('Authorization');
  
  return proxyToBrain('/incidents', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.get('/audit-log', async (c) => {
  const authHeader = c.req.header('Authorization');
  const limit = c.req.query('limit') || '100';
  return proxyToBrain(`/audit-log?limit=${limit}`, {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

apiRouter.get('/audit-log/stats', async (c) => {
  const authHeader = c.req.header('Authorization');
  return proxyToBrain('/audit-log/stats', {
    headers: authHeader ? { Authorization: authHeader } : {},
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVICES (Mock for now - will be implemented in backend)
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.get('/services', async (c) => {
  // Mock data - replace with actual backend call when available
  return c.json({
    services: [
      { name: 'api-gateway', status: 'healthy', latency: 45, requests: 12500, errors: 0.1 },
      { name: 'checkout-service', status: 'warning', latency: 189, requests: 3200, errors: 1.2 },
      { name: 'payment-api', status: 'healthy', latency: 32, requests: 1800, errors: 0.05 },
      { name: 'inventory-service', status: 'healthy', latency: 28, requests: 890, errors: 0.0 },
      { name: 'user-service', status: 'healthy', latency: 35, requests: 4500, errors: 0.2 },
      { name: 'notification-service', status: 'critical', latency: 520, requests: 650, errors: 5.3 },
    ],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS (Mock for now)
// ─────────────────────────────────────────────────────────────────────────────

apiRouter.get('/alerts', async (c) => {
  // Mock data - replace with actual backend call when available
  return c.json({
    alerts: [
      { id: 'a1', severity: 'critical', title: 'High CPU usage on api-gateway', service: 'api-gateway', time: Date.now() - 120000 },
      { id: 'a2', severity: 'warning', title: 'Memory pressure on checkout-service', service: 'checkout', time: Date.now() - 300000 },
      { id: 'a3', severity: 'critical', title: 'Database connection pool exhausted', service: 'postgres', time: Date.now() - 180000 },
      { id: 'a4', severity: 'warning', title: 'Latency spike detected', service: 'payment-api', time: Date.now() - 600000 },
      { id: 'a5', severity: 'info', title: 'Deployment completed successfully', service: 'frontend', time: Date.now() - 900000 },
    ],
  });
});
