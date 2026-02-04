import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'

const app = new Hono()

const WORKFLOW_ENGINE_URL = 'http://localhost:8001';

// Serve static files
app.use('/public/*', serveStatic({ root: './' }))

// Serve Workflow UI Static Assets
app.use('/assets/*', serveStatic({ root: '../workflow-ui/dist' }))
app.use('/vite.svg', serveStatic({ root: '../workflow-ui/dist' }))

// API: Get system metrics from Netdata
app.get('/api/metrics', async (c) => {
  try {
    const response = await fetch('http://localhost:19998/api/v1/data?chart=system.cpu&after=-60&points=60&format=json')
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch metrics' }, 500)
  }
})

// API: Get ALL charts from Netdata
app.get('/api/charts', async (c) => {
  try {
    const response = await fetch('http://localhost:19998/api/v1/charts')
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch charts' }, 500)
  }
})

// API: Get specific chart data with history
app.get('/api/chart/:chart', async (c) => {
  const chart = c.req.param('chart')
  const after = c.req.query('after') || '-60'
  const points = c.req.query('points') || '60'
  try {
    // Redirect to our backend mock stats
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/chart/${chart}?after=${after}&points=${points}`)
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch chart' }, 500)
  }
})

// API: Get active alerts from Netdata
// API: Get Alerts (Active + History)
app.get('/api/alerts', async (c) => {
  try {
    // Call Brain service for consolidated alerts
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/active-alerts`)
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch alerts', active: [], history: [] }, 500)
  }
})

// API: Diagnose Alert
app.post('/api/alerts/:id/diagnose', async (c) => {
  try {
    const body = await c.req.json()
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/diagnose-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Diagnosis failed' }, 500)
  }
})

// API: Approve Remediation (Create Incident)
app.post('/api/alerts/:id/approve', async (c) => {
  try {
    const body = await c.req.json()

    // First, create the incident
    const incidentResponse = await fetch(`${WORKFLOW_ENGINE_URL}/api/create-incident`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Alert Remediation: ${body.metric_name}`,
        description: body.description || `User approved remediation for alert ${body.alert_id}`,
        severity: body.severity || "MEDIUM",
        alert_id: body.alert_id,
        remediation_plan: body.remediation
      })
    })
    const incidentData = await incidentResponse.json()

    // Then, trigger the SSH command execution based on the remediation
    let sshCommand = ''
    const remediation = (body.remediation || '').toLowerCase()
    const metricName = (body.metric_name || '').toLowerCase()

    // Map remediations to SSH commands
    if (remediation.includes('netdata') || metricName.includes('netdata')) {
      sshCommand = 'docker restart netdata'
    } else if (remediation.includes('restart') && (remediation.includes('service') || remediation.includes('ddev'))) {
      sshCommand = 'cd ~/d1/regenics && ddev restart'
    } else if (remediation.includes('docker') && remediation.includes('restart')) {
      sshCommand = 'docker restart netdata'
    }

    // Execute SSH command if we have one
    let sshResult = null
    if (sshCommand) {
      try {
        const sshResponse = await fetch(`${WORKFLOW_ENGINE_URL}/api/terminal/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command: sshCommand })
        })
        sshResult = await sshResponse.json()
        console.log(`🔧 SSH Executed: ${sshCommand} -> Exit: ${sshResult.exitCode}`)
      } catch (e) {
        console.error('SSH execution error:', e)
      }
    }

    return c.json({ ...incidentData, ssh_executed: sshCommand, ssh_result: sshResult })
  } catch (error) {
    return c.json({ error: 'Failed to approve remediation' }, 500)
  }
})

// API: Reject Remediation
app.post('/api/alerts/:id/reject', async (c) => {
  try {
    const alertId = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/reject-alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        alert_id: alertId,
        metric_name: body.metric_name,
        reason: body.reason || 'User rejected remediation',
        description: body.description // Pass through AI diagnosis
      })
    })
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to reject' }, 500)
  }
})

// API: Get system info
app.get('/api/info', async (c) => {
  try {
    const response = await fetch('http://localhost:19998/api/v1/info')
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch info' }, 500)
  }
})

// API: Get Top Processes/Containers from REMOTE server via Netdata API
app.get('/api/processes', async (c) => {
  try {
    // Fetch list of charts to find Docker/cgroup CPU charts
    const chartsResponse = await fetch('http://localhost:19998/api/v1/charts');
    if (!chartsResponse.ok) {
      throw new Error('Failed to fetch charts list');
    }

    const chartsData = await chartsResponse.json() as { charts: Record<string, { id: string, name: string, family: string }> };

    // Find cgroup CPU charts (Docker containers)
    const cgroupCpuCharts = Object.keys(chartsData.charts).filter(c =>
      c.includes('cgroup_') && c.includes('.cpu') && !c.includes('cpu_limit') && !c.includes('throttled')
    );

    let processes: Array<{ user: string, pid: string, cpu: number, memory: number, command: string }> = [];

    // If we have cgroup charts, use those (Docker containers)
    for (const chartId of cgroupCpuCharts.slice(0, 15)) {
      try {
        const cpuResp = await fetch(`http://localhost:19998/api/v1/data?chart=${chartId}&after=-5&points=1&format=json`);
        if (cpuResp.ok) {
          const cpuData = await cpuResp.json() as { labels: string[], data: number[][] };
          // Sum all CPU dimensions
          const cpuTotal = cpuData.data[0]?.slice(1).reduce((a: number, b: number) => a + (b || 0), 0) || 0;

          // Try to get memory for same container
          const memChartId = chartId.replace('.cpu', '.mem');
          let memTotal = 0;
          try {
            const memResp = await fetch(`http://localhost:19998/api/v1/data?chart=${memChartId}&after=-5&points=1&format=json`);
            if (memResp.ok) {
              const memData = await memResp.json() as { labels: string[], data: number[][] };
              // Get RSS or total memory
              const rssIdx = memData.labels.indexOf('rss');
              memTotal = rssIdx > 0 ? (memData.data[0]?.[rssIdx] || 0) / 1048576 : 0; // Convert to MB
            }
          } catch { }

          // Extract container name from chart ID
          const containerName = chartId.replace('cgroup_', '').replace('.cpu', '').replace(/_/g, '-');

          processes.push({
            user: 'docker',
            pid: '-',
            cpu: parseFloat(cpuTotal.toFixed(2)),
            memory: parseFloat(memTotal.toFixed(2)),
            command: containerName.substring(0, 50)
          });
        }
      } catch { }
    }

    // If no cgroup charts, try to get system CPU breakdown
    if (processes.length === 0) {
      const sysResp = await fetch('http://localhost:19998/api/v1/data?chart=system.cpu&after=-5&points=1&format=json');
      if (sysResp.ok) {
        const sysData = await sysResp.json() as { labels: string[], data: number[][] };
        sysData.labels.slice(1).forEach((label: string, idx: number) => {
          const val = sysData.data[0]?.[idx + 1] || 0;
          if (val > 0.1) {
            processes.push({
              user: 'system',
              pid: '-',
              cpu: parseFloat(val.toFixed(2)),
              memory: 0,
              command: `CPU: ${label}`
            });
          }
        });
      }
    }

    // Sort by CPU and take top 10
    processes.sort((a, b) => b.cpu - a.cpu);

    return c.json({ processes: processes.slice(0, 10) });
  } catch (error) {
    console.error('Processes API error:', error);
    return c.json({ error: 'Failed to fetch processes from remote server', processes: [] }, 500);
  }
})

// API: Get Top Disk Usage from REMOTE server via Netdata API (through SSH tunnel)
app.get('/api/disk-usage', async (c) => {
  try {
    // Fetch disk space data from Netdata via SSH tunnel
    const diskResponse = await fetch('http://localhost:19998/api/v1/data?chart=disk_space._&after=-1&points=1&format=json');

    if (!diskResponse.ok) {
      // Try alternative chart name
      const altResponse = await fetch('http://localhost:19998/api/v1/charts');
      const chartsData = await altResponse.json() as { charts: Record<string, { name: string }> };

      // Find disk space charts
      const diskCharts = Object.keys(chartsData.charts).filter(c => c.startsWith('disk_space.'));

      let directories: Array<{ idx: number, path: string, size: string, sizeBytes: number, percent: string }> = [];
      let totalDiskBytes = 500000000000; // Default 500GB

      for (const chartName of diskCharts.slice(0, 10)) {
        const chartResponse = await fetch(`http://localhost:19998/api/v1/data?chart=${chartName}&after=-1&points=1&format=json`);
        if (chartResponse.ok) {
          const chartData = await chartResponse.json() as { labels: string[], data: number[][] };
          const usedIdx = chartData.labels.indexOf('used');
          const availIdx = chartData.labels.indexOf('avail');

          if (usedIdx > 0 && chartData.data[0]) {
            const usedGB = chartData.data[0][usedIdx] || 0;
            const availGB = chartData.data[0][availIdx] || 0;
            const totalGB = usedGB + availGB;

            directories.push({
              idx: directories.length + 1,
              path: chartName.replace('disk_space.', '/').replace(/_/g, '/'),
              size: usedGB >= 1024 ? (usedGB / 1024).toFixed(1) + 'T' : usedGB.toFixed(1) + 'G',
              sizeBytes: usedGB * 1073741824,
              percent: totalGB > 0 ? ((usedGB / totalGB) * 100).toFixed(1) : '0'
            });
          }
        }
      }

      return c.json({ directories, totalDiskBytes });
    }

    const diskData = await diskResponse.json() as { labels: string[], data: number[][] };
    const usedIdx = diskData.labels.indexOf('used');
    const availIdx = diskData.labels.indexOf('avail');

    const usedGB = diskData.data[0]?.[usedIdx] || 0;
    const availGB = diskData.data[0]?.[availIdx] || 0;
    const totalGB = usedGB + availGB;
    const totalDiskBytes = totalGB * 1073741824;

    const directories = [{
      idx: 1,
      path: '/',
      size: usedGB >= 1024 ? (usedGB / 1024).toFixed(1) + 'T' : usedGB.toFixed(1) + 'G',
      sizeBytes: usedGB * 1073741824,
      percent: totalGB > 0 ? ((usedGB / totalGB) * 100).toFixed(1) : '0'
    }];

    return c.json({ directories, totalDiskBytes });
  } catch (error) {
    console.error('Disk usage API error:', error);
    return c.json({ error: String(error), directories: [] }, 500);
  }
})

// API: Chat with AI Brain
app.post('/api/chat', async (c) => {
  const body = await c.req.json()
  const message = body.message

  try {
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    })
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Brain not available', response: 'The AI Brain is starting up...' }, 503)
  }
})

// API: Get pending actions (HITL)
app.get('/api/pending-actions', async (c) => {
  try {
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/pending-actions`)
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ actions: [] })
  }
})

// API: Approve/Reject action (HITL)
app.post('/api/actions/:id/approve', async (c) => {
  const actionId = c.req.param('id')
  const body = await c.req.json()

  try {
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/actions/${actionId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to process approval' }, 500)
  }
})

// API: Get audit log
app.get('/api/audit-log', async (c) => {
  try {
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/audit-log`)
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ logs: [] })
  }
})

// API: Get availability metrics from peekaping
app.get('/api/metrics/availability', async (c) => {
  try {
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/metrics/availability`)
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Failed to fetch availability metrics' }, 500)
  }
})

// API: Get network packets
app.get('/api/network/packets', async (c) => {
  try {
    const limit = c.req.query('limit') || '50'
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/network/packets?limit=${limit}`)
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ packets: [], count: 0, error: 'Network sniffer not available' })
  }
})

// ==========================================
// TERMINAL API ENDPOINTS (proxy to brain service)
// ==========================================

