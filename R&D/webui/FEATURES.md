# 🎨 CEREBRO WebUI - Feature Documentation

## Design System

### Color Palette: Dark Ops Theme

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         COLOR PALETTE                                           │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  BACKGROUNDS                                                                   │
│  ████████  #0D0D0D   Deep Black (Primary BG)                                  │
│  ████████  #141419   Dark Navy (Secondary BG)                                 │
│  ████████  #1A1A2E   Card Background                                          │
│  ████████  #252538   Hover State                                              │
│                                                                                 │
│  ACCENT (PINK SPECTRUM)                                                        │
│  ████████  #FF2E97   Neon Pink (Primary)                                      │
│  ████████  #FF6B9D   Soft Pink (Secondary)                                    │
│  ████████  #FF4DA6   Hover Pink                                               │
│                                                                                 │
│  SEMANTIC                                                                      │
│  ████████  #00F5D4   Cyan (Success/Healthy)                                   │
│  ████████  #FEE440   Yellow (Warning)                                         │
│  ████████  #FF4444   Red (Error/Critical)                                     │
│  ████████  #00B4D8   Blue (Info)                                              │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Implemented Features

### 1. Dashboard Overview
- **Health Score Ring** - Animated SVG ring showing overall system health (0-100)
- **Key Metrics Cards** - CPU, Memory, Requests/s, Error Rate with sparklines
- **Real-time Charts** - Canvas-based charts updating every 2 seconds
- **Pending Actions Panel** - HITL approval interface with risk indicators
- **Active Alerts List** - Severity-coded alerts with relative timestamps
- **Service Health Grid** - Status indicators for all services
- **Quick Actions** - One-click common operations
- **Stats Summary** - Daily metrics overview

### 2. Navigation
- **Collapsible Sidebar** - Full/compact mode toggle
- **Section-based Navigation** - Overview, Operations, Intelligence, System
- **Active State Indicators** - Visual feedback for current page
- **Badge Notifications** - Alert/incident counts on nav items

### 3. AI Chat Panel
- **Slide-out Interface** - Non-intrusive chat panel
- **Message Threading** - User and assistant message styling
- **Tool Usage Display** - Shows MCP tools used in responses
- **Keyboard Support** - Enter to send, auto-focus

### 4. Component Library

| Component | Description |
|-----------|-------------|
| `metricCard` | Stats display with sparkline |
| `healthScore` | Circular progress indicator |
| `alertItem` | Alert list item with severity |
| `serviceItem` | Service health row |
| `chartCard` | Chart container with header |
| `pendingAction` | HITL approval card |
| `chatMessage` | Chat bubble component |
| `incidentCard` | Incident summary card |
| `statGrid` | Grid of stat values |
| `quickActions` | Action button grid |

### 5. Chart Library
- **CerebroChart** - Full-featured canvas chart
  - Line, area, and bar chart types
  - Smooth curve interpolation
  - Gradient fills with glow effects
  - Animated rendering
  - Hover tooltips
  - Auto-scaling axes
  
- **Sparkline** - Compact inline chart
  - Minimal footprint
  - Gradient fill
  - Auto-sizing

### 6. Utilities
- Number formatting (K, M, B suffixes)
- Byte formatting
- Duration formatting
- Relative time formatting
- Debounce/throttle
- Random data generation
- Toast notifications

---

## File Structure

```
webui/
├── index.html              # Main application shell
├── css/
│   ├── variables.css       # Design tokens (colors, spacing, etc.)
│   ├── reset.css           # CSS reset and base styles
│   ├── components.css      # Component styles
│   └── main.css            # Layout and page styles
├── js/
│   ├── utils.js            # Utility functions
│   ├── charts.js           # Canvas chart library
│   ├── components.js       # UI component templates
│   └── app.js              # Main application logic
├── README.md               # Project overview
└── FEATURES.md             # This file
```

---

## Running the Prototype

Simply open `index.html` in a modern browser. No build step required!

```bash
# From the webui directory
open index.html

# Or serve with Python
python -m http.server 8080

# Or with Node.js
npx serve .
```

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` / `Ctrl+K` | Focus search |
| `Enter` | Send chat message |

---

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

---

## Future Enhancements

1. **Service Topology View** - Interactive service dependency graph
2. **Runbook Editor** - Visual runbook builder
3. **Incident Timeline** - Detailed incident view with timeline
4. **Settings Panel** - User preferences and integrations
5. **Mobile Responsive** - Full mobile support
6. **Dark/Light Theme Toggle** - Theme switching
7. **Notification Center** - Full notification management
8. **Keyboard Navigation** - Full accessibility support

---

*Built with ❤️ for CEREBRO - The Autonomous Infrastructure Intelligence Platform*
