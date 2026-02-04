/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Typography
   Font imports and text styling
   ═══════════════════════════════════════════════════════════════════════════════ */

export const cssTypography = `
/* ═══════════════════════════════════════════════════════════════════════════════
   TYPOGRAPHY
   ═══════════════════════════════════════════════════════════════════════════════ */

/* Font imports */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* Headings */
h1, h2, h3, h4, h5, h6 {
  font-weight: var(--font-semibold);
  line-height: var(--leading-tight);
  color: var(--text-primary);
}

h1 { font-size: var(--text-4xl); }
h2 { font-size: var(--text-3xl); }
h3 { font-size: var(--text-2xl); }
h4 { font-size: var(--text-xl); }
h5 { font-size: var(--text-lg); }
h6 { font-size: var(--text-base); }

/* Paragraphs */
p {
  color: var(--text-secondary);
  line-height: var(--leading-relaxed);
}

/* Links */
a {
  color: var(--accent-primary);
  transition: color var(--transition-fast);
}

a:hover {
  color: var(--accent-primary-hover);
}

/* Code */
code, pre {
  font-family: var(--font-mono);
  font-size: 0.9em;
}

code {
  padding: 0.125em 0.375em;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  color: var(--accent-primary);
}

pre {
  padding: var(--space-4);
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  overflow-x: auto;
}

pre code {
  padding: 0;
  background: none;
  color: inherit;
}

/* Small text */
small {
  font-size: var(--text-xs);
  color: var(--text-tertiary);
}

/* Labels */
label {
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--text-secondary);
}

/* Utility classes */
.text-xs { font-size: var(--text-xs); }
.text-sm { font-size: var(--text-sm); }
.text-base { font-size: var(--text-base); }
.text-lg { font-size: var(--text-lg); }
.text-xl { font-size: var(--text-xl); }
.text-2xl { font-size: var(--text-2xl); }
.text-3xl { font-size: var(--text-3xl); }
.text-4xl { font-size: var(--text-4xl); }

.font-normal { font-weight: var(--font-normal); }
.font-medium { font-weight: var(--font-medium); }
.font-semibold { font-weight: var(--font-semibold); }
.font-bold { font-weight: var(--font-bold); }

.font-mono { font-family: var(--font-mono); }

.text-primary { color: var(--text-primary); }
.text-secondary { color: var(--text-secondary); }
.text-tertiary { color: var(--text-tertiary); }
.text-muted { color: var(--text-muted); }
.text-pink { color: var(--accent-primary); }
.text-success { color: var(--color-success); }
.text-warning { color: var(--color-warning); }
.text-error { color: var(--color-error); }
.text-info { color: var(--color-info); }

.uppercase { text-transform: uppercase; }
.capitalize { text-transform: capitalize; }
.tracking-wide { letter-spacing: var(--tracking-wide); }
.tracking-wider { letter-spacing: var(--tracking-wider); }
.tracking-widest { letter-spacing: var(--tracking-widest); }

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Gradient text */
.text-gradient {
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

/* Glow text */
.text-glow {
  text-shadow: 0 0 20px var(--accent-glow);
}
`;
