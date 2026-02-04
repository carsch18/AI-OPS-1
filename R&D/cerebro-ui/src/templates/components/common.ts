/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Common Components
   Buttons, inputs, badges, tabs, and other base UI elements
   ═══════════════════════════════════════════════════════════════════════════════ */

import { icons } from '../../lib/html';

// ─────────────────────────────────────────────────────────────────────────────
// BUTTONS
// ─────────────────────────────────────────────────────────────────────────────

interface ButtonOptions {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  id?: string;
  className?: string;
  onclick?: string;
}

export function button(label: string, options: ButtonOptions = {}): string {
  const {
    variant = 'primary',
    size = 'md',
    icon,
    iconOnly = false,
    disabled = false,
    loading = false,
    fullWidth = false,
    id,
    className = '',
    onclick
  } = options;

  const classes = [
    'btn',
    `btn-${variant}`,
    size !== 'md' ? `btn-${size}` : '',
    iconOnly ? 'btn-icon' : '',
    fullWidth ? 'btn-full' : '',
    loading ? 'btn-loading' : '',
    className
  ].filter(Boolean).join(' ');

  return `
    <button 
      class="${classes}"
      ${id ? `id="${id}"` : ''}
      ${disabled ? 'disabled' : ''}
      ${onclick ? `onclick="${onclick}"` : ''}
    >
      ${loading ? '<span class="spinner"></span>' : ''}
      ${icon && !loading ? `<span class="btn-icon-wrapper">${icon}</span>` : ''}
      ${!iconOnly ? `<span class="btn-label">${label}</span>` : ''}
    </button>
  `;
}

