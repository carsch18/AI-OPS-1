"""
AIOps Brain - Phase 3: Human-in-the-Loop
LangGraph with Interrupt/Resume + PostgreSQL Persistence
Powered by Cerebras Llama 3.1 8B + Netdata MCP
"""

# Load environment variables from .env file
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal
import httpx
import os
import json
import uuid
import asyncio
from datetime import datetime
from openai import OpenAI

# Database
import asyncpg

# Monitoring Service
from monitoring_service import metrics_collector
from incident_manager import incident_manager
from network_sniffer import get_network_sniffer, start_network_capture, stop_network_capture

app = FastAPI(title="AIOps Brain", version="3.0.0")

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
NETDATA_URL = os.getenv("NETDATA_URL", "http://localhost:19998")
CEREBRAS_API_KEY = 'csk-vtykhvxvxhtnrtdrd3p892v48nfpd2mt49tpx4mr68d69559'
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://aiops:aiops_password@localhost:5432/peekaping")

# Database pool
db_pool = None

# WebSocket connections for real-time updates
websocket_connections: List[WebSocket] = []

# Initialize Cerebras client
cerebras_client = None
if CEREBRAS_API_KEY:
    cerebras_client = OpenAI(
        base_url="https://api.cerebras.ai/v1",
        api_key=CEREBRAS_API_KEY,
    )

# ============================================================================
# DATABASE SETUP
# ============================================================================

