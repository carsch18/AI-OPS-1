/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Table Components
   Data tables with sorting, pagination, and actions
   ═══════════════════════════════════════════════════════════════════════════════ */

import { icons } from '../../lib/html';
import { badge } from './common';

// ─────────────────────────────────────────────────────────────────────────────
// TABLE TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
  width?: string;
  render?: (value: any, row: any) => string;
}

interface TableOptions {
  id?: string;
  striped?: boolean;
  hoverable?: boolean;
  compact?: boolean;
  bordered?: boolean;
  stickyHeader?: boolean;
  emptyMessage?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA TABLE
// ─────────────────────────────────────────────────────────────────────────────

export function dataTable(
  columns: Column[],
  data: any[],
  options: TableOptions = {}
): string {
  const {
    id,
    striped = false,
    hoverable = true,
    compact = false,
    bordered = false,
    stickyHeader = false,
    emptyMessage = 'No data available'
  } = options;

  const tableClasses = [
    'data-table',
    striped ? 'table-striped' : '',
    hoverable ? 'table-hoverable' : '',
    compact ? 'table-compact' : '',
    bordered ? 'table-bordered' : '',
    stickyHeader ? 'table-sticky-header' : ''
  ].filter(Boolean).join(' ');

  if (data.length === 0) {
    return `
      <div class="table-empty">
        <div class="table-empty-icon">📋</div>
        <div class="table-empty-text">${emptyMessage}</div>
      </div>
    `;
  }

  return `
    <div class="table-container" ${id ? `id="${id}"` : ''}>
      <table class="${tableClasses}">
        <thead>
          <tr>
            ${columns.map(col => `
              <th 
                class="table-th ${col.sortable ? 'sortable' : ''}" 
                style="${col.width ? `width: ${col.width};` : ''} text-align: ${col.align || 'left'};"
                ${col.sortable ? `data-sort="${col.key}"` : ''}
              >
                <span class="th-content">
                  ${col.label}
                  ${col.sortable ? `<span class="sort-icon">${icons.chevronRight}</span>` : ''}
                </span>
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
          ${data.map((row, idx) => `
            <tr data-row="${idx}">
              ${columns.map(col => `
                <td style="text-align: ${col.align || 'left'};">
                  ${col.render ? col.render(row[col.key], row) : row[col.key] ?? '-'}
                </td>
              `).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABLE PAGINATION
// ─────────────────────────────────────────────────────────────────────────────

export function tablePagination(options: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange?: string;
}): string {
  const { currentPage, totalPages, totalItems, itemsPerPage, onPageChange } = options;
  const start = (currentPage - 1) * itemsPerPage + 1;
  const end = Math.min(currentPage * itemsPerPage, totalItems);

  const pages: (number | string)[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return `
    <div class="table-pagination">
      <div class="pagination-info">
        Showing <strong>${start}</strong> to <strong>${end}</strong> of <strong>${totalItems}</strong> results
      </div>
      <div class="pagination-controls">
        <button 
          class="pagination-btn" 
          ${currentPage === 1 ? 'disabled' : ''}
          ${onPageChange ? `onclick="${onPageChange}(${currentPage - 1})"` : ''}
        >
          ← Prev
        </button>
        ${pages.map(p => p === '...' 
          ? `<span class="pagination-ellipsis">...</span>`
          : `<button class="pagination-btn ${p === currentPage ? 'active' : ''}" ${onPageChange ? `onclick="${onPageChange}(${p})"` : ''}>${p}</button>`
        ).join('')}
        <button 
          class="pagination-btn"
          ${currentPage === totalPages ? 'disabled' : ''}
          ${onPageChange ? `onclick="${onPageChange}(${currentPage + 1})"` : ''}
        >
          Next →
        </button>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// CELL RENDERERS
// ─────────────────────────────────────────────────────────────────────────────

export const cellRenderers = {
  status: (value: string) => {
    const statusMap: Record<string, { variant: string; label: string }> = {
      healthy: { variant: 'success', label: 'Healthy' },
      running: { variant: 'success', label: 'Running' },
      active: { variant: 'success', label: 'Active' },
      warning: { variant: 'warning', label: 'Warning' },
      degraded: { variant: 'warning', label: 'Degraded' },
      critical: { variant: 'danger', label: 'Critical' },
      error: { variant: 'danger', label: 'Error' },
      stopped: { variant: 'default', label: 'Stopped' },
      pending: { variant: 'info', label: 'Pending' }
    };
    const status = statusMap[value.toLowerCase()] || { variant: 'default', label: value };
    return badge(status.label, { variant: status.variant as any, dot: true, size: 'sm' });
  },

  timestamp: (value: number | string) => {
    const date = new Date(value);
    return `<span class="cell-timestamp" title="${date.toISOString()}">${date.toLocaleString()}</span>`;
  },

  relativeTime: (value: number) => {
    const now = Date.now();
    const diff = now - value;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    let text: string;
    if (minutes < 60) text = `${minutes}m ago`;
    else if (hours < 24) text = `${hours}h ago`;
    else text = `${days}d ago`;
    
    return `<span class="cell-relative-time">${text}</span>`;
  },

  number: (value: number) => {
    return `<span class="cell-number font-mono">${value.toLocaleString()}</span>`;
  },

  percent: (value: number) => {
    const color = value >= 90 ? 'var(--color-error)' : value >= 70 ? 'var(--color-warning)' : 'var(--text-secondary)';
    return `<span class="cell-percent font-mono" style="color: ${color};">${value.toFixed(1)}%</span>`;
  },

  duration: (ms: number) => {
    if (ms < 1000) return `<span class="cell-duration font-mono">${ms}ms</span>`;
    return `<span class="cell-duration font-mono">${(ms / 1000).toFixed(2)}s</span>`;
  },

  code: (value: string) => {
    return `<code class="cell-code">${value}</code>`;
  },

  link: (value: string, href: string) => {
    return `<a href="${href}" class="cell-link">${value}</a>`;
  },

  actions: (actions: { icon: string; label: string; onclick: string; variant?: string }[]) => {
    return `
      <div class="cell-actions">
        ${actions.map(a => `
          <button 
            class="cell-action-btn ${a.variant ? `action-${a.variant}` : ''}" 
            onclick="${a.onclick}"
            title="${a.label}"
          >
            ${a.icon}
          </button>
        `).join('')}
      </div>
    `;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STATS TABLE (Key-Value pairs)
// ─────────────────────────────────────────────────────────────────────────────

export function statsTable(stats: { label: string; value: string; trend?: 'up' | 'down' | 'neutral' }[]): string {
  return `
    <div class="stats-table">
      ${stats.map(s => `
        <div class="stats-row">
          <span class="stats-label">${s.label}</span>
          <span class="stats-value ${s.trend ? `trend-${s.trend}` : ''}">
            ${s.trend === 'up' ? '↑ ' : s.trend === 'down' ? '↓ ' : ''}
            ${s.value}
          </span>
        </div>
      `).join('')}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST TABLE (Simple list with icons)
// ─────────────────────────────────────────────────────────────────────────────

export function listTable(items: {
  icon?: string;
  title: string;
  subtitle?: string;
  badge?: { text: string; variant: string };
  actions?: string;
}[]): string {
  return `
    <div class="list-table">
      ${items.map(item => `
        <div class="list-item">
          ${item.icon ? `<div class="list-icon">${item.icon}</div>` : ''}
          <div class="list-content">
            <div class="list-title">${item.title}</div>
            ${item.subtitle ? `<div class="list-subtitle">${item.subtitle}</div>` : ''}
          </div>
          ${item.badge ? badge(item.badge.text, { variant: item.badge.variant as any, size: 'sm' }) : ''}
          ${item.actions ? `<div class="list-actions">${item.actions}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}
