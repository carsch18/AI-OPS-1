# Phase 4: AIOps Integration & Configuration

## Overview
Connect your internal server to the AIOps command center for automated monitoring and incident response.

**Duration**: ~30 minutes  
**Risk Level**: Low (monitoring integration only)  
**Rollback**: Remove server from config

---

## Architecture Review

```
Server Laptop (192.168.1.100)
├─ WordPress on DDEV (port 8080 via Nginx)
├─ Netdata Metrics (port 19999)
└─ Metrics exposed via HTTP API
         ↓ (HTTP polling every 30-60s)
AIOps Command Center (192.168.1.50)
├─ Brain Service (monitoring_service.py)
├─ Incident Manager
└─ Automated Playbooks
```

**Data Flow**:
1. Netdata collects metrics on server (every 2s)
2. AIOps polls Netdata API (every 30-60s)
3. Metrics stored in AIOps PostgreSQL
4. Alerts triggered based on thresholds
5. Incidents auto-created for critical issues
6. Playbooks execute remediation

---

## Step 1: Add Server to AIOps Configuration

**On AIOps command center laptop**:

```bash
cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/brain

# Create internal server configuration
cat > internal_server_config.py <<'CONFIG'
"""
Internal Application Server Configuration
Defines server endpoints and monitoring parameters
"""

# Server details
INTERNAL_SERVER = {
    "name": "Internal WordPress Server",
    "hostname": "aiops-server",
    "ip_address": "192.168.1.100",
    "location": "internal_network",
    "environment": "production",
    
    # Service endpoints
    "endpoints": {
        "wordpress": {
            "url": "http://192.168.1.100:8080",
            "health_check": "http://192.168.1.100:8080/health",
            "check_interval_seconds": 30,
            "timeout_seconds": 10
        },
        "netdata": {
            "url": "http://192.168.1.100:19999",
            "api_base": "http://192.168.1.100:19999/api/v1",
            "check_interval_seconds": 60,
            "timeout_seconds": 5
        }
    },
    
    # Monitoring thresholds
    "thresholds": {
        "cpu_percent": {
            "warning": 70,
            "critical": 90
        },
        "memory_percent": {
            "warning": 80,
            "critical": 95
        },
        "disk_percent": {
            "warning": 80,
            "critical": 90
        },
        "response_time_ms": {
            "warning": 2000,
            "critical": 5000
        },
        "docker_containers_min": {
            "warning": 3,  # DDEV typically runs 3 containers
            "critical": 2
        }
    },
    
    # Alert notification settings
    "notifications": {
        "enabled": True,
        "channels": ["console", "database"],  # Can add: email, slack
        "escalation_minutes": 15
    }
}

# Netdata metric mappings
NETDATA_METRICS = {
    "cpu": "system.cpu",
    "memory": "system.ram",
    "disk_io": "system.io",
    "disk_space": "disk_space._",
    "network": "system.net",
    "docker_cpu": "docker.cpu",
    "docker_mem": "docker.mem",
    "docker_count": "docker.count"
}

# Critical charts to monitor
CRITICAL_CHARTS = [
    "system.cpu",
    "system.ram",
    "disk_space._",
    "docker.count",
    "system.net"
]
CONFIG

# Create config file
python3 -c "print('Configuration created')"
```

---

## Step 2: Create Internal Server Monitoring Service

