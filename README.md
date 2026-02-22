<p align="center">
  <img src="https://img.shields.io/badge/AI-Powered-10a37f?style=for-the-badge&logo=openai&logoColor=white" alt="AI Powered"/>
  <img src="https://img.shields.io/badge/Cerebras-Llama_3.1_8B-purple?style=for-the-badge" alt="Cerebras"/>
  <img src="https://img.shields.io/badge/Netdata-MCP-00ab44?style=for-the-badge&logo=netdata&logoColor=white" alt="Netdata"/>
  <img src="https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react&logoColor=black" alt="React"/>
  <img src="https://img.shields.io/badge/FastAPI-Python-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"/>
  <img src="https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/>
  <img src="https://img.shields.io/badge/Ansible-Automation-EE0000?style=for-the-badge&logo=ansible&logoColor=white" alt="Ansible"/>
</p>

<h1 align="center">🧠 AIOps Command Center</h1>

<p align="center">
  <strong>The Autonomous Enterprise Operations Platform</strong><br>
  AI-powered infrastructure monitoring, investigation, remediation & workflow orchestration — with human-in-the-loop governance
</p>

<p align="center">
  <a href="#-screenshots--ui-tour">Screenshots</a> •
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-tech-stack">Tech Stack</a> •
  <a href="#-api-reference">API Reference</a>
</p>

---

## 🎯 What is AIOps Command Center?

AIOps Command Center is a **production-grade autonomous operations platform** that combines:

- 🤖 **AI-Powered Investigation** using Cerebras LLM inference (~2100 tokens/sec)
- 📊 **Real-time Observability** via Netdata MCP Server (per-second metrics)
- 🛡️ **Human-in-the-Loop Governance** with configurable approval workflows
- ⚡ **Visual Workflow Builder** with drag-and-drop node canvas
- 🛠️ **30+ Remediation Templates** for automated incident response
- 📈 **Full Analytics Dashboard** with performance metrics & trends
- 🔌 **Multi-Executor Support** — SSH, Docker, and API execution engines

> **Think of it as an AI SRE that monitors your infrastructure, investigates issues, proposes fixes, builds workflows, and executes remediation — all with complete human oversight.**

---

## 📸 Screenshots & UI Tour

### 🏠 Command Center (Dashboard)
![Command Center](docs/screenshots/command-center.png)
*Real-time infrastructure metrics, system health indicators, active alerts, and AI-powered insights — all at a glance*

### 🤖 AI Chat — Cerebras LLM Integration
![AI Chat Interface](docs/screenshots/ai-chat.png)
*Natural language chat with CEREBRO AI Agent, powered by Cerebras Llama 3.1 8B with real-time monitoring tool access*

### 💬 Live AI Response
![AI Chat Live Response](images/ai-chat-live-response.png)
*Real Cerebras LLM responses with tool invocations — the AI can query system metrics, diagnose issues, and propose remediations*

### 🚨 Incidents Dashboard
![Incidents](docs/screenshots/incidents.png)
*Centralized incident tracking with severity levels, status management, and AI-assisted root cause analysis*

### 🔔 Alerts Management
![Alerts](docs/screenshots/alerts.png)
*Real-time alert monitoring with configurable thresholds, severity classification, and auto-escalation*

### 🤖 Autonomous Operations
![Autonomous Ops](images/autonomous-ops.png)
*Self-healing infrastructure with autonomous agent orchestration and WebSocket-powered real-time event streaming*

### 🔧 Visual Workflow Builder
![Workflow Builder](docs/screenshots/workflow-builder.png)
*Drag-and-drop workflow canvas with 15+ node types — build complex remediation pipelines visually*

### 📋 Issues Tracker
![Issues](docs/screenshots/issues.png)
*AI-categorized issue management with severity scoring, trend analysis, and automated triage*

### 🛠️ Remediation Library
![Remediation Library](docs/screenshots/remediation-library.png)
*30+ pre-built remediation workflows including Memory Crisis Recovery, CPU Spike Response, Disk Space Cleanup, and more*

