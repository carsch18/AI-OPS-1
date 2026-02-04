/* ═══════════════════════════════════════════════════════════════════════════════
   CEREBRO UI - Configuration
   Central configuration for the application
   ═══════════════════════════════════════════════════════════════════════════════ */

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001'),
  host: process.env.HOST || 'localhost',
  
  // Backend API
  brainUrl: process.env.BRAIN_URL || 'http://localhost:8000',
  
  // App Info
  appName: 'CEREBRO',
  appVersion: '1.0.0',
  appTagline: 'Autonomous Infrastructure Intelligence',
  
  // Feature Flags
  features: {
    auth: true,
    chat: true,
    realtime: true,
    anomalyDetection: true,
  },
  
  // Theme
  theme: {
    name: 'dark-ops',
    colors: {
      // Backgrounds
      bgPrimary: '#000000',
      bgSecondary: '#0A0A0F',
      bgTertiary: '#0F0F17',
      bgElevated: '#12121A',
      bgHover: '#1A1A24',
      bgActive: '#22222E',
      
      // Pink Spectrum (Primary)
      pink50: '#FFF0F6',
      pink100: '#FFD6E8',
      pink200: '#FFADD2',
      pink300: '#FF85BA',
      pink400: '#FF4D9E',
      pink500: '#FF0080',
      pink600: '#DB006D',
      pink700: '#B7005B',
      pink800: '#930049',
      pink900: '#6F0037',
      
      // Accent
      accentPrimary: '#FF0080',
      accentSecondary: '#FF66B2',
      accentGlow: 'rgba(255, 0, 128, 0.5)',
      accentSubtle: 'rgba(255, 0, 128, 0.15)',
      
      // Semantic
      success: '#00FFAA',
      successBg: 'rgba(0, 255, 170, 0.15)',
      warning: '#FFAA00',
      warningBg: 'rgba(255, 170, 0, 0.15)',
      error: '#FF3366',
      errorBg: 'rgba(255, 51, 102, 0.15)',
      info: '#00D4FF',
      infoBg: 'rgba(0, 212, 255, 0.15)',
      
      // Text
      textPrimary: '#FFFFFF',
      textSecondary: '#A0A0B0',
      textTertiary: '#606070',
      textMuted: '#404050',
      
      // Borders
      borderSubtle: 'rgba(255, 255, 255, 0.06)',
      borderDefault: 'rgba(255, 255, 255, 0.1)',
      borderStrong: 'rgba(255, 255, 255, 0.2)',
      
      // Chart colors
      chartPink: '#FF0080',
      chartCyan: '#00FFAA',
      chartYellow: '#FFAA00',
      chartOrange: '#FF6B35',
      chartPurple: '#A855F7',
      chartBlue: '#00D4FF',
    },
    
    // Typography
    fonts: {
      sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      mono: "'JetBrains Mono', 'Fira Code', 'SF Mono', Consolas, monospace",
    },
    
    // Spacing scale (in rem)
    spacing: {
      0: '0',
      1: '0.25rem',
      2: '0.5rem',
      3: '0.75rem',
      4: '1rem',
      5: '1.25rem',
      6: '1.5rem',
      8: '2rem',
      10: '2.5rem',
      12: '3rem',
      16: '4rem',
    },
    
    // Border radius
    radius: {
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '12px',
      '2xl': '16px',
      full: '9999px',
    },
    
    // Shadows
    shadows: {
      sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.6)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.6)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.6)',
      glow: '0 0 30px rgba(255, 0, 128, 0.4)',
      glowStrong: '0 0 50px rgba(255, 0, 128, 0.6)',
    },
    
    // Transitions
    transitions: {
      fast: '100ms ease',
      base: '200ms ease',
      slow: '300ms ease',
      slower: '500ms ease',
    },
    
    // Layout
    layout: {
      sidebarWidth: '240px',
      sidebarCollapsed: '64px',
      headerHeight: '56px',
      chatWidth: '400px',
      maxContentWidth: '1600px',
    },
  },
} as const;

export type Config = typeof config;
export default config;
