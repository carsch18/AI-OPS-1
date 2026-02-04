<p align="center">
  <img src="https://img.shields.io/badge/AI-Powered-10a37f?style=for-the-badge&logo=openai&logoColor=white" alt="AI Powered"/>
  <img src="https://img.shields.io/badge/Cerebras-Llama_3.3_70B-purple?style=for-the-badge" alt="Cerebras"/>
  <img src="https://img.shields.io/badge/Netdata-MCP-00ab44?style=for-the-badge&logo=netdata&logoColor=white" alt="Netdata"/>
  <img src="https://img.shields.io/badge/Ansible-Automation-EE0000?style=for-the-badge&logo=ansible&logoColor=white" alt="Ansible"/>
</p>

<h1 align="center">🧠 AIOps Command Center</h1>

<p align="center">
  <strong>The Autonomous Enterprise Platform</strong><br>
  AI-powered infrastructure operations with human-in-the-loop governance
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-demo">Demo</a> •
  <a href="#-tech-stack">Tech Stack</a>
</p>

---

## 🎯 What is AIOps Command Center?

AIOps Command Center is a **production-grade autonomous operations platform** that combines:

- 🤖 **AI-Powered Investigation** using Cerebras Llama 3.3 70B (~2100 tokens/sec)
- 📊 **Real-time Observability** via Netdata MCP Server (per-second metrics)
- 🛡️ **Human-in-the-Loop Governance** with approval workflows
- ⚡ **Event-Driven Automation** through Ansible playbooks

> **Think of it as an AI SRE that monitors your infrastructure, investigates issues, proposes fixes, and executes remediation—all with human oversight.**

---

## 📸 Screenshots

### Dashboard Overview
![Dashboard Overview](images/dashboard-overview.png)
*Real-time metrics with OpenAI-inspired dark theme*

### Live Charts
![Live Charts](images/live-charts.png)
*CPU, Memory, Network, Disk I/O, System Load*

### AI Chat Interface
![AI Chat](images/ai-chat.png)
*Natural language queries with slash commands*

### Human-in-the-Loop Approval
![HITL Approval](images/hitl-approval.png)
*Approval cards for remediation actions*

---

## ✨ Features

### 🎨 Beast Mode Dashboard
| Feature | Description |
|---------|-------------|
| **OpenAI Theme** | Black background, white text, Inter + JetBrains Mono fonts |
| **Real-time Metrics** | 7 live metrics updating every second |
| **5 Live Charts** | CPU, Memory, Network, Disk I/O, System Load |
| **Alerts Panel** | Active alerts with severity indicators |
| **Top Processes** | Real-time process table with CPU/memory bars |

### 🤖 AI Brain (Cerebras Llama 3.3 70B)
| Feature | Description |
|---------|-------------|
| **LangGraph Supervisor** | Multi-agent orchestration pattern |
| **13 MCP Tools** | Comprehensive Netdata integration |
| **Triage Agent** | Assesses severity and categorizes issues |
| **Investigator Agent** | Deep-dives into metrics and logs |
| **Remediation Agent** | Proposes actionable fixes |

### 🛡️ Human-in-the-Loop (HITL)
| Feature | Description |
|---------|-------------|
| **PostgreSQL State** | Persistent workflow storage |
| **Approval Cards** | Visual approve/reject interface |
| **Audit Trail** | Complete action logging |
| **WebSocket Updates** | Real-time notifications |

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
    subgraph User_Layer["👤 User Interface Layer"]
        Dashboard["🖥️ Bun.js Dashboard"]
        Chat["💬 AI Chat Interface"]
        Approval["✅ Approval Cards"]
    end
    
    subgraph Brain_Layer["🧠 Intelligence Layer"]
        API["⚡ FastAPI Server"]
        Supervisor["🎯 LangGraph Supervisor"]
        Triage["🔍 Triage Agent"]
        Investigator["🔬 Investigator Agent"]
        Remediation["🛠️ Remediation Agent"]
        StateDB[("🗄️ PostgreSQL")]
    end
    
    subgraph Observability_Layer["📊 Observability Layer"]
        NetdataMCP["📡 Netdata MCP Server"]
        NetdataAgent["💻 Netdata Agent"]
        Metrics["📈 Per-Second Metrics"]
    end
    
    subgraph Automation_Layer["🤖 Automation Layer"]
        EDA["🎭 Event-Driven Ansible"]
        Playbooks["📋 Remediation Playbooks"]
    end
    
    subgraph Infrastructure["🏢 Infrastructure"]
        Apps["📦 Applications"]
        DBs["🗃️ Databases"]
        OS["💾 Operating Systems"]
    end
    
    Dashboard --> API
    Chat --> API
    Approval --> API
    
    API --> Supervisor
    Supervisor --> Triage
    Supervisor --> Investigator
    Supervisor --> Remediation
    Supervisor <--> StateDB
    
    Investigator <-->|MCP Protocol| NetdataMCP
    NetdataMCP --> NetdataAgent
    NetdataAgent --> Metrics
    
    Metrics --> Apps
    Metrics --> DBs
    Metrics --> OS
    
    Remediation -->|Webhook| EDA
    EDA --> Playbooks
    Playbooks --> Apps
    Playbooks --> DBs
    Playbooks --> OS
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

