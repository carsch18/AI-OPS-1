# 🎨 CEREBRO WebUI Prototype

## Design Philosophy

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                        CEREBRO UI DESIGN SYSTEM                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   THEME: "Dark Ops" - Professional, Futuristic, Command Center                 │
│                                                                                 │
│   PRIMARY COLORS:                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────┐  │
│   │  ██████  #0D0D0D   Deep Black (Background)                             │  │
│   │  ██████  #1A1A2E   Dark Navy (Cards/Panels)                            │  │
│   │  ██████  #FF2E97   Neon Pink (Primary Accent)                          │  │
│   │  ██████  #FF6B9D   Soft Pink (Secondary)                               │  │
│   │  ██████  #00F5D4   Cyan (Success/Good)                                 │  │
│   │  ██████  #FEE440   Yellow (Warning)                                    │  │
│   │  ██████  #FF4444   Red (Error/Critical)                                │  │
│   │  ██████  #FFFFFF   White (Text)                                        │  │
│   │  ██████  #888888   Gray (Muted Text)                                   │  │
│   └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                 │
│   TYPOGRAPHY:                                                                  │
│   • Headers: Inter (Bold/Semibold)                                            │
│   • Body: Inter (Regular)                                                     │
│   • Code/Metrics: JetBrains Mono                                              │
│                                                                                 │
│   DESIGN PRINCIPLES:                                                           │
│   1. Information Density - Show more, scroll less                             │
│   2. Real-time First - Everything updates live                                │
│   3. Context Aware - Smart defaults based on state                            │
│   4. Keyboard Friendly - Power user shortcuts                                 │
│   5. Accessible - WCAG 2.1 AA compliant                                       │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## File Structure

```
webui/
├── index.html              # Main dashboard
├── css/
│   ├── variables.css       # CSS custom properties
│   ├── reset.css           # CSS reset/normalize
│   ├── typography.css      # Font styles
│   ├── layout.css          # Grid/flexbox layouts
│   ├── components.css      # Reusable components
│   ├── charts.css          # Chart styling
│   ├── animations.css      # Transitions/keyframes
│   └── main.css            # Main stylesheet (imports all)
├── js/
│   ├── app.js              # Main application
│   ├── router.js           # SPA routing
│   ├── state.js            # State management
│   ├── api.js              # API client
│   ├── websocket.js        # WebSocket handler
│   ├── charts.js           # Canvas chart library
│   ├── components/         # UI components
│   │   ├── sidebar.js
│   │   ├── header.js
│   │   ├── metrics.js
│   │   ├── chat.js
│   │   ├── alerts.js
│   │   ├── topology.js
│   │   └── terminal.js
│   └── utils/
│       ├── format.js       # Formatters
│       ├── dom.js          # DOM helpers
│       └── events.js       # Event system
├── pages/
│   ├── dashboard.html      # Overview dashboard
│   ├── services.html       # Service health
│   ├── incidents.html      # Incident management
│   ├── chat.html           # AI chat interface
│   ├── runbooks.html       # Automation runbooks
│   ├── settings.html       # Configuration
│   └── topology.html       # Service map
└── assets/
    ├── icons/              # SVG icons
    └── fonts/              # Web fonts
```

## Pages Overview

| Page | Purpose | Key Components |
|------|---------|----------------|
| **Dashboard** | System overview | Metrics grid, health score, alerts |
| **Services** | Service health | Service cards, SLO status, dependencies |
| **Incidents** | Active incidents | Timeline, actions, correlation |
| **Chat** | AI assistant | Chat interface, tool results, HITL |
| **Runbooks** | Automation | Runbook library, execution history |
| **Topology** | Service map | Interactive graph, dependencies |
| **Settings** | Configuration | Integrations, users, preferences |

## Component Library

### 1. Metric Cards
### 2. Real-time Charts
### 3. Alert Banners
### 4. Service Status Pills
### 5. Action Buttons
### 6. Chat Messages
### 7. Code Blocks
### 8. Data Tables
### 9. Modal Dialogs
### 10. Toast Notifications

---

*Built with vanilla HTML, CSS, and JavaScript - No frameworks, maximum performance*
