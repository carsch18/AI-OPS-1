/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Layout Template
   Main HTML layout wrapper with sidebar, header, and content area
   ═══════════════════════════════════════════════════════════════════════════════ */

import { config } from '../config';
import { generateCSS } from '../styles';
import { icons } from '../lib/html';
import { sidebar } from './components/sidebar';
import { header } from './components/header';
import { clientScripts } from '../scripts';

interface LayoutOptions {
  title: string;
  page: string;
  content: string;
}

export function layout({ title, page, content }: LayoutOptions): string {
  const css = generateCSS();
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="${config.appTagline}">
  <meta name="theme-color" content="#000000">
  <title>${title} - ${config.appName}</title>
  
  <!-- Favicon -->
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧠</text></svg>">
  
  <!-- Preconnect to fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  
  <!-- Inline critical CSS -->
  <style>${css}</style>
</head>
<body>
  <div class="app" id="app">
    <!-- Sidebar -->
    ${sidebar(page)}
    
    <!-- Main Content -->
    <main class="main">
      <!-- Header -->
      ${header(title)}
      
      <!-- Page Content -->
      <div class="content" id="content">
        ${content}
      </div>
    </main>
    
    <!-- Chat Panel -->
    <aside class="chat-panel" id="chat-panel">
      <div class="chat-header" style="height: var(--header-height); padding: 0 var(--space-4); display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-subtle);">
        <div style="display: flex; align-items: center; gap: var(--space-2);">
          <span class="status-dot healthy pulse"></span>
          <span style="font-weight: var(--font-semibold);">AI Assistant</span>
        </div>
        <button class="btn btn-ghost btn-icon btn-sm" id="chat-close">
          ${icons.x}
        </button>
      </div>
      <div class="chat-messages" id="chat-messages" style="flex: 1; padding: var(--space-4); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-4);">
        <!-- Chat messages will be rendered here -->
        <div class="chat-message assistant">
          <div class="avatar avatar-sm" style="background: linear-gradient(135deg, var(--accent-primary), var(--pink-600));">🧠</div>
          <div style="padding: var(--space-3) var(--space-4); background: var(--bg-tertiary); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); font-size: var(--text-sm); line-height: var(--leading-relaxed);">
            Hello! I'm <strong style="color: var(--accent-primary);">CEREBRO</strong>, your AI infrastructure assistant. I'm monitoring your systems and ready to help with any issues. What would you like to investigate?
          </div>
        </div>
      </div>
      <div style="padding: var(--space-4); border-top: 1px solid var(--border-subtle);">
        <div style="display: flex; gap: var(--space-2); background: var(--bg-primary); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: var(--space-2);">
          <textarea 
            class="chat-input" 
            id="chat-input" 
            placeholder="Ask about your infrastructure..." 
            rows="1"
            style="flex: 1; background: none; border: none; padding: var(--space-2); font-size: var(--text-sm); color: var(--text-primary); resize: none; font-family: var(--font-sans);"
          ></textarea>
          <button class="btn btn-primary btn-icon" id="chat-send" style="width: 36px; height: 36px;">
            ${icons.send}
          </button>
        </div>
        <div style="margin-top: var(--space-2); font-size: var(--text-xs); color: var(--text-muted);">
          Try: <span style="color: var(--accent-primary); cursor: pointer;" class="quick-prompt">/investigate high cpu</span> or 
          <span style="color: var(--accent-primary); cursor: pointer;" class="quick-prompt">/status api-gateway</span>
        </div>
      </div>
    </aside>
  </div>
  
  <!-- Toast Container -->
  <div class="toast-container" id="toast-container"></div>
  
  <!-- Client-side JavaScript -->
  <script>${clientScripts()}</script>
</body>
</html>`;
}
