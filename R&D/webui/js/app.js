/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO APPLICATION
   Main application logic and state management
   ═══════════════════════════════════════════════════════════════════════════════ */

const App = {
  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // ─────────────────────────────────────────────────────────────────────────────
  state: {
    currentPage: 'dashboard',
    sidebarOpen: true,
    chatOpen: false,
    healthScore: 94,
    charts: {},
    metrics: {
      cpu: Utils.generateTimeSeries(60, 20, 80),
      memory: Utils.generateTimeSeries(60, 40, 70),
      network: Utils.generateTimeSeries(60, 100, 500),
      requests: Utils.generateTimeSeries(60, 1000, 5000),
      latency: Utils.generateTimeSeries(60, 50, 200),
      errors: Utils.generateTimeSeries(60, 0, 5)
    },
    alerts: [
      { id: 'a1', severity: 'critical', title: 'High CPU usage on api-gateway', service: 'api-gateway', time: Date.now() - 120000 },
      { id: 'a2', severity: 'warning', title: 'Memory pressure on checkout-service', service: 'checkout', time: Date.now() - 300000 },
      { id: 'a3', severity: 'critical', title: 'Database connection pool exhausted', service: 'postgres', time: Date.now() - 180000 },
      { id: 'a4', severity: 'warning', title: 'Latency spike detected', service: 'payment-api', time: Date.now() - 600000 },
      { id: 'a5', severity: 'info', title: 'Deployment completed successfully', service: 'frontend', time: Date.now() - 900000 }
    ],
    services: [
      { name: 'api-gateway', status: 'critical', latency: 245, requests: 12500, errors: 2.3 },
      { name: 'checkout-service', status: 'warning', latency: 189, requests: 3200, errors: 0.8 },
      { name: 'payment-api', status: 'healthy', latency: 45, requests: 1800, errors: 0.1 },
      { name: 'inventory-service', status: 'healthy', latency: 32, requests: 890, errors: 0.0 },
      { name: 'user-service', status: 'healthy', latency: 28, requests: 4500, errors: 0.2 },
      { name: 'notification-service', status: 'healthy', latency: 156, requests: 650, errors: 0.5 }
    ],
    pendingActions: [
      { id: 'pa1', action: 'Restart api-gateway pods', service: 'api-gateway', risk: 'medium', reason: 'High CPU detected. Restarting may resolve memory leak.', time: Date.now() - 60000 },
      { id: 'pa2', action: 'Scale checkout-service to 5 replicas', service: 'checkout', risk: 'low', reason: 'Traffic spike predicted in next 30 minutes.', time: Date.now() - 120000 }
    ],
    chatMessages: [
      { role: 'assistant', content: 'Hello! I\'m CEREBRO, your AI infrastructure assistant. I\'m monitoring your systems and ready to help with any issues. What would you like to investigate?', time: Date.now() - 300000 }
    ],
    incidents: [
      { id: 'inc1', title: 'API Gateway Performance Degradation', severity: 'critical', status: 'active', services: ['api-gateway', 'checkout'], startTime: Date.now() - 1800000, assignee: 'John D.' },
      { id: 'inc2', title: 'Database Connection Issues', severity: 'high', status: 'investigating', services: ['postgres', 'redis'], startTime: Date.now() - 3600000, assignee: 'Sarah M.' },
      { id: 'inc3', title: 'Intermittent 504 Errors', severity: 'medium', status: 'monitoring', services: ['nginx', 'api-gateway'], startTime: Date.now() - 7200000, assignee: 'Mike R.' }
    ]
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────
  init() {
    this.bindEvents();
    this.renderPage('dashboard');
    this.startRealtimeUpdates();
    this.initChat();
    console.log('🧠 CEREBRO initialized');
  },

  bindEvents() {
    // Sidebar toggle
    Utils.$('#sidebar-toggle').addEventListener('click', () => this.toggleSidebar());
    
    // Navigation
    Utils.$$('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const page = e.currentTarget.dataset.page;
        if (page) this.navigate(page);
      });
    });

    // Chat toggle
    Utils.$('#chat-toggle').addEventListener('click', () => this.toggleChat());
    Utils.$('#chat-close').addEventListener('click', () => this.toggleChat());
    Utils.$('#nav-chat').addEventListener('click', (e) => {
      e.preventDefault();
      this.toggleChat();
    });

    // Chat input
    Utils.$('#chat-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    Utils.$('#chat-send').addEventListener('click', () => this.sendMessage());

    // Search shortcut
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        Utils.$('.search-input').focus();
      }
    });
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // NAVIGATION
  // ─────────────────────────────────────────────────────────────────────────────
  navigate(page) {
    this.state.currentPage = page;
    
    // Update nav active state
    Utils.$$('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.page === page);
    });

    // Update header title
    const titles = {
      dashboard: 'Dashboard',
      services: 'Services',
      topology: 'Service Topology',
      incidents: 'Incidents',
      alerts: 'Alerts',
      runbooks: 'Runbooks',
      actions: 'Pending Actions',
      insights: 'AI Insights',
      anomalies: 'Anomaly Detection',
      integrations: 'Integrations',
      settings: 'Settings'
    };
    Utils.$('.header-title').textContent = titles[page] || page;

    this.renderPage(page);
  },

  renderPage(page) {
    const content = Utils.$('#content');
    
    switch (page) {
      case 'dashboard':
        this.renderDashboard(content);
        break;
      case 'services':
        this.renderServices(content);
        break;
      case 'incidents':
        this.renderIncidents(content);
        break;
      case 'alerts':
        this.renderAlerts(content);
        break;
      case 'actions':
        this.renderActions(content);
        break;
      default:
        content.innerHTML = `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-tertiary);">
            <div style="font-size: 48px; margin-bottom: var(--space-4);">🚧</div>
            <div style="font-size: var(--text-xl);">${page.charAt(0).toUpperCase() + page.slice(1)} - Coming Soon</div>
          </div>
        `;
    }
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────────
  renderDashboard(container) {
    const { metrics, alerts, services, pendingActions, healthScore } = this.state;
    
    container.innerHTML = `
      <div class="dashboard-grid">
        <!-- Health Score -->
        <div class="grid-col-3">
          <div class="card" style="height: 100%;">
            ${Components.healthScore(healthScore)}
          </div>
        </div>

        <!-- Key Metrics -->
        <div class="grid-col-9">
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4);">
            ${Components.metricCard({
              label: 'CPU Usage',
              value: '67.2%',
              change: '+5.3% from avg',
              changeType: 'negative',
              sparklineData: metrics.cpu.slice(-20).map(d => d.value),
              color: 'pink'
            })}
            ${Components.metricCard({
              label: 'Memory',
              value: '54.8%',
              change: 'Stable',
              changeType: 'neutral',
              sparklineData: metrics.memory.slice(-20).map(d => d.value),
              color: 'cyan'
            })}
            ${Components.metricCard({
              label: 'Requests/s',
              value: '12.4K',
              change: '+12% from yesterday',
              changeType: 'positive',
              sparklineData: metrics.requests.slice(-20).map(d => d.value),
              color: 'pink'
            })}
            ${Components.metricCard({
              label: 'Error Rate',
              value: '0.42%',
              change: '+0.1% from avg',
              changeType: 'negative',
              sparklineData: metrics.errors.slice(-20).map(d => d.value),
              color: 'yellow'
            })}
          </div>
        </div>

        <!-- CPU Chart -->
        <div class="grid-col-6 grid-row-2">
          ${Components.chartCard({ id: 'cpu-chart', title: 'CPU Usage', subtitle: 'All nodes aggregated' })}
        </div>

        <!-- Memory Chart -->
        <div class="grid-col-6 grid-row-2">
          ${Components.chartCard({ id: 'memory-chart', title: 'Memory Usage', subtitle: 'All nodes aggregated' })}
        </div>

        <!-- Pending Actions -->
        <div class="grid-col-6">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Pending Actions</span>
              <span class="status-badge warning">${pendingActions.length} PENDING</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-3);">
              ${pendingActions.map(a => Components.pendingAction(a)).join('')}
            </div>
          </div>
        </div>

        <!-- Active Alerts -->
        <div class="grid-col-6">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Active Alerts</span>
              <button class="btn btn-ghost btn-sm">View All</button>
            </div>
            <div class="alert-list">
              ${alerts.slice(0, 5).map(a => Components.alertItem(a)).join('')}
            </div>
          </div>
        </div>

        <!-- Service Health -->
        <div class="grid-col-6">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Service Health</span>
              <button class="btn btn-ghost btn-sm">View All</button>
            </div>
            <div class="service-list">
              ${services.map(s => Components.serviceItem(s)).join('')}
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="grid-col-3">
          <div class="card">
            <div class="card-header">
              <span class="card-title">Quick Actions</span>
            </div>
            ${Components.quickActions()}
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="grid-col-3">
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
                <span style="color: var(--text-tertiary); font-size: var(--text-sm);">MTTR</span>
                <span style="font-family: var(--font-mono); color: var(--color-success);">4.2m</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Initialize charts
    this.initDashboardCharts();
    this.initSparklines();
  },

  initDashboardCharts() {
    const { metrics } = this.state;

    // CPU Chart
    const cpuChart = new CerebroChart(Utils.$('#cpu-chart'), {
      colors: { line: '#FF2E97', fill: 'rgba(255, 46, 151, 0.1)' }
    });
    cpuChart.setData(metrics.cpu);
    this.state.charts.cpu = cpuChart;

    // Memory Chart  
    const memChart = new CerebroChart(Utils.$('#memory-chart'), {
      colors: { line: '#00F5D4', fill: 'rgba(0, 245, 212, 0.1)' }
    });
    memChart.setData(metrics.memory);
    this.state.charts.memory = memChart;
  },

  initSparklines() {
    Utils.$$('.metric-sparkline').forEach(canvas => {
      const data = JSON.parse(canvas.dataset.sparkline);
      const color = canvas.dataset.color === 'cyan' ? '#00F5D4' : 
                    canvas.dataset.color === 'yellow' ? '#FEE440' : '#FF2E97';
      new Sparkline(canvas, data, color);
    });
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // OTHER PAGES
  // ─────────────────────────────────────────────────────────────────────────────
  renderServices(container) {
    container.innerHTML = `
      <div class="content-header">
        <h2 class="content-title">Services</h2>
        <div class="content-actions">
          <input type="text" class="input" placeholder="Filter services..." style="width: 200px;">
          <button class="btn btn-primary">Add Service</button>
        </div>
      </div>
      ${Components.statGrid([
        { value: '24', label: 'Total Services', color: 'var(--text-primary)' },
        { value: '21', label: 'Healthy', color: 'var(--color-success)' },
        { value: '2', label: 'Warning', color: 'var(--color-warning)' },
        { value: '1', label: 'Critical', color: 'var(--color-error)' }
      ])}
      <div style="margin-top: var(--space-6);">
        <div class="card">
          <div class="service-list">
            ${this.state.services.map(s => Components.serviceItem(s)).join('')}
          </div>
        </div>
      </div>
    `;
  },

  renderIncidents(container) {
    container.innerHTML = `
      <div class="content-header">
        <h2 class="content-title">Incidents</h2>
        <button class="btn btn-primary">Create Incident</button>
      </div>
      ${Components.statGrid([
        { value: '3', label: 'Active', color: 'var(--color-error)' },
        { value: '2', label: 'Investigating', color: 'var(--color-warning)' },
        { value: '15', label: 'Resolved Today', color: 'var(--color-success)' },
        { value: '4.2m', label: 'Avg MTTR', color: 'var(--accent-primary)' }
      ])}
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-4); margin-top: var(--space-6);">
        ${this.state.incidents.map(i => Components.incidentCard(i)).join('')}
      </div>
    `;
  },

  renderAlerts(container) {
    container.innerHTML = `
      <div class="content-header">
        <h2 class="content-title">Alerts</h2>
        <div class="tabs" style="width: auto;">
          <button class="tab active">Active</button>
          <button class="tab">Acknowledged</button>
          <button class="tab">Resolved</button>
        </div>
      </div>
      <div class="card">
        <div class="alert-list" style="max-height: none;">
          ${this.state.alerts.map(a => Components.alertItem(a)).join('')}
        </div>
      </div>
    `;
  },

  renderActions(container) {
    container.innerHTML = `
      <div class="content-header">
        <h2 class="content-title">Pending Actions</h2>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--space-4);">
        ${this.state.pendingActions.map(a => Components.pendingAction(a)).join('')}
      </div>
    `;
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // SIDEBAR & CHAT
  // ─────────────────────────────────────────────────────────────────────────────
  toggleSidebar() {
    this.state.sidebarOpen = !this.state.sidebarOpen;
    Utils.$('#sidebar').classList.toggle('collapsed');
  },

  toggleChat() {
    this.state.chatOpen = !this.state.chatOpen;
    Utils.$('#chat-panel').classList.toggle('open');
    if (this.state.chatOpen) {
      Utils.$('#chat-input').focus();
    }
  },

  initChat() {
    this.renderChatMessages();
  },

  renderChatMessages() {
    const container = Utils.$('#chat-messages');
    container.innerHTML = this.state.chatMessages.map(m => Components.chatMessage(m)).join('');
    container.scrollTop = container.scrollHeight;
  },

  sendMessage() {
    const input = Utils.$('#chat-input');
    const message = input.value.trim();
    if (!message) return;

    // Add user message
    this.state.chatMessages.push({ role: 'user', content: message, time: Date.now() });
    input.value = '';
    this.renderChatMessages();

    // Simulate AI response
    setTimeout(() => {
      const responses = [
        { content: 'I\'m analyzing the api-gateway service. The high CPU usage appears to be caused by a memory leak in the connection pool. I recommend restarting the pods.', tools: ['get_cpu_usage', 'get_memory_usage', 'search_logs'] },
        { content: 'Based on my analysis, the checkout-service is experiencing increased latency due to database connection timeouts. The connection pool is at 95% capacity.', tools: ['get_db_metrics', 'get_slow_queries'] },
        { content: 'I\'ve detected an anomaly in the request patterns. Traffic is 40% higher than usual for this time. I recommend scaling up the api-gateway.', tools: ['get_traffic_stats', 'predict_capacity'] }
      ];
      const response = responses[Math.floor(Math.random() * responses.length)];
      this.state.chatMessages.push({ role: 'assistant', ...response, time: Date.now() });
      this.renderChatMessages();
    }, 1500);
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────────────────────────────────────
  approveAction(id) {
    this.state.pendingActions = this.state.pendingActions.filter(a => a.id !== id);
    Utils.toast('Action approved and executing...', 'success');
    if (this.state.currentPage === 'dashboard' || this.state.currentPage === 'actions') {
      this.renderPage(this.state.currentPage);
    }
  },

  rejectAction(id) {
    this.state.pendingActions = this.state.pendingActions.filter(a => a.id !== id);
    Utils.toast('Action rejected', 'info');
    if (this.state.currentPage === 'dashboard' || this.state.currentPage === 'actions') {
      this.renderPage(this.state.currentPage);
    }
  },

  viewActionDetails(id) {
    Utils.toast('Opening action details...', 'info');
  },

  viewIncident(id) {
    Utils.toast('Opening incident ' + id, 'info');
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // REAL-TIME UPDATES
  // ─────────────────────────────────────────────────────────────────────────────
  startRealtimeUpdates() {
    setInterval(() => {
      // Update metrics
      Object.keys(this.state.metrics).forEach(key => {
        const data = this.state.metrics[key];
        const last = data[data.length - 1].value;
        const newValue = Math.max(0, Math.min(100, last + Utils.randomInRange(-5, 5)));
        data.push({ timestamp: Date.now(), value: newValue });
        if (data.length > 60) data.shift();
      });

      // Update charts if on dashboard
      if (this.state.currentPage === 'dashboard' && this.state.charts.cpu) {
        this.state.charts.cpu.setData(this.state.metrics.cpu);
        this.state.charts.memory.setData(this.state.metrics.memory);
      }

      // Fluctuate health score
      this.state.healthScore = Math.max(70, Math.min(99, this.state.healthScore + Utils.randomInRange(-2, 2)));
    }, 2000);
  }
};

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

// Export for global access
window.App = App;
