/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - CSS Variables
   Design tokens for the Dark Ops theme (Pitch Black + Neon Pink)
   ═══════════════════════════════════════════════════════════════════════════════ */

export const cssVariables = `
/* ═══════════════════════════════════════════════════════════════════════════════
   CSS CUSTOM PROPERTIES - CEREBRO DARK OPS THEME
   ═══════════════════════════════════════════════════════════════════════════════ */

:root {
  /* ─────────────────────────────────────────────────────────────────────────────
     COLORS - BACKGROUNDS
     ───────────────────────────────────────────────────────────────────────────── */
  --bg-primary: #000000;
  --bg-secondary: #0A0A0F;
  --bg-tertiary: #0F0F17;
  --bg-elevated: #12121A;
  --bg-hover: #1A1A24;
  --bg-active: #22222E;
  --bg-overlay: rgba(0, 0, 0, 0.85);

  /* ─────────────────────────────────────────────────────────────────────────────
     COLORS - PINK SPECTRUM (PRIMARY ACCENT)
     ───────────────────────────────────────────────────────────────────────────── */
  --pink-50: #FFF0F6;
  --pink-100: #FFD6E8;
  --pink-200: #FFADD2;
  --pink-300: #FF85BA;
  --pink-400: #FF4D9E;
  --pink-500: #FF0080;
  --pink-600: #DB006D;
  --pink-700: #B7005B;
  --pink-800: #930049;
  --pink-900: #6F0037;

  /* ─────────────────────────────────────────────────────────────────────────────
     COLORS - ACCENT
     ───────────────────────────────────────────────────────────────────────────── */
  --accent-primary: #FF0080;
  --accent-primary-hover: #FF339D;
  --accent-primary-active: #DB006D;
  --accent-secondary: #FF66B2;
  --accent-glow: rgba(255, 0, 128, 0.5);
  --accent-glow-strong: rgba(255, 0, 128, 0.7);
  --accent-subtle: rgba(255, 0, 128, 0.15);
  --accent-muted: rgba(255, 0, 128, 0.08);

  /* ─────────────────────────────────────────────────────────────────────────────
     COLORS - SEMANTIC
     ───────────────────────────────────────────────────────────────────────────── */
  --color-success: #00FFAA;
  --color-success-hover: #33FFBB;
  --color-success-bg: rgba(0, 255, 170, 0.15);
  --color-success-glow: rgba(0, 255, 170, 0.5);

  --color-warning: #FFAA00;
  --color-warning-hover: #FFBB33;
  --color-warning-bg: rgba(255, 170, 0, 0.15);
  --color-warning-glow: rgba(255, 170, 0, 0.5);

  --color-error: #FF3366;
  --color-error-hover: #FF5580;
  --color-error-bg: rgba(255, 51, 102, 0.15);
  --color-error-glow: rgba(255, 51, 102, 0.5);

  --color-info: #00D4FF;
  --color-info-hover: #33DDFF;
  --color-info-bg: rgba(0, 212, 255, 0.15);
  --color-info-glow: rgba(0, 212, 255, 0.5);

  /* ─────────────────────────────────────────────────────────────────────────────
     COLORS - TEXT
     ───────────────────────────────────────────────────────────────────────────── */
  --text-primary: #FFFFFF;
  --text-secondary: #A0A0B0;
  --text-tertiary: #606070;
  --text-muted: #404050;
  --text-inverse: #000000;

  /* ─────────────────────────────────────────────────────────────────────────────
     COLORS - BORDERS
     ───────────────────────────────────────────────────────────────────────────── */
  --border-subtle: rgba(255, 255, 255, 0.06);
  --border-default: rgba(255, 255, 255, 0.1);
  --border-strong: rgba(255, 255, 255, 0.2);
  --border-accent: var(--accent-primary);

  /* ─────────────────────────────────────────────────────────────────────────────
     COLORS - CHARTS
     ───────────────────────────────────────────────────────────────────────────── */
  --chart-pink: #FF0080;
  --chart-cyan: #00FFAA;
  --chart-yellow: #FFAA00;
  --chart-orange: #FF6B35;
  --chart-purple: #A855F7;
  --chart-blue: #00D4FF;
  --chart-red: #FF3366;
  --chart-green: #22C55E;
  --chart-grid: rgba(255, 255, 255, 0.04);

  /* ─────────────────────────────────────────────────────────────────────────────
     TYPOGRAPHY
     ───────────────────────────────────────────────────────────────────────────── */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace;

  --text-xs: 0.6875rem;
  --text-sm: 0.75rem;
  --text-base: 0.875rem;
  --text-lg: 1rem;
  --text-xl: 1.125rem;
  --text-2xl: 1.25rem;
  --text-3xl: 1.5rem;
  --text-4xl: 2rem;
  --text-5xl: 2.5rem;

  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  --leading-none: 1;
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;

  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
  --tracking-wider: 0.05em;
  --tracking-widest: 0.1em;

  /* ─────────────────────────────────────────────────────────────────────────────
     SPACING
     ───────────────────────────────────────────────────────────────────────────── */
  --space-0: 0;
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;
  --space-20: 5rem;

  /* ─────────────────────────────────────────────────────────────────────────────
     BORDERS & RADIUS
     ───────────────────────────────────────────────────────────────────────────── */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-2xl: 16px;
  --radius-full: 9999px;

  /* ─────────────────────────────────────────────────────────────────────────────
     SHADOWS
     ───────────────────────────────────────────────────────────────────────────── */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.5);
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.6), 0 2px 4px -1px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 10px 15px -3px rgba(0, 0, 0, 0.6), 0 4px 6px -2px rgba(0, 0, 0, 0.4);
  --shadow-xl: 0 20px 25px -5px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.4);
  --shadow-glow: 0 0 30px var(--accent-glow);
  --shadow-glow-strong: 0 0 50px var(--accent-glow-strong);
  --shadow-glow-success: 0 0 20px var(--color-success-glow);
  --shadow-glow-error: 0 0 20px var(--color-error-glow);
  --shadow-inset: inset 0 2px 4px rgba(0, 0, 0, 0.4);

  /* ─────────────────────────────────────────────────────────────────────────────
     TRANSITIONS
     ───────────────────────────────────────────────────────────────────────────── */
  --transition-fast: 100ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;
  --transition-slower: 500ms ease;
  --ease-out: cubic-bezier(0, 0, 0.2, 1);
  --ease-in: cubic-bezier(0.4, 0, 1, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

  /* ─────────────────────────────────────────────────────────────────────────────
     Z-INDEX
     ───────────────────────────────────────────────────────────────────────────── */
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-fixed: 300;
  --z-modal-backdrop: 400;
  --z-modal: 500;
  --z-popover: 600;
  --z-tooltip: 700;
  --z-toast: 800;
  --z-max: 9999;

  /* ─────────────────────────────────────────────────────────────────────────────
     LAYOUT
     ───────────────────────────────────────────────────────────────────────────── */
  --sidebar-width: 240px;
  --sidebar-collapsed: 64px;
  --header-height: 56px;
  --chat-width: 400px;
  --max-content-width: 1600px;
}
`;
