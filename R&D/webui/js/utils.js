/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UTILITIES
   Helper functions and utilities
   ═══════════════════════════════════════════════════════════════════════════════ */

const Utils = {
  // DOM Helpers
  $(selector) {
    return document.querySelector(selector);
  },

  $$(selector) {
    return document.querySelectorAll(selector);
  },

  // Format numbers with K, M, B suffixes
  formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
  },

  // Format bytes
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  },

  // Format percentage
  formatPercent(value) {
    return value.toFixed(1) + '%';
  },

  // Format duration
  formatDuration(ms) {
    if (ms < 1000) return ms + 'ms';
    if (ms < 60000) return (ms / 1000).toFixed(1) + 's';
    if (ms < 3600000) return Math.floor(ms / 60000) + 'm ' + Math.floor((ms % 60000) / 1000) + 's';
    return Math.floor(ms / 3600000) + 'h ' + Math.floor((ms % 3600000) / 60000) + 'm';
  },

  // Format relative time
  formatRelativeTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return minutes + 'm ago';
    if (hours < 24) return hours + 'h ago';
    if (days < 7) return days + 'd ago';
    return new Date(date).toLocaleDateString();
  },

  // Generate random ID
  generateId() {
    return Math.random().toString(36).substring(2, 9);
  },

  // Debounce function
  debounce(fn, delay) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  },

  // Throttle function
  throttle(fn, delay) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn(...args);
      }
    };
  },

  // Generate random data for demo
  randomInRange(min, max) {
    return Math.random() * (max - min) + min;
  },

  // Generate time series data
  generateTimeSeries(points, min, max, trend = 0) {
    const data = [];
    let value = this.randomInRange(min, max);
    const now = Date.now();
    
    for (let i = points - 1; i >= 0; i--) {
      value += this.randomInRange(-5, 5) + trend;
      value = Math.max(min, Math.min(max, value));
      data.push({
        timestamp: now - i * 1000,
        value: value
      });
    }
    return data;
  },

  // Color helpers
  hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  },

  // Animate value
  animateValue(el, start, end, duration = 1000) {
    const startTime = performance.now();
    const update = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const current = start + (end - start) * eased;
      el.textContent = Math.round(current);
      if (progress < 1) requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  },

  // Create element helper
  createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'className') el.className = value;
      else if (key === 'innerHTML') el.innerHTML = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
      else el.setAttribute(key, value);
    });
    children.forEach(child => {
      if (typeof child === 'string') el.appendChild(document.createTextNode(child));
      else el.appendChild(child);
    });
    return el;
  },

  // Show toast notification
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    const toast = this.createElement('div', {
      className: `toast toast-${type}`,
      innerHTML: `
        <div class="toast-content">
          <span class="toast-message">${message}</span>
        </div>
        <button class="toast-close">&times;</button>
      `
    });
    
    container.appendChild(toast);
    toast.querySelector('.toast-close').onclick = () => toast.remove();
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
};

// Export for use
window.Utils = Utils;
