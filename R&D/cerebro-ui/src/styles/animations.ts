/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Animations
   Keyframes and transition effects
   ═══════════════════════════════════════════════════════════════════════════════ */

export const cssAnimations = `
/* ═══════════════════════════════════════════════════════════════════════════════
   ANIMATIONS
   ═══════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────
   KEYFRAMES
   ───────────────────────────────────────────────────────────────────────────── */

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes slideIn {
  from { 
    transform: translateX(100%); 
    opacity: 0; 
  }
  to { 
    transform: translateX(0); 
    opacity: 1; 
  }
}

@keyframes slideOut {
  from { 
    transform: translateX(0); 
    opacity: 1; 
  }
  to { 
    transform: translateX(100%); 
    opacity: 0; 
  }
}

@keyframes slideUp {
  from { 
    transform: translateY(20px); 
    opacity: 0; 
  }
  to { 
    transform: translateY(0); 
    opacity: 1; 
  }
}

@keyframes slideDown {
  from { 
    transform: translateY(-20px); 
    opacity: 0; 
  }
  to { 
    transform: translateY(0); 
    opacity: 1; 
  }
}

@keyframes modalIn {
  from { 
    opacity: 0; 
    transform: translate(-50%, -48%) scale(0.96); 
  }
  to { 
    opacity: 1; 
    transform: translate(-50%, -50%) scale(1); 
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes pulse {
  0%, 100% { 
    opacity: 1; 
    transform: scale(1); 
  }
  50% { 
    opacity: 0.6; 
    transform: scale(1.15); 
  }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes glow {
  0%, 100% {
    box-shadow: 0 0 20px var(--accent-glow);
  }
  50% {
    box-shadow: 0 0 40px var(--accent-glow-strong);
  }
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}

@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

@keyframes shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

@keyframes typewriter {
  from { width: 0; }
  to { width: 100%; }
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

@keyframes chartDraw {
  from { stroke-dashoffset: 1000; }
  to { stroke-dashoffset: 0; }
}

@keyframes progressBar {
  from { width: 0; }
}

@keyframes ripple {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
   ANIMATION UTILITIES
   ───────────────────────────────────────────────────────────────────────────── */

.animate-fade-in { animation: fadeIn 0.3s ease; }
.animate-fade-out { animation: fadeOut 0.3s ease; }
.animate-slide-in { animation: slideIn 0.3s ease; }
.animate-slide-out { animation: slideOut 0.3s ease; }
.animate-slide-up { animation: slideUp 0.3s ease; }
.animate-slide-down { animation: slideDown 0.3s ease; }
.animate-spin { animation: spin 1s linear infinite; }
.animate-pulse { animation: pulse 2s ease-in-out infinite; }
.animate-glow { animation: glow 2s ease-in-out infinite; }
.animate-float { animation: float 3s ease-in-out infinite; }
.animate-bounce { animation: bounce 1s ease-in-out infinite; }
.animate-shake { animation: shake 0.5s ease-in-out; }

/* Delay utilities */
.delay-100 { animation-delay: 100ms; }
.delay-200 { animation-delay: 200ms; }
.delay-300 { animation-delay: 300ms; }
.delay-500 { animation-delay: 500ms; }
.delay-1000 { animation-delay: 1000ms; }

/* Duration utilities */
.duration-fast { animation-duration: 150ms; }
.duration-normal { animation-duration: 300ms; }
.duration-slow { animation-duration: 500ms; }
.duration-slower { animation-duration: 1000ms; }

/* ─────────────────────────────────────────────────────────────────────────────
   HOVER EFFECTS
   ───────────────────────────────────────────────────────────────────────────── */

.hover-glow:hover {
  box-shadow: var(--shadow-glow);
}

.hover-lift:hover {
  transform: translateY(-2px);
}

.hover-scale:hover {
  transform: scale(1.02);
}

.hover-bright:hover {
  filter: brightness(1.1);
}

/* ─────────────────────────────────────────────────────────────────────────────
   PAGE TRANSITIONS
   ───────────────────────────────────────────────────────────────────────────── */

.page-enter {
  animation: slideUp 0.3s ease;
}

.page-exit {
  animation: fadeOut 0.2s ease;
}

/* ─────────────────────────────────────────────────────────────────────────────
   REDUCED MOTION
   ───────────────────────────────────────────────────────────────────────────── */

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
`;