```bash
# Create dedicated monitor for internal server
cat > internal_server_monitor.py <<'MONITOR'
"""
Internal Server Monitoring Service
Polls Netdata API and WordPress endpoints
"""

import asyncio
import httpx
import time
from datetime import datetime
from typing import Dict, Optional, List
from internal_server_config import INTERNAL_SERVER, NETDATA_METRICS, CRITICAL_CHARTS

class InternalServerMonitor:
    """Monitor internal application server"""
    
    def __init__(self):
        self.server_config = INTERNAL_SERVER
        self.server_ip = self.server_config["ip_address"]
        self.netdata_api = self.server_config["endpoints"]["netdata"]["api_base"]
        self.wordpress_url = self.server_config["endpoints"]["wordpress"]["url"]
        self.session: Optional[httpx.AsyncClient] = None
        
    async def initialize(self):
        """Initialize async HTTP client"""
        self.session = httpx.AsyncClient(timeout=10.0)
        print(f"✓ Internal server monitor initialized for {self.server_ip}")
    
    async def close(self):
        """Clean up resources"""
        if self.session:
            await self.session.aclose()
    
    # ===================================================================
    # WORDPRESS HEALTH  CHECKS
    # ===================================================================
    
    async def check_wordpress_health(self) -> Dict:
        """Check WordPress availability and response time"""
        start_time = time.time()
        health_url = self.server_config["endpoints"]["wordpress"]["health_check"]
        
        try:
            response = await self.session.get(health_url)
            response_time_ms = (time.time() - start_time) * 1000
            
            return {
                "available": response.status_code == 200,
                "status_code": response.status_code,
                "response_time_ms": round(response_time_ms, 2),
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            return {
                "available": False,
                "error": str(e),
                "response_time_ms": None,
                "timestamp": datetime.utcnow().isoformat()
            }
    
    # ===================================================================
    # NETDATA METRICS COLLECTION
    # ===================================================================
    
    async def get_netdata_metric(self, chart: str, after_seconds: int = -10) -> Dict:
        """Fetch metric data from Netdata API"""
        try:
            url = f"{self.netdata_api}/data"
            params = {
                "chart": chart,
                "after": after_seconds,
                "format": "json"
            }
            
            response = await self.session.get(url, params=params)
            if response.status_code == 200:
                data = response.json()
                # Get latest data point
                if data.get("data") and len(data["data"]) > 0:
                    latest = data["data"][-1]
                    return {
                        "chart": chart,
                        "timestamp": latest[0] if len(latest) > 0 else None,
                        "values": latest[1:] if len(latest) > 1 else [],
                        "labels": data.get("labels", []),
                        "success": True
                    }
            
            return {"chart": chart, "success": False, "error": "No data"}
        except Exception as e:
            return {"chart": chart, "success": False, "error": str(e)}
    
    async def get_cpu_usage(self) -> float:
        """Get current CPU usage percentage"""
        data = await self.get_netdata_metric(NETDATA_METRICS["cpu"])
        if data["success"] and data["values"]:
            # Sum all CPU values (user + system + nice + ...)
            return round(sum(abs(v) for v in data["values"] if v is not None), 2)
        return 0.0
    
    async def get_memory_usage(self) -> Dict:
        """Get memory usage details"""
        data = await self.get_netdata_metric(NETDATA_METRICS["memory"])
        if data["success"] and data["values"]:
            labels = data["labels"]
            values = data["values"]
            
            # Parse memory components
            total = sum(abs(v) for v in values if v is not None)
            
            # Calculate used percentage (approximate)
            # Typically: used = total - free - buffers - cache
            used_percent = 0
            if len(values) > 0 and total > 0:
                free_idx = labels.index("free") if "free" in labels else 0
                if free_idx < len(values):
                    free = abs(values[free_idx])
                    used_percent = ((total - free) / total) * 100
            
            return {
                "total_mb": round(total, 2),
                "used_percent": round(used_percent, 2),
                "labels": labels,
                "values": [round(abs(v), 2) if v else 0 for v in values]
            }
        return {"total_mb": 0, "used_percent": 0}
    
    async def get_disk_usage(self) -> Dict:
        """Get disk space usage"""
        data = await self.get_netdata_metric(NETDATA_METRICS["disk_space"])
        if data["success"] and data["values"]:
            # Disk space returns [avail, used]
            values = data["values"]
            if len(values) >= 2:
                avail = abs(values[0]) if values[0] else 0
                used = abs(values[1]) if values[1] else 0
                total = avail + used
                used_percent = (used / total * 100) if total > 0 else 0
                
                return {
                    "total_gb": round(total / 1024, 2),
                    "used_gb": round(used / 1024, 2),
                    "avail_gb": round(avail / 1024, 2),
                    "used_percent": round(used_percent, 2)
                }
        return {"used_percent": 0}
    
    async def get_docker_containers(self) -> Dict:
        """Get Docker container count and status"""
        data = await self.get_netdata_metric(NETDATA_METRICS["docker_count"])
        if data["success"]:
            labels = data.get("labels", [])
            values = data.get("values", [])
            
            containers = {}
            for i, label in enumerate(labels):
                if i < len(values):
                    containers[label] = int(abs(values[i])) if values[i] else 0
            
            return {
                "running": containers.get("running", 0),
                "paused": containers.get("paused", 0),
                "stopped": containers.get("stopped", 0),
                "total": sum(containers.values())
            }
        return {"running": 0, "total": 0}
    
    # ===================================================================
    # COMPREHENSIVE HEALTH CHECK
    # ===================================================================
    
    async def collect_all_metrics(self) -> Dict:
        """Collect all metrics from server"""
        metrics = {
            "timestamp": datetime.utcnow().isoformat(),
            "server": self.server_config["name"],
            "ip": self.server_ip
        }
        
        # Parallel collection
        results = await asyncio.gather(
            self.check_wordpress_health(),
            self.get_cpu_usage(),
            self.get_memory_usage(),
            self.get_disk_usage(),
            self.get_docker_containers(),
            return_exceptions=True
        )
        
        # Parse results
        metrics["wordpress"] = results[0] if not isinstance(results[0], Exception) else {"available": False, "error": str(results[0])}
        metrics["cpu_percent"] = results[1] if not isinstance(results[1], Exception) else 0
        metrics["memory"] = results[2] if not isinstance(results[2], Exception) else {}
        metrics["disk"] = results[3] if not isinstance(results[3], Exception) else {}
        metrics["docker"] = results[4] if not isinstance(results[4], Exception) else {}
        
        return metrics
    
    # ===================================================================
    # ALERTING LOGIC
    # ===================================================================
    
    async def check_thresholds(self, metrics: Dict) -> List[Dict]:
        """Check metrics against thresholds and return alerts"""
        alerts = []
        thresholds = self.server_config["thresholds"]
        
        # CPU check
        cpu = metrics.get("cpu_percent", 0)
        if cpu > thresholds["cpu_percent"]["critical"]:
            alerts.append({
                "severity": "critical",
                "category": "infrastructure",
                "metric": "cpu_percent",
                "value": cpu,
                "threshold": thresholds["cpu_percent"]["critical"],
                "message": f"CPU usage critical: {cpu}%"
            })
        elif cpu > thresholds["cpu_percent"]["warning"]:
            alerts.append({
                "severity": "warning",
                "category": "infrastructure",
                "metric": "cpu_percent",
                "value": cpu,
                "threshold": thresholds["cpu_percent"]["warning"],
                "message": f"CPU usage high: {cpu}%"
            })
        
        # Memory check
        mem = metrics.get("memory", {}).get("used_percent", 0)
        if mem > thresholds["memory_percent"]["critical"]:
            alerts.append({
                "severity": "critical",
                "category": "infrastructure",
                "metric": "memory_percent",
                "value": mem,
                "threshold": thresholds["memory_percent"]["critical"],
                "message": f"Memory usage critical: {mem}%"
            })
        
        # Disk check
        disk = metrics.get("disk", {}).get("used_percent", 0)
        if disk > thresholds["disk_percent"]["critical"]:
            alerts.append({
                "severity": "critical",
                "category": "infrastructure",
                "metric": "disk_percent",
                "value": disk,
                "threshold": thresholds["disk_percent"]["critical"],
                "message": f"Disk usage critical: {disk}%"
            })
        
        # WordPress availability
        wp = metrics.get("wordpress", {})
        if not wp.get("available"):
            alerts.append({
                "severity": "critical",
                "category": "availability",
                "metric": "wordpress_down",
                "value": 0,
                "threshold": 1,
                "message": "WordPress site is down!"
            })
        
        # Docker containers
        docker_running = metrics.get("docker", {}).get("running", 0)
        if docker_running < thresholds["docker_containers_min"]["critical"]:
            alerts.append({
                "severity": "critical",
                "category": "infrastructure",
                "metric": "docker_containers",
                "value": docker_running,
                "threshold": thresholds["docker_containers_min"]["critical"],
                "message": f"DDEV containers down! Only {docker_running} running"
            })
        
        return alerts


# Global instance
internal_monitor = InternalServerMonitor()
MONITOR

python3 -c "print('Monitor service created')"
```