export function buttonGroup(buttons: string[]): string {
  return `<div class="btn-group">${buttons.join('')}</div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// INPUTS
// ─────────────────────────────────────────────────────────────────────────────

interface InputOptions {
  type?: 'text' | 'email' | 'password' | 'number' | 'search' | 'url';
  placeholder?: string;
  value?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  icon?: string;
  error?: string;
  hint?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function input(options: InputOptions = {}): string {
  const {
    type = 'text',
    placeholder = '',
    value = '',
    id,
    name,
    disabled = false,
    required = false,
    icon,
    error,
    hint,
    size = 'md'
  } = options;

  const hasIcon = !!icon;
  const hasError = !!error;

  return `
    <div class="input-wrapper ${hasError ? 'has-error' : ''} ${hasIcon ? 'has-icon' : ''}">
      ${hasIcon ? `<span class="input-icon">${icon}</span>` : ''}
      <input 
        type="${type}"
        class="input input-${size}"
        placeholder="${placeholder}"
        value="${value}"
        ${id ? `id="${id}"` : ''}
        ${name ? `name="${name}"` : ''}
        ${disabled ? 'disabled' : ''}
        ${required ? 'required' : ''}
      >
      ${hasError ? `<span class="input-error">${error}</span>` : ''}
      ${hint && !hasError ? `<span class="input-hint">${hint}</span>` : ''}
    </div>
  `;
}

export function textarea(options: { 
  placeholder?: string; 
  value?: string; 
  id?: string; 
  rows?: number;
  resize?: boolean;
}): string {
  const { placeholder = '', value = '', id, rows = 3, resize = true } = options;
  return `
    <textarea 
      class="textarea ${!resize ? 'no-resize' : ''}"
      placeholder="${placeholder}"
      rows="${rows}"
      ${id ? `id="${id}"` : ''}
    >${value}</textarea>
  `;
}

export function select(options: {
  options: { value: string; label: string; selected?: boolean }[];
  id?: string;
  placeholder?: string;
}): string {
  const { options: opts, id, placeholder } = options;
  return `
    <select class="select" ${id ? `id="${id}"` : ''}>
      ${placeholder ? `<option value="" disabled selected>${placeholder}</option>` : ''}
      ${opts.map(o => `<option value="${o.value}" ${o.selected ? 'selected' : ''}>${o.label}</option>`).join('')}
    </select>
  `;
}

export function checkbox(options: {
  label: string;
  id?: string;
  checked?: boolean;
  disabled?: boolean;
}): string {
  const { label, id, checked = false, disabled = false } = options;
  return `
    <label class="checkbox-wrapper">
      <input type="checkbox" class="checkbox" ${id ? `id="${id}"` : ''} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span class="checkbox-mark"></span>
      <span class="checkbox-label">${label}</span>
    </label>
  `;
}

export function toggle(options: {
  label?: string;
  id?: string;
  checked?: boolean;
  disabled?: boolean;
}): string {
  const { label, id, checked = false, disabled = false } = options;
  return `
    <label class="toggle-wrapper">
      <input type="checkbox" class="toggle-input" ${id ? `id="${id}"` : ''} ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
      <span class="toggle-track">
        <span class="toggle-thumb"></span>
      </span>
      ${label ? `<span class="toggle-label">${label}</span>` : ''}
    </label>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGES & TAGS
// ─────────────────────────────────────────────────────────────────────────────

interface BadgeOptions {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  size?: 'sm' | 'md';
  dot?: boolean;
  pulse?: boolean;
}

export function badge(text: string, options: BadgeOptions = {}): string {
  const { variant = 'default', size = 'md', dot = false, pulse = false } = options;
  return `
    <span class="badge badge-${variant} badge-${size} ${pulse ? 'badge-pulse' : ''}">
      ${dot ? `<span class="badge-dot ${pulse ? 'pulse' : ''}"></span>` : ''}
      ${text}
    </span>
  `;
}

export function tag(text: string, options: { 
  color?: string; 
  removable?: boolean;
  onclick?: string;
}): string {
  const { color, removable = false, onclick } = options;
  return `
    <span class="tag" ${color ? `style="--tag-color: ${color}"` : ''}>
      <span class="tag-text">${text}</span>
      ${removable ? `<button class="tag-remove" ${onclick ? `onclick="${onclick}"` : ''}>${icons.x}</button>` : ''}
    </span>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
  icon?: string;
  badge?: number;
  active?: boolean;
}

export function tabs(tabList: Tab[], options: { variant?: 'default' | 'pills' | 'underline' } = {}): string {
  const { variant = 'default' } = options;
  return `
    <div class="tabs tabs-${variant}" role="tablist">
      ${tabList.map(tab => `
        <button 
          class="tab ${tab.active ? 'active' : ''}" 
          role="tab"
          data-tab="${tab.id}"
          aria-selected="${tab.active ? 'true' : 'false'}"
        >
          ${tab.icon ? `<span class="tab-icon">${tab.icon}</span>` : ''}
          <span class="tab-label">${tab.label}</span>
          ${tab.badge ? `<span class="tab-badge">${tab.badge}</span>` : ''}
        </button>
      `).join('')}
    </div>
  `;
}

export function tabPanel(id: string, content: string, active: boolean = false): string {
  return `
    <div class="tab-panel ${active ? 'active' : ''}" role="tabpanel" data-panel="${id}">
      ${content}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS & LOADING
// ─────────────────────────────────────────────────────────────────────────────

export function progressBar(value: number, options: {
  max?: number;
  color?: 'pink' | 'cyan' | 'yellow' | 'red';
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  animated?: boolean;
}): string {
  const { max = 100, color = 'pink', size = 'md', showLabel = false, animated = false } = options;
  const percent = Math.min(100, (value / max) * 100);
  
  return `
    <div class="progress progress-${size}">
      <div 
        class="progress-bar progress-${color} ${animated ? 'progress-animated' : ''}" 
        style="width: ${percent}%"
        role="progressbar"
        aria-valuenow="${value}"
        aria-valuemin="0"
        aria-valuemax="${max}"
      >
        ${showLabel ? `<span class="progress-label">${percent.toFixed(0)}%</span>` : ''}
      </div>
    </div>
  `;
}

export function spinner(size: 'sm' | 'md' | 'lg' = 'md'): string {
  return `<span class="spinner spinner-${size}"></span>`;
}

export function skeleton(options: {
  width?: string;
  height?: string;
  variant?: 'text' | 'circle' | 'rect';
}): string {
  const { width = '100%', height = '20px', variant = 'text' } = options;
  return `<div class="skeleton skeleton-${variant}" style="width: ${width}; height: ${height};"></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AVATARS
// ─────────────────────────────────────────────────────────────────────────────

export function avatar(options: {
  name?: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline' | 'busy' | 'away';
}): string {
  const { name = '', src, size = 'md', status } = options;
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  
  return `
    <div class="avatar avatar-${size}">
      ${src 
        ? `<img src="${src}" alt="${name}" class="avatar-img">` 
        : `<span class="avatar-initials">${initials}</span>`
      }
      ${status ? `<span class="avatar-status avatar-status-${status}"></span>` : ''}
    </div>
  `;
}

export function avatarGroup(avatars: { name: string; src?: string }[], max: number = 4): string {
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;
  
  return `
    <div class="avatar-group">
      ${visible.map(a => avatar({ name: a.name, src: a.src, size: 'sm' })).join('')}
      ${remaining > 0 ? `<div class="avatar avatar-sm avatar-more">+${remaining}</div>` : ''}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// DIVIDERS & SPACERS
// ─────────────────────────────────────────────────────────────────────────────

export function divider(options: { label?: string; vertical?: boolean } = {}): string {
  const { label, vertical = false } = options;
  if (vertical) return `<div class="divider-vertical"></div>`;
  if (label) return `<div class="divider-with-label"><span>${label}</span></div>`;
  return `<div class="divider"></div>`;
}

export function spacer(size: 'sm' | 'md' | 'lg' | 'xl' = 'md'): string {
  return `<div class="spacer spacer-${size}"></div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

export function emptyState(options: {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onclick: string };
}): string {
  const { icon = '📭', title, description, action } = options;
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <h3 class="empty-state-title">${title}</h3>
      ${description ? `<p class="empty-state-description">${description}</p>` : ''}
      ${action ? button(action.label, { variant: 'primary', onclick: action.onclick }) : ''}
    </div>
  `;
}