// API: Test SSH connection (proxy to brain)
app.post('/api/terminal/connect', async (c) => {
  try {
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/terminal/connect`, {
      method: 'POST'
    })
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ success: false, error: 'Brain service not available' })
  }
})

// API: Execute command via SSH (proxy to brain)
app.post('/api/terminal/execute', async (c) => {
  try {
    const body = await c.req.json()
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/terminal/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({ error: 'Brain service not available' })
  }
})

// API: Get network stats
app.get('/api/network/stats', async (c) => {
  try {
    const response = await fetch(`${WORKFLOW_ENGINE_URL}/api/network/stats`)
    const data = await response.json()
    return c.json(data)
  } catch (error) {
    return c.json({
      total_packets: 0,
      packets_per_second: 0,
      suspicious_count: 0,
      protocols: {},
      is_running: false,
      scapy_available: false
    })
  }
})

// Main dashboard HTML - OpenAI Theme BEAST MODE
app.get('/', (c) => {
  return c.html(dashboardHTML)
})

// Serve Workflow UI Application
app.get('/workflows/ui', async (c) => {
  try {
    const html = await Bun.file('../workflow-ui/dist/index.html').text()
    return c.html(html)
  } catch (e) {
    return c.html('<h1>Error loading workflow UI - Build not found</h1>')
  }
})

const dashboardHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AIOps Command Center</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <!-- Lucide Icons - Professional SVG Icon Library -->
  <script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
  <style>
    :root {
      --bg-primary: #000000;
      --bg-secondary: #0d0d0d;
      --bg-card: #171717;
      --bg-card-hover: #1f1f1f;
      --border: #2d2d2d;
      --text-primary: #ffffff;
      --text-secondary: #ababab;
      --text-muted: #6b6b6b;
      --accent: #10a37f;
      --accent-light: #1ec99f;
      --warning: #f5a623;
      --error: #ff4d4f;
      --info: #43a9ff;
      --purple: #a855f7;
      --chart-1: #10a37f;
      --chart-2: #43a9ff;
      --chart-3: #f5a623;
      --chart-4: #a855f7;
      --chart-4: #a855f7;
      --chart-5: #ff4d4f;
    }

    [data-theme="light"] {
      --bg-primary: #ffffff;
      --bg-secondary: #f9f9f9;
      --bg-card: #ffffff;
      --bg-card-hover: #f0f0f0;
      --border: #e5e5e5;
      --text-primary: #111111;
      --text-secondary: #555555;
      --text-muted: #888888;
      --accent: #10a37f; /* OpenaAI Green stays similar */
      --accent-light: #1ec99f;
      --warning: #f5a623; 
      --error: #ef4444;
      --info: #3b82f6;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      min-height: 100vh;
      line-height: 1.5;
    }
    
    /* Header - OpenAI Style */
    .header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 1000;
    }
    
    .logo {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .logo-icon {
      width: 36px;
      height: 36px;
      background: var(--text-primary);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--bg-primary);
      font-weight: 700;
      font-size: 14px;
    }
    
    .logo-text {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    
    .header-right {
      display: flex;
      gap: 12px;
      align-items: center;
    }
    
    /* OpenAI White Buttons */
    .btn {
      background: var(--text-primary);
      color: var(--bg-primary);
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    
    .btn:hover {
      background: #e5e5e5;
    }
    
    .btn-sm {
      padding: 6px 12px;
      font-size: 13px;
    }
    
    .btn-outline {
      background: transparent;
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    
    .btn-outline:hover {
      background: var(--bg-card);
    }
    
    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 20px;
      font-size: 13px;
      color: var(--text-secondary);
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--accent);
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    
    /* Main Layout */
    .main {
      display: flex;
      height: calc(100vh - 61px);
    }
    
    /* Sidebar */
    .sidebar {
      width: 280px;
      background: var(--bg-secondary);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    .sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
    }
    
    .sidebar-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    
    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    
    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      font-size: 14px;
      color: var(--text-secondary);
      margin-bottom: 2px;
    }
    
    .nav-item:hover {
      background: var(--bg-card);
      color: var(--text-primary);
    }
    
    .nav-item.active {
      background: var(--bg-card);
      color: var(--text-primary);
    }
    
    .nav-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    
    .nav-icon svg {
      width: 18px;
      height: 18px;
      stroke-width: 1.5;
    }
    
    /* Lucide Icon Base Styles */
    .lucide {
      width: 20px;
      height: 20px;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }
    
    .lucide-sm {
      width: 16px;
      height: 16px;
    }
    
    .lucide-lg {
      width: 24px;
      height: 24px;
    }
    
    .lucide-xl {
      width: 32px;
      height: 32px;
    }
    
    /* Content Area */
    .content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    
    /* Tabs */
    .tabs {
      display: flex;
      gap: 4px;
      padding: 12px 24px;
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border);
    }
    
    .tab {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s;
    }
    
    .tab:hover {
      color: var(--text-primary);
    }
    
    .tab.active {
      background: var(--text-primary);
      color: var(--bg-primary);
    }
    
    .view-section, .view {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      width: 100%;
      height: 100%;
      position: relative;
    }
    
    /* Dashboard Grid */
    .dashboard {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
    }
    
    .dashboard-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
    }
    
    .dashboard-title {
      font-size: 24px;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    
    .time-range {
      display: flex;
      gap: 8px;
    }
    
    /* Stats Row */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px;
      transition: all 0.2s;
    }
    
    .stat-card:hover {
      border-color: var(--border);
      background: var(--bg-card-hover);
    }
    
    .stat-label {
      font-size: 12px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }
    
    .stat-value {
      font-size: 28px;
      font-weight: 600;
      color: var(--text-primary);
      font-family: 'JetBrains Mono', monospace;
      letter-spacing: -0.02em;
    }
    
    .stat-unit {
      font-size: 14px;
      color: var(--text-muted);
      margin-left: 4px;
    }
    
    .stat-trend {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-top: 8px;
      font-size: 12px;
    }
    
    .stat-trend.up { color: var(--accent); }
    .stat-trend.down { color: var(--error); }
    
    /* Charts Grid */
    .charts-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
      margin-bottom: 24px;
    }
    
    .chart-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      min-height: 280px;
    }
    
    .chart-card.full-width {
      grid-column: span 2;
    }
    
    .chart-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }
    
    .chart-title {
      font-size: 14px;
      font-weight: 600;
      color: var(--text-primary);
    }
    
    .chart-actions {
      display: flex;
      gap: 8px;
    }
    
    .chart-container {
      position: relative;
      height: 200px;
    }
    
    .chart-canvas {
      width: 100%;
      height: 100%;
    }
    
    /* Alerts Panel */
    .alerts-panel {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 24px;
    }
    
    .alerts-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    
    .alerts-title {
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .alerts-count {
      background: var(--warning);
      color: var(--bg-primary);
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 600;
    }
    
    .alerts-list {
      max-height: 200px;
      overflow-y: auto;
    }
    
    .alert-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      border-bottom: 1px solid var(--border);
      transition: background 0.15s;
    }
    
    .alert-row:last-child {
      border-bottom: none;
    }
    
    .alert-row:hover {
      background: var(--bg-card-hover);
    }
    
    .alert-severity {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    
    .alert-severity.warning { background: var(--warning); }
    .alert-severity.critical { background: var(--error); }
    .alert-severity.info { background: var(--info); }
    
    .alert-content {
      flex: 1;
    }
    
    .alert-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }
    
    .alert-meta {
      font-size: 12px;
      color: var(--text-muted);
    }
    
    /* Chat Panel */
    .chat-panel {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 480px; 
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      max-height: 600px;
      z-index: 1000;
    }
    
    .chat-header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .chat-title {
      font-size: 16px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      max-height: 300px;
    }
    
    .chat-message {
      margin-bottom: 16px;
    }
    
    .chat-message.user .chat-bubble {
      background: var(--text-primary);
      color: var(--bg-primary);
      margin-left: 40px;
    }
    
    .chat-message.ai .chat-bubble {
      background: var(--bg-secondary);
      margin-right: 40px;
    }
    
    .chat-bubble {
      padding: 14px 18px;
      border-radius: 12px;
      font-size: 15px;
      line-height: 1.6;
    }
    
    .chat-input-wrapper {
      padding: 16px;
      border-top: 1px solid var(--border);
      position: relative;
    }
    
    .chat-input {
      width: 100%;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 50px 16px 18px;
      color: var(--text-primary);
      font-size: 15px;
      font-family: inherit;
      outline: none;
      resize: none;
    }
    
    .chat-input:focus {
      border-color: var(--accent);
    }
    
    .chat-send {
      position: absolute;
      right: 24px;
      top: 50%;
      transform: translateY(-50%);
      background: var(--text-primary);
      color: var(--bg-primary);
      border: none;
      width: 32px;
      height: 32px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
    }
    
    /* Slash Menu */
    .slash-menu {
      position: absolute;
      bottom: 100%;
      left: 16px;
      right: 16px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 12px;
      margin-bottom: 8px;
      max-height: 250px;
      overflow-y: auto;
      display: none;
    }
    
    .slash-menu.visible {
      display: block;
    }
    
    .slash-header {
      padding: 10px 16px;
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
    }
    
    .slash-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.1s;
    }
    
    .slash-item:hover, .slash-item.selected {
      background: var(--bg-card);
    }
    
    .slash-cmd {
      color: var(--accent);
      font-weight: 500;
      font-family: 'JetBrains Mono', monospace;
      font-size: 13px;
      min-width: 120px;
    }
    
    .slash-desc {
      color: var(--text-secondary);
      font-size: 13px;
    }
    
    /* Process List */
    .process-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .process-table th {
      text-align: left;
      padding: 12px 16px;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid var(--border);
    }
    
    .process-table td {
      padding: 12px 16px;
      font-size: 14px;
      border-bottom: 1px solid var(--border);
    }
    
    .process-table tr:hover {
      background: var(--bg-card-hover);
    }
    
    .process-name {
      font-family: 'JetBrains Mono', monospace;
      color: var(--text-primary);
    }
    
    .process-bar {
      width: 100px;
      height: 6px;
      background: var(--border);
      border-radius: 3px;
      overflow: hidden;
    }
    
    .process-bar-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.3s;
    }
    
    /* Typing Indicator */
    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 8px;
    }
    
    .typing-indicator span {
      width: 6px;
      height: 6px;
      background: var(--text-muted);
      border-radius: 50%;
      animation: typing 1.2s infinite;
    }
    
    .typing-indicator span:nth-child(2) { animation-delay: 0.15s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.3s; }
    
    @keyframes typing {
      0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
      30% { transform: translateY(-4px); opacity: 1; }
    }
    
    /* Scrollbar */
    ::-webkit-scrollbar {
      width: 6px;
    }
    
    ::-webkit-scrollbar-track {
      background: transparent;
    }
    
    ::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 3px;
    }
    
    ::-webkit-scrollbar-thumb:hover {
      background: #444;
    }
    
    /* Responsive */
    @media (max-width: 1400px) {
      .stats-row {
        grid-template-columns: repeat(3, 1fr);
      }
    }
    
    @media (max-width: 1000px) {
      .charts-grid {
        grid-template-columns: 1fr;
      }
      .chart-card.full-width {
        grid-column: span 1;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <header class="header">
    <div class="logo">
      <div class="logo-icon">AI</div>
      <span class="logo-text">AIOps Command Center</span>
    </div>
    <div class="header-right">
      <div class="status-pill">
        <span class="status-dot"></span>
        <span id="netdataStatus">Connecting...</span>
      </div>
      <button class="btn btn-sm" onclick="refreshAll()" style="display: flex; align-items: center; gap: 6px;"><i data-lucide="refresh-cw" class="lucide-sm"></i> Refresh</button>
      <button class="btn btn-sm btn-outline" onclick="toggleTheme()" style="display: flex; align-items: center; gap: 6px;"><i data-lucide="sun-moon" class="lucide-sm"></i> Theme</button>
      <button class="btn btn-sm btn-outline" onclick="toggleChat()" style="display: flex; align-items: center; gap: 6px;"><i data-lucide="bot" class="lucide-sm"></i> AI Chat</button>
    </div>
  </header>

  <main class="main">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-title">Navigation</div>
      </div>
      <div class="sidebar-content">
        <div class="nav-item active" onclick="showTab('overview')">
          <span class="nav-icon"><i data-lucide="layout-dashboard"></i></span>
          <span>Overview</span>
        </div>
        <div class="nav-item" onclick="showTab('cpu')">
          <span class="nav-icon"><i data-lucide="cpu"></i></span>
          <span>CPU</span>
        </div>
        <div class="nav-item" onclick="showTab('memory')">
          <span class="nav-icon"><i data-lucide="memory-stick"></i></span>
          <span>Memory</span>
        </div>
        <div class="nav-item" onclick="showTab('disk')">
          <span class="nav-icon"><i data-lucide="hard-drive"></i></span>
          <span>Disk</span>
        </div>
        <div class="nav-item" onclick="showTab('network')">
          <span class="nav-icon"><i data-lucide="globe"></i></span>
          <span>Network</span>
        </div>
        <div class="nav-item" onclick="showTab('alerts')">
          <span class="nav-icon"><i data-lucide="bell-ring"></i></span>
          <span>Alerts</span>
        </div>
        <div class="nav-item" onclick="showTab('terminal')">
          <span class="nav-icon"><i data-lucide="terminal"></i></span>
          <span>Terminal</span>
        </div>
        <div class="nav-item" onclick="showTab('workflows')">
          <span class="nav-icon"><i data-lucide="git-branch"></i></span>
          <span>Workflows</span>
        </div>
        <div class="nav-item" onclick="showTab('remediation')">
          <span class="nav-icon"><i data-lucide="wrench"></i></span>
          <span>Auto-Remediation</span>
          <span style="margin-left: auto; background: linear-gradient(135deg, #10b981, #059669); padding: 2px 8px; border-radius: 10px; font-size: 10px; color: white; font-weight: 600;">AI</span>
        </div>
      </div>
      <div style="padding: 16px; border-top: 1px solid var(--border);">
        <div class="sidebar-title" style="margin-bottom: 12px;">Quick Stats</div>
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--text-secondary);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px;">
            <span style="flex-shrink: 0;">Uptime</span>
            <span id="uptimeValue" style="color: var(--text-primary); text-align: right;">--</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 8px;">
            <span style="flex-shrink: 0;">Hostname</span>
            <span id="hostnameValue" style="color: var(--text-primary); text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px;" title="">--</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span style="flex-shrink: 0;">IP Address</span>
            <span id="ipAddressValue" style="color: var(--accent); text-align: right;">--</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- Content -->
    <div class="content">
      <!-- Tab Bar -->
      <div class="tabs">
        <div class="tab active" data-tab="overview">Project_1</div>
        <div class="tab" data-tab="cpu">Project_2</div>
        <div class="tab" data-tab="memory">Project_3</div>
        <div class="tab" data-tab="network">Project_4</div>
        <div class="tab" data-tab="disk">Project_5</div>
      </div>

      <!-- VIEW: Overview (default) -->
      <div id="view-overview" class="view-section" style="display: block;">
      <div class="dashboard" id="dashboardContent">
        <!-- Stats Row -->
        <div class="stats-row">
          <div class="stat-card">                                                                   
            <div class="stat-label">CPU Usage</div>
            <div class="stat-value"><span id="cpuStat">--</span><span class="stat-unit">%</span></div>
            <div class="stat-trend up" id="cpuTrend">↑ 0.1%</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Memory Used</div>
            <div class="stat-value"><span id="memStat">--</span><span class="stat-unit">%</span></div>
            <div class="stat-trend" id="memTrend">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Load (1m)</div>
            <div class="stat-value" id="loadStat">--</div>
            <div class="stat-trend" id="loadTrend">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Network In</div>
            <div class="stat-value" id="netInStat">--</div>
            <div class="stat-trend up" id="netInTrend">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Network Out</div>
            <div class="stat-value" id="netOutStat">--</div>
            <div class="stat-trend" id="netOutTrend">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Disk I/O</div>
            <div class="stat-value" id="diskIOStat">--</div>
            <div class="stat-trend" id="diskIOTrend">--</div>
          </div>
        </div>

        <!-- Alerts Panel -->
        <div class="alerts-panel">
          <div class="alerts-header">
            <div class="alerts-title">
              🚨 Active Alerts
              <span class="alerts-count" id="alertsCount">0</span>
            </div>
            <button class="btn btn-sm" onclick="refreshAlerts()">Refresh</button>
          </div>
          <div class="alerts-list" id="alertsList">
            <div class="alert-row" style="justify-content: center; color: var(--text-muted);">
              Loading alerts...
            </div>
          </div>
        </div>

        <!-- HITL: Pending Actions Panel -->
        <div class="alerts-panel" style="border-color: var(--purple); background: rgba(168, 85, 247, 0.05);">
          <div class="alerts-header">
            <div class="alerts-title" style="color: var(--purple);">
              🛠️ Pending Actions (HITL)
              <span class="alerts-count" id="pendingCount" style="background: var(--purple);">0</span>
            </div>
            <button class="btn btn-sm" onclick="refreshPendingActions()">Refresh</button>
          </div>
          <div id="pendingActionsList" style="max-height: 300px; overflow-y: auto;">
            <div class="alert-row" style="justify-content: center; color: var(--text-muted);">
              No pending actions
            </div>
          </div>
        </div>

        <div class="charts-grid">
          <div class="chart-card full-width">
            <div class="chart-header">
              <div class="chart-title">📈 CPU Usage (Last 60s)</div>
              <div class="chart-actions">
                <button class="btn btn-sm btn-outline">1m</button>
                <button class="btn btn-sm btn-outline">5m</button>
                <button class="btn btn-sm btn-outline">15m</button>
              </div>
            </div>
            <div class="chart-container">
              <canvas id="cpuChart" class="chart-canvas"></canvas>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">🧠 Memory Usage</div>
            </div>
            <div class="chart-container">
              <canvas id="memChart" class="chart-canvas"></canvas>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">🌐 Network Traffic</div>
            </div>
            <div class="chart-container">
              <canvas id="netChart" class="chart-canvas"></canvas>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">💾 Disk I/O</div>
            </div>
            <div class="chart-container">
              <canvas id="diskChart" class="chart-canvas"></canvas>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">📊 System Load</div>
            </div>
            <div class="chart-container">
              <canvas id="loadChart" class="chart-canvas"></canvas>
            </div>
          </div>
        </div>

        <!-- Top Processes -->
        <div class="chart-card" style="margin-bottom: 24px;">
          <div class="chart-header">
            <div class="chart-title">⚙️ Top Processes by CPU</div>
            <button class="btn btn-sm" onclick="refreshProcesses()">Refresh</button>
          </div>
          <table class="process-table" id="processTable">
            <thead>
              <tr>
                <th>Process</th>
                <th>CPU %</th>
                <th>Usage</th>
              </tr>
            </thead>
            <tbody id="processBody">
              <tr>
                <td colspan="3" style="text-align: center; color: var(--text-muted);">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div><!-- End view-overview -->

    <!-- VIEW: CPU Details -->
    <div id="view-cpu" class="view-section" style="display: none;">
      <div class="dashboard">
        <!-- CPU Overview Stats -->
        <div class="stats-row" style="grid-template-columns: repeat(4, 1fr);">
          <div class="stat-card">
            <div class="stat-label">Total CPU Usage</div>
            <div class="stat-value"><span id="cpuViewTotal">--</span><span class="stat-unit">%</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Load (1m)</div>
            <div class="stat-value" id="cpuViewLoad1">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Load (5m)</div>
            <div class="stat-value" id="cpuViewLoad5">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Load (15m)</div>
            <div class="stat-value" id="cpuViewLoad15">--</div>
          </div>
        </div>

        <!-- CPU Components Grid -->
        <div class="chart-card" style="margin-bottom: 24px;">
          <div class="chart-header">
            <div class="chart-title">🔢 CPU Breakdown</div>
          </div>
          <div id="cpu-cores-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 12px; padding: 16px;">
            <div style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Loading...</div>
          </div>
        </div>

        <!-- Charts Grid - Same as Overview -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">📈 CPU Usage (Last 60s)</div>
            </div>
            <div class="chart-container">
              <canvas id="cpuViewChart" class="chart-canvas"></canvas>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">📊 System Load</div>
            </div>
            <div class="chart-container">
              <canvas id="cpuLoadChart" class="chart-canvas"></canvas>
            </div>
          </div>
        </div>

        <!-- Top Processes by CPU -->
        <div class="chart-card" style="margin-top: 24px;">
          <div class="chart-header">
            <div class="chart-title">⚙️ Top Processes by CPU</div>
            <button class="btn btn-sm" onclick="loadCPUProcesses()">Refresh</button>
          </div>
          <table class="process-table">
            <thead>
              <tr>
                <th>PID</th>
                <th>Process</th>
                <th>CPU %</th>
                <th>Usage</th>
              </tr>
            </thead>
            <tbody id="cpuViewProcessBody">
              <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted);">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div><!-- End view-cpu -->

    <!-- VIEW: Memory Details -->
    <div id="view-memory" class="view-section" style="display: none;">
      <div class="dashboard">
        <!-- Memory Overview Stats -->
        <div class="stats-row" style="grid-template-columns: repeat(4, 1fr);">
          <div class="stat-card">
            <div class="stat-label">Total Memory</div>
            <div class="stat-value" id="memViewTotal">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Used Memory</div>
            <div class="stat-value"><span id="memViewUsed">--</span><span class="stat-unit">%</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Swap Total</div>
            <div class="stat-value" id="memViewSwapTotal">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Swap Used</div>
            <div class="stat-value"><span id="memViewSwapUsed">--</span><span class="stat-unit">%</span></div>
          </div>
        </div>

        <!-- Memory Breakdown -->
        <div class="chart-card" style="margin-bottom: 24px;">
          <div class="chart-header">
            <div class="chart-title">🔢 Memory Breakdown</div>
          </div>
          <div id="memory-breakdown-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; padding: 16px;">
            <div style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Loading...</div>
          </div>
        </div>

        <!-- Charts Grid -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">📈 Memory Usage (Last 60s)</div>
            </div>
            <div class="chart-container">
              <canvas id="memViewChart" class="chart-canvas"></canvas>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">📊 Swap Usage (Last 60s)</div>
            </div>
            <div class="chart-container">
              <canvas id="swapViewChart" class="chart-canvas"></canvas>
            </div>
          </div>
        </div>

        <!-- Top Processes by Memory -->
        <div class="chart-card" style="margin-top: 24px;">
          <div class="chart-header">
            <div class="chart-title">🧠 Top Processes by Memory</div>
            <button class="btn btn-sm" onclick="loadMemoryProcesses()">Refresh</button>
          </div>
          <table class="process-table">
            <thead>
              <tr>
                <th>PID</th>
                <th>Process</th>
                <th>Memory %</th>
                <th>Usage</th>
              </tr>
            </thead>
            <tbody id="memViewProcessBody">
              <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted);">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div><!-- End view-memory -->

    <!-- VIEW: Disk Details -->
    <div id="view-disk" class="view-section" style="display: none;">
      <div class="dashboard">
        <!-- Disk Overview Stats -->
        <div class="stats-row" style="grid-template-columns: repeat(4, 1fr);">
          <div class="stat-card">
            <div class="stat-label">Total Size</div>
            <div class="stat-value" id="diskViewTotal">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Used Capacity</div>
            <div class="stat-value" id="diskViewUsed">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Available Space</div>
            <div class="stat-value" id="diskViewAvail">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Usage</div>
            <div class="stat-value"><span id="diskViewPercent">--</span><span class="stat-unit">%</span></div>
          </div>
        </div>

        <!-- Charts Grid -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">📈 Disk I/O (Last 60s)</div>
            </div>
            <div class="chart-container">
              <canvas id="diskIOChart" class="chart-canvas"></canvas>
            </div>
          </div>
          
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">📊 Disk Space Usage</div>
            </div>
            <div class="chart-container">
              <canvas id="diskSpaceChart" class="chart-canvas"></canvas>
            </div>
          </div>
        </div>

        <!-- Disk Usage Breakdown -->
        <div class="chart-card" style="margin-top: 24px; margin-bottom: 24px;">
          <div class="chart-header">
            <div class="chart-title">🔢 Disk Space Breakdown</div>
          </div>
          <div id="disk-breakdown-container" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; padding: 16px;">
            <div style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">Loading...</div>
          </div>
        </div>

        <!-- Top Directories by Disk Usage -->
        <div class="chart-card" style="margin-top: 24px;">
          <div class="chart-header">
            <div class="chart-title">📁 Top Directories by Size</div>
            <button class="btn btn-sm" onclick="loadDiskDirectories()">Refresh</button>
          </div>
          <table class="process-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Directory</th>
                <th>Size</th>
                <th>Usage</th>
              </tr>
            </thead>
            <tbody id="diskViewDirBody">
              <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted);">Loading...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div><!-- End view-disk -->

    <!-- VIEW: Network Monitoring -->
    <div id="view-network" class="view-section" style="display: none;">
      <div class="dashboard">
        <!-- Network Stats Row -->
        <div class="stats-row" style="grid-template-columns: repeat(4, 1fr);">
          <div class="stat-card">
            <div class="stat-label">Total Packets</div>
            <div class="stat-value" id="networkTotalPackets">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Packets/Sec</div>
            <div class="stat-value" id="networkPacketsPerSec">--</div>
          </div>
          <div class="stat-card" style="border-color: var(--warning);">
            <div class="stat-label">🚨 Suspicious</div>
            <div class="stat-value" id="networkSuspiciousCount" style="color: var(--warning);">--</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">External Connections</div>
            <div class="stat-value" id="networkExternalConnections">--</div>
          </div>
        </div>

        <!-- Protocol Breakdown -->
        <div class="chart-card" style="margin-bottom: 24px;">
          <div class="chart-header">
            <div class="chart-title">📊 Protocol Distribution</div>
          </div>
          <div id="protocol-breakdown" style="display: flex; gap: 16px; padding: 16px; flex-wrap: wrap;">
            <div style="color: var(--text-muted);">Loading...</div>
          </div>
        </div>

        <!-- Network Charts -->
        <div class="charts-grid">
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">🌐 Network Traffic</div>
            </div>
            <div class="chart-container">
              <canvas id="networkViewChart" class="chart-canvas"></canvas>
            </div>
          </div>
          <div class="chart-card">
            <div class="chart-header">
              <div class="chart-title">📈 Packets Over Time</div>
            </div>
            <div class="chart-container">
              <canvas id="packetsChart" class="chart-canvas"></canvas>
            </div>
          </div>
        </div>

        <!-- Packet List Table -->
        <div class="chart-card" style="margin-top: 24px;">
          <div class="chart-header">
            <div class="chart-title">📦 Recent Network Packets</div>
            <button class="btn btn-sm" onclick="loadNetworkPackets()">Refresh</button>
          </div>
          <div style="max-height: 400px; overflow-y: auto;">
            <table class="process-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source IP</th>
                  <th>Dest IP</th>
                  <th>Port</th>
                  <th>Protocol</th>
                  <th>Payload</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="networkPacketBody">
                <tr>
                  <td colspan="7" style="text-align: center; color: var(--text-muted);">Loading packets...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Sniffer Status -->
        <div style="margin-top: 16px; padding: 12px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; font-size: 12px; color: var(--text-muted);">
          <span id="snifferStatus">⏳ Checking sniffer status...</span>
        </div>
      </div>
    </div><!-- End view-network -->

    <!-- VIEW: Alerts & Remediation -->
    <div id="view-alerts" class="view-section" style="display: none;">
      <div class="dashboard">
        <!-- Alerts Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h2 style="margin: 0; color: var(--text-primary);">🚨 Active Alerts</h2>
          <button class="btn btn-sm" onclick="loadAlerts()">⟳ Refresh</button>
        </div>

        <!-- Alerts Container -->
        <div id="alertsContainer" style="display: grid; gap: 16px;">
          <div style="text-align: center; padding: 40px; color: var(--text-muted);">
            Loading alerts...
          </div>
        </div>

        <!-- Alert History -->
        <div class="chart-card" style="margin-top: 32px; height: auto; min-height: min-content;">
          <div class="chart-header">
            <div class="chart-title">📜 Alert History</div>
          </div>
          <div style="overflow-x: auto; width: 100%;">
            <table class="process-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Remediation (Jist)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody id="alertHistoryBody">
                <tr>
                  <td colspan="5" style="text-align: center; color: var(--text-muted);">Loading history...</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div><!-- End view-alerts -->

    <!-- VIEW: Terminal -->
    <div id="view-terminal" class="view-section" style="display: none;">
      <div class="dashboard" style="height: calc(100vh - 100px);">
        <!-- Terminal Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h2 style="margin: 0; color: var(--text-primary);">💻 SSH Terminal - DDEV Server</h2>
          <div style="display: flex; gap: 12px; align-items: center;">
            <span id="terminalStatus" style="font-size: 12px; color: var(--text-muted);">● Disconnected</span>
            <button class="btn btn-sm" onclick="connectTerminal()">Connect</button>
            <button class="btn btn-sm btn-outline" onclick="disconnectTerminal()">Disconnect</button>
          </div>
        </div>

        <!-- Connection Info -->
        <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-family: 'JetBrains Mono', monospace; font-size: 12px;">
          <span style="color: var(--text-muted);">Host:</span> <span style="color: var(--accent);">test@10.10.2.21</span>
          <span style="margin-left: 24px; color: var(--text-muted);">DDEV Site:</span> <span style="color: var(--text-primary);">~/d1/regenics</span>
        </div>

        <!-- Terminal Output -->
        <div id="terminalOutput" style="
          background: #0d1117;
          border-radius: 8px;
          padding: 16px;
          height: calc(100% - 180px);
          overflow-y: auto;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: #c9d1d9;
          white-space: pre-wrap;
          word-break: break-all;
        ">
<span style="color: #8b949e;">Welcome to AIOps SSH Terminal</span>
<span style="color: #8b949e;">Click "Connect" to establish SSH connection to 10.10.2.21</span>
<span style="color: #8b949e;">───────────────────────────────────────────────────</span>
        </div>

        <!-- Terminal Input -->
        <div style="display: flex; gap: 12px; margin-top: 16px;">
          <input type="text" id="terminalInput" 
            placeholder="Enter command (e.g., ddev status, ddev restart)..." 
            style="
              flex: 1;
              background: var(--bg-tertiary);
              border: 1px solid var(--border);
              border-radius: 8px;
              padding: 12px 16px;
              color: var(--text-primary);
              font-family: 'JetBrains Mono', monospace;
              font-size: 13px;
            "
            onkeydown="if(event.key==='Enter')sendTerminalCommand()"
          />
          <button class="btn" onclick="sendTerminalCommand()">Run ▶</button>
        </div>

        <!-- Quick Commands -->
        <div style="margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;">
          <span style="color: var(--text-muted); font-size: 12px; margin-right: 8px;">Quick:</span>
          <button class="btn btn-sm btn-outline" onclick="runQuickCommand('ddev status')">ddev status</button>
          <button class="btn btn-sm btn-outline" onclick="runQuickCommand('ddev restart')">ddev restart</button>
          <button class="btn btn-sm btn-outline" onclick="runQuickCommand('ddev logs -f')">ddev logs</button>
          <button class="btn btn-sm btn-outline" onclick="runQuickCommand('docker ps')">docker ps</button>
          <button class="btn btn-sm btn-outline" onclick="runQuickCommand('docker restart netdata')">netdata restart</button>
        </div>
      </div>
    </div><!-- End view-terminal -->

    <!-- VIEW: Workflows - Full Height Seamless Integration -->
    <div id="view-workflows" class="view" style="display: none; height: 100%; flex: 1;">
      <iframe 
        id="workflowFrame"
        src="/workflows/ui"
        style="width: 100%; height: 100%; border: none; background: #0d0d0d;"
        title="Workflow Builder"
        onload="document.getElementById('workflowLoading').style.display='none';"
      ></iframe>
      
      <!-- Overlay for loading state -->
      <div id="workflowLoading" style="
        position: absolute; top: 0; left: 0; right: 0; bottom: 0;
        background: #0d0d0d;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 16px; z-index: 10;
      ">
        <div style="font-size: 64px; animation: pulse 2s infinite;">⚡</div>
        <div style="color: #a3a3a3; font-size: 18px; font-weight: 500;">Loading Workflow Builder...</div>
        <div style="color: #666; font-size: 13px;">Initializing visual automation engine</div>
      </div>
    </div><!-- End view-workflows -->

    <!-- VIEW: Auto-Remediation Dashboard - THE CROWN JEWEL -->
    <div id="view-remediation" class="view" style="display: none; height: 100%; flex: 1; overflow-y: auto; background: linear-gradient(180deg, #0a0a0a 0%, #111 100%);">
      <style>
        /* Auto-Remediation Dashboard Styles */
        .remediation-container {
          padding: 24px;
          max-width: 1800px;
          margin: 0 auto;
        }
        
        .remediation-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
          padding: 20px 24px;
          background: linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 95, 70, 0.1));
          border: 1px solid rgba(16, 185, 129, 0.2);
          border-radius: 16px;
          position: relative;
          overflow: hidden;
        }
        
        .remediation-header::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(16, 185, 129, 0.5), transparent);
        }
        
        .remediation-title {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        
        .remediation-title h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, #10b981, #34d399);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          text-shadow: 0 0 30px rgba(16, 185, 129, 0.3);
        }
        
        .ai-badge {
          background: linear-gradient(135deg, #10b981, #059669);
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          color: white;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 0 20px rgba(16, 185, 129, 0.4);
          animation: glow 2s ease-in-out infinite;
        }
        
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.4); }
          50% { box-shadow: 0 0 30px rgba(16, 185, 129, 0.6); }
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 24px;
        }
        
        .stat-card {
          background: rgba(23, 23, 23, 0.8);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          padding: 20px;
          position: relative;
          overflow: hidden;
          transition: all 0.3s ease;
        }
        
        .stat-card:hover {
          transform: translateY(-4px);
          border-color: rgba(16, 185, 129, 0.3);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }
        
        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          border-radius: 16px 16px 0 0;
        }
        
        .stat-card.critical::before { background: linear-gradient(90deg, #ef4444, #dc2626); }
        .stat-card.high::before { background: linear-gradient(90deg, #f97316, #ea580c); }
        .stat-card.medium::before { background: linear-gradient(90deg, #eab308, #ca8a04); }
        .stat-card.success::before { background: linear-gradient(90deg, #10b981, #059669); }
        
        .stat-label {
          font-size: 13px;
          color: #737373;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 8px;
        }
        
        .stat-value {
          font-size: 36px;
          font-weight: 700;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .stat-card.critical .stat-value { color: #ef4444; }
        .stat-card.high .stat-value { color: #f97316; }
        .stat-card.medium .stat-value { color: #eab308; }
        .stat-card.success .stat-value { color: #10b981; }
        
        .stat-subtitle {
          font-size: 12px;
          color: #525252;
          margin-top: 4px;
        }
        
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-bottom: 24px;
        }
        
        .panel {
          background: rgba(23, 23, 23, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 16px;
          overflow: hidden;
        }
        
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          background: rgba(0, 0, 0, 0.3);
        }
        
        .panel-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 600;
          color: #e5e5e5;
        }
        
        .panel-icon {
          font-size: 20px;
        }
        
        .panel-body {
          padding: 16px 20px;
          max-height: 400px;
          overflow-y: auto;
        }
        
        .issue-card {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          margin-bottom: 12px;
          transition: all 0.2s ease;
          cursor: pointer;
        }
        
        .issue-card:hover {
          background: rgba(16, 185, 129, 0.05);
          border-color: rgba(16, 185, 129, 0.3);
          transform: translateX(4px);
        }
        
        .issue-icon {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          flex-shrink: 0;
        }
        
        .issue-icon.critical { background: rgba(239, 68, 68, 0.2); }
        .issue-icon.high { background: rgba(249, 115, 22, 0.2); }
        .issue-icon.medium { background: rgba(234, 179, 8, 0.2); }
        
        .issue-info {
          flex: 1;
          min-width: 0;
        }
        
        .issue-name {
          font-weight: 600;
          color: #e5e5e5;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .issue-meta {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: #737373;
        }
        
        .issue-severity {
          padding: 2px 8px;
          border-radius: 6px;
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
        }
        
        .issue-severity.P0 { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
        .issue-severity.P1 { background: rgba(249, 115, 22, 0.2); color: #f97316; }
        .issue-severity.P2 { background: rgba(234, 179, 8, 0.2); color: #eab308; }
        
        .issue-actions {
          display: flex;
          gap: 8px;
        }
        
        .btn-remediate {
          padding: 8px 16px;
          background: linear-gradient(135deg, #10b981, #059669);
          border: none;
          border-radius: 8px;
          color: white;
          font-weight: 600;
          font-size: 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s;
          white-space: nowrap;
        }
        
        .btn-remediate:hover {
          transform: scale(1.05);
          box-shadow: 0 4px 16px rgba(16, 185, 129, 0.4);
        }
        
        .btn-details {
          padding: 8px 12px;
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: #a3a3a3;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .btn-details:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.2);
        }
        
        /* Template Gallery */
        .template-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        
        .template-card {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          transition: all 0.3s ease;
        }
        
        .template-card:hover {
          transform: translateY(-4px);
          border-color: rgba(16, 185, 129, 0.3);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }
        
        .template-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          margin-bottom: 12px;
        }
        
        .template-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(16, 185, 129, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          flex-shrink: 0;
        }
        
        .template-title {
          font-weight: 600;
          color: #e5e5e5;
          font-size: 14px;
          line-height: 1.3;
        }
        
        .template-category {
          font-size: 11px;
          color: #10b981;
          text-transform: uppercase;
          margin-top: 4px;
        }
        
        .template-stats {
          display: flex;
          gap: 16px;
          font-size: 12px;
          color: #737373;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        
        .template-stat {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        
        .template-stat .success { color: #10b981; }
        
        /* Live Execution Monitor */
        .execution-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 16px;
          background: rgba(0, 0, 0, 0.3);
          border-radius: 10px;
          margin-bottom: 10px;
          border-left: 3px solid;
        }
        
        .execution-item.running { border-left-color: #3b82f6; }
        .execution-item.completed { border-left-color: #10b981; }
        .execution-item.failed { border-left-color: #ef4444; }
        
        .execution-status {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          flex-shrink: 0;
        }
        
        .execution-status.running { 
          background: rgba(59, 130, 246, 0.2); 
          animation: spin 1s linear infinite;
        }
        .execution-status.completed { background: rgba(16, 185, 129, 0.2); }
        .execution-status.failed { background: rgba(239, 68, 68, 0.2); }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .execution-info {
          flex: 1;
        }
        
        .execution-name {
          font-weight: 500;
          color: #e5e5e5;
          font-size: 14px;
        }
        
        .execution-time {
          font-size: 12px;
          color: #525252;
          font-family: 'JetBrains Mono', monospace;
        }
        
        .execution-progress {
          width: 120px;
        }
        
        .progress-bar {
          height: 6px;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          overflow: hidden;
        }
        
        .progress-fill {
          height: 100%;
          border-radius: 3px;
          transition: width 0.3s ease;
        }
        
        .progress-fill.running { 
          background: linear-gradient(90deg, #3b82f6, #60a5fa);
          animation: shimmer 1.5s infinite;
        }
        .progress-fill.completed { background: linear-gradient(90deg, #10b981, #34d399); }
        .progress-fill.failed { background: linear-gradient(90deg, #ef4444, #f87171); }
        
        @keyframes shimmer {
          0% { opacity: 0.7; }
          50% { opacity: 1; }
          100% { opacity: 0.7; }
        }
        
        /* Category Pills */
        .category-pills {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 16px;
        }
        
        .category-pill {
          padding: 8px 16px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          font-size: 13px;
          color: #a3a3a3;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .category-pill:hover, .category-pill.active {
          background: rgba(16, 185, 129, 0.1);
          border-color: rgba(16, 185, 129, 0.3);
          color: #10b981;
        }
        
        .category-count {
          background: rgba(0, 0, 0, 0.3);
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 600;
        }
        
        /* Empty State */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px;
          text-align: center;
        }
        
        .empty-icon {
          font-size: 48px;
          margin-bottom: 16px;
          opacity: 0.3;
        }
        
        .empty-title {
          font-size: 18px;
          color: #737373;
          margin-bottom: 8px;
        }
        
        .empty-subtitle {
          font-size: 14px;
          color: #525252;
        }
        
        /* Refresh animation */
        .spin {
          animation: spin 1s linear infinite;
        }
      </style>
      
      <div class="remediation-container">
        <!-- Header -->
        <div class="remediation-header">
          <div class="remediation-title">
            <span style="width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;"><i data-lucide="settings" style="width: 40px; height: 40px; stroke-width: 1.5;"></i></span>
            <div>
              <h1>Auto-Remediation</h1>
              <p style="margin: 0; color: #737373; font-size: 14px;">AI-Powered Self-Healing Infrastructure</p>
            </div>
          </div>
          <div style="display: flex; gap: 12px; align-items: center;">
            <div class="ai-badge">
              <i data-lucide="brain" style="width: 16px; height: 16px;"></i>
              <span>30 AI Templates</span>
            </div>
            <button class="btn btn-outline" onclick="loadRemediationData()" style="display: flex; align-items: center; gap: 6px;">
              <i data-lucide="refresh-cw" id="refreshIcon" class="lucide-sm"></i>
              <span>Refresh</span>
            </button>
            <button class="btn-remediate" onclick="runDetectionCycle()" style="display: flex; align-items: center; gap: 6px;">
              <i data-lucide="play" class="lucide-sm"></i>
              <span>Run Detection</span>
            </button>
          </div>
        </div>
        
        <!-- Stats Grid -->
        <div class="stats-grid" id="remediationStats">
          <div class="stat-card critical">
            <div class="stat-label">Critical Issues</div>
            <div class="stat-value" id="statCritical">0</div>
            <div class="stat-subtitle">Requires immediate action</div>
          </div>
          <div class="stat-card high">
            <div class="stat-label">High Priority</div>
            <div class="stat-value" id="statHigh">0</div>
            <div class="stat-subtitle">Resolve within 1 hour</div>
          </div>
          <div class="stat-card medium">
            <div class="stat-label">Medium Priority</div>
            <div class="stat-value" id="statMedium">0</div>
            <div class="stat-subtitle">Schedule for review</div>
          </div>
          <div class="stat-card success">
            <div class="stat-label">Auto-Remediated</div>
            <div class="stat-value" id="statRemediated">0</div>
            <div class="stat-subtitle">Fixed automatically today</div>
          </div>
        </div>
        
        <!-- Main Dashboard Grid -->
        <div class="dashboard-grid">
          <!-- Active Issues Panel -->
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">
                <span class="panel-icon"><i data-lucide="alert-triangle" style="width: 20px; height: 20px; color: #ef4444;"></i></span>
                <span>Active Issues</span>
                <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;" id="issueCount">0</span>
              </div>
              <button class="btn btn-sm btn-outline" onclick="toggleAutoRemediate()" style="display: flex; align-items: center; gap: 6px;">
                <i data-lucide="toggle-right" class="lucide-sm" style="color: #10b981;"></i>
                <span id="autoRemediateStatus">Auto-Remediate ON</span>
              </button>
            </div>
            <div class="panel-body" id="issuesList">
              <div class="empty-state">
                <div class="empty-icon"><i data-lucide="check-circle-2" style="width: 48px; height: 48px; color: #10b981; opacity: 0.5;"></i></div>
                <div class="empty-title">All Systems Healthy</div>
                <div class="empty-subtitle">No active issues detected</div>
              </div>
            </div>
          </div>
          
          <!-- Live Execution Monitor -->
          <div class="panel">
            <div class="panel-header">
              <div class="panel-title">
                <span class="panel-icon"><i data-lucide="activity" style="width: 20px; height: 20px; color: #3b82f6;"></i></span>
                <span>Live Execution Monitor</span>
              </div>
              <span style="font-size: 12px; color: #525252;">Real-time workflow status</span>
            </div>
            <div class="panel-body" id="executionMonitor">
              <div class="empty-state">
                <div class="empty-icon"><i data-lucide="moon" style="width: 48px; height: 48px; color: #525252; opacity: 0.5;"></i></div>
                <div class="empty-title">No Active Executions</div>
                <div class="empty-subtitle">Workflows run when issues are detected</div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Templates Gallery -->
        <div class="panel" style="margin-bottom: 24px;">
          <div class="panel-header">
            <div class="panel-title">
              <span class="panel-icon"><i data-lucide="library" style="width: 20px; height: 20px; color: #10b981;"></i></span>
              <span>Remediation Templates</span>
              <span style="background: rgba(16, 185, 129, 0.2); color: #10b981; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600;" id="templateCount">30</span>
            </div>
            <button class="btn btn-sm btn-outline" onclick="showAllTemplates()" style="display: flex; align-items: center; gap: 6px;">View All <i data-lucide="arrow-right" class="lucide-sm"></i></button>
          </div>
          <div class="panel-body" style="max-height: 600px;">
            <div class="category-pills" id="categoryPills">
              <div class="category-pill active" onclick="filterTemplates('all')">
                <i data-lucide="layers" class="lucide-sm"></i>
                <span>All</span>
                <span class="category-count">30</span>
              </div>
            </div>
            <div class="template-grid" id="templatesGallery">
              <!-- Templates will be loaded here -->
            </div>
          </div>
        </div>
      </div>
    </div><!-- End view-remediation -->

  </main>

  <!-- Floating Chat Panel -->
  <div class="chat-panel" id="chatPanel" style="display: none;">
    <div class="chat-header">
      <div class="chat-title" style="display: flex; align-items: center; gap: 10px;">
        <i data-lucide="bot" style="width: 22px; height: 22px;"></i>
        AI Infrastructure Agent
      </div>
      <button class="btn btn-sm btn-outline" onclick="toggleChat()" style="display: flex; align-items: center; justify-content: center;"><i data-lucide="x" class="lucide-sm"></i></button>
    </div>
    <div class="chat-messages" id="chatMessages">
      <div class="chat-message ai">
        <div class="chat-bubble">
          Welcome! I'm your AI infrastructure agent. Type <strong>/</strong> to see all available commands, or ask me anything about your system.
        </div>
      </div>
    </div>
    <div class="chat-input-wrapper">
      <div class="slash-menu" id="slashMenu"></div>
      <textarea class="chat-input" id="chatInput" placeholder="Type / for commands..." rows="1"></textarea>
      <button class="chat-send" onclick="sendMessage()"><i data-lucide="send" class="lucide-sm"></i></button>
    </div>
  </div>

  <script>
    // ==========================================
    // DATA STORAGE
    // ==========================================
    // ==========================================
    // THEME HANDLING
    // ==========================================
    function toggleTheme() {
      const root = document.documentElement;
      const current = root.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      // Force chart update to pick up new colors
      if (typeof updateCharts === 'function') updateCharts();
    }
    // Init theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // ==========================================
    // DATA STORAGE
    // ==========================================
    const chartData = {
      cpu: [],
      mem: [],
      net: { in: [], out: [] },
      disk: { read: [], write: [] },
      load: { load1: [], load5: [], load15: [] }
    };
    const maxPoints = 60;

    // ==========================================
    // CHART DRAWING (Pure Canvas, No Library)
    // ==========================================
    function drawChart(canvasId, datasets, options = {}) {
      const canvas = document.getElementById(canvasId);
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);
      
      const width = rect.width;
      const height = rect.height;
      const padding = { top: 20, right: 20, bottom: 30, left: 50 };
      const chartWidth = width - padding.left - padding.right;
      const chartHeight = height - padding.top - padding.bottom;
      
      
      // Get theme colors from body/root where data-theme is set
      const style = getComputedStyle(document.documentElement);
      const bgCard = style.getPropertyValue('--bg-card').trim() || (document.documentElement.getAttribute('data-theme') === 'light' ? '#ffffff' : '#171717');
      const borderColor = style.getPropertyValue('--border').trim() || '#2d2d2d';
      const textMuted = style.getPropertyValue('--text-muted').trim() || '#6b6b6b';
      const textSecondary = style.getPropertyValue('--text-secondary').trim() || '#ababab';

      // Clear
      ctx.fillStyle = bgCard;
      ctx.fillRect(0, 0, width, height);
      
      // Find max value
      let maxVal = options.maxY || 0;
      datasets.forEach(ds => {
        const max = Math.max(...ds.data.filter(v => !isNaN(v)));
        if (max > maxVal) maxVal = max;
      });
      if (maxVal === 0) maxVal = 100;
      maxVal = Math.ceil(maxVal * 1.1);
      
      // Draw grid
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();
        
        // Y axis labels
        ctx.fillStyle = textMuted;
        ctx.font = '11px JetBrains Mono';
        ctx.textAlign = 'right';
        const val = (maxVal - (maxVal / 4) * i).toFixed(0);
        ctx.fillText(val + (options.unit || ''), padding.left - 8, y + 4);
      }
      
      // Draw lines
      datasets.forEach(ds => {
        if (ds.data.length < 2) return;
        
        ctx.strokeStyle = ds.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        // Dynamic step based on data length to ensure it fills width
        const points = ds.data.length > 1 ? ds.data.length : maxPoints;
        const step = chartWidth / (points - 1);

        ds.data.forEach((val, i) => {
          const x = padding.left + i * step;
          const y = padding.top + chartHeight - (val / maxVal) * chartHeight;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        
        // Fill gradient
        const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
        gradient.addColorStop(0, ds.color + '40');
        gradient.addColorStop(1, ds.color + '00');
        
        ctx.fillStyle = gradient;
        ctx.lineTo(padding.left + (ds.data.length - 1) * step, height - padding.bottom);
        ctx.lineTo(padding.left, height - padding.bottom);
        ctx.closePath();
        ctx.fill();
      });
      
      // Legend
      if (datasets.length > 1) {
        let legendX = padding.left;
        datasets.forEach(ds => {
          ctx.fillStyle = ds.color;
          ctx.fillRect(legendX, height - 15, 12, 3);
          ctx.fillStyle = textSecondary;
          ctx.font = '11px Inter';
          ctx.textAlign = 'left';
          ctx.fillText(ds.label, legendX + 16, height - 11);
          legendX += ctx.measureText(ds.label).width + 36;
        });
      }
    }

    // ==========================================
    // DATA FETCHING
    // ==========================================
    async function fetchCPU() {
      try {
        const res = await fetch('/api/chart/system.cpu?after=-60&points=60');
        const data = await res.json();
        if (data.data) {
          chartData.cpu = data.data.map(row => {
            const values = row.slice(1);
            return values.reduce((a, b) => a + b, 0);
          }).reverse();
          
          const latest = chartData.cpu[chartData.cpu.length - 1] || 0;
          document.getElementById('cpuStat').textContent = latest.toFixed(1);
        }
      }catch (e) {}
    }

    async function fetchMemory() {
      try {
        const res = await fetch('/api/chart/system.ram?after=-60&points=60');
        const data = await res.json();
        if (data.data) {
          // Netdata system.ram labels: [time, free, used, cached, buffers]
          // Use actual 'used' memory (index 1) / total
          chartData.mem = data.data.map(row => {
            const values = row.slice(1); // [free, used, cached, buffers]
            const total = values.reduce((a, b) => a + (b || 0), 0);
            const used = values[1] || 0; // Actual 'used' memory (not including cache/buffers)
            return total > 0 ? (used / total * 100) : 0;
          }).reverse();
          
          const latest = chartData.mem[chartData.mem.length - 1] || 0;
          document.getElementById('memStat').textContent = latest.toFixed(1);
        }
      }catch (e) {}
    }

    async function fetchNetwork() {
      try {
        const res = await fetch('/api/chart/system.net?after=-60&points=60');
        const data = await res.json();
        if (data.data) {
          chartData.net.in = data.data.map(row => Math.abs(row[1] || 0)).reverse();
          chartData.net.out = data.data.map(row => Math.abs(row[2] || 0)).reverse();
          
          const latestIn = chartData.net.in[chartData.net.in.length - 1] || 0;
          const latestOut = chartData.net.out[chartData.net.out.length - 1] || 0;
          document.getElementById('netInStat').textContent = formatBytes(latestIn * 1024);
          document.getElementById('netOutStat').textContent = formatBytes(latestOut * 1024);
        }
      }catch (e) {}
    }

    async function fetchDiskIO() {
      try {
        const res = await fetch('/api/chart/system.io?after=-60&points=60');
        const data = await res.json();
        if (data.data) {
          chartData.disk.read = data.data.map(row => Math.abs(row[1] || 0)).reverse();
          chartData.disk.write = data.data.map(row => Math.abs(row[2] || 0)).reverse();
          
          const latestRead = chartData.disk.read[chartData.disk.read.length - 1] || 0;
          const latestWrite = chartData.disk.write[chartData.disk.write.length - 1] || 0;
          document.getElementById('diskIOStat').textContent = formatBytes((latestRead + latestWrite) * 1024);
        }
      }catch (e) {}
    }

    async function fetchLoad() {
      try {
        const res = await fetch('/api/chart/system.load?after=-60&points=60');
        const data = await res.json();
        if (data.data) {
          chartData.load.load1 = data.data.map(row => row[1] || 0).reverse();
          chartData.load.load5 = data.data.map(row => row[2] || 0).reverse();
          chartData.load.load15 = data.data.map(row => row[3] || 0).reverse();
          
          const latest = chartData.load.load1[chartData.load.load1.length - 1] || 0;
          document.getElementById('loadStat').textContent = latest.toFixed(2);
        }
      }catch (e) {}
    }

    async function fetchAlerts() {
      const list = document.getElementById('alertsList');
      try {
        const res = await fetch('/api/alerts');
        if (!res.ok) throw new Error('API error: ' + res.status);
        
        const data = await res.json();
        // Brain consolidated format returns { active: [], history: [] }
        const alerts = data.active || [];
        
        document.getElementById('alertsCount').textContent = alerts.length;
        
        if (alerts.length === 0) {
          list.innerHTML = '<div class="alert-row" style="justify-content: center; color: var(--accent);">✓ All systems normal</div>';
        } else {
          list.innerHTML = alerts.map(a => \`
            <div class="alert-row">
              <div class="alert-severity \${a.severity === 'CRITICAL' ? 'critical' : 'warning'}"></div>
              <div class="alert-content">
                <div class="alert-name">\${a.metric_name}</div>
                <div class="alert-meta">\${a.category || ''} • \${a.severity} • \${new Date(a.triggered_at).toLocaleTimeString()}</div>
              </div>
              <button class="btn btn-sm" onclick="showTab('alerts')">Details</button>
            </div>
          \`).join('');
        }
      } catch (e) {
        console.error('Alerts fetch error:', e);
        list.innerHTML = '<div class="alert-row" style="justify-content: center; color: var(--error);">⚠ Failed to load alerts</div>';
        document.getElementById('alertsCount').textContent = '?';
      }
    }

    async function fetchInfo() {
      try {
        const res = await fetch('/api/info');
        const data = await res.json();
        
        document.getElementById('netdataStatus').textContent = 'Connected';
        
        // Get hostname and IP from host_labels
        const hostLabels = data.host_labels || {};
        document.getElementById('hostnameValue').textContent = hostLabels._hostname || data.hostname || '--';
        
        // Get IP address from Netdata host_labels
        const ipAddress = hostLabels._net_default_iface_ip || '--';
        document.getElementById('ipAddressValue').textContent = ipAddress;
        
        // Get uptime from peekaping availability API
        try {
          const availRes = await fetch('/api/metrics/availability');
          const availData = await availRes.json();
          const uptimePercent = availData.metrics?.uptime_percentage?.value;
          if (uptimePercent !== undefined) {
            document.getElementById('uptimeValue').textContent = uptimePercent.toFixed(1) + '%';
          } else {
            // Fallback to Netdata host uptime
            const uptime = data.host?.uptime || 0;
            const hours = Math.floor(uptime / 3600);
            const mins = Math.floor((uptime % 3600) / 60);
            document.getElementById('uptimeValue').textContent = \`\${hours}h \${mins}m\`;
          }
        } catch {
          // Fallback to Netdata host uptime
          const uptime = data.host?.uptime || 0;
          const hours = Math.floor(uptime / 3600);
          const mins = Math.floor((uptime % 3600) / 60);
          document.getElementById('uptimeValue').textContent = \`\${hours}h \${mins}m\`;
        }
      } catch (e) {
        document.getElementById('netdataStatus').textContent = 'Disconnected';
      }
    }



    async function fetchProcesses() {
      try {
        const res = await fetch('/api/chart/apps.cpu?after=-1&points=1');
        const data = await res.json();
        if (data.data && data.data[0]) {
          const labels = data.labels.slice(1);
          const values = data.data[0].slice(1);
          const processes = labels.map((name, i) => ({ name, cpu: values[i] || 0 }))
            .sort((a, b) => b.cpu - a.cpu)
            .slice(0, 8);
          
          const tbody = document.getElementById('processBody');
          tbody.innerHTML = processes.map(p => \`
            <tr>
              <td class="process-name">\${p.name}</td>
              <td>\${p.cpu.toFixed(1)}%</td>
              <td>
                <div class="process-bar">
                  <div class="process-bar-fill" style="width: \${Math.min(p.cpu, 100)}%; background: \${p.cpu > 50 ? 'var(--warning)' : 'var(--accent)'}"></div>
                </div>
              </td>
            </tr>
          \`).join('');
        }
      }catch (e) {}
    }

    // ==========================================
    // CHAT FUNCTIONALITY
    // ==========================================
    const mcpTools = [
      { cmd: '/cpu', desc: 'CPU usage breakdown', query: 'What is my CPU usage?' },
      { cmd: '/memory', desc: 'Memory/RAM usage', query: 'Show me memory usage' },
      { cmd: '/disk', desc: 'Disk space usage', query: 'Check disk space' },
      { cmd: '/diskio', desc: 'Disk I/O stats', query: 'Show disk I/O stats' },
      { cmd: '/network', desc: 'Network traffic', query: 'Show network traffic' },
      { cmd: '/alerts', desc: 'Active alerts', query: 'What alerts are active?' },
      { cmd: '/processes', desc: 'Top CPU processes', query: 'What processes are using the most CPU?' },
      { cmd: '/load', desc: 'System load', query: 'What is the system load?' },
      { cmd: '/system', desc: 'System info', query: 'Show system information' },
      { cmd: '/investigate', desc: 'Full investigation', query: 'Investigate the current system state thoroughly' },
      { cmd: '/diagnose', desc: 'Diagnose alerts', query: 'Check active alerts and diagnose them' },
    ];

    let selectedIdx = 0;
    let filtered = [];

    function toggleChat() {
      const panel = document.getElementById('chatPanel');
      panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
    }

    const chatInput = document.getElementById('chatInput');
    const slashMenu = document.getElementById('slashMenu');

    chatInput.addEventListener('input', () => {
      const val = chatInput.value;
      if (val.startsWith('/')) {
        const q = val.slice(1).toLowerCase();
        filtered = mcpTools.filter(t => t.cmd.includes(q) || t.desc.toLowerCase().includes(q));
        if (filtered.length > 0) {
          slashMenu.innerHTML = \`
            <div class="slash-header">MCP Commands</div>
            \${filtered.map((t, i) => \`
              <div class="slash-item \${i === selectedIdx ? 'selected' : ''}" data-i="\${i}">
                <span class="slash-cmd">\${t.cmd}</span>
                <span class="slash-desc">\${t.desc}</span>
              </div>
            \`).join('')}
          \`;
          slashMenu.classList.add('visible');
          slashMenu.querySelectorAll('.slash-item').forEach(el => {
            el.onclick = () => selectSlash(filtered[parseInt(el.dataset.i)]);
          });
        }else {
          slashMenu.classList.remove('visible');
        }
      }else {
        slashMenu.classList.remove('visible');
        selectedIdx = 0;
      }
    });

    chatInput.addEventListener('keydown', e => {
      if (slashMenu.classList.contains('visible')) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
          chatInput.dispatchEvent(new Event('input'));
        }else if (e.key === 'ArrowUp') {
          e.preventDefault();
          selectedIdx = Math.max(selectedIdx - 1, 0);
          chatInput.dispatchEvent(new Event('input'));
        }else if (e.key === 'Enter' || e.key === 'Tab') {
          if (filtered.length > 0) {
            e.preventDefault();
            selectSlash(filtered[selectedIdx]);
          }
        }else if (e.key === 'Escape') {
          slashMenu.classList.remove('visible');
        }
      }else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    function selectSlash(tool) {
      chatInput.value = tool.query;
      slashMenu.classList.remove('visible');
      selectedIdx = 0;
      chatInput.focus();
    }

    async function sendMessage() {
      const text = chatInput.value.trim();
      if (!text) return;
      
      chatInput.value = '';
      slashMenu.classList.remove('visible');
      
      addChatMessage(text, true);
      const typingId = addTyping();
      
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text })
        });
        const data = await res.json();
        removeTyping(typingId);
        
        let content = data.response || 'No response';
        if (data.tools_used?.length > 0) {
          content = '<div style="margin-bottom: 8px; font-size: 11px; color: var(--text-muted);">Tools: ' + data.tools_used.join(', ') + '</div>' + content;
        }
        addChatMessage(content, false);
      }catch (e) {
        removeTyping(typingId);
        addChatMessage('Error connecting to AI Brain', false);
      }
    }

    function addChatMessage(content, isUser) {
      const msgs = document.getElementById('chatMessages');
      const div = document.createElement('div');
      div.className = 'chat-message ' + (isUser ? 'user' : 'ai');
      div.innerHTML = \`<div class="chat-bubble">\${content.replace(/\\n/g, '<br>')}</div>\`;
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    function addTyping() {
      const id = 'typing-' + Date.now();
      const msgs = document.getElementById('chatMessages');
      const div = document.createElement('div');
      div.className = 'chat-message ai';
      div.id = id;
      div.innerHTML = '<div class="chat-bubble"><div class="typing-indicator"><span></span><span></span><span></span></div></div>';
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
      return id;
    }

    function removeTyping(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    function diagnoseAlert(name) {
      chatInput.value = 'Diagnose the ' + name + ' alert';
      document.getElementById('chatPanel').style.display = 'flex';
      sendMessage();
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    function formatBytes(bytes) {
      if (bytes < 1024) return bytes.toFixed(0) + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function refreshAll() {
      // Show loading states
      document.getElementById('alertsList').innerHTML = '<div class="alert-row" style="justify-content: center; color: var(--text-muted);">Refreshing...</div>';
      document.getElementById('processBody').innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Refreshing...</td></tr>';
      
      fetchCPU();
      fetchMemory();
      fetchNetwork();
      fetchDiskIO();
      fetchLoad();
      fetchAlerts();
      fetchProcesses();
      fetchInfo();
    }

    function refreshAlerts() {
      const list = document.getElementById('alertsList');
      list.innerHTML = '<div class="alert-row" style="justify-content: center; color: var(--text-muted);">Refreshing...</div>';
      fetchAlerts();
    }

    function refreshProcesses() {
      const tbody = document.getElementById('processBody');
      tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Refreshing...</td></tr>';
      fetchProcesses();
    }
    
    // ==========================================
    // HITL: PENDING ACTIONS
    // ==========================================
    async function refreshPendingActions() {
      try {
        const res = await fetch('/api/pending-actions');
        const data = await res.json();
        const actions = data.actions || [];
        
        document.getElementById('pendingCount').textContent = actions.length;
        const container = document.getElementById('pendingActionsList');
        
        if (actions.length === 0) {
          container.innerHTML = '<div class="alert-row" style="justify-content: center; color: var(--text-muted);">No pending actions - all clear! ✓</div>';
        }else {
          container.innerHTML = actions.map(a => \`
            <div style="padding: 16px; border-bottom: 1px solid var(--border);">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">
                <div>
                  <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">
                    \${a.action_type.replace('_', ' ').toUpperCase()}
                  </div>
                  <div style="font-size: 12px; color: var(--text-muted);">
                    Target: \${a.target}| Severity: <span style="color: \${a.severity === 'CRITICAL' ? 'var(--error)' : a.severity === 'HIGH' ? 'var(--warning)' : 'var(--accent)'};">\${a.severity}</span>
                  </div>
                </div>
                <div style="font-size: 11px; color: var(--text-muted);">
                  ID: \${String(a.id).slice(0, 8)}
                </div>
              </div>
              <div style="background: var(--bg-secondary); padding: 12px; border-radius: 8px; margin-bottom: 12px; font-size: 13px;">
                <div style="margin-bottom: 8px;"><strong>Description:</strong> \${a.description}</div>
                <div style="margin-bottom: 8px;"><strong>Impact:</strong> \${a.impact || 'Unknown'}</div>
                <div><strong>Rollback:</strong> \${a.rollback_plan || 'Manual intervention'}</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="approveAction('\${a.id}')" class="btn" style="background: var(--accent); flex: 1;">
                  ✓ Approve
                </button>
                <button onclick="rejectAction('\${a.id}')" class="btn btn-outline" style="color: var(--error); border-color: var(--error); flex: 1;">
                  ✕ Reject
                </button>
              </div>
            </div>
          \`).join('');
        }
      }catch (e) {
        console.error('Pending actions error:', e);
      }
    }
    
    async function approveAction(actionId) {
      try {
        const res = await fetch(\`/api/actions/\${actionId}/approve\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: actionId, decision: 'approve', approved_by: 'admin' })
        });
        const data = await res.json();
        
        // Show success notification
        addChatMessage('✅ Action approved: ' + data.message, false);
        document.getElementById('chatPanel').style.display = 'flex';
        
        // Refresh pending actions
        refreshPendingActions();
      }catch (e) {
        console.error('Approval error:', e);
      }
    }
    
    async function rejectAction(actionId) {
      try {
        const res = await fetch(\`/api/actions/\${actionId}/approve\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action_id: actionId, decision: 'reject', approved_by: 'admin' })
        });
        const data = await res.json();
        
        addChatMessage('❌ Action rejected: ' + data.message, false);
        document.getElementById('chatPanel').style.display = 'flex';
        refreshPendingActions();
      }catch (e) {
        console.error('Rejection error:', e);
      }
    }
    
    // WebSocket for real-time HITL updates
    function connectWebSocket() {
      try {
        const ws = new WebSocket('ws://localhost:8001/ws');
        ws.onopen = () => console.log('HITL WebSocket connected');
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'pending_action') {
            refreshPendingActions();
            // Flash notification
            document.getElementById('pendingCount').style.animation = 'pulse 0.5s 3';
          }else if (data.type === 'action_resolved') {
            refreshPendingActions();
          }
        };
        ws.onclose = () => setTimeout(connectWebSocket, 3001);
      }catch (e) {
        console.log('WebSocket not available');
      }
    }
    connectWebSocket();
    
    // Initial fetch
    refreshPendingActions();
    setInterval(refreshPendingActions, 5000);


    // ==========================================
    // MAIN LOOP
    // ==========================================
    async function updateCharts() {
      drawChart('cpuChart', [
        { label: 'CPU %', data: chartData.cpu, color: '#10a37f' }
      ], { unit: '%', maxY: 100 });
      
      drawChart('memChart', [
        { label: 'Memory %', data: chartData.mem, color: '#43a9ff' }
      ], { unit: '%', maxY: 100 });
      
      drawChart('netChart', [
        { label: 'In', data: chartData.net.in, color: '#10a37f' },
        { label: 'Out', data: chartData.net.out, color: '#f5a623' }
      ], { unit: ' KB/s' });
      
      drawChart('diskChart', [
        { label: 'Read', data: chartData.disk.read, color: '#a855f7' },
        { label: 'Write', data: chartData.disk.write, color: '#ff4d4f' }
      ], { unit: ' KB/s' });
      
      drawChart('loadChart', [
        { label: '1m', data: chartData.load.load1, color: '#10a37f' },
        { label: '5m', data: chartData.load.load5, color: '#43a9ff' },
        { label: '15m', data: chartData.load.load15, color: '#f5a623' }
      ]);
    }

    async function mainLoop() {
      await Promise.all([fetchCPU(), fetchMemory(), fetchNetwork(), fetchDiskIO(), fetchLoad()]);
      updateCharts();
    }

    // Initialize
    refreshAll();
    mainLoop();
    setInterval(mainLoop, 1000);
    setInterval(fetchAlerts, 5000);
    setInterval(fetchProcesses, 3001);
    
    // Initialize Lucide Icons
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }

    // ==========================================
    // VIEW SWITCHING
    // ==========================================
    let currentView = 'overview';
    
    function showTab(viewId) {
      // Hide all views (both .view-section and .view classes)
      document.querySelectorAll('.view-section, .view').forEach(el => el.style.display = 'none');
      
      // Show selected view
      const viewEl = document.getElementById('view-' + viewId);
      if (viewEl) viewEl.style.display = 'flex';
      
      // Update nav active state
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      if (event && event.target) {
        event.target.closest('.nav-item').classList.add('active');
      }
      
      currentView = viewId;
      
      // Load view-specific data
      if (viewId === 'cpu') loadCPUView();
      if (viewId === 'memory') loadMemoryView();
      if (viewId === 'disk') loadDiskView();
      if (viewId === 'network') loadNetworkView();
      if (viewId === 'alerts') loadAlerts();
      if (viewId === 'workflows') initWorkflowView();
      if (viewId === 'remediation') initRemediationView();
    }
    
    // ==========================================
    // WORKFLOW VIEW FUNCTIONS
    // ==========================================
    function initWorkflowView() {
      const iframe = document.getElementById('workflowFrame');
      const loading = document.getElementById('workflowLoading');
      
      // Check if iframe loaded successfully
      iframe.onload = function() {
        loading.style.display = 'none';
      };
      
      iframe.onerror = function() {
        loading.style.display = 'flex';
      };
      
      // Try to hide loading after a delay
      setTimeout(() => {
        try {
          if (iframe.contentWindow && iframe.contentDocument) {
            loading.style.display = 'none';
          }
        } catch(e) {
          // Cross-origin, assume it loaded
          loading.style.display = 'none';
        }
      }, 2000);
    }
    
    function retryWorkflowLoad() {
      const iframe = document.getElementById('workflowFrame');
      iframe.src = iframe.src;
    }
    
    function loadWorkflows() {
      alert('Workflows list coming soon! Create new workflows using the canvas.');
    }
    
    function loadTemplates() {
      alert('8 pre-built templates available! Check the API at /api/templates');
    }
    
    function openWorkflowFullscreen() {
      window.open('http://localhost:5174', '_blank');
    }

    // ==========================================
    // AUTO-REMEDIATION VIEW FUNCTIONS
    // ==========================================
    const WORKFLOW_ENGINE_URL = 'http://localhost:8001';
    let remediationData = { issues: [], templates: [], stats: {} };
    let autoRemediateEnabled = true;
    let remediationRefreshInterval = null;
    
    async function initRemediationView() {
      console.log('🔧 Initializing Auto-Remediation View...');
      await loadRemediationData();
      
      // Start auto-refresh every 10 seconds
      if (remediationRefreshInterval) clearInterval(remediationRefreshInterval);
      remediationRefreshInterval = setInterval(loadRemediationData, 10000);
    }
    
    async function loadRemediationData() {
      const refreshIcon = document.getElementById('refreshIcon');
      if (refreshIcon) refreshIcon.classList.add('spin');
      
      try {
        // Parallel API calls for speed
        const [issuesRes, templatesRes, statsRes, categoriesRes] = await Promise.all([
          fetch(WORKFLOW_ENGINE_URL + '/api/issues').then(r => r.json()).catch(() => ({ issues: [] })),
          fetch(WORKFLOW_ENGINE_URL + '/api/remediation/templates').then(r => r.json()).catch(() => ({ templates: [] })),
          fetch(WORKFLOW_ENGINE_URL + '/api/remediation/stats').then(r => r.json()).catch(() => ({})),
          fetch(WORKFLOW_ENGINE_URL + '/api/remediation/categories').then(r => r.json()).catch(() => ({ categories: [] }))
        ]);
        
        remediationData.issues = issuesRes.issues || [];
        remediationData.templates = templatesRes.templates || [];
        remediationData.stats = statsRes;
        remediationData.categories = categoriesRes.categories || [];
        
        renderRemediationStats();
        renderIssuesList();
        renderCategoryPills();
        renderTemplatesGallery();
        
        console.log('✅ Remediation data loaded:', {
          issues: remediationData.issues.length,
          templates: remediationData.templates.length
        });
      } catch (error) {
        console.error('❌ Failed to load remediation data:', error);
      } finally {
        if (refreshIcon) refreshIcon.classList.remove('spin');
      }
    }
    
    function renderRemediationStats() {
      // Count issues by severity
      const critical = remediationData.issues.filter(i => i.severity === 'P0_CRITICAL').length;
      const high = remediationData.issues.filter(i => i.severity === 'P1_HIGH').length;
      const medium = remediationData.issues.filter(i => i.severity === 'P2_MEDIUM').length;
      const remediated = remediationData.issues.filter(i => i.status === 'RESOLVED').length;
      
      // Animate counters
      animateCounter('statCritical', critical);
      animateCounter('statHigh', high);
      animateCounter('statMedium', medium);
      animateCounter('statRemediated', remediated);
      
      // Update issue count badge
      const issueCount = document.getElementById('issueCount');
      if (issueCount) {
        issueCount.textContent = remediationData.issues.length;
        issueCount.style.background = remediationData.issues.length > 0 ? '#ef4444' : '#10b981';
      }
    }
    
    function animateCounter(elementId, target) {
      const el = document.getElementById(elementId);
      if (!el) return;
      
      const current = parseInt(el.textContent) || 0;
      if (current === target) return;
      
      const diff = target - current;
      const step = Math.max(1, Math.abs(diff) / 10);
      
      let value = current;
      const interval = setInterval(() => {
        if (diff > 0) {
          value = Math.min(target, value + step);
        } else {
          value = Math.max(target, value - step);
        }
        el.textContent = Math.round(value);
        if (value === target) clearInterval(interval);
      }, 50);
    }
    
    function renderIssuesList() {
      const container = document.getElementById('issuesList');
      if (!container) return;
      
      const activeIssues = remediationData.issues.filter(i => i.status !== 'RESOLVED');
      
      if (activeIssues.length === 0) {
        container.innerHTML = \`
          <div class="empty-state">
            <div class="empty-icon">✅</div>
            <div class="empty-title">All Systems Healthy</div>
            <div class="empty-subtitle">No active issues detected</div>
          </div>
        \`;
        return;
      }
      
      container.innerHTML = activeIssues.map(issue => \`
        <div class="issue-card" onclick="showIssueDetails('\${issue.id}')">
          <div class="issue-icon \${getSeverityClass(issue.severity)}">
            \${getIssueIcon(issue.pattern_name)}
          </div>
          <div class="issue-info">
            <div class="issue-name">\${issue.pattern_name}</div>
            <div class="issue-meta">
              <span class="issue-severity \${issue.severity.split('_')[0]}">\${issue.severity.replace('_', ' ')}</span>
              <span style="display: flex; align-items: center; gap: 4px;"><i data-lucide="server" class="lucide-sm"></i> \${issue.host}</span>
              <span style="display: flex; align-items: center; gap: 4px;"><i data-lucide="clock" class="lucide-sm"></i> \${formatTimeAgo(issue.detected_at)}</span>
            </div>
          </div>
          <div class="issue-actions">
            <button class="btn-remediate" onclick="event.stopPropagation(); remediateIssue('\${issue.id}')" style="display: flex; align-items: center; gap: 6px;">
              <i data-lucide="wrench" class="lucide-sm"></i>
              <span>Fix Now</span>
            </button>
            <button class="btn-details" onclick="event.stopPropagation(); showIssueDetails('\${issue.id}')">
              <i data-lucide="file-text" class="lucide-sm"></i>
            </button>
          </div>
        </div>
      \`).join('');
      // Re-initialize Lucide icons for dynamic content
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    function getSeverityClass(severity) {
      if (severity.includes('CRITICAL')) return 'critical';
      if (severity.includes('HIGH')) return 'high';
      return 'medium';
    }
    
    function getIssueIcon(name) {
      const icons = {
        'Memory': '<i data-lucide="memory-stick" style="width: 24px; height: 24px;"></i>',
        'CPU': '<i data-lucide="cpu" style="width: 24px; height: 24px;"></i>',
        'Disk': '<i data-lucide="hard-drive" style="width: 24px; height: 24px;"></i>',
        'Network': '<i data-lucide="globe" style="width: 24px; height: 24px;"></i>',
        'Database': '<i data-lucide="database" style="width: 24px; height: 24px;"></i>',
        'DDoS': '<i data-lucide="shield-alert" style="width: 24px; height: 24px;"></i>',
        'DNS': '<i data-lucide="plug" style="width: 24px; height: 24px;"></i>',
        'Load Balancer': '<i data-lucide="scale" style="width: 24px; height: 24px;"></i>',
        'Security': '<i data-lucide="lock" style="width: 24px; height: 24px;"></i>',
        'SSL': '<i data-lucide="key" style="width: 24px; height: 24px;"></i>',
        'HTTP': '<i data-lucide="trending-up" style="width: 24px; height: 24px;"></i>',
        'Queue': '<i data-lucide="inbox" style="width: 24px; height: 24px;"></i>',
        'Cron': '<i data-lucide="clock" style="width: 24px; height: 24px;"></i>',
        'Pod': '<i data-lucide="box" style="width: 24px; height: 24px;"></i>',
        'Kubernetes': '<i data-lucide="network" style="width: 24px; height: 24px;"></i>',
        'Docker': '<i data-lucide="container" style="width: 24px; height: 24px;"></i>',
        'Cost': '<i data-lucide="dollar-sign" style="width: 24px; height: 24px;"></i>'
      };
      
      for (const [key, icon] of Object.entries(icons)) {
        if (name.toLowerCase().includes(key.toLowerCase())) return icon;
      }
      return '<i data-lucide="alert-circle" style="width: 24px; height: 24px;"></i>';
    }
    
    function formatTimeAgo(timestamp) {
      if (!timestamp) return 'Just now';
      const now = new Date();
      const past = new Date(timestamp);
      const seconds = Math.floor((now - past) / 1000);
      
      if (seconds < 60) return 'Just now';
      if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
      if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
      return Math.floor(seconds / 86400) + 'd ago';
    }
    
    function renderCategoryPills() {
      const container = document.getElementById('categoryPills');
      if (!container || !remediationData.categories) return;
      
      const icons = {
        'compute': '<i data-lucide="cpu" class="lucide-sm"></i>',
        'storage': '<i data-lucide="hard-drive" class="lucide-sm"></i>',
        'network': '<i data-lucide="globe" class="lucide-sm"></i>',
        'application': '<i data-lucide="app-window" class="lucide-sm"></i>',
        'security': '<i data-lucide="shield" class="lucide-sm"></i>',
        'container': '<i data-lucide="container" class="lucide-sm"></i>',
        'compliance': '<i data-lucide="clipboard-check" class="lucide-sm"></i>',
        'business': '<i data-lucide="wallet" class="lucide-sm"></i>'
      };
      
      let html = \`
        <div class="category-pill active" onclick="filterTemplates('all')">
          <i data-lucide="layers" class="lucide-sm"></i>
          <span>All</span>
          <span class="category-count">\${remediationData.templates.length}</span>
        </div>
      \`;
      
      remediationData.categories.forEach(cat => {
        html += \`
          <div class="category-pill" onclick="filterTemplates('\${cat.name}')">
            \${icons[cat.name] || '<i data-lucide="package" class="lucide-sm"></i>'}
            <span>\${cat.name}</span>
            <span class="category-count">\${cat.template_count}</span>
          </div>
        \`;
      });
      
      container.innerHTML = html;
      // Re-initialize Lucide icons for dynamic content
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    let currentTemplateFilter = 'all';
    
    function filterTemplates(category) {
      currentTemplateFilter = category;
      
      // Update active pill
      document.querySelectorAll('.category-pill').forEach(pill => {
        pill.classList.remove('active');
        if (pill.textContent.toLowerCase().includes(category.toLowerCase()) || 
            (category === 'all' && pill.textContent.includes('All'))) {
          pill.classList.add('active');
        }
      });
      
      renderTemplatesGallery();
    }
    
    function renderTemplatesGallery() {
      const container = document.getElementById('templatesGallery');
      if (!container) return;
      
      let templates = remediationData.templates;
      if (currentTemplateFilter !== 'all') {
        templates = templates.filter(t => t.category === currentTemplateFilter);
      }
      
      if (templates.length === 0) {
        container.innerHTML = \`
          <div class="empty-state" style="grid-column: 1 / -1;">
            <div class="empty-icon"><i data-lucide="package" style="width: 48px; height: 48px; opacity: 0.3;"></i></div>
            <div class="empty-title">No Templates</div>
            <div class="empty-subtitle">No templates in this category</div>
          </div>
        \`;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
      }
      
      // Map template icons to Lucide icons
      const templateIconMap = {
        'compute': 'cpu',
        'storage': 'hard-drive',
        'network': 'globe',
        'application': 'app-window',
        'security': 'shield',
        'container': 'box',
        'compliance': 'clipboard-check',
        'business': 'wallet'
      };
      
      container.innerHTML = templates.slice(0, 12).map(template => \`
        <div class="template-card" onclick="showTemplateDetails('\${template.id}')">
          <div class="template-header">
            <div class="template-icon"><i data-lucide="\${templateIconMap[template.category] || 'wrench'}" style="width: 20px; height: 20px;"></i></div>
            <div>
              <div class="template-title">\${template.name}</div>
              <div class="template-category">\${template.category}</div>
            </div>
          </div>
          <div class="template-stats">
            <div class="template-stat">
              <i data-lucide="bar-chart-2" class="lucide-sm"></i>
              <span class="success">\${template.success_rate}%</span>
            </div>
            <div class="template-stat">
              <i data-lucide="timer" class="lucide-sm"></i>
              <span>\${template.estimated_fix_time}</span>
            </div>
            <div class="template-stat">
              <i data-lucide="list" class="lucide-sm"></i>
              <span>\${template.step_count} steps</span>
            </div>
          </div>
        </div>
      \`).join('');
      // Re-initialize Lucide icons for dynamic content
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    async function runDetectionCycle() {
      const btn = event.target.closest('button');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<i data-lucide="loader" class="lucide-sm spin"></i><span>Detecting...</span>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
      btn.disabled = true;
      
      try {
        const response = await fetch(WORKFLOW_ENGINE_URL + '/api/issues/detect', {
          method: 'POST'
        });
        const data = await response.json();
        
        console.log('🔍 Detection cycle complete:', data);
        
        // Refresh the data
        await loadRemediationData();
        
        // Show notification
        showToast(\`Detection complete: \${data.issues_found || 0} issues found\`, 'success');
      } catch (error) {
        console.error('Detection failed:', error);
        showToast('Detection failed. Is the workflow engine running?', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
    
    async function remediateIssue(issueId) {
      const btn = event.target.closest('button');
      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spin">⚙️</span>';
      btn.disabled = true;
      
      try {
        // First get the remediation info
        const infoRes = await fetch(WORKFLOW_ENGINE_URL + '/api/issues/' + issueId + '/remediation');
        const info = await infoRes.json();
        
        if (!info.has_remediation) {
          showToast('No remediation template available for this issue', 'warning');
          return;
        }
        
        // Confirm with user
        const confirmed = confirm(
          \`🔧 Auto-Remediation\\n\\n\` +
          \`Issue: \${info.issue_name}\\n\` +
          \`Template: \${info.template.name}\\n\` +
          \`Steps: \${info.template.step_count}\\n\` +
          \`Estimated Time: \${info.estimated_fix_time}\\n\` +
          \`Success Rate: \${info.success_rate}%\\n\\n\` +
          \`Proceed with auto-remediation?\`
        );
        
        if (!confirmed) {
          btn.innerHTML = originalText;
          btn.disabled = false;
          return;
        }
        
        // Execute remediation
        const response = await fetch(WORKFLOW_ENGINE_URL + '/api/issues/' + issueId + '/auto-remediate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        
        if (result.success) {
          showToast(\`✅ Remediation started: \${result.template_name}\`, 'success');
          
          // Add to execution monitor
          addExecutionItem({
            name: result.template_name,
            status: 'running',
            steps: result.steps_count,
            time: result.estimated_time
          });
          
          // Refresh data
          await loadRemediationData();
        } else {
          showToast('Remediation failed: ' + (result.detail || 'Unknown error'), 'error');
        }
      } catch (error) {
        console.error('Remediation failed:', error);
        showToast('Remediation failed. Check console for details.', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
    
    function addExecutionItem(execution) {
      const container = document.getElementById('executionMonitor');
      if (!container) return;
      
      // Remove empty state if present
      const emptyState = container.querySelector('.empty-state');
      if (emptyState) emptyState.remove();
      
      const item = document.createElement('div');
      item.className = 'execution-item ' + execution.status;
      item.innerHTML = \`
        <div class="execution-status \${execution.status}">
          \${execution.status === 'running' ? '⚙️' : execution.status === 'completed' ? '✅' : '❌'}
        </div>
        <div class="execution-info">
          <div class="execution-name">\${execution.name}</div>
          <div class="execution-time">\${execution.steps} steps • \${execution.time}</div>
        </div>
        <div class="execution-progress">
          <div class="progress-bar">
            <div class="progress-fill \${execution.status}" style="width: \${execution.status === 'running' ? '60%' : '100%'}"></div>
          </div>
        </div>
      \`;
      
      container.insertBefore(item, container.firstChild);
      
      // Simulate completion after some time
      if (execution.status === 'running') {
        setTimeout(() => {
          item.className = 'execution-item completed';
          item.querySelector('.execution-status').className = 'execution-status completed';
          item.querySelector('.execution-status').textContent = '✅';
          item.querySelector('.progress-fill').className = 'progress-fill completed';
          item.querySelector('.progress-fill').style.width = '100%';
        }, 5000);
      }
    }
    
    function showIssueDetails(issueId) {
      fetch(WORKFLOW_ENGINE_URL + '/api/issues/' + issueId + '/remediation')
        .then(r => r.json())
        .then(data => {
          alert(
            \`📋 Issue Details\\n\\n\` +
            \`Issue: \${data.issue_name}\\n\` +
            \`Severity: \${data.issue_severity}\\n\` +
            \`Has Remediation: \${data.has_remediation ? 'Yes' : 'No'}\\n\` +
            (data.has_remediation ? 
              \`\\nTemplate: \${data.template.name}\\n\` +
              \`Steps: \${data.template.step_count}\\n\` +
              \`Success Rate: \${data.success_rate}%\\n\` +
              \`Auto-Execute: \${data.auto_execute ? 'Yes' : 'No'}\` 
              : '')
          );
        })
        .catch(err => {
          showToast('Failed to load issue details', 'error');
        });
    }
    
    function showTemplateDetails(templateId) {
      fetch(WORKFLOW_ENGINE_URL + '/api/remediation/templates/' + templateId)
        .then(r => r.json())
        .then(template => {
          const steps = template.steps.map((s, i) => \`\${i+1}. \${s.name}\`).join('\\n');
          alert(
            \`📚 Template Details\\n\\n\` +
            \`Name: \${template.name}\\n\` +
            \`Category: \${template.category}\\n\` +
            \`Severity: \${template.severity}\\n\` +
            \`Success Rate: \${template.success_rate}%\\n\` +
            \`Estimated Time: \${template.estimated_fix_time}\\n\` +
            \`Auto-Execute: \${template.auto_execute ? 'Yes' : 'Requires Approval'}\\n\\n\` +
            \`Steps:\\n\${steps}\`
          );
        })
        .catch(err => {
          showToast('Failed to load template details', 'error');
        });
    }
    
    function showAllTemplates() {
      window.open(WORKFLOW_ENGINE_URL + '/docs#/default/list_remediation_templates_api_remediation_templates_get', '_blank');
    }
    
    function toggleAutoRemediate() {
      autoRemediateEnabled = !autoRemediateEnabled;
      const status = document.getElementById('autoRemediateStatus');
      if (status) {
        status.textContent = autoRemediateEnabled ? '🟢 Auto-Remediate ON' : '🔴 Auto-Remediate OFF';
      }
      showToast(\`Auto-remediation \${autoRemediateEnabled ? 'enabled' : 'disabled'}\`, 'info');
    }
    
    function showToast(message, type = 'info') {
      // Create toast element
      const toast = document.createElement('div');
      toast.style.cssText = \`
        position: fixed;
        bottom: 24px;
        right: 24px;
        padding: 16px 24px;
        background: \${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f97316' : '#3b82f6'};
        color: white;
        border-radius: 10px;
        font-weight: 500;
        z-index: 10000;
        animation: slideIn 0.3s ease;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      \`;
      toast.textContent = message;
      document.body.appendChild(toast);
      
      setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }

    // ==========================================
    // CPU VIEW DATA LOADING
    // ==========================================
    let cpuViewData = { cpu: [] };
    let cpuCoresList = [];
    
    async function loadCPUView() {
      // Load aggregate CPU data
      try {
        const cpuRes = await fetch('/api/chart/system.cpu?after=-60&points=60');
        const cpuData = await cpuRes.json();
        if (cpuData.data) {
          cpuViewData.cpu = cpuData.data.map(row => {
            const values = row.slice(1);
            return values.reduce((a, b) => a + b, 0);
          }).reverse();
          
          const latest = cpuViewData.cpu[cpuViewData.cpu.length - 1] || 0;
          document.getElementById('cpuViewTotal').textContent = latest.toFixed(1);
          
          // Draw CPU chart
          drawChart('cpuViewChart', [
            { label: 'CPU %', data: cpuViewData.cpu, color: '#10a37f' }
          ], { unit: '%', maxY: 100 });
        }
      }catch (e) { console.error('CPU view fetch error:', e); }
      
      // Load system load (stats + chart)
      try {
        const loadRes = await fetch('/api/chart/system.load?after=-60&points=60');
        const loadData = await loadRes.json();
        if (loadData.data && loadData.data.length > 0) {
          // Update stats from latest value
          const latest = loadData.data[0];
          document.getElementById('cpuViewLoad1').textContent = (latest[1] || 0).toFixed(2);
          document.getElementById('cpuViewLoad5').textContent = (latest[2] || 0).toFixed(2);
          document.getElementById('cpuViewLoad15').textContent = (latest[3] || 0).toFixed(2);
          
          // Draw load chart
          const load1 = loadData.data.map(row => row[1] || 0).reverse();
          const load5 = loadData.data.map(row => row[2] || 0).reverse();
          const load15 = loadData.data.map(row => row[3] || 0).reverse();
          
          drawChart('cpuLoadChart', [
            { label: '1m', data: load1, color: '#10a37f' },
            { label: '5m', data: load5, color: '#43a9ff' },
            { label: '15m', data: load15, color: '#f5a623' }
          ]);
        }
      }catch (e) {}
      
      // Load per-core data
      await loadCPUCores();
      
      // Load processes
      await loadCPUProcesses();
    }
    
    async function loadCPUCores() {
      const container = document.getElementById('cpu-cores-container');
      if (!container) return;
      
      try {
        // Use system.cpu breakdown as CPU components
        const cpuRes = await fetch('/api/chart/system.cpu?after=-1&points=1');
        const cpuData = await cpuRes.json();
        
        if (!cpuData.labels || !cpuData.data || !cpuData.data[0]) {
          container.innerHTML = '<div style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No CPU component data</div>';
          return;
        }
        
        const labels = cpuData.labels.slice(1); // Skip 'time'
        const values = cpuData.data[0].slice(1);
        
        container.innerHTML = '';
        
        for (var i = 0; i < labels.length; i++) {
          var label = labels[i];
          var value = values[i] || 0;
          
          if (value < 0.01) continue; // Skip zero values
          
          var card = document.createElement('div');
          card.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;';
          card.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px; text-transform: capitalize;">' + label + '</div><div style="font-size: 20px; font-weight: 600; color: var(--text-primary);">' + value.toFixed(1) + '%</div>';
          container.appendChild(card);
        }
        
        if (container.children.length === 0) {
          container.innerHTML = '<div style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">CPU idle</div>';
        }
      }catch (e) {
        container.innerHTML = '<div style="color: var(--error); text-align: center; grid-column: 1/-1;">Error loading CPU data</div>';
      }
    }
    
    async function loadCPUProcesses() {
      const tbody = document.getElementById('cpuViewProcessBody');
      if (!tbody) return;
      
      try {
        // Use ps-based API endpoint for actual process data
        const res = await fetch('/api/processes');
        const data = await res.json();
        
        if (data.processes && data.processes.length > 0) {
          tbody.innerHTML = data.processes.map(function(p) {
            var barWidth = Math.min(p.cpu, 100);
            var barColor = p.cpu > 50 ? 'var(--warning)' : 'var(--accent)';
            var cmdDisplay = p.command.length > 30 ? p.command.substring(0, 30) + '...' : p.command;
            return '<tr><td style="font-family: JetBrains Mono, monospace; color: var(--accent);">' + p.pid + '</td><td class="process-name">' + cmdDisplay + '</td><td>' + p.cpu.toFixed(1) + '%</td><td><div class="process-bar"><div class="process-bar-fill" style="width: ' + barWidth + '%; background: ' + barColor + '"></div></div></td></tr>';
          }).join('');
        }else {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No process data</td></tr>';
        }
      }catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--error);">Error loading processes</td></tr>';
      }
    }
    
    // Auto-refresh CPU view if active
    setInterval(() => {
      if (currentView === 'cpu') loadCPUView();
    }, 2000);

    // ==========================================
    // MEMORY VIEW DATA LOADING
    // ==========================================
    let memViewData = { used: [], swap: [] };
    
    async function loadMemoryView() {
      // Load memory stats and chart
      try {
        const memRes = await fetch('/api/chart/system.ram?after=-60&points=60');
        const memData = await memRes.json();
        if (memData.data && memData.labels) {
          // Calculate used memory percentage over time
          const labels = memData.labels.slice(1);
          const usedData = [];
          let totalMem = 0;
          let usedMem = 0;
          let freeMem = 0;
          let cachedMem = 0;
          let buffersMem = 0;
          
          memData.data.forEach(row => {
            const values = row.slice(1);
            const total = values.reduce((a, b) => a + Math.abs(b || 0), 0);
            // Find used memory (index varies, typically position 1 or look for 'used' label)
            const usedIdx = labels.findIndex(l => l.toLowerCase() === 'used');
            const freeIdx = labels.findIndex(l => l.toLowerCase() === 'free');
            const cachedIdx = labels.findIndex(l => l.toLowerCase() === 'cached');
            const buffersIdx = labels.findIndex(l => l.toLowerCase() === 'buffers');
            
            const used = Math.abs(values[usedIdx] || 0);
            const pct = total > 0 ? (used / total * 100) : 0;
            usedData.push(pct);
            
            // Store latest values for stats
            totalMem = total;
            usedMem = used;
            freeMem = Math.abs(values[freeIdx] || 0);
            cachedMem = Math.abs(values[cachedIdx] || 0);
            buffersMem = Math.abs(values[buffersIdx] || 0);
          });
          
          memViewData.used = usedData.reverse();
          
          // Update stats
          const latestPct = memViewData.used[memViewData.used.length - 1] || 0;
          document.getElementById('memViewUsed').textContent = latestPct.toFixed(1);
          document.getElementById('memViewTotal').textContent = formatBytes(totalMem * 1024 * 1024);
          
          // Draw memory chart
          drawChart('memViewChart', [
            { label: 'Used %', data: memViewData.used, color: '#43a9ff' }
          ], { unit: '%', maxY: 100 });
          
          // Update breakdown
          updateMemoryBreakdown(labels, memData.data[0] ? memData.data[0].slice(1) : []);
        }
      } catch (e) { console.error('Memory view fetch error:', e); }
      
      // Load swap stats
      try {
        const swapRes = await fetch('/api/chart/mem.swap?after=-60&points=60');
        const swapData = await swapRes.json();
        if (swapData.data && swapData.labels) {
          const labels = swapData.labels.slice(1);
          const usedData = [];
          let totalSwap = 0;
          let usedSwap = 0;
          
          swapData.data.forEach(row => {
            const values = row.slice(1);
            const total = values.reduce((a, b) => a + Math.abs(b || 0), 0);
            const usedIdx = labels.findIndex(l => l.toLowerCase() === 'used');
            // Use proper null check - 0 is a valid value, not falsy here
            const used = usedIdx >= 0 && values[usedIdx] !== undefined ? Math.abs(values[usedIdx]) : 0;
            const pct = total > 0 ? (used / total * 100) : 0;
            usedData.push(pct);
            totalSwap = total;
            usedSwap = used;
          });
          
          memViewData.swap = usedData.reverse();
          
          // Update stats
          const latestSwapPct = memViewData.swap[memViewData.swap.length - 1] || 0;
          document.getElementById('memViewSwapUsed').textContent = latestSwapPct.toFixed(1);
          document.getElementById('memViewSwapTotal').textContent = formatBytes(totalSwap * 1024 * 1024);
          
          // Draw swap chart
          drawChart('swapViewChart', [
            { label: 'Swap %', data: memViewData.swap, color: '#f5a623' }
          ], { unit: '%', maxY: 100 });
        }
      } catch (e) { console.error('Swap view fetch error:', e); }
      
      // Load top processes by memory
      await loadMemoryProcesses();
    }
    
    function formatBytes(bytes) {
      if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GB';
      if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    
    function updateMemoryBreakdown(labels, values) {
      const container = document.getElementById('memory-breakdown-container');
      if (!container) return;
      
      const colors = {
        'used': '#ef4444',
        'free': '#10a37f',
        'cached': '#43a9ff',
        'buffers': '#a855f7',
        'available': '#22c55e'
      };
      
      container.innerHTML = '';
      
      for (var i = 0; i < labels.length; i++) {
        var label = labels[i];
        var value = Math.abs(values[i] || 0);
        
        if (value < 1) continue; // Skip very small values
        
        var color = colors[label.toLowerCase()] || '#666';
        var card = document.createElement('div');
        card.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;';
        card.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px; text-transform: capitalize;">' + label + '</div><div style="font-size: 18px; font-weight: 600; color: ' + color + ';">' + formatBytes(value * 1024 * 1024) + '</div>';
        container.appendChild(card);
      }
      
      if (container.children.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No memory data</div>';
      }
    }
    
    async function loadMemoryProcesses() {
      const tbody = document.getElementById('memViewProcessBody');
      if (!tbody) return;
      
      try {
        const res = await fetch('/api/processes?sort=memory');
        const data = await res.json();
        
        if (data.processes && data.processes.length > 0) {
          // Sort by memory and take top 10
          const sorted = data.processes.sort((a, b) => (b.memory || 0) - (a.memory || 0)).slice(0, 10);
          tbody.innerHTML = sorted.map(function(p) {
            var memPct = p.memory || 0;
            var barWidth = Math.min(memPct, 100);
            var barColor = memPct > 50 ? 'var(--warning)' : '#43a9ff';
            var cmdDisplay = p.command.length > 30 ? p.command.substring(0, 30) + '...' : p.command;
            return '<tr><td style="font-family: JetBrains Mono, monospace; color: var(--accent);">' + p.pid + '</td><td class="process-name">' + cmdDisplay + '</td><td>' + memPct.toFixed(1) + '%</td><td><div class="process-bar"><div class="process-bar-fill" style="width: ' + barWidth + '%; background: ' + barColor + '"></div></div></td></tr>';
          }).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No process data</td></tr>';
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--error);">Error loading processes</td></tr>';
      }
    }
    
    // Auto-refresh Memory view if active
    setInterval(() => {
      if (currentView === 'memory') loadMemoryView();
    }, 2000);

    // ==========================================
    // DISK VIEW DATA LOADING
    // ==========================================
    let diskViewData = { reads: [], writes: [], space: [] };
    
    async function loadDiskView() {
      // Load disk space stats
      try {
        const spaceRes = await fetch('/api/chart/disk_space.%2F?after=-60&points=60');
        const spaceData = await spaceRes.json();
        if (spaceData.data && spaceData.labels) {
          const labels = spaceData.labels.slice(1); // ['avail', 'used', 'reserved for root']
          const latest = spaceData.data[0]?.slice(1) || [];
          
          const availIdx = labels.findIndex(l => l.toLowerCase().includes('avail'));
          const usedIdx = labels.findIndex(l => l.toLowerCase() === 'used');
          const reservedIdx = labels.findIndex(l => l.toLowerCase().includes('reserved'));
          
          const avail = availIdx >= 0 ? Math.abs(latest[availIdx]) : 0;
          const used = usedIdx >= 0 ? Math.abs(latest[usedIdx]) : 0;
          const reserved = reservedIdx >= 0 ? Math.abs(latest[reservedIdx]) : 0;
          const total = avail + used + reserved;
          const pct = total > 0 ? (used / total * 100) : 0;
          
          // Update stats
          document.getElementById('diskViewTotal').textContent = formatBytes(total * 1024 * 1024 * 1024);
          document.getElementById('diskViewUsed').textContent = formatBytes(used * 1024 * 1024 * 1024);
          document.getElementById('diskViewAvail').textContent = formatBytes(avail * 1024 * 1024 * 1024);
          document.getElementById('diskViewPercent').textContent = pct.toFixed(1);
          
          // Update breakdown
          updateDiskBreakdown(labels, latest);
          
          // Draw space usage chart over time
          const usedHistory = spaceData.data.map(row => {
            const vals = row.slice(1);
            const u = usedIdx >= 0 ? Math.abs(vals[usedIdx]) : 0;
            return u;
          }).reverse();
          
          diskViewData.space = usedHistory;
          drawChart('diskSpaceChart', [
            { label: 'Used (GB)', data: usedHistory, color: '#ef4444' }
          ], { unit: ' GB' });
        }
      } catch (e) { console.error('Disk space fetch error:', e); }
      
      // Load disk I/O stats
      try {
        const ioRes = await fetch('/api/chart/system.io?after=-60&points=60');
        const ioData = await ioRes.json();
        if (ioData.data && ioData.labels) {
          const labels = ioData.labels.slice(1);
          const readsIdx = labels.findIndex(l => l.toLowerCase().includes('read'));
          const writesIdx = labels.findIndex(l => l.toLowerCase().includes('write'));
          
          const reads = ioData.data.map(row => {
            const val = row.slice(1)[readsIdx] || 0;
            return Math.abs(val);
          }).reverse();
          
          const writes = ioData.data.map(row => {
            const val = row.slice(1)[writesIdx] || 0;
            return Math.abs(val);
          }).reverse();
          
          diskViewData.reads = reads;
          diskViewData.writes = writes;
          
          drawChart('diskIOChart', [
            { label: 'Reads', data: reads, color: '#10a37f' },
            { label: 'Writes', data: writes, color: '#f5a623' }
          ], { unit: ' KB/s' });
        }
      } catch (e) { console.error('Disk IO fetch error:', e); }
      
      // Load top directories
      await loadDiskDirectories();
    }
    
    function updateDiskBreakdown(labels, values) {
      const container = document.getElementById('disk-breakdown-container');
      if (!container) return;
      
      const colors = {
        'avail': '#10a37f',
        'used': '#ef4444',
        'reserved for root': '#f5a623',
        'reserved': '#f5a623'
      };
      
      container.innerHTML = '';
      
      for (var i = 0; i < labels.length; i++) {
        var label = labels[i];
        var value = Math.abs(values[i] || 0);
        
        if (value < 0.01) continue;
        
        var colorKey = label.toLowerCase();
        var color = colors[colorKey] || '#666';
        for (var key in colors) {
          if (colorKey.includes(key)) { color = colors[key]; break; }
        }
        
        var card = document.createElement('div');
        card.style.cssText = 'background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px; text-align: center;';
        card.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px; text-transform: capitalize;">' + label + '</div><div style="font-size: 18px; font-weight: 600; color: ' + color + ';">' + formatBytes(value * 1024 * 1024 * 1024) + '</div>';
        container.appendChild(card);
      }
      
      if (container.children.length === 0) {
        container.innerHTML = '<div style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No disk data</div>';
      }
    }
    
    async function loadDiskDirectories() {
      const tbody = document.getElementById('diskViewDirBody');
      if (!tbody) return;
      
      try {
        const res = await fetch('/api/disk-usage');
        const data = await res.json();
        
        if (data.directories && data.directories.length > 0) {
          tbody.innerHTML = data.directories.map(function(d, idx) {
            var barWidth = parseFloat(d.percent) || 0;
            var barColor = barWidth > 80 ? 'var(--error)' : barWidth > 50 ? 'var(--warning)' : 'var(--accent)';
            var pathDisplay = d.path.length > 40 ? '...' + d.path.substring(d.path.length - 37) : d.path;
            return '<tr><td style="font-family: JetBrains Mono, monospace; color: var(--text-muted);">' + (idx + 1) + '</td><td class="process-name" title="' + d.path + '">' + pathDisplay + '</td><td style="font-family: JetBrains Mono, monospace;">' + d.size + '</td><td><div class="process-bar"><div class="process-bar-fill" style="width: ' + barWidth + '%; background: ' + barColor + '"></div></div></td></tr>';
          }).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No directory data</td></tr>';
        }
      } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--error);">Error loading directories</td></tr>';
      }
    }
    
    // Auto-refresh Disk view if active
    setInterval(() => {
      if (currentView === 'disk') loadDiskView();
    }, 5000); // Disk is slower to update

    // ==========================================
    // NETWORK VIEW DATA LOADING
    // ==========================================
    let networkPacketsHistory = [];
    
    async function loadNetworkView() {
      // Load network stats
      await loadNetworkStats();
      // Load packets
      await loadNetworkPackets();
      // Draw network traffic chart (reuse existing data)
      drawChart('networkViewChart', [
        { label: 'In', data: chartData.net.in, color: '#10a37f' },
        { label: 'Out', data: chartData.net.out, color: '#f5a623' }
      ], { unit: ' KB/s' });
    }
    
    async function loadNetworkStats() {
      try {
        const res = await fetch('/api/network/stats');
        const stats = await res.json();
        
        document.getElementById('networkTotalPackets').textContent = stats.total_packets || 0;
        document.getElementById('networkPacketsPerSec').textContent = (stats.packets_per_second || 0).toFixed(1);
        document.getElementById('networkSuspiciousCount').textContent = stats.suspicious_count || 0;
        document.getElementById('networkExternalConnections').textContent = stats.external_connections || 0;
        
        // Update protocol breakdown
        const protocolContainer = document.getElementById('protocol-breakdown');
        if (protocolContainer) {
          const protocols = stats.protocols || {};
          if (Object.keys(protocols).length > 0) {
            const colors = { TCP: '#10a37f', UDP: '#43a9ff', ICMP: '#f5a623', OTHER: '#a855f7' };
            protocolContainer.innerHTML = Object.entries(protocols).map(function([proto, count]) {
              const color = colors[proto] || '#666';
              return '<div style="background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; padding: 12px 20px; text-align: center;"><div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">' + proto + '</div><div style="font-size: 20px; font-weight: 600; color: ' + color + ';">' + count + '</div></div>';
            }).join('');
          } else {
            protocolContainer.innerHTML = '<div style="color: var(--text-muted);">No packets captured</div>';
          }
        }
        
        // Update sniffer status
        const statusEl = document.getElementById('snifferStatus');
        if (statusEl) {
          if (!stats.scapy_available) {
            statusEl.innerHTML = '⚠️ Scapy not installed - packet sniffing disabled';
            statusEl.style.color = 'var(--warning)';
          } else if (stats.is_running) {
            statusEl.innerHTML = '✅ Packet capture active - Duration: ' + (stats.capture_duration_seconds || 0).toFixed(0) + 's';
            statusEl.style.color = 'var(--accent)';
          } else {
            statusEl.innerHTML = '⚠️ Packet capture not running (requires sudo)';
            statusEl.style.color = 'var(--warning)';
          }
        }
        
        // Update packets chart with history
        networkPacketsHistory.push(stats.total_packets || 0);
        if (networkPacketsHistory.length > 60) networkPacketsHistory.shift();
        
        drawChart('packetsChart', [
          { label: 'Packets', data: networkPacketsHistory, color: '#a855f7' }
        ]);
        
      } catch (e) {
        console.error('Network stats error:', e);
      }
    }
    
    async function loadNetworkPackets() {
      const tbody = document.getElementById('networkPacketBody');
      if (!tbody) return;
      
      try {
        const res = await fetch('/api/network/packets?limit=50');
        const data = await res.json();
        
        if (data.packets && data.packets.length > 0) {
          tbody.innerHTML = data.packets.map(function(p) {
            const time = p.timestamp ? new Date(p.timestamp).toLocaleTimeString() : '--';
            const isSuspicious = p.is_suspicious;
            const isExternal = p.src_external || p.dst_external;
            
            // Determine row styling
            let rowStyle = '';
            let statusBadge = '<span style="color: var(--accent);">OK</span>';
            
            if (isSuspicious) {
              rowStyle = 'background: rgba(239, 68, 68, 0.1); border-left: 3px solid var(--error);';
              const reasons = (p.suspicious_reasons || []).slice(0, 2).join(', ');
              statusBadge = '<span style="color: var(--error); font-weight: 600;" title="' + reasons + '">🚨 SUSPICIOUS</span>';
            } else if (isExternal) {
              rowStyle = 'background: rgba(245, 166, 35, 0.1);';
              statusBadge = '<span style="color: var(--warning);">🌐 External</span>';
            }
            
            // Style IPs
            const srcStyle = p.src_external ? 'color: var(--warning); font-weight: 500;' : '';
            const dstStyle = p.dst_external ? 'color: var(--warning); font-weight: 500;' : '';
            
            // Truncate payload
            const payload = (p.payload_preview || '').substring(0, 30) || '-';
            
            return '<tr style="' + rowStyle + '">' +
              '<td style="font-family: JetBrains Mono, monospace; font-size: 12px;">' + time + '</td>' +
              '<td style="font-family: JetBrains Mono, monospace; ' + srcStyle + '">' + (p.src_ip || '-') + '</td>' +
              '<td style="font-family: JetBrains Mono, monospace; ' + dstStyle + '">' + (p.dst_ip || '-') + '</td>' +
              '<td>' + (p.port || '-') + '</td>' +
              '<td><span style="background: var(--bg-secondary); padding: 2px 8px; border-radius: 4px; font-size: 12px;">' + (p.protocol || '-') + '</span></td>' +
              '<td style="font-family: JetBrains Mono, monospace; font-size: 11px; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">' + payload + '</td>' +
              '<td>' + statusBadge + '</td>' +
            '</tr>';
          }).join('');
        } else {
          tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">No packets captured. Run backend with sudo for packet sniffing.</td></tr>';
        }
      } catch (e) {
        console.error('Network packets error:', e);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--error);">Error loading packets</td></tr>';
      }
    }
    
    // Auto-refresh Network view if active
    setInterval(() => {
      if (currentView === 'network') loadNetworkView();
    }, 2000);
    
    // ==========================================
    // TERMINAL VIEW FUNCTIONS
    // ==========================================
    let terminalConnected = false;
    
    function appendTerminalOutput(text, type = 'output') {
      const output = document.getElementById('terminalOutput');
      if (!output) return;
      const line = document.createElement('div');
      if (type === 'command') {
        line.innerHTML = '<span style="color: #58a6ff;">$ ' + text + '</span>';
      } else if (type === 'error') {
        line.innerHTML = '<span style="color: #f85149;">' + text + '</span>';
      } else if (type === 'success') {
        line.innerHTML = '<span style="color: #3fb950;">' + text + '</span>';
      } else {
        line.textContent = text;
      }
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    }
    
    function connectTerminal() {
      const status = document.getElementById('terminalStatus');
      status.innerHTML = '● Connecting...';
      status.style.color = '#d29922';
      
      // Test SSH connection
      fetch('/api/terminal/connect', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            terminalConnected = true;
            status.innerHTML = '● Connected';
            status.style.color = '#3fb950';
            appendTerminalOutput('Connected to test@10.10.2.21', 'success');
            appendTerminalOutput('DDEV directory: ~/d1/regenics', 'output');
            appendTerminalOutput('───────────────────────────────────────────────────', 'output');
          } else {
            status.innerHTML = '● Connection Failed';
            status.style.color = '#f85149';
            appendTerminalOutput('Failed to connect: ' + (data.error || 'Unknown error'), 'error');
          }
        })
        .catch(e => {
          status.innerHTML = '● Connection Failed';
          status.style.color = '#f85149';
          appendTerminalOutput('Connection error: ' + e.message, 'error');
        });
    }
    
    function disconnectTerminal() {
      terminalConnected = false;
      const status = document.getElementById('terminalStatus');
      status.innerHTML = '● Disconnected';
      status.style.color = 'var(--text-muted)';
      appendTerminalOutput('Disconnected from server', 'output');
    }
    
    async function sendTerminalCommand() {
      const input = document.getElementById('terminalInput');
      const command = input.value.trim();
      if (!command) return;
      
      appendTerminalOutput(command, 'command');
      input.value = '';
      
      try {
        const res = await fetch('/api/terminal/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command })
        });
        const data = await res.json();
        
        if (data.output) {
          data.output.split('\\n').forEach(line => appendTerminalOutput(line));
        }
        if (data.error) {
          appendTerminalOutput(data.error, 'error');
        }
      } catch (e) {
        appendTerminalOutput('Error: ' + e.message, 'error');
      }
    }
    
    function runQuickCommand(cmd) {
      document.getElementById('terminalInput').value = cmd;
      sendTerminalCommand();
    }
    
    // ==========================================
    // ALERTS VIEW DATA LOADING
    // ==========================================
    async function loadAlerts() {
      const activeContainer = document.getElementById('alertsContainer');
      const historyBody = document.getElementById('alertHistoryBody');
      if (!activeContainer || !historyBody) return;
      
      try {
        const res = await fetch('/api/alerts');
        const data = await res.json();
        
        // Render Active Alerts
        if (data.active && data.active.length > 0) {
          activeContainer.innerHTML = data.active.map(function(alert) {
            const severityColor = alert.severity === 'CRITICAL' ? 'var(--error)' : alert.severity === 'WARNING' ? 'var(--warning)' : 'var(--accent)';
            const timestamp = new Date(alert.triggered_at).toLocaleString();
            const alertId = alert.id || Math.random().toString(36).substr(2, 9);
            
            return '<div class="alert-card" id="alert-' + alertId + '" style="background: var(--bg-secondary); border: 1px solid var(--border); border-left: 4px solid ' + severityColor + '; border-radius: 8px; padding: 16px;">' +
              '<div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 12px;">' +
                '<div>' +
                  '<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">' +
                    '<span style="font-weight: 600; color: var(--text-primary); font-size: 16px;">' + alert.metric_name + '</span>' +
                    '<span style="background: ' + severityColor + '20; color: ' + severityColor + '; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">' + alert.severity + '</span>' +
                  '</div>' +
                  '<div style="font-size: 12px; color: var(--text-muted);">Triggered: ' + timestamp + '</div>' +
                '</div>' +
                '<div style="text-align: right; font-family: monospace;">' +
                  '<div style="font-size: 18px; color: ' + severityColor + ';">' + parseFloat(alert.current_value).toFixed(2) + '</div>' +
                  '<div style="font-size: 11px; color: var(--text-muted);">Threshold: ' + alert.threshold + '</div>' +
                '</div>' +
              '</div>' +
              '<div id="diagnosis-' + alertId + '" style="display: none; margin-top: 16px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 6px;">' +
                '<div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--accent);">🤖 AI Diagnosis</div>' +
                '<div class="diagnosis-content" style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;"></div>' +
                '<div class="remediation-box" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border);">' +
                  '<div style="font-size: 12px; font-weight: 600; margin-bottom: 4px;">Recommended Remediation:</div>' +
                  '<div class="remediation-text" style="font-size: 13px; color: var(--text-primary); margin-bottom: 12px; font-style: italic;"></div>' +
                  '<div style="display: flex; gap: 8px;">' +
                    '<button class="btn btn-sm" style="background: var(--accent); border-color: var(--accent); color: white;" onclick="approveRemediation(\\'' + alertId + '\\')">Approve Fix</button>' +
                    '<button class="btn btn-sm btn-outline" style="color: var(--error); border-color: var(--error);" onclick="rejectRemediation(\\'' + alertId + '\\')">Reject</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div style="margin-top: 12px; display: flex; gap: 8px;" id="actions-' + alertId + '">' +
                '<button class="btn btn-sm btn-outline" onclick="diagnoseAlert(\\'' + alertId + '\\', \\'' + alert.metric_name + '\\', ' + alert.current_value + ', ' + alert.threshold + ', \\'' + alert.severity + '\\')">🔍 Diagnose with AI</button>' +
                '<button class="btn btn-sm btn-outline" onclick="acknowledgeAlert(\\'' + alertId + '\\')">✓ Acknowledge</button>' +
              '</div>' +
            '</div>';
          }).join('');
        } else {
          activeContainer.innerHTML = '<div style="text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-secondary); border-radius: 8px;">No active alerts</div>';
        }
        
        // Render History
        if (data.history && data.history.length > 0) {
          historyBody.innerHTML = data.history.map(function(alert, index) {
            const name = alert.metric_name || alert.name || 'Unknown';
            const description = alert.description || 'N/A';
            
            // Handle remediation display (can be string, object, or array)
            let remediation = alert.remediation_proposed || 'N/A';
            if (typeof remediation === 'object') {
              if (Array.isArray(remediation)) {
                remediation = remediation.map(r => typeof r === 'object' ? (r.description || JSON.stringify(r)) : String(r)).join('; ');
              } else {
                remediation = remediation.description || JSON.stringify(remediation);
              }
            }
            
            const status = alert.status || 'Unknown';
            const statusColors = { 'Approved': 'var(--accent)', 'Rejected': 'var(--error)', 'Closed': 'var(--success)', 'Open': 'var(--warning)', 'In-progress': 'var(--accent)' };
            const statusColor = statusColors[status] || 'var(--text-muted)';
            
            // Truncate remediation for a "jist" view
            const remediationJist = remediation.length > 80 ? remediation.substring(0, 77) + '...' : remediation;
            
            return '<tr>' +
              '<td style="color: var(--text-muted); font-size: 12px;">' + (index + 1) + '</td>' +
              '<td style="font-weight: 500;">' + name + '</td>' +
              '<td style="color: var(--text-secondary); max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + description + '">' + description + '</td>' +
              '<td style="color: var(--text-secondary); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="' + remediation + '">' + remediationJist + '</td>' +
              '<td><span style="color: ' + statusColor + '; font-weight: 600;">' + status + '</span></td>' +
            '</tr>';
          }).join('');
        } else {
          historyBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">No alert history found</td></tr>';
        }
      } catch (e) {
        console.error('Failed to load alerts:', e);
        activeContainer.innerHTML = '<div style="color: var(--error); text-align: center;">Failed to load alerts</div>';
      }
    }
    
    // Interactive Alert Functions
    window.diagnoseAlert = async function(id, metric, value, threshold, severity) {
      const diagDiv = document.getElementById('diagnosis-' + id);
      const btnDiv = document.getElementById('actions-' + id);
      if (!diagDiv) return;
      
      diagDiv.style.display = 'block';
      diagDiv.querySelector('.diagnosis-content').innerHTML = '<span style="color: var(--accent);">Analyzing...</span>';
      
      try {
        const res = await fetch('/api/alerts/' + id + '/diagnose', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alert_id: id, metric_name: metric, current_value: value, threshold: threshold })
        });
        const data = await res.json();
        
        // Handle object/string for remediation/analysis
        const remediation = typeof data.remediation === 'object' ? JSON.stringify(data.remediation) : String(data.remediation || 'Investigate manually');
        const analysis = typeof data.analysis === 'object' ? JSON.stringify(data.analysis) : String(data.analysis || 'AI diagnosis complete');
        
        diagDiv.dataset.remediation = remediation;
        diagDiv.dataset.analysis = analysis;
        diagDiv.dataset.severity = severity;
        diagDiv.dataset.metric = metric;
        
        // Update UI display
        diagDiv.querySelector('.diagnosis-content').textContent = analysis.substring(0, 500) + (analysis.length > 500 ? '...' : '');
        diagDiv.querySelector('.remediation-text').textContent = remediation.substring(0, 300) + (remediation.length > 300 ? '...' : '');
        
        if (btnDiv) btnDiv.style.display = 'none';
      } catch (e) {
        diagDiv.querySelector('.diagnosis-content').textContent = 'Diagnosis failed. Please check backend logs.';
      }
    };
    
    window.approveRemediation = async function(id) {
      const diagDiv = document.getElementById('diagnosis-' + id);
      if (!diagDiv) return;
      
      try {
        await fetch('/api/alerts/' + id + '/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            alert_id: id, 
            remediation: diagDiv.dataset.remediation,
            description: diagDiv.dataset.analysis, // Pass AI diagnosis as description
            metric_name: diagDiv.dataset.metric || 'Unknown Alert',
            severity: diagDiv.dataset.severity || 'MEDIUM'
          })
        });
        alert('Remediation approved!');
        setTimeout(loadAlerts, 1000);
      } catch (e) {
        console.error(e);
        alert('Failed to approve remediation');
      }
    };
    
    window.rejectRemediation = async function(id) {
      if (!confirm('Reject this remediation plan?')) return;
      const diagDiv = document.getElementById('diagnosis-' + id);
      
      try {
        await fetch('/api/alerts/' + id + '/reject', { 
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            alert_id: id,
            reason: diagDiv ? diagDiv.dataset.remediation : 'User rejected remediation',
            description: diagDiv ? diagDiv.dataset.analysis : 'Alert rejected'
          })
        });
        setTimeout(loadAlerts, 500);
      } catch (e) { console.error(e); }
    };
    
    window.acknowledgeAlert = async function(id) {
      const card = document.getElementById('alert-' + id);
      if (card) card.style.opacity = '0.6';
    };
  </script>
</body>
</html>
`

export default {
  port: 3001,
  fetch: app.fetch,
  idleTimeout: 60, // Increased timeout for SSH-tunneled Netdata requests
}

console.log('🔷 AIOps Command Center BEAST MODE running at http://localhost:3001')