---

## Step 3: Integrate with Existing AIOps Platform

Add internal server to `monitoring_service.py`:

```bash
# Edit monitoring_service.py to include internal server
cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/brain

# Add import at top of file
cat >> monitoring_service_additions.txt <<'ADDITIONS'
# Add this import near the top:
from internal_server_monitor import internal_monitor

# Add this method to MetricsCollector class:

async def collect_internal_server_metrics(self) -> Dict[str, Any]:
    """Collect metrics from internal application server"""
    metrics = {
        "category": "internal_server",
        "timestamp": datetime.utcnow().isoformat(),
        "metrics": {}
    }
    
    try:
        # Collect all metrics
        server_metrics = await internal_monitor.collect_all_metrics()
        
        # WordPress availability
        wp_available = server_metrics.get("wordpress", {}).get("available", False)
        metrics["metrics"]["wordpress_available"] = {
            "value": 1 if wp_available else 0,
            "threshold": 1,
            "severity": "critical" if not wp_available else "normal"
        }
        
        # WordPress response time
        wp_response = server_metrics.get("wordpress", {}).get("response_time_ms", 0)
        metrics["metrics"]["wordpress_response_time_ms"] = {
            "value": wp_response,
            "threshold": 2000,
            "severity": "warning" if wp_response > 2000 else "normal"
        }
        
        # Server CPU
        cpu = server_metrics.get("cpu_percent", 0)
        metrics["metrics"]["server_cpu_percent"] = {
            "value": cpu,
            "threshold": 70,
            "severity": "critical" if cpu > 90 else ("warning" if cpu > 70 else "normal")
        }
        
        # Server Memory
        mem_percent = server_metrics.get("memory", {}).get("used_percent", 0)
        metrics["metrics"]["server_memory_percent"] = {
            "value": mem_percent,
            "threshold": 80,
            "severity": "critical" if mem_percent > 95 else ("warning" if mem_percent > 80 else "normal")
        }
        
        # Server Disk
        disk_percent = server_metrics.get("disk", {}).get("used_percent", 0)
        metrics["metrics"]["server_disk_percent"] = {
            "value": disk_percent,
            "threshold": 80,
            "severity": "critical" if disk_percent > 90 else ("warning" if disk_percent > 80 else "normal")
        }
        
        # Docker containers
        docker_running = server_metrics.get("docker", {}).get("running", 0)
        metrics["metrics"]["server_docker_containers"] = {
            "value": docker_running,
            "threshold": 3,
            "severity": "critical" if docker_running < 2 else ("warning" if docker_running < 3 else "normal")
        }
        
        # Store raw metrics for analysis
        metrics["raw_data"] = server_metrics
        
        # Check thresholds and trigger alerts
        alerts = await internal_monitor.check_thresholds(server_metrics)
        for alert in alerts:
            await self._trigger_alert(
                category=alert["category"],
                metric_name=alert["metric"],
                severity=alert["severity"],
                current_value=alert["value"],
                threshold=alert["threshold"],
                metadata={"server": "internal", "message": alert["message"]}
            )
        
    except Exception as e:
        print(f"Error collecting internal server metrics: {e}")
        metrics["error"] = str(e)
    
    await self._store_metrics(metrics)
    return metrics

# Add to get_all_metrics_summary method:
# summary["categories"]["internal_server"] = await self.collect_internal_server_metrics()

ADDITIONS

echo "✓ Integration code prepared"
echo "Manually add these methods to monitoring_service.py"
```

