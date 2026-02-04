from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
import random
import time
from datetime import datetime

router = APIRouter()

startTime = datetime.now()

@router.get("/api/active-alerts")
async def get_active_alerts():
    """Mock active alerts"""
    return {
        "alerts": [
            {
                "id": "alert-1",
                "severity": "critical",
                "title": "High CPU Usage",
                "message": "CPU usage is above 90% on host server-01",
                "source": "Prometheus",
                "timestamp": datetime.now().isoformat()
            }
        ],
        "count": 1
    }

@router.get("/api/metrics/availability")
async def get_availability():
    """Mock system availability metrics"""
    uptime_seconds = (datetime.now() - startTime).total_seconds()
    
    # Format uptime nicely
    days, remainder = divmod(uptime_seconds, 86400)
    hours, remainder = divmod(remainder, 3600)
    minutes, seconds = divmod(remainder, 60)
    
    uptime_str = f"{int(hours)}h {int(minutes)}m"
    if days > 0:
        uptime_str = f"{int(days)}d {uptime_str}"
        
    return {
        "uptime_percentage": 99.99,
        "uptime_str": uptime_str,
        "hostname": "aiops-controller-01",
        "ip_address": "192.168.1.105",
        "last_updated": datetime.now().isoformat()
    }

@router.get("/api/network/stats")
async def get_network_stats():
    """Mock network statistics"""
    return {
        "bytes_in": 1024 * 1024 * random.uniform(10, 50), # 10-50 MB
        "bytes_out": 1024 * 1024 * random.uniform(5, 20), # 5-20 MB
        "packets_in": int(random.uniform(5000, 10000)),
        "packets_out": int(random.uniform(2000, 5000)),
        "errors_in": 0,
        "errors_out": 0
    }

@router.get("/api/chart/system.cpu")
async def get_cpu_chart(after: int = -60, points: int = 60):
    """Mock CPU chart data - Format: [timestamp, value]"""
    data = []
    now = time.time()
    for i in range(points):
        # Netdata format: [timestamp, value]
        timestamp = int(now - (points - i))
        import math
        value = 25 + 10 * math.sin(timestamp / 10) + random.uniform(-5, 5)
        value = max(0, min(100, value))
        data.append([timestamp, value]) 
    
    return {
        "data": list(reversed(data)), # Netdata returns newest first usually, but check frontend logic
        "label": "CPU Usage (%)"
    }

@router.get("/api/chart/system.ram")
async def get_ram_chart(after: int = -60, points: int = 60):
    """Mock RAM chart data - Format: [timestamp, free, used, cached, buffers]"""
    data = []
    now = time.time()
    total_mem = 16000 # 16GB
    for i in range(points):
        timestamp = int(now - (points - i))
        used = 6000 + random.uniform(-200, 200)
        cached = 4000
        buffers = 1000
        free = total_mem - used - cached - buffers
        # Netdata: [time, free, used, cached, buffers]
        data.append([timestamp, free, used, cached, buffers])
        
    return {
        "data": list(reversed(data)),
        "label": "Memory Usage (%)"
    }

@router.get("/api/chart/system.load")
async def get_load_chart(after: int = -60, points: int = 60):
    """Mock Load chart data - Format: [timestamp, load1, load5, load15]"""
    data = []
    now = time.time()
    for i in range(points):
        timestamp = int(now - (points - i))
        value = 1.5 + random.uniform(-0.2, 0.2)
        data.append([timestamp, value, value, value])
        
    return {
        "data": list(reversed(data)),
        "label": "System Load (1m)"
    }

@router.get("/api/chart/system.net")
async def get_net_chart(after: int = -60, points: int = 60):
    """Mock Network chart data - Format: [timestamp, received, sent]"""
    data = []
    now = time.time()
    for i in range(points):
        timestamp = int(now - (points - i))
        val_in = random.uniform(10, 50)
        val_out = random.uniform(5, 20)
        # Netdata: [time, received, sent] (usually negative for sent)
        data.append([timestamp, val_in, -val_out])
    
    return {
        "data": list(reversed(data)),
        "label": "Network Traffic (KB/s)"
    }

@router.get("/api/chart/system.io")
async def get_disk_chart(after: int = -60, points: int = 60):
    """Mock Disk IO chart data - Format: [timestamp, read, write]"""
    data = []
    now = time.time()
    for i in range(points):
        timestamp = int(now - (points - i))
        read_val = random.uniform(0, 5)
        write_val = random.uniform(0, 10)
        # Netdata: [time, read, write]
        data.append([timestamp, read_val, -write_val])
    
    return {
        "data": list(reversed(data)),
        "label": "Disk I/O (MB/s)"
    }

# New endpoints to match server.ts specific calls
@router.post("/api/diagnose-alert")
async def diagnose_alert(payload: Dict[str, Any]):
    return {"diagnosis": "Automated diagnosis initiated.", "status": "running"}

@router.post("/api/create-incident")
async def create_incident(payload: Dict[str, Any]):
    return {"incident_id": f"INC-{random.randint(1000,9999)}", "status": "created"}

@router.get("/chat")
async def chat_history():
    return {"messages": []}

@router.post("/chat")
async def chat_message(payload: Dict[str, Any]):
    return {"response": "I am operating in limited mode. Full AI capabilities will be restored soon."}

@router.get("/pending-actions")
async def pending_actions():
    return {"actions": [], "count": 0}

@router.get("/audit-log")
async def audit_log():
    return {"logs": []}

@router.post("/api/terminal/connect")
async def terminal_connect():
    return {"status": "connected", "session_id": "mock-session-123"}

@router.post("/api/terminal/execute")
async def terminal_execute(payload: Dict[str, Any]):
    command = payload.get("command", "")
    return {
        "output": f"Mock output for: {command}\nSuccess.",
        "exit_code": 0
    }

@router.get("/api/chart/{chart_name}")
async def get_generic_chart(chart_name: str, after: int = -60, points: int = 60):
    """Generic fallback for other charts like apps.cpu or disk_space"""
    data = []
    now = time.time()
    for i in range(points):
        timestamp = int(now - (points - i))
        # Simple random data [timestamp, val1, val2]
        data.append([timestamp, random.uniform(0, 100)])
        
    return {
        "data": list(reversed(data)),
        "label": f"{chart_name} data"
    }
