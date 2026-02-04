/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO CHARTS
   Custom Canvas-based chart library
   ═══════════════════════════════════════════════════════════════════════════════ */

class CerebroChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      type: 'line',
      padding: { top: 20, right: 20, bottom: 30, left: 50 },
      colors: {
        line: '#FF2E97',
        fill: 'rgba(255, 46, 151, 0.1)',
        grid: 'rgba(255, 255, 255, 0.05)',
        axis: 'rgba(255, 255, 255, 0.1)',
        text: '#6B6B80'
      },
      animation: true,
      showGrid: true,
      showPoints: false,
      smooth: true,
      ...options
    };
    this.data = [];
    this.animationProgress = 0;
    this.setupCanvas();
    this.bindEvents();
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

  bindEvents() {
    window.addEventListener('resize', Utils.debounce(() => {
      this.setupCanvas();
      this.render();
    }, 100));

    this.canvas.addEventListener('mousemove', (e) => this.handleHover(e));
    this.canvas.addEventListener('mouseleave', () => this.hideTooltip());
  }

  setData(data) {
    this.data = data;
    if (this.options.animation) {
      this.animate();
    } else {
      this.animationProgress = 1;
      this.render();
    }
  }

  addPoint(point) {
    this.data.push(point);
    if (this.data.length > 60) this.data.shift();
    this.render();
  }

  animate() {
    this.animationProgress = 0;
    const duration = 800;
    const start = performance.now();

    const step = (timestamp) => {
      const elapsed = timestamp - start;
      this.animationProgress = Math.min(elapsed / duration, 1);
      this.animationProgress = 1 - Math.pow(1 - this.animationProgress, 3); // easeOutCubic
      this.render();
      if (this.animationProgress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }

  render() {
    const { ctx, width, height, options, data } = this;
    const { padding, colors } = options;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (data.length < 2) return;

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate bounds
    const values = data.map(d => d.value);
    const minValue = Math.min(...values) * 0.95;
    const maxValue = Math.max(...values) * 1.05;
    const valueRange = maxValue - minValue || 1;

    // Draw grid
    if (options.showGrid) {
      this.drawGrid(chartWidth, chartHeight, minValue, maxValue);
    }

    // Draw line
    if (options.type === 'line') {
      this.drawLine(chartWidth, chartHeight, minValue, valueRange);
    } else if (options.type === 'area') {
      this.drawArea(chartWidth, chartHeight, minValue, valueRange);
    } else if (options.type === 'bar') {
      this.drawBars(chartWidth, chartHeight, minValue, valueRange);
    }

    // Draw axis labels
    this.drawAxisLabels(chartWidth, chartHeight, minValue, maxValue);
  }

  drawGrid(chartWidth, chartHeight, minValue, maxValue) {
    const { ctx, options, height } = this;
    const { padding, colors } = options;

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;

    // Horizontal grid lines
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }
  }

  drawLine(chartWidth, chartHeight, minValue, valueRange) {
    const { ctx, data, options, animationProgress } = this;
    const { padding, colors } = options;

    const points = data.map((d, i) => ({
      x: padding.left + (i / (data.length - 1)) * chartWidth,
      y: padding.top + chartHeight - ((d.value - minValue) / valueRange) * chartHeight
    }));

    // Animate drawing
    const visiblePoints = Math.floor(points.length * animationProgress);

    // Draw fill gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
    gradient.addColorStop(0, colors.fill);
    gradient.addColorStop(1, 'rgba(255, 46, 151, 0)');

    ctx.beginPath();
    ctx.moveTo(points[0].x, padding.top + chartHeight);
    
    if (options.smooth && visiblePoints > 2) {
      this.drawSmoothLine(points.slice(0, visiblePoints));
    } else {
      points.slice(0, visiblePoints).forEach((p, i) => {
        if (i === 0) ctx.lineTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
    }

    if (visiblePoints > 0) {
      ctx.lineTo(points[visiblePoints - 1].x, padding.top + chartHeight);
    }
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    if (options.smooth && visiblePoints > 2) {
      ctx.moveTo(points[0].x, points[0].y);
      this.drawSmoothLine(points.slice(0, visiblePoints));
    } else {
      points.slice(0, visiblePoints).forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
    }
    
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Glow effect
    ctx.shadowColor = colors.line;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw points
    if (options.showPoints) {
      points.slice(0, visiblePoints).forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = colors.line;
        ctx.fill();
      });
    }
  }

  drawSmoothLine(points) {
    const { ctx } = this;
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
    }
  }

  drawArea(chartWidth, chartHeight, minValue, valueRange) {
    this.drawLine(chartWidth, chartHeight, minValue, valueRange);
  }

  drawBars(chartWidth, chartHeight, minValue, valueRange) {
    const { ctx, data, options, animationProgress } = this;
    const { padding, colors } = options;

    const barWidth = (chartWidth / data.length) * 0.8;
    const gap = (chartWidth / data.length) * 0.2;

    data.forEach((d, i) => {
      const barHeight = ((d.value - minValue) / valueRange) * chartHeight * animationProgress;
      const x = padding.left + i * (barWidth + gap) + gap / 2;
      const y = padding.top + chartHeight - barHeight;

      // Bar gradient
      const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
      gradient.addColorStop(0, colors.line);
      gradient.addColorStop(1, Utils.hexToRgba(colors.line, 0.3));

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
      ctx.fill();
    });
  }

  drawAxisLabels(chartWidth, chartHeight, minValue, maxValue) {
    const { ctx, options, data } = this;
    const { padding, colors } = options;

    ctx.fillStyle = colors.text;
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'right';

    // Y-axis labels
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const value = maxValue - ((maxValue - minValue) / gridLines) * i;
      const y = padding.top + (chartHeight / gridLines) * i;
      ctx.fillText(value.toFixed(1), padding.left - 8, y + 4);
    }

    // X-axis labels (time)
    ctx.textAlign = 'center';
    const labelCount = 5;
    for (let i = 0; i < labelCount; i++) {
      const index = Math.floor((data.length - 1) * (i / (labelCount - 1)));
      if (data[index]) {
        const x = padding.left + (index / (data.length - 1)) * chartWidth;
        const date = new Date(data[index].timestamp);
        const label = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        ctx.fillText(label, x, padding.top + chartHeight + 20);
      }
    }
  }

  handleHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const { padding } = this.options;
    const chartWidth = this.width - padding.left - padding.right;
    
    if (x >= padding.left && x <= padding.left + chartWidth) {
      const index = Math.round(((x - padding.left) / chartWidth) * (this.data.length - 1));
      if (this.data[index]) {
        this.showTooltip(x, y, this.data[index]);
      }
    }
  }

  showTooltip(x, y, data) {
    let tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = 'chart-tooltip';
      tooltip.style.cssText = `
        position: fixed;
        padding: 8px 12px;
        background: var(--bg-elevated);
        border: 1px solid var(--border-default);
        border-radius: 6px;
        font-size: 12px;
        pointer-events: none;
        z-index: 1000;
        box-shadow: var(--shadow-lg);
      `;
      document.body.appendChild(tooltip);
    }

    const rect = this.canvas.getBoundingClientRect();
    tooltip.innerHTML = `
      <div style="color: var(--text-tertiary); margin-bottom: 4px;">
        ${new Date(data.timestamp).toLocaleTimeString()}
      </div>
      <div style="color: var(--accent-primary); font-weight: 600;">
        ${data.value.toFixed(2)}
      </div>
    `;
    tooltip.style.left = (rect.left + x + 10) + 'px';
    tooltip.style.top = (rect.top + y - 10) + 'px';
    tooltip.style.display = 'block';
  }

  hideTooltip() {
    const tooltip = document.getElementById('chart-tooltip');
    if (tooltip) tooltip.style.display = 'none';
  }

  destroy() {
    window.removeEventListener('resize', this.handleResize);
  }
}

// Sparkline - mini inline chart
class Sparkline {
  constructor(canvas, data, color = '#FF2E97') {
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
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    if (data.length < 2) return;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - ((v - min) / range) * height * 0.8 - height * 0.1
    }));

    // Draw gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, Utils.hexToRgba(color, 0.3));
    gradient.addColorStop(1, Utils.hexToRgba(color, 0));

    ctx.beginPath();
    ctx.moveTo(0, height);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

window.CerebroChart = CerebroChart;
window.Sparkline = Sparkline;