---

## Step 4: Initialize Internal Server Monitoring

Update `main.py` to include internal server:

```python
# In main.py startup, add:

@app.on_event("startup")
async def startup():
    # existing code...
    
    # Initialize internal server monitor
    from internal_server_monitor import internal_monitor
    await internal_monitor.initialize()
    print("✓ Internal server monitor initialized")
```

---

## Step 5: Test Integration from Command Center

```bash
# Test script to verify integration
cat > ~/test_internal_server_integration.py <<'TEST'
import asyncio
from internal_server_monitor import internal_monitor

async def test_monitoring():
    print("=== Testing Internal Server Monitoring ===\n")
    
    await internal_monitor.initialize()
    
    # Test WordPress health
    print("1. Testing WordPress health...")
    wp_health = await internal_monitor.check_wordpress_health()
    print(f"   Available: {wp_health['available']}")
    print(f"   Response time: {wp_health.get('response_time_ms')}ms\n")
    
    # Test CPU
    print("2. Testing CPU metrics...")
    cpu = await internal_monitor.get_cpu_usage()
    print(f"   CPU usage: {cpu}%\n")
    
    # Test Memory
    print("3. Testing Memory metrics...")
    mem = await internal_monitor.get_memory_usage()
    print(f"   Memory used: {mem.get('used_percent')}%\n")
    
# Test Disk
    print("4. Testing Disk metrics...")
    disk = await internal_monitor.get_disk_usage()
    print(f"   Disk used: {disk.get('used_percent')}%\n")
    
    # Test Docker
    print("5. Testing Docker metrics...")
    docker = await internal_monitor.get_docker_containers()
    print(f"   Running containers: {docker.get('running')}\n")
    
    # Collect all metrics
    print("6. Collecting all metrics...")
    all_metrics = await internal_monitor.collect_all_metrics()
    print(f"   Collected {len(all_metrics)} metric categories\n")
    
    # Check for alerts
    print("7. Checking thresholds...")
    alerts = await internal_monitor.check_thresholds(all_metrics)
    if alerts:
        print(f"   ⚠️ {len(alerts)} alerts triggered:")
        for alert in alerts:
            print(f"      - {alert['severity'].upper()}: {alert['message']}")
    else:
        print("   ✓ All metrics within normal ranges")
    
    await internal_monitor.close()
    print("\n=== Test Complete ===")

if __name__ == "__main__":
    asyncio.run(test_monitoring())
TEST

# Run test
cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/brain
python3 ~/test_internal_server_integration.py
```