### ⚡ Executors
![Executors](docs/screenshots/executors.png)
*Multi-executor infrastructure — SSH, Docker, and API execution engines with host configuration and health monitoring*

### 📈 Analytics Dashboard
![Analytics](docs/screenshots/analytics.png)
*Comprehensive system performance analytics with CPU/Memory trends, execution status breakdowns, and issue distribution charts*

### ⚙️ Settings
![Settings](docs/screenshots/settings.png)
*System configuration with service health monitoring, notification preferences, and API connectivity status*

---

## ✨ Features

### 🎨 11-Page Enterprise UI
| Page | Description |
|------|-------------|
| **Command Center** | Real-time dashboard with infrastructure metrics, alerts, and AI insights |
| **AI Chat** | Natural language interface to Cerebras LLM with monitoring tool access |
| **Incidents** | Centralized incident management with severity tracking |
| **Alerts** | Real-time alert monitoring with configurable thresholds |
| **Autonomous Ops** | Self-healing infrastructure with autonomous agent orchestration |
| **Workflow Builder** | Visual drag-and-drop workflow canvas with 15+ node types |
| **Issues** | AI-categorized issue tracker with trend analysis |
| **Remediation Library** | 30+ pre-built remediation templates (execute, clone, customize) |
| **Executors** | SSH, Docker, and API execution engines with host management |
| **Analytics** | System performance dashboards with trends and breakdowns |
| **Settings** | Service health, notifications, and API configuration |

### 🤖 AI Brain (Cerebras LLM)
| Feature | Description |
|---------|-------------|
| **Cerebras Inference** | Llama 3.1 8B running at ~2100 tokens/sec |
| **13 MCP Tools** | Comprehensive Netdata monitoring integration |
| **Tool-Calling** | AI automatically selects and invokes monitoring tools |
| **Investigation Agent** | Deep-dives into metrics and root cause analysis |
| **Remediation Agent** | Proposes actionable fixes with rollback plans |
| **HITL Actions** | Proposes actions for human approval before execution |

### 🛡️ Human-in-the-Loop (HITL)
| Feature | Description |
|---------|-------------|
| **PostgreSQL Persistence** | Durable workflow state storage |
| **Approval Cards** | Visual approve/reject interface with impact assessment |
| **Audit Trail** | Complete action logging with timestamps |
| **WebSocket Updates** | Real-time notifications and event streaming |

### 🔧 Workflow Engine
| Feature | Description |
|---------|-------------|
| **Visual Builder** | Drag-and-drop canvas with node/edge connections |
| **15+ Node Types** | Triggers, conditions, actions, notifications, approvals |
| **30 Templates** | Pre-built remediation workflows |
| **Execution Engine** | Multi-step workflow execution with status tracking |
| **SSH/Docker/API** | Three execution backends for different infrastructure needs |

### ⚡ Automation Layer
| Feature | Description |
|---------|-------------|
| **5 Playbooks** | restart_service, kill_process, clear_cache, health_check, restart_container |
| **EDA Integration** | Event-Driven Ansible with webhook triggers |
| **Callback System** | Execution results reported back to Brain |
| **Safety Checks** | Pre/post health verification |

---

## 🏗️ Architecture

### High-Level System Design

