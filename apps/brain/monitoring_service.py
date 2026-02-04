"""
AIOps Monitoring Service - Comprehensive Metrics Collection
Implements 6 categories: Availability, Performance, Database, Infrastructure, Application, Incidents
"""

import os
import time
import asyncio
import socket
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import asyncpg
import aiohttp
from collections import defaultdict
from incident_manager import incident_manager
from pipeline_simulator import PipelineSimulator

# Configuration
NETDATA_URL = os.getenv("NETDATA_URL", "http://localhost:19998")
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://aiops:aiops_password@localhost:5432/peekaping")

# Thresholds from requirements
THRESHOLDS = {
    "availability": {
        "site_down": {"critical": True},
        "uptime_percentage": {"critical": 95.0},
        "dns_resolution": {"critical": True}
    },
    "performance": {
        "page_load_time_ms": {"warning": 2000},  # 2 seconds
        "http_5xx_count": {"critical": 1},
        "error_rate_percent": {"warning": 5, "critical": 10}
    },
    "database": {
        "query_latency_ms": {"warning": 1000},
        "slow_query_ms": {"warning": 500},
        "connection_pool_percent": {"warning": 80}
    },
    "infrastructure": {
        "cpu_percent": {"warning": 70},
        "memory_percent": {"warning": 70},
        "disk_percent": {"warning": 80}
    },
    "application": {
        "errors_per_hour": {"warning": 100},
        "unique_errors_daily": {"info": 5}
    },
    "incidents": {
        "consecutive_failures": {"critical": 3},
        "service_down": {"critical": True}
    },
    "security": {
        "ddos_detected": {"critical": True},
        "brute_force_attempts": {"warning": 50},
        "cdn_status": {"critical": True}
    }
}