async def init_db():
    """Initialize database connection and create tables"""
    global db_pool
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        
        # Initialize incident manager with the pool
        incident_manager.db_pool = db_pool
        await incident_manager._ensure_tables()
        
        async with db_pool.acquire() as conn:
            # Create tables
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS pending_actions (
                    id UUID PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT NOW(),
                    action_type VARCHAR(100) NOT NULL,
                    target VARCHAR(255) NOT NULL,
                    description TEXT NOT NULL,
                    impact VARCHAR(255),
                    rollback_plan TEXT,
                    severity VARCHAR(20) DEFAULT 'MEDIUM',
                    investigation_context JSONB,
                    status VARCHAR(20) DEFAULT 'PENDING',
                    resolved_at TIMESTAMP,
                    resolved_by VARCHAR(100),
                    resolution VARCHAR(20)
                )
            ''')
            
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS audit_log (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMP DEFAULT NOW(),
                    event_type VARCHAR(50) NOT NULL,
                    actor VARCHAR(50) NOT NULL,
                    action TEXT NOT NULL,
                    metadata JSONB,
                    action_id UUID REFERENCES pending_actions(id)
                )
            ''')
            
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS incidents (
                    id UUID PRIMARY KEY,
                    created_at TIMESTAMP DEFAULT NOW(),
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    severity VARCHAR(20),
                    status VARCHAR(20) DEFAULT 'OPEN',
                    root_cause TEXT,
                    resolution TEXT,
                    closed_at TIMESTAMP
                )
            ''')
            
        print("✅ Database initialized successfully")
    except Exception as e:
        print(f"⚠️ Database initialization failed: {e}")
        print("   HITL features will run in memory-only mode")


# In-memory fallback for when DB is unavailable
pending_actions_memory: Dict[str, Dict] = {}


async def log_audit(event_type: str, actor: str, action: str, metadata: dict = None, action_id: str = None):
    """Log an audit event"""
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                await conn.execute('''
                    INSERT INTO audit_log (event_type, actor, action, metadata, action_id)
                    VALUES ($1, $2, $3, $4, $5)
                ''', event_type, actor, action, json.dumps(metadata) if metadata else None, 
                    uuid.UUID(action_id) if action_id else None)
        except Exception as e:
            print(f"Audit log error: {e}")


# ============================================================================
# NETDATA MCP TOOLS - Extended Suite
# ============================================================================

NETDATA_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_cpu_usage",
            "description": "Get real-time CPU usage percentage with breakdown",
            "parameters": {"type": "object", "properties": {"duration_seconds": {"type": "integer", "default": 60}}, "required": []}
        }
    },
    {
        "type": "function", 
        "function": {
            "name": "get_memory_usage",
            "description": "Get memory/RAM usage with breakdown",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_active_alerts",
            "description": "Get all active alerts from the monitoring system",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_top_processes_by_cpu",
            "description": "Get top processes consuming CPU",
            "parameters": {"type": "object", "properties": {"limit": {"type": "integer", "default": 10}}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_system_info",
            "description": "Get system information",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_load_average",
            "description": "Get system load average",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_disk_io",
            "description": "Get disk I/O statistics",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_network_traffic",
            "description": "Get network traffic statistics",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "diagnose_alert",
            "description": "Perform comprehensive diagnosis of an alert",
            "parameters": {"type": "object", "properties": {"alert_name": {"type": "string"}}, "required": ["alert_name"]}
        }
    }
]

# REMEDIATION TOOLS - For proposing actions
REMEDIATION_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "propose_remediation",
            "description": "Propose a remediation action that requires human approval. Use this when you've identified an issue and want to fix it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action_type": {
                        "type": "string",
                        "enum": ["restart_service", "kill_process", "clear_cache", "scale_up", "scale_down", "restart_container", "run_playbook", "custom"],
                        "description": "Type of remediation action"
                    },
                    "target": {
                        "type": "string",
                        "description": "Target of the action (e.g., service name, process name, container ID)"
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of what the action will do"
                    },
                    "impact": {
                        "type": "string",
                        "description": "Expected impact (e.g., '2-3 seconds downtime')"
                    },
                    "rollback_plan": {
                        "type": "string",
                        "description": "How to rollback if the action fails"
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                        "description": "Severity/risk level of the action"
                    }
                },
                "required": ["action_type", "target", "description"]
            }
        }
    }
]


async def execute_tool(tool_name: str, arguments: dict) -> str:
    """Execute a Netdata MCP tool and return the result"""
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            if tool_name == "get_cpu_usage":
                duration = arguments.get("duration_seconds", 60)
                response = await client.get(
                    f"{NETDATA_URL}/api/v1/data",
                    params={"chart": "system.cpu", "after": -duration, "points": 1, "format": "json"}
                )
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    values = data["data"][0][1:]
                    total = sum(values)
                    return f"Total CPU usage: {total:.1f}%"
                return "Unable to fetch CPU data"

            elif tool_name == "get_memory_usage":
                response = await client.get(
                    f"{NETDATA_URL}/api/v1/data",
                    params={"chart": "system.ram", "after": -1, "points": 1, "format": "json"}
                )
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    labels = data.get("labels", [])[1:]
                    values = data["data"][0][1:]
                    total = sum(values)
                    used = values[1] if len(values) > 1 else 0
                    pct = (used / total * 100) if total > 0 else 0
                    return f"Memory: {used:.0f} MiB used of {total:.0f} MiB ({pct:.1f}%)"
                return "Unable to fetch memory data"

            elif tool_name == "get_active_alerts":
                response = await client.get(f"{NETDATA_URL}/api/v1/alarms?active")
                data = response.json()
                alarms = data.get("alarms", {})
                if not alarms:
                    return "✅ No active alerts. All systems normal."
                results = []
                for name, alert in alarms.items():
                    status = alert.get("status", "UNKNOWN")
                    chart = alert.get("chart", "")
                    results.append(f"[{status}] {name} on {chart}")
                return f"Found {len(alarms)} alert(s):\n" + "\n".join(results)

            elif tool_name == "get_top_processes_by_cpu":
                limit = arguments.get("limit", 10)
                response = await client.get(
                    f"{NETDATA_URL}/api/v1/data",
                    params={"chart": "apps.cpu", "after": -1, "points": 1, "format": "json"}
                )
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    labels = data.get("labels", [])[1:]
                    values = data["data"][0][1:]
                    processes = sorted(zip(labels, values), key=lambda x: x[1], reverse=True)[:limit]
                    results = [f"{name}: {cpu:.1f}%" for name, cpu in processes if cpu > 0]
                    return "Top CPU:\n" + "\n".join(results) if results else "No significant CPU usage"
                return "Unable to fetch process data"

            elif tool_name == "get_system_info":
                response = await client.get(f"{NETDATA_URL}/api/v1/info")
                data = response.json()
                return f"Hostname: {data.get('hostname', 'Unknown')}, OS: {data.get('os_name', '')}"

            elif tool_name == "get_load_average":
                response = await client.get(
                    f"{NETDATA_URL}/api/v1/data",
                    params={"chart": "system.load", "after": -1, "points": 1, "format": "json"}
                )
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    values = data["data"][0][1:]
                    return f"Load: 1m={values[0]:.2f}, 5m={values[1]:.2f}, 15m={values[2]:.2f}"
                return "Unable to fetch load data"

            elif tool_name == "get_disk_io":
                response = await client.get(
                    f"{NETDATA_URL}/api/v1/data",
                    params={"chart": "system.io", "after": -1, "points": 1, "format": "json"}
                )
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    values = data["data"][0][1:]
                    return f"Disk I/O: Read {abs(values[0]):.1f} KB/s, Write {abs(values[1]):.1f} KB/s"
                return "Unable to fetch disk I/O data"

            elif tool_name == "get_network_traffic":
                response = await client.get(
                    f"{NETDATA_URL}/api/v1/data",
                    params={"chart": "system.net", "after": -1, "points": 1, "format": "json"}
                )
                data = response.json()
                if data.get("data") and len(data["data"]) > 0:
                    values = data["data"][0][1:]
                    return f"Network: ↓{abs(values[0]):.1f} KB/s, ↑{abs(values[1]):.1f} KB/s"
                return "Unable to fetch network data"

            elif tool_name == "diagnose_alert":
                # Comprehensive diagnosis
                results = []
                for tool in ["get_active_alerts", "get_cpu_usage", "get_memory_usage", "get_load_average", "get_top_processes_by_cpu"]:
                    r = await execute_tool(tool, {})
                    results.append(r)
                return "\n\n".join(results)

            elif tool_name == "propose_remediation":
                # Create pending action
                action_id = str(uuid.uuid4())
                action = {
                    "id": action_id,
                    "created_at": datetime.now().isoformat(),
                    "action_type": arguments.get("action_type", "custom"),
                    "target": arguments.get("target", "unknown"),
                    "description": arguments.get("description", ""),
                    "impact": arguments.get("impact", "Unknown"),
                    "rollback_plan": arguments.get("rollback_plan", "Manual intervention required"),
                    "severity": arguments.get("severity", "MEDIUM"),
                    "status": "PENDING"
                }
                
                # Store in database or memory
                if db_pool:
                    try:
                        async with db_pool.acquire() as conn:
                            await conn.execute('''
                                INSERT INTO pending_actions (id, action_type, target, description, impact, rollback_plan, severity, status)
                                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                            ''', uuid.UUID(action_id), action["action_type"], action["target"], 
                                action["description"], action["impact"], action["rollback_plan"], 
                                action["severity"], "PENDING")
                    except Exception as e:
                        print(f"DB error: {e}")
                        pending_actions_memory[action_id] = action
                else:
                    pending_actions_memory[action_id] = action
                
                # Log audit
                await log_audit("ACTION_PROPOSED", "AI", f"Proposed: {action['action_type']} on {action['target']}", action, action_id)
                
                # Notify connected websockets
                await broadcast_pending_action(action)
                
                return f"🛠️ PROPOSED ACTION (ID: {action_id[:8]})\n\nAction: {action['action_type']}\nTarget: {action['target']}\nDescription: {action['description']}\nImpact: {action['impact']}\nRollback: {action['rollback_plan']}\n\n⏳ AWAITING HUMAN APPROVAL"

            else:
                return f"Unknown tool: {tool_name}"

        except Exception as e:
            return f"Error: {str(e)}"


async def broadcast_pending_action(action: dict):
    """Broadcast pending action to all connected websockets"""
    message = json.dumps({"type": "pending_action", "action": action})
    disconnected = []
    for ws in websocket_connections:
        try:
            await ws.send_text(message)
        except:
            disconnected.append(ws)
    for ws in disconnected:
        websocket_connections.remove(ws)


# ============================================================================
# AGENT PROMPTS
# ============================================================================

SUPERVISOR_PROMPT = """You are the Supervisor Agent for an AIOps platform. Your role is to:
1. Analyze incoming requests and alerts
2. Use monitoring tools to gather data
3. When you identify an issue that needs fixing, use propose_remediation to suggest a fix

IMPORTANT: When proposing remediation, always provide:
- Clear action_type (restart_service, kill_process, etc.)
- Specific target
- Detailed description
- Expected impact
- Rollback plan

Be concise and action-oriented."""

REMEDIATION_PROMPT = """You are a Remediation Agent. When asked to fix something, you MUST use the propose_remediation tool.

DO NOT describe what you would do - ACTUALLY CALL the propose_remediation function with:
- action_type: restart_service, kill_process, clear_cache, scale_up, scale_down, restart_container, netdata_down, run_playbook, or custom
- target: The specific service, process, or component
- description: What the action will do
- impact: Expected impact (e.g., "2-3 seconds downtime")
- rollback_plan: How to undo if it fails
- severity: LOW, MEDIUM, HIGH, or CRITICAL

You MUST call propose_remediation. DO NOT just describe it - EXECUTE THE TOOL."""


# ============================================================================
# API MODELS
# ============================================================================

class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    response: str
    tools_used: List[str] = []
    pending_action: Optional[Dict] = None
    investigation_complete: bool = False


class ApprovalRequest(BaseModel):
    action_id: str
    decision: Literal["approve", "reject", "modify"]
    modified_action: Optional[Dict] = None
    approved_by: str = "admin"


# ============================================================================
# BACKGROUND MONITORING
# ============================================================================

async def run_metrics_collection():
    """Background task to periodically collect all metrics"""
    await asyncio.sleep(5)  # Wait for services to be ready
    while True:
        try:
            # Collect all 6 categories of metrics
            await metrics_collector.collect_availability_metrics()
            await asyncio.sleep(1)
            await metrics_collector.collect_performance_metrics()
            await asyncio.sleep(1)
            await metrics_collector.collect_database_metrics()
            await asyncio.sleep(1)
            await metrics_collector.collect_infrastructure_metrics()
            await asyncio.sleep(1)
            await metrics_collector.collect_application_metrics()
            await asyncio.sleep(1)
            await metrics_collector.collect_incident_metrics()
            await asyncio.sleep(1)
            await metrics_collector.collect_pipeline_metrics()
            
            # Wait before next round (collect every 10 seconds)
            await asyncio.sleep(4)
        except Exception as e:
            print(f"Metrics collection error: {e}")
            await asyncio.sleep(10)


# ============================================================================
# DDEV AUTO-RESTART MONITOR
# ============================================================================

# Track consecutive failures to avoid restart loops
ddev_failure_count = 0
DDEV_FAILURE_THRESHOLD = 2  # Restart after 2 consecutive failures
DDEV_CHECK_INTERVAL = 30  # Check every 30 seconds

async def run_ddev_health_monitor():
    """Background task to monitor DDEV site and auto-restart when down"""
    global ddev_failure_count
    import subprocess
    
    await asyncio.sleep(15)  # Wait for services to be ready
    
    SSH_HOST = "test@10.10.2.21"
    SSH_OPTIONS = ["-i", "/home/adityatiwari/.ssh/id_ed25519", "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]
    DDEV_DIR = "~/d1/regenics"
    
    # Import email service
    from email_notifications import email_service
    
    while True:
        try:
            # Check DDEV site health via SSH
            check_cmd = ["ssh"] + SSH_OPTIONS + [SSH_HOST, f"cd {DDEV_DIR} && ddev describe -j 2>/dev/null | grep -q 'running' && echo 'OK' || echo 'DOWN'"]
            
            process = subprocess.run(
                check_cmd,
                capture_output=True,
                text=True,
                timeout=20
            )
            
            is_healthy = "OK" in process.stdout
            
            if is_healthy:
                if ddev_failure_count > 0:
                    print(f"✅ DDEV recovered - site is healthy")
                    await log_audit("DDEV_RECOVERED", "system", "DDEV site is back online", {}, None)
                    # Send recovery email
                    await email_service.send_recovery_notification(
                        metric_name="DDEV/WordPress Site",
                        category="availability",
                        previous_severity="CRITICAL",
                        description="DDEV site has recovered and is now running"
                    )
                else:
                    # Log periodic status (every ~2.5 minutes = 5 checks)
                    import random
                    if random.randint(1, 5) == 1:
                        print(f"💚 DDEV health check OK - site running")
                ddev_failure_count = 0
            else:
                ddev_failure_count += 1
                print(f"⚠️ DDEV check failed ({ddev_failure_count}/{DDEV_FAILURE_THRESHOLD}): {process.stdout.strip() or process.stderr.strip()}")
                
                # Send email on FIRST failure
                if ddev_failure_count == 1:
                    await email_service.send_alert(
                        metric_name="DDEV/WordPress Site",
                        severity="WARNING",
                        value="DOWN",
                        threshold="UP",
                        category="availability",
                        description="DDEV site is not responding. Auto-restart will trigger after 2 consecutive failures."
                    )
                
                if ddev_failure_count >= DDEV_FAILURE_THRESHOLD:
                    print(f"🔄 AUTO-RESTARTING DDEV - {ddev_failure_count} consecutive failures")
                    await log_audit("DDEV_AUTO_RESTART", "system", f"Auto-restarting DDEV after {ddev_failure_count} failures", {}, None)
                    
                    # Send CRITICAL email before restart
                    await email_service.send_alert(
                        metric_name="DDEV/WordPress Site",
                        severity="CRITICAL",
                        value="DOWN - AUTO-RESTARTING",
                        threshold="UP",
                        category="availability",
                        description=f"DDEV site down for {ddev_failure_count} consecutive checks. Auto-restart initiated."
                    )
                    
                    # Execute DDEV restart via SSH
                    restart_cmd = ["ssh"] + SSH_OPTIONS + [SSH_HOST, f"cd {DDEV_DIR} && ddev restart"]
                    restart_process = subprocess.run(
                        restart_cmd,
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                    
                    if restart_process.returncode == 0:
                        print(f"✅ DDEV restart completed successfully")
                        await log_audit("DDEV_RESTART_SUCCESS", "system", "DDEV restarted successfully", {"output": restart_process.stdout[-500:]}, None)
                        ddev_failure_count = 0
                    else:
                        print(f"❌ DDEV restart failed: {restart_process.stderr}")
                        await log_audit("DDEV_RESTART_FAILED", "system", "DDEV restart failed", {"error": restart_process.stderr}, None)
                    
                    # Wait longer after a restart attempt
                    await asyncio.sleep(60)
                    continue
            
            await asyncio.sleep(DDEV_CHECK_INTERVAL)
            
        except subprocess.TimeoutExpired:
            print(f"⚠️ DDEV health check timed out")
            ddev_failure_count += 1
            await asyncio.sleep(DDEV_CHECK_INTERVAL)
        except Exception as e:
            print(f"DDEV health monitor error: {e}")
            await asyncio.sleep(DDEV_CHECK_INTERVAL)


# ============================================================================
# API ENDPOINTS
# ============================================================================

@app.on_event("startup")
async def startup():
    await init_db()
    await incident_manager.initialize()
    await metrics_collector.initialize()
    # Start background metrics collection
    asyncio.create_task(run_metrics_collection())
    # Start DDEV health monitor with auto-restart
    asyncio.create_task(run_ddev_health_monitor())


@app.get("/")
async def root():
    return {
        "status": "online",
        "service": "AIOps Brain v3.0 - Human-in-the-Loop",
        "model": "Cerebras Llama 3.1 8B",
        "features": ["Investigation", "Remediation", "HITL Approval", "Audit Log"],
        "tools_available": len(NETDATA_TOOLS) + len(REMEDIATION_TOOLS)
    }


@app.get("/health")
async def health_check():
    netdata_ok = False
    db_ok = db_pool is not None
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{NETDATA_URL}/api/v1/info", timeout=2.0)
            netdata_ok = response.status_code == 200
    except:
        pass
    
    return {
        "status": "healthy" if netdata_ok else "degraded",
        "netdata_connected": netdata_ok,
        "database_connected": db_ok,
        "cerebras_configured": bool(CEREBRAS_API_KEY),
        "version": "3.0.0"
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Main chat endpoint with investigation and remediation capabilities"""
    tools_used = []
    message_lower = request.message.lower()
    
    # Check if user wants remediation (includes log cleaning)
    wants_fix = any(word in message_lower for word in [
        "fix", "remediate", "restart", "kill", "stop", "resolve", "clear", "clean", 
        "scale", "purge", "truncate", "archive", "delete log", "remove log", 
        "clean log", "clean postgres", "clear cache", "clear log"
    ])
    
    # Check if investigation needed
    is_investigation = any(word in message_lower for word in [
        "diagnose", "investigate", "alert", "problem", "issue", "why", "analyze"
    ])
    
    all_tools = NETDATA_TOOLS + REMEDIATION_TOOLS if wants_fix else NETDATA_TOOLS
    prompt = REMEDIATION_PROMPT if wants_fix else SUPERVISOR_PROMPT
    
    # Direct test mode - bypass LLM for demo/testing
    if "test" in message_lower or "demo" in message_lower:
        result = await execute_tool("propose_remediation", {
            "action_type": "restart_service",
            "target": "test-service",
            "description": "Test remediation action for HITL demo",
            "impact": "No actual impact - demo only",
            "rollback_plan": "N/A - test only",
            "severity": "LOW"
        })
        return ChatResponse(response=result, tools_used=["propose_remediation"])
    
    if not cerebras_client:
        # Fallback mode
        if "cpu" in message_lower:
            result = await execute_tool("get_cpu_usage", {})
            return ChatResponse(response=result, tools_used=["get_cpu_usage"])
        elif wants_fix:
            # Demo remediation
            result = await execute_tool("propose_remediation", {
                "action_type": "restart_service",
                "target": "demo-service",
                "description": "Demo remediation action (LLM not configured)",
                "impact": "No actual impact - demo only",
                "rollback_plan": "N/A",
                "severity": "LOW"
            })
            return ChatResponse(response=result, tools_used=["propose_remediation"])
        else:
            result = await execute_tool("get_active_alerts", {})
            return ChatResponse(response=result, tools_used=["get_active_alerts"])
    
    try:
        messages = [{"role": "user", "content": request.message}]
        
        # Call LLM with tools
        tool_choice_mode = "required" if wants_fix else "auto"
        response = cerebras_client.chat.completions.create(
            model="llama3.1-8b",
            messages=[{"role": "system", "content": prompt}] + messages,
            tools=all_tools,
            tool_choice=tool_choice_mode
        )
        
        assistant_msg = response.choices[0].message
        
        if assistant_msg.tool_calls:
            # Process tool calls
            last_pending_action = None
            for tc in assistant_msg.tool_calls:
                tool_name = tc.function.name
                tools_used.append(tool_name)
                try:
                    args = json.loads(tc.function.arguments)
                except:
                    args = {}
                
                result = await execute_tool(tool_name, args)
                
                # Capture the last pending action if propose_remediation was called
                if tool_name == "propose_remediation" and pending_actions_memory:
                    # Get the most recently created action from memory
                    last_pending_action = list(pending_actions_memory.values())[-1]  # Get the last added action
                
                messages.append({"role": "assistant", "content": assistant_msg.content or "",
                               "tool_calls": [{"id": tc.id, "type": "function", "function": {"name": tool_name, "arguments": tc.function.arguments}}]})
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})
            
            # Get final response
            final = cerebras_client.chat.completions.create(
                model="llama3.1-8b",
                messages=[{"role": "system", "content": prompt}] + messages
            )
            
            return ChatResponse(
                response=final.choices[0].message.content,
                tools_used=tools_used,
                investigation_complete=is_investigation,
                pending_action=last_pending_action
            )
        
        return ChatResponse(response=assistant_msg.content or "I understand. How can I help?", tools_used=[])
    
    except Exception as e:
        return ChatResponse(response=f"Error: {str(e)}", tools_used=tools_used)


@app.get("/pending-actions")
async def get_pending_actions():
    """Get all pending actions awaiting approval"""
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                rows = await conn.fetch('''
                    SELECT * FROM pending_actions WHERE status = 'PENDING' ORDER BY created_at DESC
                ''')
                return {"actions": [dict(r) for r in rows]}
        except Exception as e:
            print(f"DB error: {e}")
    
    # Fallback to memory
    pending = [a for a in pending_actions_memory.values() if a.get("status") == "PENDING"]
    return {"actions": pending}


@app.post("/actions/{action_id}/approve")
async def approve_action(action_id: str, request: ApprovalRequest):
    """Approve or reject a pending action"""
    decision = request.decision
    approved_by = request.approved_by
    
    # Get action details
    action_details = None
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                row = await conn.fetchrow('SELECT * FROM pending_actions WHERE id = $1', uuid.UUID(action_id))
                if row:
                    action_details = dict(row)
        except Exception as e:
            print(f"DB error: {e}")
    
    if not action_details and action_id in pending_actions_memory:
        action_details = pending_actions_memory[action_id]
    
    # Update status
    new_status = "EXECUTING" if decision == "approve" else decision.upper()
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                await conn.execute('''
                    UPDATE pending_actions 
                    SET status = $1, resolved_at = NOW(), resolved_by = $2, resolution = $3
                    WHERE id = $4
                ''', new_status, approved_by, decision, uuid.UUID(action_id))
        except Exception as e:
            print(f"DB error: {e}")
    
    if action_id in pending_actions_memory:
        pending_actions_memory[action_id]["status"] = new_status
        pending_actions_memory[action_id]["resolved_by"] = approved_by
    
    # Log audit
    await log_audit(f"ACTION_{decision.upper()}", approved_by, f"Action {action_id[:8]} {decision}d", {}, action_id)
    
    # Broadcast update
    message = json.dumps({"type": "action_resolved", "action_id": action_id, "decision": decision})
    for ws in websocket_connections:
        try:
            await ws.send_text(message)
        except:
            pass
    
    if decision == "approve" and action_details:
        # Execute remediation via SSH
        print(f"🔄 EXECUTING REMEDIATION: action_type={action_details.get('action_type')}, target={action_details.get('target')}")
        execution_result = await trigger_automation(action_id, action_details)
        return {
            "status": "approved",
            "action_id": action_id,
            "message": "Action approved and sent to automation controller",
            "execution": execution_result
        }
    elif decision == "approve":
        return {
            "status": "approved",
            "action_id": action_id,
            "message": "Action approved (action details not found for execution)"
        }
    else:
        return {
            "status": "rejected",
            "action_id": action_id,
            "message": "Action rejected by human operator"
        }


@app.get("/incidents")
async def list_incidents():
    """List all incidents"""
    return {"incidents": await incident_manager.list_incidents()}

@app.get("/incidents/{incident_id}/rca")
async def get_incident_rca(incident_id: str):
    """Get Root Cause Analysis for an incident"""
    rca = await incident_manager.generate_rca(incident_id)
    return {"rca": rca}
    
@app.post("/incidents/{incident_id}/status")
async def update_incident_status(incident_id: str, status: str, note: str = ""):
    """Update incident status"""
    try:
        await incident_manager.update_status(incident_id, status, note)
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# Configuration for automation
ANSIBLE_EDA_URL = os.getenv("ANSIBLE_EDA_URL", "http://localhost:5000")


async def trigger_automation(action_id: str, action: dict) -> dict:
    """Trigger automation via Ansible EDA webhook, fallback to SSH"""
    action_type = action.get("action_type", "custom")
    target = action.get("target", "unknown")
    description = action.get("description", "")
    severity = action.get("severity", "MEDIUM")
    
    payload = {
        "action_id": str(action_id),
        "action_type": action_type,
        "target": target,
        "description": description,
        "severity": severity,
        "callback_url": "http://localhost:8000/automation/callback"
    }
    
    print(f"🔄 EXECUTING REMEDIATION: action_type={action_type}, target={target}")
    
    # First try Ansible EDA
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.post(ANSIBLE_EDA_URL, json=payload)
            if response.status_code in [200, 201, 202]:
                await log_audit("EDA_TRIGGERED", "system", f"Sent to Ansible EDA: {action_type}", payload, action_id)
                return {
                    "triggered": True,
                    "execution_mode": "ansible_eda",
                    "eda_response": response.status_code,
                    "message": f"Playbook triggered via Ansible EDA for {action_type}"
                }
    except Exception as e:
        await log_audit("EDA_UNAVAILABLE", "system", f"EDA not available: {str(e)}, falling back to SSH", {}, action_id)
    
    # Fallback to direct SSH execution
    return await execute_local_playbook(action_id, action)


async def execute_local_playbook(action_id: str, action: dict) -> dict:
    """Execute remediation action via SSH to DDEV server"""
    import subprocess
    
    action_type = action.get("action_type", "health_check")
    target = action.get("target", "")
    
    # SSH configuration for DDEV server
    SSH_HOST = "test@10.10.2.21"
    SSH_OPTIONS = ["-i", "/home/adityatiwari/.ssh/id_ed25519", "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]
    DDEV_DIR = "~/d1/regenics"
    
    # Map playbook types to SSH commands
    ssh_command_map = {
        "restart_service": f"cd {DDEV_DIR} && ddev restart",
        "restart_container": f"docker restart {target}" if target else f"cd {DDEV_DIR} && ddev restart",
        "site_downtime": f"cd {DDEV_DIR} && ddev restart",
        "health_check": f"cd {DDEV_DIR} && ddev status",
        "resource_spike": "top -bn1 | head -20; free -m; df -h",
        "page_load_slow": f"cd {DDEV_DIR} && ddev restart",
        "http_5xx_spike": f"cd {DDEV_DIR} && ddev logs -f",
        "app_error_spike": f"cd {DDEV_DIR} && ddev logs -f",
        "db_latency": f"cd {DDEV_DIR} && ddev restart db",
        "production_emergency": f"cd {DDEV_DIR} && ddev stop && ddev start",
        "run_playbook": f"cd {DDEV_DIR} && ddev status",
        "netdata_down": "docker restart netdata",
        "custom": f"cd {DDEV_DIR} && ddev status",
    }
    
    # Get the SSH command for this action type
    ssh_command = ssh_command_map.get(action_type, f"cd {DDEV_DIR} && ddev status")
    
    # If target contains 'netdata', use docker restart
    if target and "netdata" in target.lower():
        ssh_command = "docker restart netdata"
    
    try:
        await log_audit("SSH_EXECUTION", "system", f"Executing SSH command: {ssh_command}", {"host": SSH_HOST, "action_type": action_type}, action_id)
        
        # Execute SSH command
        cmd = ["ssh"] + SSH_OPTIONS + [SSH_HOST, ssh_command]
        
        process = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=60
        )
        
        success = process.returncode == 0
        output = process.stdout if success else process.stderr
        
        await log_audit(
            "SSH_COMPLETED" if success else "SSH_FAILED",
            "system",
            f"SSH execution {'succeeded' if success else 'failed'}: {output[:200]}",
            {"output": output[:500], "exit_code": process.returncode},
            action_id
        )
        
        # Update action status in database
        final_status = "COMPLETED" if success else "FAILED"
        if db_pool:
            try:
                async with db_pool.acquire() as conn:
                    await conn.execute('''
                        UPDATE pending_actions 
                        SET status = $1
                        WHERE id = $2
                    ''', final_status, uuid.UUID(action_id))
            except Exception as e:
                print(f"DB error updating status: {e}")
        
        return {
            "triggered": True,
            "execution_mode": "ssh_direct",
            "ssh_command": ssh_command,
            "host": SSH_HOST,
            "success": success,
            "output": output[:500],
            "exit_code": process.returncode,
            "message": f"SSH command executed on {SSH_HOST}"
        }
        
    except subprocess.TimeoutExpired:
        await log_audit("SSH_TIMEOUT", "system", "SSH command timed out after 60s", {}, action_id)
        return {
            "triggered": False,
            "error": "SSH command timed out"
        }
    except Exception as e:
        await log_audit("SSH_ERROR", "system", f"SSH execution error: {str(e)}", {}, action_id)
        return {
            "triggered": False,
            "error": str(e)
        }


class AutomationCallback(BaseModel):
    action_id: str
    status: str
    success: bool = True
    message: str = ""
    details: Optional[Dict] = None


@app.post("/automation/callback")
async def automation_callback(callback: AutomationCallback):
    """Receive execution results from Ansible"""
    action_id = callback.action_id
    
    # Update action status
    final_status = "COMPLETED" if callback.success else "FAILED"
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                await conn.execute('''
                    UPDATE pending_actions 
                    SET status = $1
                    WHERE id = $2
                ''', final_status, uuid.UUID(action_id))
        except Exception as e:
            print(f"DB error: {e}")
    
    # Log audit
    await log_audit(
        f"AUTOMATION_{final_status}",
        "ansible",
        callback.message,
        callback.details,
        action_id
    )
    
    # Broadcast to websockets
    message = json.dumps({
        "type": "automation_result",
        "action_id": action_id,
        "status": callback.status,
        "success": callback.success,
        "message": callback.message
    })
    for ws in websocket_connections:
        try:
            await ws.send_text(message)
        except:
            pass
    
    return {"received": True, "action_id": action_id}


@app.get("/audit-log")
async def get_audit_log(limit: int = 50):
    """Get recent audit log entries"""
    if db_pool:
        try:
            async with db_pool.acquire() as conn:
                rows = await conn.fetch('''
                    SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT $1
                ''', limit)
                return {"logs": [dict(r) for r in rows]}
        except Exception as e:
            print(f"DB error: {e}")
    
    return {"logs": []}


# ============================================================================
# METRICS ENDPOINTS - New comprehensive monitoring
# ============================================================================

@app.get("/api/metrics/summary")
async def get_metrics_summary():
    """Get summary of all metrics categories"""
    return await metrics_collector.get_all_metrics_summary()


@app.get("/api/metrics/availability")
async def get_availability_metrics():
    """Get availability and uptime metrics"""
    return await metrics_collector.collect_availability_metrics()


@app.get("/api/metrics/performance")
async def get_performance_metrics():
    """Get performance metrics (page load, 5xx errors, error rate)"""
    return await metrics_collector.collect_performance_metrics()


@app.get("/api/metrics/database")
async def get_database_metrics():
    """Get database performance metrics"""
    return await metrics_collector.collect_database_metrics()


@app.get("/api/metrics/infrastructure")
async def get_infrastructure_metrics():
    """Get enhanced infrastructure metrics with threshold alerts"""
    return await metrics_collector.collect_infrastructure_metrics()


@app.get("/api/metrics/application")
async def get_application_metrics():
    """Get application error logs and metrics"""
    return await metrics_collector.collect_application_metrics()


@app.get("/api/metrics/incidents")
async def get_incident_metrics():
    """Get incident tracking and service failure metrics"""
    return await metrics_collector.collect_incident_metrics()


@app.get("/api/metrics/alerts")
async def get_metrics_alerts():
    """Get all active threshold-based alerts"""
    return {"alerts": await metrics_collector.get_active_alerts()}


@app.post("/api/metrics/alerts/{alert_id}/acknowledge")
async def acknowledge_metric_alert(alert_id: str, acknowledged_by: str = "admin"):
    """Acknowledge a metric alert"""
    await metrics_collector.acknowledge_alert(alert_id, acknowledged_by)
    return {"status": "acknowledged", "alert_id": alert_id}


@app.post("/api/metrics/alerts/{alert_id}/resolve")
async def resolve_metric_alert(alert_id: str):
    """Mark a metric alert as resolved"""
    await metrics_collector.resolve_alert(alert_id)
    return {"status": "resolved", "alert_id": alert_id}


@app.post("/api/metrics/errors/log")
async def log_application_error(
    error_type: str,
    error_message: str,
    stack_trace: Optional[str] = None,
    context: Optional[Dict] = None
):
    """Log an application error for tracking"""
    await metrics_collector.log_error(error_type, error_message, stack_trace, context)
    return {"logged": True}


# ============================================================================
# NETWORK MONITORING ENDPOINTS
# ============================================================================

@app.on_event("startup")
async def start_network_sniffer():
    """Start network packet capture on startup"""
    try:
        start_network_capture()
        print("✅ Network packet capture started")
    except Exception as e:
        print(f"⚠️ Network capture failed (requires sudo): {e}")


@app.on_event("shutdown")
async def stop_network_sniffer():
    """Stop network packet capture on shutdown"""
    stop_network_capture()


@app.get("/api/network/packets")
async def get_network_packets(limit: int = 50):
    """Get recent captured network packets"""
    sniffer = get_network_sniffer()
    packets = sniffer.get_packets(limit)
    return {
        "packets": packets,
        "count": len(packets)
    }


@app.get("/api/network/stats")
async def get_network_stats():
    """Get network capture statistics"""
    sniffer = get_network_sniffer()
    return sniffer.get_stats()


# ============================================================================
# TERMINAL SSH ENDPOINTS
# ============================================================================
SSH_HOST = "test@10.10.2.21"
SSH_OPTIONS = ["-i", "/home/adityatiwari/.ssh/id_ed25519", "-o", "StrictHostKeyChecking=no", "-o", "BatchMode=yes", "-o", "ConnectTimeout=10"]
DDEV_DIR = "~/d1/regenics"


class TerminalCommand(BaseModel):
    command: str


@app.post("/api/terminal/connect")
async def terminal_connect():
    """Test SSH connection to DDEV server"""
    import subprocess
    try:
        result = subprocess.run(
            ["ssh"] + SSH_OPTIONS + [SSH_HOST, "echo connected"],
            capture_output=True,
            text=True,
            timeout=15
        )
        if result.returncode == 0 and "connected" in result.stdout:
            return {"success": True, "message": f"Connected to {SSH_HOST}"}
        else:
            return {"success": False, "error": result.stderr or "SSH connection failed"}
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "SSH connection timed out"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.post("/api/terminal/execute")
async def terminal_execute(req: TerminalCommand):
    """Execute command via SSH on DDEV server"""
    import subprocess
    command = req.command
    
    # Prepend cd to DDEV directory for ddev commands
    if command.startswith("ddev "):
        command = f"cd {DDEV_DIR} && {command}"
    
    try:
        result = subprocess.run(
            ["ssh"] + SSH_OPTIONS + [SSH_HOST, command],
            capture_output=True,
            text=True,
            timeout=60
        )
        return {
            "output": result.stdout,
            "error": result.stderr if result.returncode != 0 else None,
            "exitCode": result.returncode
        }
    except subprocess.TimeoutExpired:
        return {"output": "", "error": "Command timed out after 60s", "exitCode": -1}
    except Exception as e:
        return {"output": "", "error": str(e), "exitCode": -1}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket for real-time updates on pending actions"""
    await websocket.accept()
    websocket_connections.append(websocket)
    
    try:
        # Send current pending actions on connect
        pending = await get_pending_actions()
        await websocket.send_text(json.dumps({"type": "initial", "pending_actions": pending["actions"]}))
        
        while True:
            # Keep connection alive
            data = await websocket.receive_text()
            # Handle any client messages if needed
    except WebSocketDisconnect:
        if websocket in websocket_connections:
            websocket_connections.remove(websocket)


# ============================================================================
# ALERTS & INCIDENT MANAGEMENT ENDPOINTS
# ============================================================================

@app.get("/api/active-alerts")
async def get_active_alerts():
    """Get all active alerts and recent history"""
    if not db_pool:
        await init_db()
        
    try:
        async with db_pool.acquire() as conn:
            # Fetch active alerts
            active_rows = await conn.fetch("""
                SELECT * FROM active_alerts 
                WHERE resolved = FALSE 
                ORDER BY triggered_at DESC
            """)
            
            # Fetch recent history from resolved_alerts table
            history_rows = await conn.fetch("""
                SELECT id, name as metric_name, description, remediation_proposed, status, resolved_at as triggered_at
                FROM resolved_alerts 
                ORDER BY resolved_at DESC 
                LIMIT 50
            """)
            
            # Convert to dicts
            active = [dict(r) for r in active_rows]
            history = [dict(r) for r in history_rows]
            
            # Format dates isoformat and UUIDs to strings
            import uuid as uuid_module
            for r in active + history:
                for k, v in list(r.items()):
                    if isinstance(v, datetime):
                        r[k] = v.isoformat()
                    elif isinstance(v, uuid_module.UUID):
                        r[k] = str(v)
            
            return {
                "active": active, 
                "history": history
            }
    except Exception as e:
        # Return mock data if DB fails (for development)
        print(f"DB Error fetching alerts: {e}")
        return {
            "active": [],
            "history": []
        }

class DiagnoseRequest(BaseModel):
    alert_id: str
    metric_name: str
    current_value: float
    threshold: float
    metadata: Optional[Dict[str, Any]] = {}

@app.post("/api/diagnose-alert")
async def diagnose_alert(request: DiagnoseRequest):
    """Diagnose an alert using AI"""
    if not cerebras_client:
        return {
            "analysis": "AI diagnosis unavailable (API key missing)",
            "root_cause": "Unknown",
            "remediation": "Check logs manually"
        }
        
    prompt = f"""
    Analyze this system alert:
    Metric: {request.metric_name}
    Current Value: {request.current_value}
    Threshold: {request.threshold}
    Metadata: {json.dumps(request.metadata)}
    
    Provide a JSON response with:
    1. analysis: Brief explanation of what's happening
    2. root_cause: Probable cause
    3. remediation: Concrete steps to fix it
    """
    
    try:
        completion = cerebras_client.chat.completions.create(
            model="llama3.1-8b",
            messages=[
                {"role": "system", "content": "You are a Site Reliability Engineer AI."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"}
        )
        
        result = json.loads(completion.choices[0].message.content)
        return result
    except Exception as e:
        print(f"Diagnosis error: {e}")
        return {
            "analysis": "AI analysis failed",
            "root_cause": "Error calling AI service",
            "remediation": "Investigate manually"
        }

class IncidentCreateRequest(BaseModel):
    title: str
    description: str
    severity: str
    alert_id: Optional[str] = None
    remediation_plan: Optional[str] = None

class RejectAlertRequest(BaseModel):
    alert_id: str
    metric_name: Optional[str] = None
    reason: Optional[str] = None
    description: Optional[str] = None

@app.post("/api/reject-alert")
async def reject_alert_endpoint(request: RejectAlertRequest):
    """Reject a remediation and move alert to history"""
    if not db_pool:
        await init_db()
        
    try:
        async with db_pool.acquire() as conn:
            # 1. Get alert details for history
            alert_row = await conn.fetchrow("""
                SELECT metric_name, current_value, threshold, category
                FROM active_alerts WHERE id = $1::uuid
            """, request.alert_id)
            
            # 2. Insert into resolved_alerts as rejected (Alert History)
            await conn.execute("""
                INSERT INTO resolved_alerts (name, description, remediation_proposed, status, original_alert_id, metadata)
                VALUES ($1, $2, $3, 'Rejected', $4::uuid, $5)
            """, 
                request.metric_name or (alert_row['metric_name'] if alert_row else 'Unknown'),
                request.description or (f"Value: {alert_row['current_value'] if alert_row else 'N/A'}" if alert_row else 'Alert rejected by user'),
                request.reason or 'User rejected remediation',
                request.alert_id,
                json.dumps({"category": alert_row['category'] if alert_row else 'unknown', "rejected": True}))
            
            # 3. Mark active alert as resolved
            await conn.execute("""
                UPDATE active_alerts 
                SET resolved = TRUE, resolved_at = NOW() 
                WHERE id = $1::uuid
            """, request.alert_id)
        
        print(f"❌ Alert {request.alert_id} rejected and moved to history")
        return {"status": "rejected", "alert_id": request.alert_id}
    except Exception as e:
        print(f"Reject error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/api/create-incident")
async def create_incident_endpoint(request: IncidentCreateRequest):
    """Create a new incident from an alert and log to history"""
    if not db_pool:
        await init_db()
        
    try:
        # 1. Create the incident
        incident_id = await incident_manager.create_incident(
            title=request.title,
            description=request.description,
            severity=request.severity,
            source="User Approved Alert"
        )
        
        # 2. Add remediation plan to timeline if exists
        if request.remediation_plan:
             await incident_manager.add_timeline_event(
                 incident_id, 
                 "Remediation Approved", 
                 request.remediation_plan
             )
             await incident_manager.update_status(incident_id, "MITIGATING", "Remediation plan approved by user")
        
        # 3. Mark alert as resolved and log to history
        if request.alert_id:
             async with db_pool.acquire() as conn:
                try:
                    # Get alert details before resolving (as fallback for missing info)
                    alert_row = await conn.fetchrow("""
                        SELECT metric_name, severity, current_value, threshold, category
                        FROM active_alerts WHERE id = $1::uuid
                    """, request.alert_id)
                    
                    # Log to resolved_alerts (Alert History)
                    await conn.execute("""
                        INSERT INTO resolved_alerts (name, description, remediation_proposed, status, original_alert_id, metadata)
                        VALUES ($1, $2, $3, 'Approved', $4::uuid, $5)
                    """, 
                        request.title or (alert_row['metric_name'] if alert_row else 'Unknown'),
                        request.description or (f"Value: {alert_row['current_value']}, Threshold: {alert_row['threshold']}" if alert_row else 'Remediation approved'),
                        request.remediation_plan or 'N/A',
                        request.alert_id,
                        json.dumps({"incident_id": incident_id, "category": alert_row['category'] if alert_row else 'unknown'}))
                    
                    # Mark active alert as resolved
                    await conn.execute("""
                        UPDATE active_alerts 
                        SET resolved = TRUE, resolved_at = NOW() 
                        WHERE id = $1::uuid
                    """, request.alert_id)
                    
                    print(f"✅ Alert {request.alert_id} approved and moved to history")
                except Exception as e:
                    print(f"Error resolving alert during incident creation: {e}")

        return {"incident_id": incident_id, "status": "created", "alert_history": "logged"}
    except Exception as e:
        print(f"❌ Failed to create incident: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create incident: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    print("🧠 Starting AIOps Brain v3.0 - Human-in-the-Loop")
    print(f"📡 Netdata URL: {NETDATA_URL}")
    print(f"🗄️ Database: {DATABASE_URL.split('@')[1] if '@' in DATABASE_URL else 'configured'}")
    print(f"🤖 Cerebras API: {'Configured (Llama 3.1 8B)' if CEREBRAS_API_KEY else 'Not configured'}")
    uvicorn.run(app, host="0.0.0.0", port=8000)