```mermaid
graph TB
    subgraph Frontend["🖥️ Frontend — React + Vite"]
        Dashboard["📊 Command Center"]
        Chat["💬 AI Chat"]
        Workflows["🔧 Workflow Builder"]
        Remediation["🛠️ Remediation Library"]
        Analytics["📈 Analytics"]
        Settings["⚙️ Settings"]
    end
    
    subgraph Brain["🧠 Brain API — FastAPI :8000"]
        BrainAPI["⚡ REST API"]
        Cerebras["🤖 Cerebras LLM"]
        MCPTools["🔧 13 MCP Tools"]
        IncidentMgr["🚨 Incident Manager"]
        ActionMgr["✅ HITL Actions"]
    end
    
    subgraph Engine["⚙️ Workflow Engine — FastAPI :8001"]
        EngineAPI["⚡ REST API"]
        Executor["🔄 Workflow Executor"]
        Triggers["⏰ Trigger Manager"]
        Approvals["✅ Approval Service"]
        Templates["📋 Template Service"]
        NodeRegistry["🧩 Node Registry"]
    end
    
    subgraph Infra["🏢 Infrastructure"]
        Postgres[("🗄️ PostgreSQL")]
        Netdata["📡 Netdata Agent"]
        Docker["🐳 Docker"]
    end
    
    subgraph Automation["🤖 Automation"]
        Ansible["📋 Ansible Playbooks"]
        EDA["🎭 Event-Driven Ansible"]
    end
    
    Frontend --> BrainAPI
    Frontend --> EngineAPI
    
    BrainAPI --> Cerebras
    Cerebras --> MCPTools
    MCPTools --> Netdata
    BrainAPI --> ActionMgr
    ActionMgr --> Postgres
    IncidentMgr --> Postgres
    
    EngineAPI --> Executor
    EngineAPI --> Triggers
    EngineAPI --> Approvals
    EngineAPI --> Templates
    Executor --> NodeRegistry
    EngineAPI --> Postgres
    
    ActionMgr --> EDA
    EDA --> Ansible
    Ansible --> Docker
```

### Microservices Communication

```mermaid
sequenceDiagram
    participant User
    participant UI as Workflow UI :5173
    participant Brain as Brain API :8000
    participant Engine as Workflow Engine :8001
    participant DB as PostgreSQL :5432
    participant LLM as Cerebras API
    participant Netdata as Netdata Agent
    
    User->>UI: Ask question in AI Chat
    UI->>Brain: POST /chat
    Brain->>LLM: Chat completion (llama3.1-8b)
    LLM-->>Brain: Tool call decision
    Brain->>Netdata: MCP: get_cpu_usage
    Netdata-->>Brain: CPU metrics
    Brain->>LLM: Tool result + generate response
    LLM-->>Brain: AI analysis
    Brain-->>UI: ChatResponse
    UI-->>User: Show AI response + tools used
    
    User->>UI: Build workflow
    UI->>Engine: POST /api/workflows
    Engine->>DB: Store workflow
    User->>UI: Execute workflow
    UI->>Engine: POST /api/workflows/{id}/execute
    Engine->>DB: Track execution
    Engine-->>UI: WebSocket updates
```

### Agent Workflow

```mermaid
stateDiagram-v2
    [*] --> Supervisor: Alert/Query Received
    
    Supervisor --> Triage: Route for Assessment
    Triage --> Supervisor: Severity + Category
    
    Supervisor --> Investigator: Deep Investigation
    Investigator --> NetdataMCP: Query Metrics
    NetdataMCP --> Investigator: Data Response
    Investigator --> Investigator: Analyze Loop
    Investigator --> Supervisor: Root Cause Found
    
    Supervisor --> Remediation: Propose Fix
    Remediation --> Supervisor: Action Proposal
    
    Supervisor --> HumanApproval: ⏸️ Interrupt Workflow
    HumanApproval --> Supervisor: ✅ Approved / ❌ Rejected
    
    Supervisor --> AnsibleEDA: Execute Playbook
    AnsibleEDA --> Supervisor: Execution Result
    
    Supervisor --> [*]: 🎉 Incident Resolved
```

---

## 🚀 Quick Start

### Prerequisites

