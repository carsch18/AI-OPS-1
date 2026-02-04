/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Styles Index
   Aggregates all CSS modules into a single stylesheet
   ═══════════════════════════════════════════════════════════════════════════════ */

import { cssVariables } from './variables';
import { cssReset } from './reset';
import { cssTypography } from './typography';
import { cssLayout } from './layout';
import { cssComponents } from './components';
import { cssAnimations } from './animations';

export function generateCSS(): string {
  return `
${cssVariables}
${cssReset}
${cssTypography}
${cssLayout}
${cssComponents}
${cssAnimations}
  `.trim();
}

export { cssVariables, cssReset, cssTypography, cssLayout, cssComponents, cssAnimations };