### Data Flow

```mermaid
sequenceDiagram
    participant User
    participant Dashboard
    participant Brain
    participant Netdata
    participant PostgreSQL
    participant Ansible
    
    User->>Dashboard: Ask question
    Dashboard->>Brain: POST /chat
    
    Brain->>Netdata: MCP: get_cpu_usage
    Netdata-->>Brain: CPU metrics
    Brain->>Netdata: MCP: get_memory_usage
    Netdata-->>Brain: Memory metrics
    
    Brain->>Brain: AI Analysis
    Brain->>PostgreSQL: Store pending action
    Brain-->>Dashboard: Proposed remediation
    
    Dashboard->>User: Show approval card
    User->>Dashboard: Approve action
    Dashboard->>Brain: POST /approve
    
    Brain->>Ansible: Webhook trigger
    Ansible->>Ansible: Execute playbook
    Ansible-->>Brain: Callback with result
    
    Brain->>PostgreSQL: Update status
    Brain-->>Dashboard: WebSocket update
    Dashboard->>User: Show success
```

---

## 🚀 Quick Start

### Prerequisites

- **Docker** & Docker Compose
- **Bun** v1.0+ (or Node.js 18+)
- **Python** 3.11+
- **Cerebras API Key** ([Get one here](https://cloud.cerebras.ai))

### 1. Clone & Setup

```bash
git clone https://github.com/yourusername/aiops-platform.git
cd aiops-platform

# Create environment file
cp .env.example .env
# Edit .env and add your CEREBRAS_API_KEY
```

### 2. Start Infrastructure

```bash
cd infra/local
docker compose up -d
```

This starts:
- 📊 **Netdata** on `localhost:19999`
- 🗄️ **PostgreSQL** on `localhost:5432`

### 3. Start the Brain

```bash
cd apps/brain
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Start the Brain
export $(cat ../../.env | xargs)
python main.py
```

Brain runs on `localhost:8000`

### 4. Start the Frontend

```bash
cd apps/web
bun install
bun run dev
```

Frontend runs on `localhost:3000`

### 5. Open the Dashboard

🎉 **Navigate to [http://localhost:3000](http://localhost:3000)**

---

## 🎮 Demo

### Quick Commands

| Command | What It Does |
|---------|--------------|
| `/cpu` | Get current CPU usage |
| `/memory` | Get memory breakdown |
| `/investigate` | Full system investigation |
| `/diagnose` | Diagnose active alerts |
| `demo test` | Create a test HITL action |

### Try the HITL Flow

1. **Create an action**: Type `demo test` in the chat
2. **See the pending action** in the purple HITL panel
3. **Click Approve** to trigger automation
4. **Check the result** in the chat

### API Examples

```bash
# Health check
curl http://localhost:8000/health

# Chat with the AI
curl -X POST http://localhost:8000/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is my CPU usage?"}'

# Get pending actions
curl http://localhost:8000/pending-actions

# Approve an action
curl -X POST http://localhost:8000/actions/{id}/approve \
  -H "Content-Type: application/json" \
  -d '{"decision": "approve", "approved_by": "admin"}'
```

---

## 🔧 Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| **Bun.js** | Ultra-fast JS runtime |
| **Hono** | Lightweight web framework |
| **Canvas API** | Real-time chart rendering |
| **WebSocket** | Live updates |

### Backend (Brain)
| Technology | Purpose |
|------------|---------|
| **FastAPI** | Async Python API |
| **LangGraph** | Agent orchestration |
| **Cerebras** | LLM inference (Llama 3.3 70B) |
| **asyncpg** | PostgreSQL async driver |

### Observability
| Technology | Purpose |
|------------|---------|
| **Netdata** | Per-second metrics collection |
| **MCP Protocol** | AI-native tool access |

### Automation
| Technology | Purpose |
|------------|---------|
| **Ansible** | Infrastructure automation |
| **Event-Driven Ansible** | Webhook-triggered execution |

### Infrastructure
| Technology | Purpose |
|------------|---------|
| **Docker Compose** | Local development |
| **PostgreSQL** | State persistence |

---

## 📁 Project Structure

```
aiops-platform/
├── apps/
│   ├── brain/                 # 🧠 AI Backend
│   │   ├── main.py           # FastAPI server + LangGraph agents
│   │   └── requirements.txt
│   ├── web/                   # 🖥️ Frontend
│   │   ├── src/server.ts     # Hono server + Dashboard HTML
│   │   └── package.json
│   └── automation/            # 🤖 Ansible Playbooks
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
├── infra/
│   └── local/
│       └── docker-compose.yml  # Netdata + PostgreSQL + EDA
├── images/                     # 📸 Screenshots
└── README.md
```

---

## 🔐 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `CEREBRAS_API_KEY` | Your Cerebras API key | ✅ Yes |
| `NETDATA_URL` | Netdata endpoint | Default: `http://localhost:19999` |
| `DATABASE_URL` | PostgreSQL connection | Default: `postgresql://aiops:aiops_password@localhost:5432/aiops_brain` |
| `ANSIBLE_EDA_URL` | EDA webhook endpoint | Default: `http://localhost:5000` |

---

## 📊 Available MCP Tools

| Tool | Description |
|------|-------------|
| `get_cpu_usage` | CPU usage with breakdown |
| `get_memory_usage` | RAM usage details |
| `get_disk_usage` | Disk space per mount |
| `get_disk_io` | Read/write throughput |
| `get_active_alerts` | Current alerts |
| `get_system_info` | OS/kernel/uptime |
| `get_network_traffic` | Network in/out |
| `get_top_processes_by_cpu` | Top CPU consumers |
| `get_top_processes_by_memory` | Top RAM consumers |
| `get_load_average` | 1/5/15 min load |
| `get_network_connections` | Active sockets |
| `get_all_charts` | Available metrics |
| `diagnose_alert` | Comprehensive diagnosis |
| `propose_remediation` | Create HITL action |

---

## 🛠️ Remediation Playbooks

| Playbook | Purpose | Safety Features |
|----------|---------|-----------------|
| `restart_service.yml` | Restart systemd services | Pre/post health checks |
| `kill_process.yml` | Terminate runaway processes | PID verification |
| `clear_cache.yml` | Clear system caches | Memory before/after comparison |
| `health_check.yml` | System health audit | Comprehensive metrics |
| `restart_container.yml` | Docker container restart | Container health check |

---

## 🎯 Roadmap

- [x] **Phase 1**: Walking Skeleton
- [x] **Phase 2**: Investigation Loop
- [x] **Phase 3**: Human-in-the-Loop
- [x] **Phase 4**: Automation Layer
- [ ] **Phase 5**: Production Hardening
  - [ ] RBAC & Authentication
  - [ ] Enhanced Error Handling
  - [ ] Metrics & Tracing
- [ ] **Phase 6**: Advanced Features
  - [ ] Anomaly Detection ML
  - [ ] Incident Timeline View
  - [ ] Slack/PagerDuty Integration

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

- **[Cerebras](https://cerebras.ai)** - For blazingly fast LLM inference
- **[Netdata](https://netdata.cloud)** - For real-time monitoring
- **[LangGraph](https://langchain-ai.github.io/langgraph/)** - For agent orchestration
- **[Ansible](https://ansible.com)** - For infrastructure automation

---

<p align="center">
  <strong>Built with ❤️ by the AIOps Team</strong>
</p>

<p align="center">
  <a href="https://github.com/yourusername/aiops-platform">⭐ Star this repo</a> •
  <a href="https://github.com/yourusername/aiops-platform/issues">🐛 Report Bug</a> •
  <a href="https://github.com/yourusername/aiops-platform/issues">💡 Request Feature</a>
</p>