- **Docker** & Docker Compose
- **Node.js** 18+ (with npm)
- **Python** 3.11+
- **Cerebras API Key** ([Get one here](https://cloud.cerebras.ai))

### 1. Clone & Setup

```bash
git clone https://github.com/yourusername/aiops-platform.git
cd aiops-platform
```

### 2. Start Infrastructure (PostgreSQL)

```bash
cd infra/local
docker compose up -d
```

This starts:
- 🗄️ **PostgreSQL** on `localhost:5432` (database: `peekaping`)

### 3. Start the Brain API

```bash
cd apps/brain
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Brain API runs on `http://localhost:8000`

### 4. Start the Workflow Engine

```bash
cd apps/workflow-engine
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Workflow Engine runs on `http://localhost:8001`

### 5. Start the Frontend

```bash
cd apps/workflow-ui
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

### 6. Open the Dashboard

🎉 **Navigate to [http://localhost:5173](http://localhost:5173)**

### One-Command Start (Alternative)

```bash
# Use the project start script
chmod +x start-project.sh
./start-project.sh
```

---

## 🎮 Demo

### Quick Commands (AI Chat)

| Command | What It Does |
|---------|----|
| `What is the current system health?` | Full CPU, memory, load check via Netdata |
| `Check CPU usage` | Get current CPU breakdown |
| `Are there any active alerts?` | Query monitoring alerts |
| `Diagnose high CPU usage` | AI investigation with root cause analysis |
| `Fix high memory usage` | Propose remediation with HITL approval |
| `demo test` | Create a test HITL action for approval flow |

### Try the HITL Flow

1. **Open AI Chat** → Type `demo test`
2. **See the pending action** appear as an approval card
3. **Click Approve** to trigger remediation
4. **Check the result** in the chat response

### API Examples

```bash
# Health check — Brain API
curl http://localhost:8000/health

# Health check — Workflow Engine
curl http://localhost:8001/health

# Chat with the AI
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my CPU usage?"}'

# List workflows
curl http://localhost:8001/api/workflows

# List remediation templates
curl http://localhost:8001/api/remediation/templates

# Get pending HITL actions
curl http://localhost:8000/pending-actions

# Approve an action
curl -X POST http://localhost:8000/actions/{id}/approve \
  -H "Content-Type: application/json" \
  -d '{"decision": "approve", "approved_by": "admin"}'

# Get issue stats
curl http://localhost:8001/api/issues/stats
```

---

## 🔧 Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **React 18** | Component-based UI framework |
| **TypeScript** | Type-safe development |
| **Vite** | Ultra-fast build tool and dev server |
| **Lucide React** | Beautiful icon library |
| **CSS Modules** | Scoped styling with dark theme |
| **WebSocket** | Real-time event streaming |

### Backend — Brain API (Port 8000)
| Technology | Purpose |
|------------|---------|
| **FastAPI** | Async Python API framework |
| **Cerebras** | LLM inference (Llama 3.1 8B) |
| **OpenAI SDK** | Cerebras-compatible chat completions client |
| **asyncpg** | PostgreSQL async driver |
| **Netdata MCP** | 13 monitoring tools via MCP protocol |

### Backend — Workflow Engine (Port 8001)
| Technology | Purpose |
|------------|---------|
| **FastAPI** | Async Python API framework |
| **Pydantic** | Data validation and serialization |
| **asyncpg** | PostgreSQL async driver |
| **aiohttp** | Async HTTP client for API executor |
| **Paramiko** | SSH execution engine |

### Database
| Technology | Purpose |
|------------|---------|
| **PostgreSQL 15** | Primary data store |
| **7 Engine Tables** | workflows, nodes, edges, executions, templates, approvals |
| **Brain Tables** | Incidents, pending actions, audit log |

### Observability
| Technology | Purpose |
|------------|---------|
| **Netdata** | Per-second metrics collection |
| **MCP Protocol** | AI-native monitoring tool access |

### Automation
| Technology | Purpose |
|------------|---------|
| **Ansible** | Infrastructure automation |
| **Event-Driven Ansible** | Webhook-triggered execution |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| **Docker Compose** | Local development orchestration |
| **PostgreSQL** | State persistence |

---

## 📁 Project Structure

```
aiops-platform/
├── apps/
│   ├── brain/                    # 🧠 AI Backend (Port 8000)
│   │   ├── main.py              # FastAPI server + Cerebras chat + HITL
│   │   ├── incident_manager.py  # Incident lifecycle management
│   │   ├── incident_types.py    # Incident data models
│   │   ├── cerebro_engine.rs    # Cerebro engine (Rust component)
│   │   └── requirements.txt
│   │
│   ├── workflow-engine/          # ⚙️ Workflow Engine (Port 8001)
│   │   ├── main.py              # FastAPI server + all API endpoints
│   │   ├── database.py          # PostgreSQL schema + connection pool
│   │   ├── executor.py          # Workflow execution engine
│   │   ├── node_registry.py     # 15+ node type definitions
│   │   ├── trigger_manager.py   # Scheduled/event trigger management
│   │   ├── approval_service.py  # Human-in-the-loop approvals
│   │   ├── template_service.py  # 8 system workflow templates
│   │   └── requirements.txt
│   │
│   ├── workflow-ui/              # 🖥️ React Frontend (Port 5173)
│   │   ├── src/
│   │   │   ├── pages/           # 11 full page components
│   │   │   │   ├── CommandCenter.tsx
│   │   │   │   ├── AiChat.tsx
│   │   │   │   ├── Incidents.tsx
│   │   │   │   ├── Alerts.tsx
│   │   │   │   ├── AutonomousOps.tsx
│   │   │   │   ├── Workflows.tsx
│   │   │   │   ├── Issues.tsx
│   │   │   │   ├── Remediation.tsx
│   │   │   │   ├── Executors.tsx
│   │   │   │   ├── Analytics.tsx
│   │   │   │   └── Settings.tsx
│   │   │   ├── components/      # Shared components
│   │   │   │   ├── ConnectionStatusBar.tsx
│   │   │   │   ├── ErrorBoundary.tsx
│   │   │   │   └── Icons.tsx
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── api/             # API client modules
│   │   │   ├── App.tsx          # Router + layout
│   │   │   └── main.tsx         # Entry point
│   │   ├── package.json
│   │   └── vite.config.ts
│   │
│   ├── web/                      # 📦 Legacy Bun.js Dashboard
│   │   └── (deprecated — see workflow-ui)
│   │
│   └── automation/               # 🤖 Ansible Playbooks
│       ├── playbooks/
│       │   ├── restart_service.yml
│       │   ├── kill_process.yml
│       │   ├── clear_cache.yml
│       │   ├── health_check.yml
│       │   └── restart_container.yml
│       ├── rules/
│       │   └── aiops_rulebook.yml
│       └── inventory/
│           └── hosts.yml
│
├── infra/
│   ├── local/
│   │   └── docker-compose.yml    # PostgreSQL + Netdata
│   └── aws/
│       └── providers.tf          # AWS Terraform config
│
├── images/                        # 📸 README Screenshots
├── start-project.sh               # 🚀 One-command startup script
└── README.md
```

---

## 🔐 Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CEREBRAS_API_KEY` | Your Cerebras API key | Required |
| `NETDATA_URL` | Netdata endpoint | `http://localhost:19999` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://aiops:aiops_password@localhost:5432/peekaping` |
| `ANSIBLE_EDA_URL` | EDA webhook endpoint | `http://localhost:5000` |

---

## 📡 API Reference

### Brain API (`localhost:8000`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health + model info |
| `POST` | `/chat` | Chat with Cerebras LLM |
| `GET` | `/pending-actions` | List pending HITL actions |
| `POST` | `/actions/{id}/approve` | Approve/reject an action |
| `GET` | `/api/incidents` | List all incidents |
| `GET` | `/api/metrics/infrastructure` | Infrastructure metrics |
| `POST` | `/api/analyze-issue` | AI-powered issue analysis |

### Workflow Engine (`localhost:8001`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Service health check |
| `GET` | `/api/workflows` | List all workflows |
| `POST` | `/api/workflows` | Create a workflow |
| `POST` | `/api/workflows/{id}/execute` | Execute a workflow |
| `GET` | `/api/remediation/templates` | List remediation templates |
| `GET` | `/api/issues` | List all issues |
| `GET` | `/api/issues/stats` | Issue statistics |
| `GET` | `/api/node-types` | Available workflow node types |
| `GET` | `/ws` | WebSocket for real-time events |

---

## 📊 Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_cpu_usage` | CPU usage with per-core breakdown |
| `get_memory_usage` | RAM usage details |
| `get_disk_usage` | Disk space per mount point |
| `get_disk_io` | Read/write throughput |
| `get_active_alerts` | Current monitoring alerts |
| `get_system_info` | OS, kernel, uptime |
| `get_network_traffic` | Network in/out bandwidth |
| `get_top_processes_by_cpu` | Top CPU-consuming processes |
| `get_top_processes_by_memory` | Top RAM-consuming processes |
| `get_load_average` | 1/5/15 minute load averages |
| `get_network_connections` | Active socket connections |
| `get_all_charts` | All available Netdata metrics |
| `diagnose_alert` | Comprehensive alert diagnosis |
| `propose_remediation` | Create HITL approval action |

---

## 🛠️ Remediation Templates

| Template | Purpose | Safety Features |
|----------|---------|----|
| `restart_service.yml` | Restart systemd services | Pre/post health checks |
| `kill_process.yml` | Terminate runaway processes | PID verification |
| `clear_cache.yml` | Clear system caches | Memory before/after comparison |
| `health_check.yml` | System health audit | Comprehensive metrics |
| `restart_container.yml` | Docker container restart | Container health check |

### Built-in Workflow Templates (Workflow Engine)

| Template | Description |
|----------|-------------|
| Memory Crisis Recovery | Automated response to critical RAM usage |
| CPU Spike Response | Handles sustained high CPU by managing runaway processes |
| Disk Space Cleanup | Automated disk space recovery and log rotation |
| Service Health Check | Comprehensive multi-service health verification |
| Network Connectivity Diagnostics | Tests network paths and DNS resolution |
| SSL Certificate Monitor | Monitors certificate expiration and auto-renewal |
| Database Maintenance | Automated DB vacuum, reindex, and backup |
| Container Orchestration Recovery | Docker/K8s container restart and scaling |

---

## 🎯 Roadmap

- [x] **Phase 1**: Walking Skeleton — Brain API + basic monitoring
- [x] **Phase 2**: Investigation Loop — LangGraph agents + Netdata MCP
- [x] **Phase 3**: Human-in-the-Loop — PostgreSQL persistence + approval workflows
- [x] **Phase 4**: Automation Layer — Ansible playbooks + Event-Driven Ansible
- [x] **Phase 5**: Enterprise UI — React 18 + TypeScript + 11-page platform
  - [x] Visual Workflow Builder with drag-and-drop canvas
  - [x] Remediation Library with 30+ templates
  - [x] Multi-executor support (SSH, Docker, API)
  - [x] Analytics dashboard with charts
  - [x] Cerebras LLM integration (live AI chat)
- [ ] **Phase 6**: Production Hardening
  - [ ] RBAC & Authentication
  - [ ] Enhanced Error Handling & Retry Logic
  - [ ] OpenTelemetry Metrics & Tracing
  - [ ] Rate Limiting & API Gateway
- [ ] **Phase 7**: Advanced Features
  - [ ] Anomaly Detection ML Models
  - [ ] Incident Timeline Visualization
  - [ ] Slack / PagerDuty / Teams Integration
  - [ ] Multi-tenant Support
  - [ ] Kubernetes Operator

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **[Cerebras](https://cerebras.ai)** — Blazingly fast LLM inference
- **[Netdata](https://netdata.cloud)** — Real-time infrastructure monitoring
- **[FastAPI](https://fastapi.tiangolo.com)** — High-performance async Python API
- **[React](https://react.dev)** — Component-based UI framework
- **[Vite](https://vitejs.dev)** — Next-generation frontend tooling
- **[Ansible](https://ansible.com)** — Infrastructure automation
- **[PostgreSQL](https://postgresql.org)** — The world's most advanced open source database

---

<p align="center">
  <strong>Built with ❤️ for production-grade AI-powered infrastructure operations</strong>
</p>

<p align="center">
  <a href="https://github.com/yourusername/aiops-platform">⭐ Star this repo</a> •
  <a href="https://github.com/yourusername/aiops-platform/issues">🐛 Report Bug</a> •
  <a href="https://github.com/yourusername/aiops-platform/issues">💡 Request Feature</a>
</p>