---

## Step 6: Validation Checklist

```bash
cat > ~/validate-phase4.sh <<'SCRIPT'
#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

validate() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ $1${NC}"
  else
    echo -e "${RED}✗ $1${NC}"
    return 1
  fi
}

echo "=== Phase 4 Validation ==="
echo ""

cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/brain

# 1. Configuration files exist
[ -f "internal_server_config.py" ]
validate "Internal server config exists"

# 2. Monitor service exists
[ -f "internal_server_monitor.py" ]
validate "Monitor service exists"

# 3. Can import modules
python3 -c "from internal_server_config import INTERNAL_SERVER; print(INTERNAL_SERVER['ip_address'])" > /dev/null 2>&1
validate "Configuration importable"

# 4. Can reach server
ping -c 2 192.168.1.100 > /dev/null 2>&1
validate "Server reachable via ping"

# 5. WordPress endpoint accessible
curl -s -I http://192.168.1.100:8080/health | grep "200" > /dev/null 2>&1
validate "WordPress health endpoint responding"

# 6. Netdata endpoint accessible
curl -s -I http://192.168.1.100:19999/api/v1/info | grep "200" > /dev/null 2>&1
validate "Netdata API accessible"

echo ""
echo "=== Phase 4 Complete ==="
echo "Internal server integrated with AIOps"
echo "Ready for Phase 5: AIOps Playbooks"
SCRIPT

chmod +x ~/validate-phase4.sh
./validate-phase4.sh
```

---

## Next Steps

✅ **Phase 4 Complete!**

**What we accomplished**:
- ✅ Server configuration defined
- ✅ Monitoring service created
- ✅ Metric collection integrated
- ✅ Alert thresholds configured
- ✅ Ready for automated playbooks

**Proceed to Phase 5**: AIOps Playbooks for Internal Server
