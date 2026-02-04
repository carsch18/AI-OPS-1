# 🧠 CEREBRO UI

**Autonomous Infrastructure Intelligence Platform**

A world-class, production-grade WebUI built with **Bun.js** and **Hono**, featuring a stunning **pitch-black + neon pink** dark theme.

---

## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Start development server (with hot reload)
bun run dev

# Start production server
bun run start

# Type checking
bun run typecheck
```

The UI will be available at **http://localhost:3001**

---

## 🎨 Design System

### Color Palette: Dark Ops Theme

| Color | Hex | Usage |
|-------|-----|-------|
| **Primary BG** | `#000000` | Main background (pitch black) |
| **Secondary BG** | `#0A0A0F` | Cards, sidebar |
| **Tertiary BG** | `#0F0F17` | Elevated surfaces |
| **Neon Pink** | `#FF0080` | Primary accent, CTAs |
| **Soft Pink** | `#FF66B2` | Secondary accent |
| **Cyber Green** | `#00FFAA` | Success states |
| **Amber** | `#FFAA00` | Warning states |
| **Coral Red** | `#FF3366` | Error states |
| **Cyan** | `#00D4FF` | Info states |

### Typography

- **Sans-serif**: Inter (headings, body)
- **Monospace**: JetBrains Mono (metrics, code)

---

## 📁 Project Structure

```
cerebro-ui/
├── src/
│   ├── index.ts              # Entry point
│   ├── server.ts             # Hono server setup
│   ├── config.ts             # Configuration
│   │
│   ├── routes/               # Route handlers
│   │   ├── api.ts            # API proxy routes
│   │   └── pages.ts          # Page routes
│   │
│   ├── templates/            # HTML templates
│   │   ├── layout.ts         # Main layout wrapper
│   │   ├── components/       # UI components
│   │   │   ├── sidebar.ts
│   │   │   ├── header.ts
│   │   │   ├── metrics.ts
│   │   │   ├── health.ts
│   │   │   ├── alerts.ts
│   │   │   ├── services.ts
│   │   │   └── hitl.ts
│   │   └── pages/            # Page templates
│   │       ├── dashboard.ts
│   │       └── login.ts
│   │
│   ├── styles/               # CSS modules
│   │   ├── variables.ts      # Design tokens
│   │   ├── reset.ts          # CSS reset
│   │   ├── typography.ts     # Font styles
│   │   ├── layout.ts         # Grid & flexbox
│   │   ├── components.ts     # Component styles
│   │   └── animations.ts     # Keyframes
│   │
│   ├── scripts/              # Client-side JS
│   │   └── index.ts          # Main app logic
│   │
│   └── lib/                  # Utilities
│       └── html.ts           # Template helpers
│
├── package.json
├── tsconfig.json
└── bunfig.toml
```

---

## ✨ Features (Phase 1)

### ✅ Completed

- [x] **Bun.js + Hono** server setup
- [x] **Pitch black + neon pink** design system
- [x] **CSS custom properties** (200+ design tokens)
- [x] **Collapsible sidebar** navigation
- [x] **Header** with search, notifications, chat toggle
- [x] **Health score ring** (animated SVG)
- [x] **Metric cards** with sparklines
- [x] **Real-time charts** (Canvas-based)
- [x] **Alert list** component
- [x] **Service health** grid
- [x] **HITL panel** (approve/reject actions)
- [x] **AI Chat** slide-out panel
- [x] **Login page**
- [x] **API proxy** to Brain backend
- [x] **Toast notifications**
- [x] **Responsive layout**

### 🔮 Coming Soon (Future Phases)

- [ ] Services detail page
- [ ] Service topology graph
- [ ] Incident management
- [ ] Alert center
- [ ] Anomaly detection dashboard
- [ ] Runbook library
- [ ] Audit log viewer
- [ ] Settings page
- [ ] WebSocket real-time updates
- [ ] Full authentication flow

---

## 🔗 API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Dashboard page |
| `GET /login` | Login page |
| `GET /services` | Services page |
| `GET /incidents` | Incidents page |
| `GET /alerts` | Alerts page |
| `GET /api/health` | Health check |
| `POST /api/auth/login` | Authentication |
| `GET /api/metrics/*` | Metrics proxy |
| `GET /api/anomaly/*` | Anomaly data |
| `POST /api/chat` | AI chat |
| `GET /api/actions/pending` | Pending HITL actions |

---

## 🔧 Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `HOST` | `localhost` | Server host |
| `BRAIN_URL` | `http://localhost:8000` | Brain API URL |

---

## 📊 Performance

- **Zero dependencies** for client-side JS
- **Inline critical CSS** for fast FCP
- **Streaming HTML** responses
- **Gzip compression** enabled
- **Canvas-based charts** (no external libraries)

---

## 🧪 Development

```bash
# Install Bun (if not installed)
curl -fsSL https://bun.sh/install | bash

# Install dependencies
bun install

# Run in development mode
bun run dev
```

---

*Built with ❤️ for CEREBRO - The Autonomous Infrastructure Intelligence Platform*
