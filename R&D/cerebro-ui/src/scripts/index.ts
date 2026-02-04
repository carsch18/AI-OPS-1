/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Client Scripts
   Bundled client-side JavaScript
   ═══════════════════════════════════════════════════════════════════════════════ */

export function clientScripts(): string {
  return `
(function() {
  'use strict';
  
  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════
  
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  
  function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  }
  
  function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  }
  
  function generateTimeSeries(points, min, max) {
    const data = [];
    let value = randomInRange(min, max);
    const now = Date.now();
    for (let i = points - 1; i >= 0; i--) {
      value += randomInRange(-3, 3);
      value = Math.max(min, Math.min(max, value));
      data.push({ timestamp: now - i * 2000, value });
    }
    return data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CHART LIBRARY
  // ═══════════════════════════════════════════════════════════════════════════
  
  class Chart {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.options = {
        lineColor: '#FF0080',
        fillColor: 'rgba(255, 0, 128, 0.1)',
        gridColor: 'rgba(255, 255, 255, 0.04)',
        textColor: '#606070',
        padding: { top: 20, right: 20, bottom: 30, left: 45 },
        ...options
      };
      this.data = [];
      this.setupCanvas();
    }
    
    setupCanvas() {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';
      this.ctx.scale(dpr, dpr);
      this.width = rect.width;
      this.height = rect.height;
    }
    
    setData(data) {
      this.data = data;
      this.render();
    }
    
    addPoint(point) {
      this.data.push(point);
      if (this.data.length > 60) this.data.shift();
      this.render();
    }
    
    render() {
      const { ctx, width, height, options, data } = this;
      const { padding, lineColor, fillColor, gridColor, textColor } = options;
      
      ctx.clearRect(0, 0, width, height);
      if (data.length < 2) return;
      
      const chartW = width - padding.left - padding.right;
      const chartH = height - padding.top - padding.bottom;
      
      const values = data.map(d => d.value);
      const minVal = Math.min(...values) * 0.9;
      const maxVal = Math.max(...values) * 1.1;
      const range = maxVal - minVal || 1;
      
      // Grid
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartH / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(padding.left + chartW, y);
        ctx.stroke();
      }
      
      // Points
      const points = data.map((d, i) => ({
        x: padding.left + (i / (data.length - 1)) * chartW,
        y: padding.top + chartH - ((d.value - minVal) / range) * chartH
      }));
      
      // Fill
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
      gradient.addColorStop(0, fillColor);
      gradient.addColorStop(1, 'rgba(255, 0, 128, 0)');
      
      ctx.beginPath();
      ctx.moveTo(points[0].x, padding.top + chartH);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, padding.top + chartH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Line
      ctx.beginPath();
      points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      
      // Glow
      ctx.shadowColor = lineColor;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      // Y-axis labels
      ctx.fillStyle = textColor;
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      for (let i = 0; i <= 4; i++) {
        const val = maxVal - ((maxVal - minVal) / 4) * i;
        const y = padding.top + (chartH / 4) * i;
        ctx.fillText(val.toFixed(1), padding.left - 8, y + 4);
      }
    }
  }
  
  // Sparkline
  class Sparkline {
    constructor(canvas, data, color = '#FF0080') {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.color = color;
      this.setData(data);
    }
    
    setData(data) {
      this.data = data;
      this.render();
    }
    
    render() {
      const { canvas, ctx, data, color } = this;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
      
      if (data.length < 2) return;
      
      const min = Math.min(...data);
      const max = Math.max(...data);
      const range = max - min || 1;
      
      const points = data.map((v, i) => ({
        x: (i / (data.length - 1)) * w,
        y: h - ((v - min) / range) * h * 0.8 - h * 0.1
      }));
      
      // Fill
      const gradient = ctx.createLinearGradient(0, 0, 0, h);
      gradient.addColorStop(0, color + '40');
      gradient.addColorStop(1, color + '00');
      
      ctx.beginPath();
      ctx.moveTo(0, h);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Line
      ctx.beginPath();
      points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // APP STATE & LOGIC
  // ═══════════════════════════════════════════════════════════════════════════
  
  const App = {
    charts: {},
    sparklines: {},
    chatOpen: false,
    sidebarCollapsed: false,
    
    init() {
      this.bindEvents();
      this.initCharts();
      this.initSparklines();
      this.startRealtime();
      console.log('🧠 CEREBRO UI initialized');
    },
    
    bindEvents() {
      // Sidebar toggle
      $('#sidebar-toggle')?.addEventListener('click', () => this.toggleSidebar());
      
      // Chat toggle
      $('#chat-toggle')?.addEventListener('click', () => this.toggleChat());
      $('#chat-close')?.addEventListener('click', () => this.toggleChat());
      $('#nav-chat')?.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleChat();
      });
      
      // Chat send
      $('#chat-send')?.addEventListener('click', () => this.sendMessage());
      $('#chat-input')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      
      // Quick prompts
      $$('.quick-prompt').forEach(el => {
        el.addEventListener('click', () => {
          const input = $('#chat-input');
          if (input) {
            input.value = el.textContent;
            input.focus();
          }
        });
      });
      
      // Global search shortcut
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
          e.preventDefault();
          $('#global-search')?.focus();
        }
      });
      
      // Window resize
      window.addEventListener('resize', () => {
        Object.values(this.charts).forEach(c => {
          c.setupCanvas();
          c.render();
        });
      });
    },
    
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      $('#sidebar')?.classList.toggle('collapsed');
    },
    
    toggleChat() {
      this.chatOpen = !this.chatOpen;
      $('#chat-panel')?.classList.toggle('open');
      if (this.chatOpen) $('#chat-input')?.focus();
    },
    
    sendMessage() {
      const input = $('#chat-input');
      const msg = input?.value?.trim();
      if (!msg) return;
      
      // Add user message
      this.addChatMessage('user', msg);
      input.value = '';
      
      // Simulate AI response
      setTimeout(() => {
        const responses = [
          'I\\'m analyzing the api-gateway service. The high CPU appears to be caused by a memory leak. I recommend restarting the pods.',
          'Based on my analysis, the checkout-service is experiencing latency due to database connection timeouts.',
          'I\\'ve detected an anomaly in request patterns. Traffic is 40% higher than usual. Consider scaling up.'
        ];
        this.addChatMessage('assistant', responses[Math.floor(Math.random() * responses.length)]);
      }, 1500);
    },
    
    addChatMessage(role, content) {
      const container = $('#chat-messages');
      if (!container) return;
      
      const isUser = role === 'user';
      const html = \`
        <div class="chat-message \${role}" style="display: flex; gap: var(--space-3); max-width: 90%; \${isUser ? 'align-self: flex-end; flex-direction: row-reverse;' : ''}">
          \${isUser ? '<div class="avatar avatar-sm">JD</div>' : '<div class="avatar avatar-sm" style="background: linear-gradient(135deg, var(--accent-primary), var(--pink-600));">🧠</div>'}
          <div style="padding: var(--space-3) var(--space-4); background: \${isUser ? 'var(--accent-primary)' : 'var(--bg-tertiary)'}; border: 1px solid \${isUser ? 'transparent' : 'var(--border-subtle)'}; border-radius: var(--radius-lg); font-size: var(--text-sm); line-height: var(--leading-relaxed);">
            \${content}
          </div>
        </div>
      \`;
      container.insertAdjacentHTML('beforeend', html);
      container.scrollTop = container.scrollHeight;
    },
    
    initCharts() {
      const cpuCanvas = $('#chart-cpu');
      const memCanvas = $('#chart-memory');
      
      if (cpuCanvas) {
        this.charts.cpu = new Chart(cpuCanvas, {
          lineColor: '#FF0080',
          fillColor: 'rgba(255, 0, 128, 0.1)'
        });
        this.charts.cpu.setData(generateTimeSeries(30, 40, 80));
      }
      
      if (memCanvas) {
        this.charts.memory = new Chart(memCanvas, {
          lineColor: '#00FFAA',
          fillColor: 'rgba(0, 255, 170, 0.1)'
        });
        this.charts.memory.setData(generateTimeSeries(30, 50, 70));
      }
    },
    
    initSparklines() {
      const configs = [
        { id: 'sparkline-cpu', color: '#FF0080', min: 40, max: 80 },
        { id: 'sparkline-memory', color: '#00FFAA', min: 50, max: 70 },
        { id: 'sparkline-requests', color: '#FF0080', min: 10000, max: 15000 },
        { id: 'sparkline-errors', color: '#FFAA00', min: 0, max: 2 }
      ];
      
      configs.forEach(({ id, color, min, max }) => {
        const canvas = $('#' + id);
        if (canvas) {
          const data = Array.from({ length: 20 }, () => randomInRange(min, max));
          this.sparklines[id] = new Sparkline(canvas, data, color);
        }
      });
    },
    
    startRealtime() {
      setInterval(() => {
        // Update charts
        if (this.charts.cpu) {
          const last = this.charts.cpu.data[this.charts.cpu.data.length - 1]?.value || 60;
          const newVal = Math.max(20, Math.min(95, last + randomInRange(-5, 5)));
          this.charts.cpu.addPoint({ timestamp: Date.now(), value: newVal });
        }
        
        if (this.charts.memory) {
          const last = this.charts.memory.data[this.charts.memory.data.length - 1]?.value || 55;
          const newVal = Math.max(30, Math.min(85, last + randomInRange(-3, 3)));
          this.charts.memory.addPoint({ timestamp: Date.now(), value: newVal });
        }
      }, 2000);
    },
    
    // HITL Actions
    approveAction(id) {
      console.log('Approving action:', id);
      this.toast('Action approved and executing...', 'success');
      const card = document.querySelector(\`[data-action-id="\${id}"]\`);
      if (card) card.remove();
    },
    
    rejectAction(id) {
      console.log('Rejecting action:', id);
      this.toast('Action rejected', 'info');
      const card = document.querySelector(\`[data-action-id="\${id}"]\`);
      if (card) card.remove();
    },
    
    viewActionDetails(id) {
      this.toast('Opening action details...', 'info');
    },
    
    toast(message, type = 'info') {
      const container = $('#toast-container');
      if (!container) return;
      
      const toast = document.createElement('div');
      toast.className = 'toast ' + type;
      toast.innerHTML = \`<span>\${message}</span>\`;
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  };
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => App.init());
  } else {
    App.init();
  }
  
  // Expose to global scope
  window.App = App;
})();
  `.trim();
}
