/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - CSS Reset
   Modern CSS reset for consistent cross-browser styling
   ═══════════════════════════════════════════════════════════════════════════════ */

export const cssReset = `
/* ═══════════════════════════════════════════════════════════════════════════════
   CSS RESET
   ═══════════════════════════════════════════════════════════════════════════════ */

*, *::before, *::after {
  box-sizing: border-box;
}

* {
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-text-size-adjust: 100%;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

html, body {
  height: 100%;
}

body {
  line-height: 1.5;
  font-family: var(--font-sans);
  font-size: var(--text-base);
  color: var(--text-primary);
  background: var(--bg-primary);
}

img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
}

input, button, textarea, select {
  font: inherit;
  color: inherit;
}

button {
  cursor: pointer;
  background: none;
  border: none;
}

p, h1, h2, h3, h4, h5, h6 {
  overflow-wrap: break-word;
}

a {
  color: inherit;
  text-decoration: none;
}

ul, ol {
  list-style: none;
}

table {
  border-collapse: collapse;
  border-spacing: 0;
}

/* Focus styles */
:focus {
  outline: none;
}

:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}

/* Selection */
::selection {
  background: var(--accent-primary);
  color: var(--text-primary);
}

/* Scrollbar - WebKit */
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--bg-secondary);
}

::-webkit-scrollbar-thumb {
  background: var(--bg-hover);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--bg-active);
}

/* Scrollbar - Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--bg-hover) var(--bg-secondary);
}

/* Remove number input spinners */
input[type="number"]::-webkit-inner-spin-button,
input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

input[type="number"] {
  -moz-appearance: textfield;
}

/* Remove search input clear button */
input[type="search"]::-webkit-search-cancel-button {
  -webkit-appearance: none;
}

/* Placeholder styling */
::placeholder {
  color: var(--text-muted);
  opacity: 1;
}
`;
