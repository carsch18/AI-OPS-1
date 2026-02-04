/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Modal & Dialog Components
   Modal dialogs, drawers, and confirmation dialogs
   ═══════════════════════════════════════════════════════════════════════════════ */

import { icons } from '../../lib/html';
import { button } from './common';

// ─────────────────────────────────────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────────────────────────────────────

interface ModalOptions {
  id: string;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closable?: boolean;
  showFooter?: boolean;
  primaryAction?: { label: string; onclick: string; variant?: string };
  secondaryAction?: { label: string; onclick: string };
}

export function modal(content: string, options: ModalOptions): string {
  const {
    id,
    title,
    size = 'md',
    closable = true,
    showFooter = true,
    primaryAction,
    secondaryAction
  } = options;

  return `
    <div class="modal-backdrop" id="${id}-backdrop" onclick="Modals.close('${id}')"></div>
    <div class="modal modal-${size}" id="${id}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="modal-header">
        <h2 class="modal-title" id="${id}-title">${title}</h2>
        ${closable ? `
          <button class="modal-close" onclick="Modals.close('${id}')" aria-label="Close">
            ${icons.x}
          </button>
        ` : ''}
      </div>
      <div class="modal-body">
        ${content}
      </div>
      ${showFooter ? `
        <div class="modal-footer">
          ${secondaryAction ? button(secondaryAction.label, { 
            variant: 'secondary', 
            onclick: secondaryAction.onclick 
          }) : ''}
          ${primaryAction ? button(primaryAction.label, { 
            variant: (primaryAction.variant || 'primary') as any, 
            onclick: primaryAction.onclick 
          }) : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIRM DIALOG
// ─────────────────────────────────────────────────────────────────────────────

export function confirmDialog(options: {
  id: string;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  onConfirm: string;
  onCancel?: string;
}): string {
  const {
    id,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    variant = 'primary',
    onConfirm,
    onCancel = `Modals.close('${id}')`
  } = options;

  const iconMap = {
    danger: `<div class="confirm-icon danger">⚠️</div>`,
    warning: `<div class="confirm-icon warning">⚡</div>`,
    primary: `<div class="confirm-icon primary">❓</div>`
  };

  return modal(`
    <div class="confirm-content">
      ${iconMap[variant]}
      <p class="confirm-message">${message}</p>
    </div>
  `, {
    id,
    title,
    size: 'sm',
    primaryAction: { label: confirmLabel, onclick: onConfirm, variant },
    secondaryAction: { label: cancelLabel, onclick: onCancel }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAWER (Slide-out panel)
// ─────────────────────────────────────────────────────────────────────────────

export function drawer(content: string, options: {
  id: string;
  title: string;
  position?: 'left' | 'right';
  size?: 'sm' | 'md' | 'lg';
  showFooter?: boolean;
  footerContent?: string;
}): string {
  const {
    id,
    title,
    position = 'right',
    size = 'md',
    showFooter = false,
    footerContent
  } = options;

  return `
    <div class="drawer-backdrop" id="${id}-backdrop" onclick="Drawers.close('${id}')"></div>
    <div class="drawer drawer-${position} drawer-${size}" id="${id}">
      <div class="drawer-header">
        <h2 class="drawer-title">${title}</h2>
        <button class="drawer-close" onclick="Drawers.close('${id}')" aria-label="Close">
          ${icons.x}
        </button>
      </div>
      <div class="drawer-body">
        ${content}
      </div>
      ${showFooter ? `
        <div class="drawer-footer">
          ${footerContent || ''}
        </div>
      ` : ''}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// DROPDOWN MENU
// ─────────────────────────────────────────────────────────────────────────────

interface DropdownItem {
  type: 'item' | 'divider' | 'header';
  label?: string;
  icon?: string;
  onclick?: string;
  href?: string;
  disabled?: boolean;
  variant?: 'danger';
}

export function dropdown(trigger: string, items: DropdownItem[], options: {
  id: string;
  align?: 'left' | 'right';
  width?: string;
}): string {
  const { id, align = 'left', width = '180px' } = options;

  return `
    <div class="dropdown" id="${id}">
      <div class="dropdown-trigger" onclick="Dropdowns.toggle('${id}')">
        ${trigger}
      </div>
      <div class="dropdown-menu dropdown-${align}" style="min-width: ${width};">
        ${items.map(item => {
          if (item.type === 'divider') return `<div class="dropdown-divider"></div>`;
          if (item.type === 'header') return `<div class="dropdown-header">${item.label}</div>`;
          return `
            <${item.href ? 'a' : 'button'} 
              class="dropdown-item ${item.disabled ? 'disabled' : ''} ${item.variant ? `item-${item.variant}` : ''}"
              ${item.href ? `href="${item.href}"` : ''}
              ${item.onclick ? `onclick="${item.onclick}; Dropdowns.close('${id}')"` : ''}
              ${item.disabled ? 'disabled' : ''}
            >
              ${item.icon ? `<span class="dropdown-icon">${item.icon}</span>` : ''}
              <span class="dropdown-label">${item.label}</span>
            </${item.href ? 'a' : 'button'}>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// POPOVER
// ─────────────────────────────────────────────────────────────────────────────

export function popover(trigger: string, content: string, options: {
  id: string;
  title?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  trigger?: 'click' | 'hover';
}): string {
  const { id, title, position = 'bottom', trigger: triggerType = 'click' } = options;

  const triggerEvent = triggerType === 'hover' 
    ? `onmouseenter="Popovers.show('${id}')" onmouseleave="Popovers.hide('${id}')"`
    : `onclick="Popovers.toggle('${id}')"`;

  return `
    <div class="popover-wrapper" id="${id}-wrapper">
      <div class="popover-trigger" ${triggerEvent}>
        ${trigger}
      </div>
      <div class="popover popover-${position}" id="${id}">
        ${title ? `<div class="popover-header">${title}</div>` : ''}
        <div class="popover-body">${content}</div>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLTIP
// ─────────────────────────────────────────────────────────────────────────────

export function tooltip(content: string, text: string, position: 'top' | 'bottom' | 'left' | 'right' = 'top'): string {
  return `
    <span class="tooltip-wrapper" data-tooltip="${text}" data-position="${position}">
      ${content}
    </span>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMMAND PALETTE
// ─────────────────────────────────────────────────────────────────────────────

interface CommandItem {
  id: string;
  icon?: string;
  label: string;
  shortcut?: string;
  category?: string;
  action: string;
}

export function commandPalette(commands: CommandItem[]): string {
  // Group commands by category
  const grouped = commands.reduce((acc, cmd) => {
    const cat = cmd.category || 'Actions';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(cmd);
    return acc;
  }, {} as Record<string, CommandItem[]>);

  return `
    <div class="command-palette-backdrop" id="command-palette-backdrop" onclick="CommandPalette.close()"></div>
    <div class="command-palette" id="command-palette">
      <div class="command-input-wrapper">
        <span class="command-input-icon">${icons.search}</span>
        <input 
          type="text" 
          class="command-input" 
          id="command-input"
          placeholder="Type a command or search..."
          autocomplete="off"
          autofocus
        >
        <kbd class="command-shortcut">ESC</kbd>
      </div>
      <div class="command-list" id="command-list">
        ${Object.entries(grouped).map(([category, items]) => `
          <div class="command-category">
            <div class="command-category-label">${category}</div>
            ${items.map(cmd => `
              <button 
                class="command-item" 
                data-command="${cmd.id}"
                onclick="${cmd.action}; CommandPalette.close()"
              >
                ${cmd.icon ? `<span class="command-item-icon">${cmd.icon}</span>` : ''}
                <span class="command-item-label">${cmd.label}</span>
                ${cmd.shortcut ? `<kbd class="command-item-shortcut">${cmd.shortcut}</kbd>` : ''}
              </button>
            `).join('')}
          </div>
        `).join('')}
      </div>
      <div class="command-footer">
        <span><kbd>↑↓</kbd> to navigate</span>
        <span><kbd>↵</kbd> to select</span>
        <span><kbd>ESC</kbd> to close</span>
      </div>
    </div>
  `;
}