class MetricsCollector:
    """Collects and evaluates metrics across all categories"""
    
    def __init__(self):
        self.db_pool = None
        self.session = None
        self.error_cache = defaultdict(int)  # Track error signatures
        self.service_health = {}  # Track service health status
        self.service_previous_state = {}  # Track previous state for email on state change
        self.alert_rules = {}  # Cache for thresholds and rules
        self.pipeline_sim = PipelineSimulator()
        
    async def initialize(self):
        """Initialize database connection and HTTP session"""
        try:
            self.db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
            self.session = aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10))
            await self._ensure_tables()
            await self._load_alert_rules()
            await self._refresh_alert_rules()
            print("✅ Monitoring service initialized")
        except Exception as e:
            print(f"❌ Monitoring service initialization error: {e}")

    def _round_val(self, val):
        """Helper to round numeric values to 3 decimal places"""
        if isinstance(val, (int, float)):
            return round(float(val), 3)
        if isinstance(val, dict):
            return {k: self._round_val(v) for k, v in val.items()}
        if isinstance(val, list):
            return [self._round_val(v) for v in val]
        return val
    
    async def close(self):
        """Cleanup resources"""
        if self.db_pool:
            await self.db_pool.close()
        if self.session:
            await self.session.close()
    
    async def _ensure_tables(self):
        """Create metrics tables if they don't exist"""
        async with self.db_pool.acquire() as conn:
            # Metrics history table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS metrics_history (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    category VARCHAR(50) NOT NULL,
                    metric_name VARCHAR(100) NOT NULL,
                    value NUMERIC NOT NULL,
                    threshold NUMERIC,
                    severity VARCHAR(20),
                    metadata JSONB
                )
            """)
            
            # Active alerts table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS active_alerts (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    category VARCHAR(50) NOT NULL,
                    metric_name VARCHAR(100) NOT NULL,
                    severity VARCHAR(20) NOT NULL,
                    threshold NUMERIC,
                    current_value NUMERIC NOT NULL,
                    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    acknowledged BOOLEAN DEFAULT FALSE,
                    acknowledged_at TIMESTAMPTZ,
                    acknowledged_by VARCHAR(100),
                    resolved BOOLEAN DEFAULT FALSE,
                    resolved_at TIMESTAMPTZ,
                    metadata JSONB
                )
            """)
            
            # Resolved alerts table (stores approved/rejected alerts)
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS resolved_alerts (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    remediation_proposed TEXT,
                    status VARCHAR(20) NOT NULL,
                    resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    original_alert_id UUID,
                    metadata JSONB
                )
            """)
            
            # Alert rules table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS alert_rules (
                    id SERIAL PRIMARY KEY,
                    category VARCHAR(50) NOT NULL,
                    metric_name VARCHAR(100) NOT NULL,
                    threshold NUMERIC NOT NULL,
                    comparison VARCHAR(10) NOT NULL,
                    severity VARCHAR(20) NOT NULL,
                    enabled BOOLEAN DEFAULT TRUE,
                    cooldown_seconds INT DEFAULT 300,
                    metadata JSONB
                )
            """)
            
            # Error logs table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS error_logs (
                    id SERIAL PRIMARY KEY,
                    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    error_type VARCHAR(100) NOT NULL,
                    error_message TEXT NOT NULL,
                    error_signature VARCHAR(64) NOT NULL,
                    stack_trace TEXT,
                    context JSONB,
                    count INT DEFAULT 1
                )
            """)
            
            # Service health table
            await conn.execute("""
                CREATE TABLE IF NOT EXISTS service_health (
                    id SERIAL PRIMARY KEY,
                    service_name VARCHAR(100) NOT NULL UNIQUE,
                    last_check TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    status VARCHAR(20) NOT NULL,
                    response_time_ms INT,
                    consecutive_failures INT DEFAULT 0,
                    last_error TEXT,
                    metadata JSONB
                )
            """)
            
            print("✅ Metrics tables ensured")
    
    async def _load_alert_rules(self):
        """Load default alert rules if table is empty"""
        async with self.db_pool.acquire() as conn:
            count = await conn.fetchval("SELECT COUNT(*) FROM alert_rules")
            if count == 0:
                # Insert default rules based on THRESHOLDS
                rules = [
                    # Availability
                    ('availability', 'uptime_percentage', 90, '>=', 'critical', True, 300, None),
                    
                    # Performance
                    ('performance', 'page_load_time_ms', 2000, '>', 'warning', True, 300, None),
                    ('performance', 'http_5xx_count', 1, '>=', 'critical', True, 60, None),
                    ('performance', 'error_rate_percent', 5, '>', 'warning', True, 300, None),
                    
                    # Database
                    ('database', 'query_latency_ms', 1000, '>', 'warning', True, 300, None),
                    ('database', 'connection_pool_percent', 80, '>', 'warning', True, 300, None),
                    
                    # Infrastructure
                    ('infrastructure', 'cpu_percent', 70, '>', 'warning', True, 300, None),
                    ('infrastructure', 'memory_percent', 70, '>', 'warning', True, 300, None),
                    ('infrastructure', 'disk_percent', 80, '>', 'warning', True, 300, None),
                    
                    # Application
                    ('application', 'errors_per_hour', 100, '>', 'warning', True, 3600, None),
                    
                    # Incidents
                    ('incidents', 'consecutive_failures', 3, '>=', 'critical', True, 300, None),
                    
                    # Pipeline
                    ('pipeline', 'pipeline_status', 1, '<', 'critical', True, 60, None),
                    ('pipeline', 'pipeline_latency', 2000, '>', 'warning', True, 300, None),
                    ('pipeline', 'pipeline_errors', 5, '>', 'warning', True, 300, None),
                ]
                
                await conn.executemany("""
                    INSERT INTO alert_rules 
                    (category, metric_name, threshold, comparison, severity, enabled, cooldown_seconds, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                """, rules)
                
                print(f"✅ Inserted {len(rules)} default alert rules")
                
    async def _refresh_alert_rules(self):
        """Load rules from DB into memory for fast lookup"""
        if not self.db_pool:
            return
            
        try:
            async with self.db_pool.acquire() as conn:
                rows = await conn.fetch("SELECT category, metric_name, threshold, comparison, severity FROM alert_rules WHERE enabled = TRUE")
                # Group by category then metric_name
                new_rules = {}
                for r in rows:
                    cat = r['category']
                    if cat not in new_rules:
                        new_rules[cat] = {}
                    new_rules[cat][r['metric_name']] = {
                        'threshold': float(r['threshold']),
                        'comparison': r['comparison'],
                        'severity': r['severity']
                    }
                self.alert_rules = new_rules
                print(f"🔄 Refreshed {len(rows)} alert rules from DB")
        except Exception as e:
            print(f"⚠️ Failed to refresh alert rules: {e}")
    
    # ============================================================
    # 1. AVAILABILITY METRICS
    # ============================================================
    
    async def collect_availability_metrics(self) -> Dict[str, Any]:
        """Monitor site/service availability via Peekaping + default services"""
        metrics = {
            "category": "availability",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        # ============================================================
        # Check default core services (Frontend, Brain, Netdata)
        # ============================================================
        default_services = [
            {"name": "Frontend", "url": "http://localhost:3001"},
            {"name": "Brain", "url": "http://localhost:8000/health"},
            {"name": "Netdata", "url": "http://localhost:19998/api/v1/info"},
        ]
        
        for service in default_services:
            is_up, response_time = await self._check_service_health(service["url"])
            await self._update_service_health(service["name"], is_up, response_time)
            
            metrics["metrics"][f"{service['name']}_status"] = {
                "value": 1 if is_up else 0,
                "response_time_ms": response_time,
                "url": service["url"]
            }
            
            # Detect state change and send email
            service_key = service["name"]
            previous_state = self.service_previous_state.get(service_key, True)  # Assume UP initially
            
            if not is_up:
                # Service is DOWN
                if previous_state:  # Was UP, now DOWN - state change!
                    from email_notifications import email_service
                    print(f"🔔 SERVICE STATE CHANGE: {service_key} went DOWN")
                    await email_service.send_alert(
                        metric_name=f"{service_key} Service",
                        severity="CRITICAL",
                        value="DOWN",
                        threshold="UP",
                        category="availability",
                        description=f"{service_key} at {service['url']} is not responding"
                    )
                
                await self._trigger_alert(
                    category="availability",
                    metric_name=f"{service['name']}_down",
                    severity="critical",
                    current_value=0,
                    threshold=1,
                    metadata={"service": service["name"], "url": service["url"]}
                )
            else:
                # Service is UP
                if not previous_state:  # Was DOWN, now UP - recovery!
                    from email_notifications import email_service
                    print(f"✅ SERVICE RECOVERED: {service_key} is back UP")
                    await email_service.send_recovery_notification(
                        metric_name=f"{service_key} Service",
                        category="availability",
                        previous_severity="CRITICAL",
                        description=f"{service_key} at {service['url']} has recovered"
                    )
            
            # Update previous state
            self.service_previous_state[service_key] = is_up
        
        # ============================================================
        # Check Peekaping monitors (if any configured)
        # ============================================================
        try:
            async with self.db_pool.acquire() as conn:
                # Get all active monitors from Peekaping
                monitors = await conn.fetch("""
                    SELECT id, name, type 
                    FROM monitors 
                    WHERE active = TRUE
                """)
                
                total_monitors = 0
                up_monitors = 0
                
                for monitor in monitors:
                    total_monitors += 1
                    
                    # Get latest stats for this monitor (ignore empty rows)
                    stats = await conn.fetchrow("""
                        SELECT ping, ping_min, ping_max, up, down 
                        FROM stats 
                        WHERE monitor_id = $1 AND (up > 0 OR down > 0)
                        ORDER BY timestamp DESC 
                        LIMIT 1
                    """, monitor['id'])
                    
                    # Get latest heartbeat for current status
                    heartbeat = await conn.fetchrow("""
                        SELECT status, msg, time 
                        FROM heartbeats 
                        WHERE monitor_id = $1 
                        ORDER BY time DESC 
                        LIMIT 1
                    """, monitor['id'])
                    
                    is_up = heartbeat['status'] == 1 if heartbeat else False
                    if is_up:
                        up_monitors += 1
                        
                    # Add metrics for this service
                    metrics["metrics"][f"{monitor['name']}_status"] = {
                        "value": 1 if is_up else 0,
                        "ping_avg": stats['ping'] if stats else 0,
                        "ping_min": stats['ping_min'] if stats else 0,
                        "ping_max": stats['ping_max'] if stats else 0,
                        "last_msg": heartbeat['msg'] if heartbeat else "Unknown"
                    }
                    
                    # Trigger alert if down
                    if not is_up:
                        await self._trigger_alert(
                            category="availability",
                            metric_name=f"{monitor['name']}_down",
                            severity="critical",
                            current_value=0,
                            threshold=1,
                            metadata={
                                "service": monitor['name'], 
                                "last_error": heartbeat['msg'] if heartbeat else "No heartbeat"
                            }
                        )
                
                # Calculate overall uptime based on stats history (last 24h)
                uptime_stats = await conn.fetchrow("""
                    SELECT SUM(up) as total_up, SUM(down) as total_down
                    FROM stats
                    WHERE timestamp > NOW() - INTERVAL '24 hours'
                """)
                
                total_checks = (uptime_stats['total_up'] or 0) + (uptime_stats['total_down'] or 0)
                if total_checks > 0:
                    uptime_percentage = round((uptime_stats['total_up'] / total_checks) * 100, 3)
                else:
                    uptime_percentage = 100.0

                # Use threshold from config or default to 95.0
                thresh = self.alert_rules.get('availability', {}).get('uptime_percentage', {}).get('threshold', 95.0)
                metrics["metrics"]["uptime_percentage"] = {
                    "value": uptime_percentage,
                    "threshold": thresh
                }
                
                if uptime_percentage < thresh:
                    await self._trigger_alert(
                        category="availability",
                        metric_name="uptime_percentage",
                        severity="critical",
                        current_value=uptime_percentage,
                        threshold=thresh
                    )

        except Exception as e:
            print(f"Error collecting availability from Peekaping: {e}")
            metrics["error"] = str(e)
        
        await self._store_metrics(metrics)

        # Check DNS Resolution (Keep local check as fallback/verification)
        dns_ok = await self._check_dns_resolution(domain="google.com")
        metrics["metrics"]["dns_resolution_status"] = {
            "value": 1 if dns_ok else 0,
            "threshold": 1
        }
        
        if not dns_ok:
            await self._trigger_alert(
                category="availability",
                metric_name="dns_resolution_error",
                severity="critical",
                current_value=0,
                threshold=1,
                metadata={"domain": "google.com"}
            )
            
        return metrics

    async def _check_dns_resolution(self, domain: str) -> bool:
        """Check if DNS resolution is working"""
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, socket.gethostbyname, domain)
            return True
        except:
            return False
    
    async def _check_service_health(self, url: str) -> tuple[bool, int]:
        """Check if a service is responsive"""
        try:
            start = time.time()
            async with self.session.get(url) as resp:
                response_time = int((time.time() - start) * 1000)
                return resp.status < 500, response_time
        except Exception as e:
            print(f"Service check failed for {url}: {e}")
            return False, 0
    
    async def _update_service_health(self, service_name: str, is_up: bool, response_time: int):
        """Update service health status in database"""
        async with self.db_pool.acquire() as conn:
            status = "up" if is_up else "down"
            
            # Get current consecutive failures
            current = await conn.fetchrow(
                "SELECT consecutive_failures FROM service_health WHERE service_name = $1",
                service_name
            )
            
            consecutive_failures = 0
            if current:
                consecutive_failures = 0 if is_up else current['consecutive_failures'] + 1
            else:
                consecutive_failures = 0 if is_up else 1
            
            await conn.execute("""
                INSERT INTO service_health 
                (service_name, last_check, status, response_time_ms, consecutive_failures)
                VALUES ($1, NOW(), $2, $3, $4)
                ON CONFLICT (service_name) DO UPDATE SET
                    last_check = EXCLUDED.last_check,
                    status = EXCLUDED.status,
                    response_time_ms = EXCLUDED.response_time_ms,
                    consecutive_failures = EXCLUDED.consecutive_failures
            """, service_name, status, response_time, consecutive_failures)
    
    async def _calculate_uptime(self) -> float:
        """Calculate uptime percentage from last 24 hours"""
        async with self.db_pool.acquire() as conn:
            # Get health checks from last 24 hours
            result = await conn.fetchrow("""
                SELECT 
                    COUNT(*) as total_checks,
                    COUNT(*) FILTER (WHERE status = 'up') as up_checks
                FROM service_health
                WHERE last_check > NOW() - INTERVAL '24 hours'
            """)
            
            if result and result['total_checks'] > 0:
                return (result['up_checks'] / result['total_checks']) * 100
            return 100.0
    
    # ============================================================
    # 2. PERFORMANCE METRICS
    # ============================================================
    
    async def collect_performance_metrics(self) -> Dict[str, Any]:
        """Monitor page load times and HTTP errors via Peekaping + default services"""
        metrics = {
            "category": "performance",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        # ============================================================
        # Collect latency from default services (Frontend, Brain, Netdata)
        # ============================================================
        default_services = [
            {"name": "Frontend", "url": "http://localhost:3001"},
            {"name": "Brain", "url": "http://localhost:8000/health"},
            {"name": "Netdata", "url": "http://localhost:19998/api/v1/info"},
        ]
        
        # Get thresholds from config
        perf_rules = self.alert_rules.get('performance', {})
        page_load_thresh = perf_rules.get('page_load_time_ms', {}).get('threshold', 2000)
        
        service_latencies = []
        for service in default_services:
            is_up, response_time = await self._check_service_health(service["url"])
            if is_up and response_time > 0:
                service_latencies.append(response_time)
                metrics["metrics"][f"{service['name']}_latency_ms"] = {
                    "value": response_time,
                    "threshold": page_load_thresh
                }
                
                # Trigger alert for each service if above threshold
                if response_time > page_load_thresh:
                    await self._trigger_alert(
                        category="performance",
                        metric_name="page_load_time_ms",
                        severity="warning",
                        current_value=response_time,
                        threshold=page_load_thresh,
                        metadata={"service": service['name'], "url": service['url']}
                    )
        
        # Calculate min/max/avg from default services
        if service_latencies:
            metrics["metrics"]["page_load_latency_min_ms"] = {
                "value": min(service_latencies),
                "threshold": 500
            }
            metrics["metrics"]["page_load_latency_max_ms"] = {
                "value": max(service_latencies),
                "threshold": page_load_thresh
            }
            metrics["metrics"]["page_load_latency_avg_ms"] = {
                "value": round(sum(service_latencies) / len(service_latencies), 3),
                "threshold": 1000
            }
        
        # ============================================================
        # Collect latency from Peekaping monitors (if any)
        # ============================================================
        try:
            async with self.db_pool.acquire() as conn:
                # Get latency stats from Peekaping (ping_min, ping, ping_max)
                latency_stats = await conn.fetchrow("""
                    SELECT s.ping as ping_avg, s.ping_min, s.ping_max
                    FROM stats s
                    JOIN monitors m ON s.monitor_id = m.id
                    WHERE m.active = TRUE AND (s.up > 0 OR s.down > 0)
                    ORDER BY s.timestamp DESC
                    LIMIT 1
                """)
                
                if latency_stats:
                    ping_min = float(latency_stats['ping_min'] or 0)
                    ping_avg = float(latency_stats['ping_avg'] or 0)
                    ping_max = float(latency_stats['ping_max'] or 0)
                    
                    metrics["metrics"]["page_load_latency_min_ms"] = {
                        "value": ping_min,
                        "threshold": 500
                    }
                    metrics["metrics"]["page_load_latency_avg_ms"] = {
                        "value": ping_avg,
                        "threshold": 1000
                    }
                    metrics["metrics"]["page_load_latency_max_ms"] = {
                        "value": ping_max,
                        "threshold": 2000
                    }
                    
                    # Use max for alerting (worst case)
                    if ping_max > 2000:
                        await self._trigger_alert(
                            category="performance",
                            metric_name="page_load_latency_max_ms",
                            severity="warning",
                            current_value=ping_max,
                            threshold=2000
                        )
            
                # Fetch 5xx errors from Peekaping Heartbeats
                error_stats = await conn.fetchrow("""
                    SELECT 
                        COUNT(*) as total_checks,
                        COUNT(*) FILTER (WHERE msg LIKE '5%') as http_5xx
                    FROM heartbeats
                    WHERE time > NOW() - INTERVAL '1 hour'
                """)
                
                http_5xx_count = error_stats['http_5xx'] or 0
                total_checks = error_stats['total_checks'] or 0
                
                metrics["metrics"]["http_5xx_count"] = {
                    "value": http_5xx_count,
                    "threshold": 1
                }
                
                if http_5xx_count >= 1:
                    await self._trigger_alert(
                        category="performance",
                        metric_name="http_5xx_count",
                        severity="critical",
                        current_value=http_5xx_count,
                        threshold=1,
                        metadata={"source": "peekaping_heartbeats"}
                    )
                
                # Calculate error rate
                error_rate = round((http_5xx_count / total_checks * 100), 3) if total_checks > 0 else 0.0
                metrics["metrics"]["error_rate_percent"] = {
                    "value": error_rate,
                    "threshold": 5
                }
                
                if error_rate > 5:
                    await self._trigger_alert(
                        category="performance",
                        metric_name="error_rate_percent",
                        severity="warning",
                        current_value=error_rate,
                        threshold=5
                    )
                    
        except Exception as e:
            print(f"Error collecting performance metrics: {e}")
            metrics["error"] = str(e)
        
        await self._store_metrics(metrics)
        return metrics
    

    
    # ============================================================
    # 3. DATABASE METRICS
    # ============================================================
    
    async def collect_database_metrics(self) -> Dict[str, Any]:
        """Monitor database query performance and connections"""
        metrics = {
            "category": "database",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        # Test query latency
        query_latency = await self._measure_query_latency()
        metrics["metrics"]["query_latency_ms"] = {
            "value": query_latency,
            "threshold": 3000
        }
        
        if query_latency > 3000:
            await self._trigger_alert(
                category="database",
                metric_name="query_latency_ms",
                severity="warning",
                current_value=query_latency,
                threshold=3000
            )
        
        # Check connection pool usage
        pool_usage = await self._get_connection_pool_usage()
        metrics["metrics"]["connection_pool_percent"] = {
            "value": pool_usage,
            "threshold": 80
        }
        
        if pool_usage > 80:
            await self._trigger_alert(
                category="database",
                metric_name="connection_pool_percent",
                severity="warning",
                current_value=pool_usage,
                threshold=80
            )
        
        await self._store_metrics(metrics)
        return metrics
    
    async def _measure_query_latency(self) -> float:
        """Measure a test query latency in milliseconds"""
        try:
            async with self.db_pool.acquire() as conn:
                start = time.perf_counter()
                # Run a real query (count items in history)
                await conn.fetchval("SELECT COUNT(*) FROM metrics_history")
                latency = (time.perf_counter() - start) * 1000
                return round(latency, 3)
        except Exception as e:
            print(f"Error measuring query latency: {e}")
            return 9999.0
    
    async def _get_connection_pool_usage(self) -> float:
        """Get current connection pool utilization percentage"""
        if self.db_pool:
            size = self.db_pool.get_size()
            max_size = self.db_pool.get_max_size()
            return (size / max_size) * 100 if max_size > 0 else 0
        return 0
    
    # ============================================================
    # 4. INFRASTRUCTURE METRICS
    # ============================================================
    
    async def collect_infrastructure_metrics(self) -> Dict[str, Any]:
        """Monitor CPU, Memory, Disk usage via Netdata"""
        metrics = {
            "category": "infrastructure",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        # CPU Usage
        cpu_percent = await self._get_cpu_usage_percent()
        cpu_thresh = self.alert_rules.get('infrastructure', {}).get('cpu_percent', {}).get('threshold', 70)
        metrics["metrics"]["cpu_percent"] = {
            "value": cpu_percent,
            "threshold": cpu_thresh
        }
        
        if cpu_percent > cpu_thresh:
            await self._trigger_alert(
                category="infrastructure",
                metric_name="cpu_percent",
                severity="warning",
                current_value=cpu_percent,
                threshold=cpu_thresh
            )
            
        # Memory Usage
        mem_percent = await self._get_memory_usage_percent()
        mem_thresh = self.alert_rules.get('infrastructure', {}).get('memory_percent', {}).get('threshold', 70)
        metrics["metrics"]["memory_percent"] = {
            "value": mem_percent,
            "threshold": mem_thresh
        }
        
        if mem_percent > mem_thresh:
            await self._trigger_alert(
                category="infrastructure",
                metric_name="memory_percent",
                severity="warning",
                current_value=mem_percent,
                threshold=mem_thresh
            )
        
        # Disk Usage
        disk_percent = await self._get_disk_usage_percent()
        disk_thresh = self.alert_rules.get('infrastructure', {}).get('disk_percent', {}).get('threshold', 80)
        metrics["metrics"]["disk_percent"] = {
            "value": disk_percent,
            "threshold": disk_thresh
        }
        
        if disk_percent > disk_thresh:
            await self._trigger_alert(
                category="infrastructure",
                metric_name="disk_percent",
                severity="warning",
                current_value=disk_percent,
                threshold=disk_thresh
            )
        
        await self._store_metrics(metrics)
        return metrics
    
    async def _get_cpu_usage_percent(self) -> float:
        """Get CPU usage percentage from Netdata"""
        return await self._get_netdata_metric("system.cpu", aggregate=True)
    
    async def _get_netdata_metric(self, chart: str, aggregate: bool = False) -> float:
        """Get metric value from Netdata"""
        try:
            url = f"{NETDATA_URL}/api/v1/data?chart={chart}&after=-1&points=1&format=json"
            async with self.session.get(url) as resp:
                data = await resp.json()
                if data.get('data') and len(data['data']) > 0:
                    values = data['data'][0][1:]  # Skip timestamp
                    if aggregate:
                        return round(sum(abs(v) if v is not None else 0 for v in values), 3)
                    return round(values[0], 3) if values and values[0] is not None else 0
        except Exception as e:
            print(f"Netdata error for {chart}: {e}")
            return 0
        return 0
    
    async def _get_memory_usage_percent(self) -> float:
        """Calculate memory usage percentage from Netdata"""
        try:
            url = f"{NETDATA_URL}/api/v1/data?chart=system.ram&after=-1&points=1&format=json"
            async with self.session.get(url) as resp:
                data = await resp.json()
                if data.get('data') and len(data['data']) > 0:
                    # Labels: [time, free, used, cached, buffers]
                    values = data['data'][0][1:]
                    total = sum(abs(v) for v in values if v is not None)
                    used = abs(values[1]) if len(values) > 1 else 0  # Actual 'used' memory
                    return round((used / total * 100), 3) if total > 0 else 0
        except:
            return 0
        return 0
    
    async def _get_disk_usage_percent(self) -> float:
        """Get disk usage percentage from Netdata"""
        try:
            url = f"{NETDATA_URL}/api/v1/data?chart=disk_space._&after=-1&points=1&format=json"
            async with self.session.get(url) as resp:
                data = await resp.json()
                if data.get('data') and len(data['data']) > 0:
                    values = data['data'][0][1:]
                    # Disk usage is typically reported as percentage
                    return abs(values[0]) if values else 0
        except:
            return 0
        return 0
    
    # ============================================================
    # 5. APPLICATION METRICS
    # ============================================================
    
    async def collect_application_metrics(self) -> Dict[str, Any]:
        """Monitor application errors and logs"""
        metrics = {
            "category": "application",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        # Count errors in last hour
        errors_per_hour = await self._count_errors_last_hour()
        metrics["metrics"]["errors_per_hour"] = {
            "value": errors_per_hour,
            "threshold": 100
        }
        
        if errors_per_hour > 100:
            await self._trigger_alert(
                category="application",
                metric_name="errors_per_hour",
                severity="warning",
                current_value=errors_per_hour,
                threshold=100
            )
        
        # Count unique error types today
        unique_errors = await self._count_unique_errors_daily()
        metrics["metrics"]["unique_errors_daily"] = {
            "value": unique_errors,
            "threshold": 5
        }
        
        await self._store_metrics(metrics)
        return metrics
    
    async def _count_errors_last_hour(self) -> int:
        """Count error log entries from last hour"""
        async with self.db_pool.acquire() as conn:
            count = await conn.fetchval("""
                SELECT COALESCE(SUM(count), 0)
                FROM error_logs
                WHERE timestamp > NOW() - INTERVAL '1 hour'
            """)
            return count or 0
    
    async def _count_unique_errors_daily(self) -> int:
        """Count unique error signatures from today"""
        async with self.db_pool.acquire() as conn:
            count = await conn.fetchval("""
                SELECT COUNT(DISTINCT error_signature)
                FROM error_logs
                WHERE timestamp > CURRENT_DATE
            """)
            return count or 0
    
    async def log_error(self, error_type: str, error_message: str, stack_trace: str = None, context: dict = None):
        """Log an application error"""
        # Generate error signature
        signature_content = f"{error_type}:{error_message}"
        error_signature = hashlib.sha256(signature_content.encode()).hexdigest()
        
        async with self.db_pool.acquire() as conn:
            # Check if this error already exists
            existing = await conn.fetchrow("""
                SELECT id, count FROM error_logs
                WHERE error_signature = $1 AND timestamp > NOW() - INTERVAL '1 hour'
            """, error_signature)
            
            if existing:
                # Increment count
                await conn.execute("""
                    UPDATE error_logs SET count = count + 1, timestamp = NOW()
                    WHERE id = $1
                """, existing['id'])
            else:
                # Insert new error
                await conn.execute("""
                    INSERT INTO error_logs 
                    (error_type, error_message, error_signature, stack_trace, context)
                    VALUES ($1, $2, $3, $4, $5)
                """, error_type, error_message, error_signature, stack_trace, context)
    
    # ============================================================
    # 6. INCIDENT METRICS
    # ============================================================
    
    async def collect_incident_metrics(self) -> Dict[str, Any]:
        """Monitor service incidents and failures"""
        metrics = {
            "category": "incidents",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        # Check for services with consecutive failures
        critical_services = await self._get_services_with_consecutive_failures()
        metrics["metrics"]["critical_services"] = {
            "value": len(critical_services),
            "services": critical_services
        }
        
        for service in critical_services:
            await self._trigger_alert(
                category="incidents",
                metric_name="service_down",
                severity="critical",
                current_value=service['consecutive_failures'],
                threshold=3,
                metadata={"service": service['service_name']}
            )
        
        await self._store_metrics(metrics)
        return metrics
    
    async def _get_services_with_consecutive_failures(self) -> List[Dict]:
        """Get services that have failed multiple times consecutively"""
        async with self.db_pool.acquire() as conn:
            services = await conn.fetch("""
                SELECT service_name, consecutive_failures, last_error
                FROM service_health
                WHERE consecutive_failures >= 3
            """)
            return [dict(s) for s in services]
    
    # ============================================================
    # HELPER METHODS
    # ============================================================
    
    async def _store_metrics(self, metrics_data: Dict):
        """Store metrics in history table"""
        import json
        if not self.db_pool: return
        
        async with self.db_pool.acquire() as conn:
            # Refresh rules at start of cycle to ensure latest thresholds
            if metrics_data.get("category") == "availability":
                await self._refresh_alert_rules()
                
            for metric_name, metric_value in metrics_data["metrics"].items():
                value = self._round_val(metric_value.get("value", 0))
                threshold = self._round_val(metric_value.get("threshold"))
                severity = metric_value.get("severity") 
                
                # Round everything in the metadata dictionary too
                rounded_metadata = self._round_val(metric_value)
                
                # Try to look up severity if missing
                if not severity:
                    cat = metrics_data.get("category")
                    rule = self.alert_rules.get(cat, {}).get(metric_name)
                    if rule:
                         severity = rule['severity']
                
                await conn.execute("""
                    INSERT INTO metrics_history 
                    (category, metric_name, value, threshold, severity, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, metrics_data["category"], metric_name, value, threshold, severity, json.dumps(rounded_metadata))
    
    async def _trigger_alert(self, category: str, metric_name: str, severity: str, 
                            current_value: float, threshold: float, metadata: dict = None):
        """Trigger an alert if not already active"""
        import json
        from email_notifications import email_service
        
        async with self.db_pool.acquire() as conn:
            # Check if alert already exists and is not resolved
            existing = await conn.fetchrow("""
                SELECT id FROM active_alerts
                WHERE category = $1 AND metric_name = $2 AND resolved = FALSE
            """, category, metric_name)
            
            if not existing:
                # Round current value and threshold for storage
                current_value = self._round_val(current_value)
                threshold = self._round_val(threshold)
                rounded_metadata = self._round_val(metadata or {})
                
                # Create new alert
                await conn.execute("""
                    INSERT INTO active_alerts 
                    (category, metric_name, severity, threshold, current_value, metadata)
                    VALUES ($1, $2, $3, $4, $5, $6)
                """, category, metric_name, severity, threshold, current_value, json.dumps(rounded_metadata))
                
                print(f"🚨 ALERT: {severity.upper()} - {category}/{metric_name} = {current_value} (threshold: {threshold})")
                
                # Send email notification for warning and critical alerts
                if severity.lower() in ["warning", "critical"]:
                    await email_service.send_alert(
                        metric_name=metric_name,
                        severity=severity.upper(),
                        value=current_value,
                        threshold=threshold,
                        category=category,
                        description=f"Threshold breached in {category}",
                        metadata=metadata
                    )

                # Auto-create incident for critical alerts
                if severity.lower() == "critical":
                    await incident_manager.create_incident(
                        title=f"{category.title()}: {metric_name} Critical Alert",
                        description=f"Threshold breached: {current_value} (Limit: {threshold}). \nMetadata: {json.dumps(metadata or {})}",
                        severity="CRITICAL",
                        source="MonitoringService"
                    )
    

    # ============================================================
    # 7. SECURITY & TRAFFIC METRICS
    # ============================================================
    
    async def collect_security_metrics(self) -> Dict[str, Any]:
        """Monitor for security threats and traffic anomalies"""
        metrics = {
            "category": "security",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        # Simulate DDoS detection (requests per second)
        rps = await self._get_requests_per_second()
        metrics["metrics"]["requests_per_second"] = {
            "value": rps,
            "threshold": 1000 # Configurable threshold for DDoS
        }
        
        if rps > 1000:
             await self._trigger_alert(
                category="security",
                metric_name="ddos_detected",
                severity="critical",
                current_value=rps,
                threshold=1000,
                metadata={"type": "high_traffic_volume"}
            )

        # Simulate Brute Force detection (failed logins / auth errors)
        failed_logins = await self._count_failed_logins()
        metrics["metrics"]["brute_force_attempts"] = {
            "value": failed_logins,
            "threshold": 50
        }
        
        if failed_logins > 50:
             await self._trigger_alert(
                category="security",
                metric_name="brute_force_attempts",
                severity="warning",
                current_value=failed_logins,
                threshold=50,
                metadata={"type": "auth_failures"}
            )
            
        # Check CDN/Edge status (simulated)
        cdn_ok = True # Placeholder for actual CDN check
        metrics["metrics"]["cdn_status"] = {
            "value": 1 if cdn_ok else 0,
            "threshold": 1
        }
        
        if not cdn_ok:
             await self._trigger_alert(
                category="security",
                metric_name="cdn_failure",
                severity="critical",
                current_value=0,
                threshold=1
            )

        await self._store_metrics(metrics)
        return metrics
        
    async def _get_requests_per_second(self) -> int:
        """Get current RPS from Netdata or logs"""
        # Placeholder simulation
        return await self._get_netdata_metric("web_log.requests", aggregate=True)

    async def _count_failed_logins(self) -> int:
        """Count recent failed login attempts"""
        # Placeholder simulation
        return 0


    # ============================================================
    # 7. SECURITY & TRAFFIC METRICS
    # ============================================================
    
    async def collect_security_metrics(self) -> Dict[str, Any]:
        """Monitor for security threats and traffic anomalies"""
        metrics = {
            "category": "security",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        # Simulate DDoS detection (requests per second)
        rps = await self._get_requests_per_second()
        metrics["metrics"]["requests_per_second"] = {
            "value": rps,
            "threshold": 1000 # Configurable threshold for DDoS
        }
        
        if rps > 1000:
             await self._trigger_alert(
                category="security",
                metric_name="ddos_detected",
                severity="critical",
                current_value=rps,
                threshold=1000,
                metadata={"type": "high_traffic_volume"}
            )

        # Simulate Brute Force detection (failed logins / auth errors)
        failed_logins = await self._count_failed_logins()
        metrics["metrics"]["brute_force_attempts"] = {
            "value": failed_logins,
            "threshold": 50
        }
        
        if failed_logins > 50:
             await self._trigger_alert(
                category="security",
                metric_name="brute_force_attempts",
                severity="warning",
                current_value=failed_logins,
                threshold=50,
                metadata={"type": "auth_failures"}
            )
            
        # Check CDN/Edge status (simulated)
        cdn_ok = True # Placeholder for actual CDN check
        metrics["metrics"]["cdn_status"] = {
            "value": 1 if cdn_ok else 0,
            "threshold": 1
        }
        
        if not cdn_ok:
             await self._trigger_alert(
                category="security",
                metric_name="cdn_failure",
                severity="critical",
                current_value=0,
                threshold=1
            )

        await self._store_metrics(metrics)
        return metrics
        
    async def _count_failed_logins(self) -> int:
        """Count recent failed login attempts"""
        # Placeholder simulation
        return 0

    # ============================================================
    # 8. PIPELINE METRICS
    # ============================================================
    
    async def collect_pipeline_metrics(self) -> Dict[str, Any]:
        """Monitor website CI/CD pipeline states"""
        metrics = {
            "category": "pipeline",
            "timestamp": datetime.utcnow().isoformat(),
            "metrics": {}
        }
        
        state = self.pipeline_sim.get_state()
        
        # Pipeline Status (1 = Healthy, 0 = Failed)
        is_healthy = 1 if state["stages"]["build"] == "success" and state["stages"]["test"] == "success" and state["stages"]["deploy"] == "success" else 0
        metrics["metrics"]["pipeline_status"] = {
            "value": is_healthy,
            "threshold": 1,
            "mode": state["mode"],
            "stages": state["stages"]
        }
        
        if is_healthy == 0:
            failed_stage = next((stage for stage, status in state["stages"].items() if status == "failed"), "unknown")
            await self._trigger_alert(
                category="pipeline",
                metric_name="pipeline_status",
                severity="critical",
                current_value=0,
                threshold=1,
                metadata={"mode": state["mode"], "failed_stage": failed_stage}
            )
            
        # Pipeline Latency
        latency = state["metrics"]["latency_ms"]
        metrics["metrics"]["pipeline_latency"] = {
            "value": latency,
            "threshold": 2000
        }
        
        if latency > 2000:
            await self._trigger_alert(
                category="pipeline",
                metric_name="pipeline_latency",
                severity="warning",
                current_value=latency,
                threshold=2000,
                metadata={"mode": state["mode"]}
            )
            
        # Pipeline Errors
        errors = state["metrics"]["error_rate"]
        metrics["metrics"]["pipeline_errors"] = {
            "value": errors,
            "threshold": 5
        }
        
        if errors > 5:
            await self._trigger_alert(
                category="pipeline",
                metric_name="pipeline_errors",
                severity="warning",
                current_value=errors,
                threshold=5,
                metadata={"mode": state["mode"]}
            )
            
        await self._store_metrics(metrics)
        return metrics

    async def get_all_metrics_summary(self) -> Dict:
        """Get summary of all metric categories"""
        summary = {
            "timestamp": datetime.utcnow().isoformat(),
            "categories": {}
        }
        
        # Collect all metrics
        summary["categories"]["availability"] = await self.collect_availability_metrics()
        summary["categories"]["performance"] = await self.collect_performance_metrics()
        summary["categories"]["database"] = await self.collect_database_metrics()
        summary["categories"]["infrastructure"] = await self.collect_infrastructure_metrics()
        summary["categories"]["application"] = await self.collect_application_metrics()
        summary["categories"]["security"] = await self.collect_security_metrics()
        summary["categories"]["incidents"] = await self.collect_incident_metrics()
        summary["categories"]["pipeline"] = await self.collect_pipeline_metrics()
        
        # Get active alerts count
        async with self.db_pool.acquire() as conn:
            alerts_count = await conn.fetchval("""
                SELECT COUNT(*) FROM active_alerts WHERE resolved = FALSE
            """)
            summary["active_alerts_count"] = alerts_count
        
        return summary
    
    async def get_active_alerts(self) -> List[Dict]:
        """Get all unresolved alerts"""
        async with self.db_pool.acquire() as conn:
            alerts = await conn.fetch("""
                SELECT * FROM active_alerts
                WHERE resolved = FALSE
                ORDER BY severity DESC, triggered_at DESC
                LIMIT 50
            """)
            return [dict(a) for a in alerts]
    
    async def acknowledge_alert(self, alert_id: str, acknowledged_by: str):
        """Acknowledge an alert"""
        async with self.db_pool.acquire() as conn:
            await conn.execute("""
                UPDATE active_alerts
                SET acknowledged = TRUE, acknowledged_at = NOW(), acknowledged_by = $2
                WHERE id = $1
            """, alert_id, acknowledged_by)
    
    async def resolve_alert(self, alert_id: str):
        """Mark alert as resolved and send recovery notification"""
        from email_notifications import email_service
        
        async with self.db_pool.acquire() as conn:
            # Get alert details before resolving
            alert = await conn.fetchrow("""
                SELECT category, metric_name, severity FROM active_alerts WHERE id = $1
            """, alert_id)
            
            await conn.execute("""
                UPDATE active_alerts
                SET resolved = TRUE, resolved_at = NOW()
                WHERE id = $1
            """, alert_id)
            
            # Send recovery email
            if alert and alert['severity'].lower() in ['warning', 'critical']:
                await email_service.send_recovery_notification(
                    metric_name=alert['metric_name'],
                    category=alert['category'],
                    previous_severity=alert['severity'].upper(),
                    description=f"Alert resolved automatically"
                )
                print(f"✅ RESOLVED: {alert['category']}/{alert['metric_name']}")

    async def create_incident_from_alert(self, alert_id: str, category: str,
                                         metric_name: str, severity: str, metadata: dict):
        """Create incident from critical alert with automatic type detection"""
        try:
            from incident_manager import incident_manager
            from incident_types import detect_incident_type_from_alert, get_incident_config
            
            incident_type = detect_incident_type_from_alert(category, metric_name, severity)
            incident_type_str = incident_type.value if incident_type else "unknown"
            config = get_incident_config(incident_type) if incident_type else None
            
            title = f"{category.upper()} Alert: {metric_name}"
            description = f"Alert triggered: {metric_name} (severity: {severity})"
            if metadata:
                description += f"\n\nDetails: {json.dumps(metadata, indent=2)}"
            
            response_sla = config.response_sla_minutes if config else 15
            resolution_sla = config.resolution_sla_minutes if config else 60
            
            incident_id = await incident_manager.create_incident(
                title=title,
                description=description,
                severity=severity.upper(),
                source=f"Alert:{alert_id}",
                incident_type=incident_type_str,
                response_sla_minutes=response_sla,
                resolution_sla_minutes=resolution_sla
            )
            
            # Auto-triage
            await incident_manager.triage_incident(incident_id)
            
            print(f"📋 Incident {incident_id[:8]} created from alert (type: {incident_type_str})")
            return incident_id
        except Exception as e:
            print(f"Error creating incident: {e}")
            return None


# Global instance
metrics_collector = MetricsCollector()
