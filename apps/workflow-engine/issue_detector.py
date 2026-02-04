"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║     █████╗ ██╗ ██████╗ ██████╗ ███████╗    ██████╗ ███████╗████████╗███████╗ ║
║    ██╔══██╗██║██╔═══██╗██╔══██╗██╔════╝    ██╔══██╗██╔════╝╚══██╔══╝██╔════╝ ║
║    ███████║██║██║   ██║██████╔╝███████╗    ██║  ██║█████╗     ██║   █████╗   ║
║    ██╔══██║██║██║   ██║██╔═══╝ ╚════██║    ██║  ██║██╔══╝     ██║   ██╔══╝   ║
║    ██║  ██║██║╚██████╔╝██║     ███████║    ██████╔╝███████╗   ██║   ███████╗ ║
║    ╚═╝  ╚═╝╚═╝ ╚═════╝ ╚═╝     ╚══════╝    ╚═════╝ ╚══════╝   ╚═╝   ╚══════╝ ║
║                                                                              ║
║                    ISSUE DETECTION ENGINE v1.0                               ║
║              AI-Powered Self-Healing Infrastructure System                   ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

The brain that watches everything. The guardian that never sleeps.
Detects 30 types of infrastructure issues in real-time.

Author: AIOps Platform Team
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Dict, List, Optional, Any, Callable
import asyncio
import logging
import json
import hashlib
from collections import defaultdict

# Configure logging with style
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s │ %(levelname)-8s │ %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger("🔍 IssueDetector")


# ══════════════════════════════════════════════════════════════════════════════
# ENUMS & DATA CLASSES
# ══════════════════════════════════════════════════════════════════════════════

class Severity(Enum):
    """Issue severity levels - determines response urgency"""
    P0_CRITICAL = 0   # Immediate auto-action required
    P1_HIGH = 1       # Action within 5 minutes
    P2_MEDIUM = 2     # Action within 30 minutes
    P3_LOW = 3        # Informational, schedule fix


class Category(Enum):
    """Issue categories for organization and filtering"""
    COMPUTE = "compute"
    STORAGE = "storage"
    NETWORK = "network"
    APPLICATION = "application"
    SECURITY = "security"
    CONTAINER = "container"
    COMPLIANCE = "compliance"
    BUSINESS = "business"


class IssueStatus(Enum):
    """Current status of a detected issue"""
    DETECTED = "detected"           # Just found
    ACKNOWLEDGED = "acknowledged"   # Team is aware
    REMEDIATING = "remediating"     # Fix in progress
    RESOLVED = "resolved"           # Fixed!
    ESCALATED = "escalated"         # Needs human intervention


@dataclass
class DetectionPattern:
    """
    Defines how to detect a specific issue type.
    The DNA of each issue - what triggers it, what it means.
    """
    id: str                                    # Unique identifier
    name: str                                  # Human readable name
    description: str                           # What this issue means
    category: Category                         # Which category
    severity: Severity                         # How urgent
    
    # Detection logic
    metric_key: str                            # Which metric to watch
    condition: str                             # "gt", "lt", "eq", "spike", "drop"
    threshold: float                           # Threshold value
    duration_seconds: int                      # How long before triggering
    
    # Suggested remediation
    suggested_workflow_id: str                 # Which workflow template to suggest
    auto_remediate: bool                       # Can we auto-fix without approval?
    
    # Additional context
    icon: str = "⚠️"                           # Visual icon
    tags: List[str] = field(default_factory=list)
    cooldown_seconds: int = 300                # Minimum time between alerts


@dataclass
class DetectedIssue:
    """
    A specific issue instance that was detected.
    The crime scene report.
    """
    id: str                                    # Unique issue ID
    pattern_id: str                            # Which pattern triggered this
    pattern_name: str                          # Human readable pattern name
    category: Category
    severity: Severity
    status: IssueStatus
    
    # Context
    host: str                                  # Which host/server
    metric_value: float                        # Current value that triggered
    threshold: float                           # What the threshold was
    message: str                               # Human readable description
    
    # Timestamps
    detected_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    
    # Remediation
    suggested_workflow_id: str = ""
    auto_remediate: bool = False
    remediation_started: bool = False
    remediation_result: Optional[str] = None
    
    # Metadata
    icon: str = "⚠️"
    raw_data: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API responses"""
        return {
            "id": self.id,
            "pattern_id": self.pattern_id,
            "pattern_name": self.pattern_name,
            "category": self.category.value,
            "severity": self.severity.name,
            "severity_level": self.severity.value,
            "status": self.status.value,
            "host": self.host,
            "metric_value": round(self.metric_value, 2),
            "threshold": self.threshold,
            "message": self.message,
            "detected_at": self.detected_at.isoformat(),
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "suggested_workflow_id": self.suggested_workflow_id,
            "auto_remediate": self.auto_remediate,
            "remediation_started": self.remediation_started,
            "icon": self.icon,
            "age_seconds": (datetime.utcnow() - self.detected_at).total_seconds(),
        }


# ══════════════════════════════════════════════════════════════════════════════
# THE 30 DETECTION PATTERNS - THE COMPLETE ARSENAL
# ══════════════════════════════════════════════════════════════════════════════

DETECTION_PATTERNS: List[DetectionPattern] = [
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 1: COMPUTE RESOURCES
    # ─────────────────────────────────────────────────────────────────────────
    DetectionPattern(
        id="memory_crisis",
        name="Memory Crisis",
        description="RAM usage critically high - system may become unresponsive",
        category=Category.COMPUTE,
        severity=Severity.P0_CRITICAL,
        metric_key="system.ram.used_percent",
        condition="gt",
        threshold=90.0,
        duration_seconds=300,
        suggested_workflow_id="wf_memory_crisis_recovery",
        auto_remediate=True,
        icon="🔴",
        tags=["memory", "ram", "oom", "critical"],
    ),
    DetectionPattern(
        id="cpu_spike",
        name="CPU Spike",
        description="CPU usage sustained at high levels - performance degradation likely",
        category=Category.COMPUTE,
        severity=Severity.P1_HIGH,
        metric_key="system.cpu.total_percent",
        condition="gt",
        threshold=85.0,
        duration_seconds=600,
        suggested_workflow_id="wf_cpu_spike_response",
        auto_remediate=True,
        icon="🟠",
        tags=["cpu", "performance", "load"],
    ),
    DetectionPattern(
        id="zombie_processes",
        name="Zombie Process Accumulation",
        description="Too many zombie processes detected - resource leak",
        category=Category.COMPUTE,
        severity=Severity.P2_MEDIUM,
        metric_key="system.processes.zombie_count",
        condition="gt",
        threshold=50.0,
        duration_seconds=60,
        suggested_workflow_id="wf_zombie_cleanup",
        auto_remediate=True,
        icon="🧟",
        tags=["zombie", "processes", "cleanup"],
    ),
    DetectionPattern(
        id="memory_leak",
        name="Memory Leak Detection",
        description="Memory growing steadily without release - application leak suspected",
        category=Category.COMPUTE,
        severity=Severity.P1_HIGH,
        metric_key="system.ram.growth_rate_percent_per_hour",
        condition="gt",
        threshold=10.0,
        duration_seconds=21600,  # 6 hours
        suggested_workflow_id="wf_memory_leak_response",
        auto_remediate=False,  # Needs approval before restart
        icon="🧠",
        tags=["memory", "leak", "growth"],
    ),
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 2: STORAGE & DATA
    # ─────────────────────────────────────────────────────────────────────────
    DetectionPattern(
        id="disk_critical",
        name="Disk Space Critical",
        description="Disk usage critically high - writes may fail",
        category=Category.STORAGE,
        severity=Severity.P1_HIGH,
        metric_key="system.disk.used_percent",
        condition="gt",
        threshold=90.0,
        duration_seconds=60,
        suggested_workflow_id="wf_disk_cleanup",
        auto_remediate=True,
        icon="🟢",
        tags=["disk", "storage", "space"],
    ),
    DetectionPattern(
        id="db_latency_spike",
        name="Database Latency Spike",
        description="Database queries taking too long - performance impact",
        category=Category.STORAGE,
        severity=Severity.P0_CRITICAL,
        metric_key="database.query.avg_time_ms",
        condition="gt",
        threshold=5000.0,
        duration_seconds=120,
        suggested_workflow_id="wf_db_latency_fix",
        auto_remediate=False,  # Dangerous to auto-kill queries
        icon="🟡",
        tags=["database", "latency", "slow"],
    ),
    DetectionPattern(
        id="db_connection_exhausted",
        name="Database Connection Pool Exhausted",
        description="Running out of database connections",
        category=Category.STORAGE,
        severity=Severity.P0_CRITICAL,
        metric_key="database.connections.active_percent",
        condition="gt",
        threshold=90.0,
        duration_seconds=60,
        suggested_workflow_id="wf_db_connection_fix",
        auto_remediate=True,
        icon="🔗",
        tags=["database", "connections", "pool"],
    ),
    DetectionPattern(
        id="filesystem_readonly",
        name="Filesystem Read-Only",
        description="Filesystem mounted as read-only - writes failing",
        category=Category.STORAGE,
        severity=Severity.P0_CRITICAL,
        metric_key="system.disk.readonly",
        condition="eq",
        threshold=1.0,
        duration_seconds=10,
        suggested_workflow_id="wf_fs_readonly_fix",
        auto_remediate=False,
        icon="📁",
        tags=["filesystem", "readonly", "disk"],
    ),
    DetectionPattern(
        id="backup_failure",
        name="Backup Job Failure",
        description="Scheduled backup failed to complete",
        category=Category.STORAGE,
        severity=Severity.P1_HIGH,
        metric_key="backup.last_status",
        condition="eq",
        threshold=0.0,  # 0 = failed
        duration_seconds=60,
        suggested_workflow_id="wf_backup_retry",
        auto_remediate=True,
        icon="📦",
        tags=["backup", "failure", "data"],
    ),
    DetectionPattern(
        id="log_overflow",
        name="Log Storage Overflow",
        description="Log files growing too fast - disk pressure",
        category=Category.STORAGE,
        severity=Severity.P2_MEDIUM,
        metric_key="logs.growth_rate_mb_per_hour",
        condition="gt",
        threshold=1000.0,  # 1GB/hour
        duration_seconds=3600,
        suggested_workflow_id="wf_log_cleanup",
        auto_remediate=True,
        icon="📊",
        tags=["logs", "storage", "overflow"],
    ),
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 3: NETWORK & CONNECTIVITY
    # ─────────────────────────────────────────────────────────────────────────
    DetectionPattern(
        id="ddos_attack",
        name="DDoS Attack Detected",
        description="Abnormal traffic spike with attack patterns",
        category=Category.NETWORK,
        severity=Severity.P0_CRITICAL,
        metric_key="network.traffic.requests_per_second",
        condition="spike",
        threshold=10.0,  # 10x normal
        duration_seconds=60,
        suggested_workflow_id="wf_ddos_mitigation",
        auto_remediate=True,
        icon="🔵",
        tags=["ddos", "attack", "traffic", "security"],
    ),
    DetectionPattern(
        id="dns_failure",
        name="DNS Resolution Failure",
        description="DNS lookups failing - connectivity impacted",
        category=Category.NETWORK,
        severity=Severity.P0_CRITICAL,
        metric_key="network.dns.failure_rate_percent",
        condition="gt",
        threshold=5.0,
        duration_seconds=60,
        suggested_workflow_id="wf_dns_fix",
        auto_remediate=True,
        icon="🔌",
        tags=["dns", "network", "resolution"],
    ),
    DetectionPattern(
        id="lb_unhealthy",
        name="Load Balancer Backend Unhealthy",
        description="Too many backend servers failing health checks",
        category=Category.NETWORK,
        severity=Severity.P0_CRITICAL,
        metric_key="loadbalancer.backends.healthy_percent",
        condition="lt",
        threshold=50.0,
        duration_seconds=120,
        suggested_workflow_id="wf_lb_recovery",
        auto_remediate=False,
        icon="⚖️",
        tags=["loadbalancer", "health", "backends"],
    ),
    DetectionPattern(
        id="network_saturation",
        name="Network Interface Saturation",
        description="Network bandwidth nearly exhausted",
        category=Category.NETWORK,
        severity=Severity.P1_HIGH,
        metric_key="network.interface.utilization_percent",
        condition="gt",
        threshold=90.0,
        duration_seconds=300,
        suggested_workflow_id="wf_network_throttle",
        auto_remediate=True,
        icon="📡",
        tags=["network", "bandwidth", "saturation"],
    ),
    DetectionPattern(
        id="cdn_origin_failure",
        name="CDN Origin Failure",
        description="CDN cannot reach origin servers",
        category=Category.NETWORK,
        severity=Severity.P0_CRITICAL,
        metric_key="cdn.origin.health",
        condition="eq",
        threshold=0.0,
        duration_seconds=60,
        suggested_workflow_id="wf_cdn_failover",
        auto_remediate=True,
        icon="🌍",
        tags=["cdn", "origin", "failover"],
    ),
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 4: APPLICATION LAYER
    # ─────────────────────────────────────────────────────────────────────────
    DetectionPattern(
        id="service_down",
        name="Service Down",
        description="Critical service not responding",
        category=Category.APPLICATION,
        severity=Severity.P0_CRITICAL,
        metric_key="service.http.error_5xx_percent",
        condition="gt",
        threshold=10.0,
        duration_seconds=120,
        suggested_workflow_id="wf_service_recovery",
        auto_remediate=True,
        icon="🟣",
        tags=["service", "down", "5xx", "error"],
    ),
    DetectionPattern(
        id="app_timeout",
        name="Application Timeout",
        description="Application response times critically high",
        category=Category.APPLICATION,
        severity=Severity.P1_HIGH,
        metric_key="service.http.p95_latency_ms",
        condition="gt",
        threshold=10000.0,
        duration_seconds=300,
        suggested_workflow_id="wf_app_timeout_fix",
        auto_remediate=True,
        icon="⏱️",
        tags=["timeout", "latency", "slow"],
    ),
    DetectionPattern(
        id="http_error_spike",
        name="HTTP Error Rate Spike",
        description="Abnormal increase in HTTP errors",
        category=Category.APPLICATION,
        severity=Severity.P1_HIGH,
        metric_key="service.http.error_rate_percent",
        condition="gt",
        threshold=5.0,
        duration_seconds=180,
        suggested_workflow_id="wf_http_error_fix",
        auto_remediate=True,
        icon="📈",
        tags=["http", "errors", "4xx", "5xx"],
    ),
    DetectionPattern(
        id="queue_backlog",
        name="Queue Backlog Crisis",
        description="Message queue depth critically high",
        category=Category.APPLICATION,
        severity=Severity.P1_HIGH,
        metric_key="queue.depth",
        condition="gt",
        threshold=100000.0,
        duration_seconds=600,
        suggested_workflow_id="wf_queue_fix",
        auto_remediate=True,
        icon="📬",
        tags=["queue", "backlog", "messages"],
    ),
    DetectionPattern(
        id="rate_limit_triggered",
        name="API Rate Limit Triggered",
        description="Too many requests being rate limited",
        category=Category.APPLICATION,
        severity=Severity.P2_MEDIUM,
        metric_key="api.rate_limit.triggered_per_minute",
        condition="gt",
        threshold=1000.0,
        duration_seconds=300,
        suggested_workflow_id="wf_rate_limit_adjust",
        auto_remediate=True,
        icon="🚦",
        tags=["api", "ratelimit", "429"],
    ),
    DetectionPattern(
        id="cronjob_failure",
        name="Cron Job Failure",
        description="Scheduled job failed to complete",
        category=Category.APPLICATION,
        severity=Severity.P2_MEDIUM,
        metric_key="cron.last_run_status",
        condition="eq",
        threshold=0.0,
        duration_seconds=60,
        suggested_workflow_id="wf_cron_retry",
        auto_remediate=True,
        icon="⏰",
        tags=["cron", "scheduled", "job"],
    ),
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 5: SECURITY & INTRUSION
    # ─────────────────────────────────────────────────────────────────────────
    DetectionPattern(
        id="brute_force",
        name="Brute Force Attack",
        description="Multiple failed login attempts detected",
        category=Category.SECURITY,
        severity=Severity.P1_HIGH,
        metric_key="security.auth.failed_per_minute",
        condition="gt",
        threshold=100.0,
        duration_seconds=60,
        suggested_workflow_id="wf_brute_force_defense",
        auto_remediate=True,
        icon="🔐",
        tags=["security", "brute-force", "auth"],
    ),
    DetectionPattern(
        id="malware_detected",
        name="Malware/Rootkit Detected",
        description="Suspicious process or file activity detected",
        category=Category.SECURITY,
        severity=Severity.P0_CRITICAL,
        metric_key="security.malware.detected",
        condition="eq",
        threshold=1.0,
        duration_seconds=1,
        suggested_workflow_id="wf_malware_response",
        auto_remediate=False,  # NEVER auto - needs investigation
        icon="🦠",
        tags=["security", "malware", "intrusion"],
    ),
    DetectionPattern(
        id="ssh_intrusion",
        name="SSH Intrusion Attempt",
        description="Unauthorized SSH access from unknown IP",
        category=Category.SECURITY,
        severity=Severity.P0_CRITICAL,
        metric_key="security.ssh.unauthorized_access",
        condition="eq",
        threshold=1.0,
        duration_seconds=1,
        suggested_workflow_id="wf_ssh_intrusion_response",
        auto_remediate=True,
        icon="🔑",
        tags=["security", "ssh", "intrusion"],
    ),
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 6: CONTAINER & ORCHESTRATION
    # ─────────────────────────────────────────────────────────────────────────
    DetectionPattern(
        id="pod_crash_loop",
        name="Pod Crash Loop",
        description="Kubernetes pod restarting repeatedly",
        category=Category.CONTAINER,
        severity=Severity.P1_HIGH,
        metric_key="k8s.pod.restart_count_10min",
        condition="gt",
        threshold=5.0,
        duration_seconds=600,
        suggested_workflow_id="wf_pod_crash_fix",
        auto_remediate=True,
        icon="⚡",
        tags=["kubernetes", "pod", "crash"],
    ),
    DetectionPattern(
        id="image_pull_failure",
        name="Container Image Pull Failure",
        description="Cannot pull container image from registry",
        category=Category.CONTAINER,
        severity=Severity.P1_HIGH,
        metric_key="k8s.pod.image_pull_errors",
        condition="gt",
        threshold=0.0,
        duration_seconds=120,
        suggested_workflow_id="wf_image_pull_fix",
        auto_remediate=True,
        icon="🐳",
        tags=["docker", "image", "registry"],
    ),
    DetectionPattern(
        id="k8s_node_notready",
        name="Kubernetes Node Not Ready",
        description="Worker node is not accepting workloads",
        category=Category.CONTAINER,
        severity=Severity.P0_CRITICAL,
        metric_key="k8s.node.ready",
        condition="eq",
        threshold=0.0,
        duration_seconds=300,
        suggested_workflow_id="wf_k8s_node_fix",
        auto_remediate=False,
        icon="🎛️",
        tags=["kubernetes", "node", "cluster"],
    ),
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 7: COMPLIANCE & MAINTENANCE
    # ─────────────────────────────────────────────────────────────────────────
    DetectionPattern(
        id="ssl_expiring",
        name="SSL Certificate Expiring",
        description="SSL certificate will expire soon",
        category=Category.COMPLIANCE,
        severity=Severity.P1_HIGH,
        metric_key="ssl.days_until_expiry",
        condition="lt",
        threshold=7.0,
        duration_seconds=3600,
        suggested_workflow_id="wf_ssl_renewal",
        auto_remediate=True,
        icon="🔐",
        tags=["ssl", "certificate", "expiry"],
    ),
    DetectionPattern(
        id="security_patch",
        name="Critical Security Patch Available",
        description="Unpatched critical CVE detected",
        category=Category.COMPLIANCE,
        severity=Severity.P0_CRITICAL,
        metric_key="security.cve.critical_unpatched",
        condition="gt",
        threshold=0.0,
        duration_seconds=60,
        suggested_workflow_id="wf_security_patch",
        auto_remediate=False,  # Needs testing before patching
        icon="📦",
        tags=["security", "patch", "cve"],
    ),
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 8: BUSINESS CONTINUITY
    # ─────────────────────────────────────────────────────────────────────────
    DetectionPattern(
        id="cost_anomaly",
        name="Cloud Cost Anomaly",
        description="Unusual spending detected - possible runaway resources",
        category=Category.BUSINESS,
        severity=Severity.P2_MEDIUM,
        metric_key="cloud.cost.daily_percent_of_average",
        condition="gt",
        threshold=150.0,
        duration_seconds=3600,
        suggested_workflow_id="wf_cost_investigation",
        auto_remediate=True,
        icon="💸",
        tags=["cost", "cloud", "spending"],
    ),
]


# ══════════════════════════════════════════════════════════════════════════════
# METRICS COLLECTOR - Gets data from various sources
# ══════════════════════════════════════════════════════════════════════════════

class MetricsCollector:
    """
    Collects metrics from all sources: Netdata, system, application, etc.
    The eyes and ears of the detection engine.
    """
    
    def __init__(self, netdata_url: str = "http://localhost:19999"):
        self.netdata_url = netdata_url
        self.cache: Dict[str, tuple] = {}  # metric_key -> (value, timestamp)
        self.cache_ttl_seconds = 5
        
    async def get_metric(self, metric_key: str, host: str = "localhost") -> Optional[float]:
        """
        Get a specific metric value.
        Tries cache first, then fetches from source.
        """
        cache_key = f"{host}:{metric_key}"
        
        # Check cache
        if cache_key in self.cache:
            value, timestamp = self.cache[cache_key]
            if (datetime.utcnow() - timestamp).total_seconds() < self.cache_ttl_seconds:
                return value
        
        # Fetch from source based on metric type
        try:
            if metric_key.startswith("system."):
                value = await self._get_system_metric(metric_key, host)
            elif metric_key.startswith("database."):
                value = await self._get_database_metric(metric_key, host)
            elif metric_key.startswith("network."):
                value = await self._get_network_metric(metric_key, host)
            elif metric_key.startswith("service."):
                value = await self._get_service_metric(metric_key, host)
            elif metric_key.startswith("k8s."):
                value = await self._get_k8s_metric(metric_key, host)
            elif metric_key.startswith("security."):
                value = await self._get_security_metric(metric_key, host)
            else:
                value = await self._get_netdata_metric(metric_key, host)
            
            # Update cache
            self.cache[cache_key] = (value, datetime.utcnow())
            return value
            
        except Exception as e:
            logger.error(f"Failed to get metric {metric_key}: {e}")
            return None
    
    async def _get_system_metric(self, metric_key: str, host: str) -> Optional[float]:
        """Get system metrics from Netdata or psutil"""
        import aiohttp
        
        # Map our metric keys to Netdata chart/dimension
        netdata_mappings = {
            "system.ram.used_percent": ("system.ram", "used"),
            "system.cpu.total_percent": ("system.cpu", "user"),
            "system.disk.used_percent": ("disk_space._", "used"),
            "system.processes.zombie_count": ("system.processes", "zombie"),
        }
        
        if metric_key in netdata_mappings:
            chart, dimension = netdata_mappings[metric_key]
            try:
                async with aiohttp.ClientSession() as session:
                    url = f"{self.netdata_url}/api/v1/data?chart={chart}&points=1"
                    async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                        if resp.status == 200:
                            data = await resp.json()
                            # Netdata returns data in columns format
                            if "data" in data and len(data["data"]) > 0:
                                return float(data["data"][0][1])  # First data point, second column
            except Exception as e:
                logger.warning(f"Netdata fetch failed for {metric_key}: {e}")
        
        # Fallback to mock data for demo
        return self._get_mock_metric(metric_key)
    
    async def _get_database_metric(self, metric_key: str, host: str) -> Optional[float]:
        """Get database metrics"""
        return self._get_mock_metric(metric_key)
    
    async def _get_network_metric(self, metric_key: str, host: str) -> Optional[float]:
        """Get network metrics from Netdata or system"""
        return self._get_mock_metric(metric_key)
    
    async def _get_service_metric(self, metric_key: str, host: str) -> Optional[float]:
        """Get application/service metrics"""
        return self._get_mock_metric(metric_key)
    
    async def _get_k8s_metric(self, metric_key: str, host: str) -> Optional[float]:
        """Get Kubernetes metrics"""
        return self._get_mock_metric(metric_key)
    
    async def _get_security_metric(self, metric_key: str, host: str) -> Optional[float]:
        """Get security metrics"""
        return self._get_mock_metric(metric_key)
    
    async def _get_netdata_metric(self, metric_key: str, host: str) -> Optional[float]:
        """Generic Netdata metric fetch"""
        return self._get_mock_metric(metric_key)
    
    def _get_mock_metric(self, metric_key: str) -> float:
        """
        Return mock metrics for demo/testing.
        In production, this would be replaced by real metric sources.
        """
        import random
        
        # Simulate realistic metric values
        mock_values = {
            "system.ram.used_percent": random.uniform(60, 85),
            "system.cpu.total_percent": random.uniform(20, 70),
            "system.disk.used_percent": random.uniform(40, 80),
            "system.processes.zombie_count": random.randint(0, 10),
            "database.query.avg_time_ms": random.uniform(50, 500),
            "database.connections.active_percent": random.uniform(20, 60),
            "network.traffic.requests_per_second": random.uniform(100, 1000),
            "service.http.error_5xx_percent": random.uniform(0, 3),
            "service.http.p95_latency_ms": random.uniform(100, 2000),
            "ssl.days_until_expiry": random.randint(10, 90),
        }
        
        return mock_values.get(metric_key, random.uniform(0, 100))


# ══════════════════════════════════════════════════════════════════════════════
# THE ISSUE DETECTOR - The Brain
# ══════════════════════════════════════════════════════════════════════════════

class IssueDetector:
    """
    The main detection engine.
    Watches metrics, matches patterns, creates issues.
    The guardian that never sleeps.
    """
    
    def __init__(self, metrics_collector: Optional[MetricsCollector] = None):
        self.metrics = metrics_collector or MetricsCollector()
        self.patterns: Dict[str, DetectionPattern] = {p.id: p for p in DETECTION_PATTERNS}
        
        # Active issues tracking
        self.active_issues: Dict[str, DetectedIssue] = {}
        
        # Cooldown tracking (pattern_id:host -> last_alert_time)
        self.cooldowns: Dict[str, datetime] = {}
        
        # Metric history for spike/trend detection
        self.metric_history: Dict[str, List[tuple]] = defaultdict(list)
        self.history_max_points = 60  # Keep last 60 data points
        
        # Detection stats
        self.stats = {
            "total_detections": 0,
            "auto_remediated": 0,
            "escalated": 0,
            "resolved": 0,
        }
        
        logger.info("🔍 Issue Detector initialized with %d patterns", len(self.patterns))
    
    async def run_detection_cycle(self, hosts: List[str] = None) -> List[DetectedIssue]:
        """
        Run a complete detection cycle across all patterns.
        This is the heartbeat of the detection engine.
        """
        if hosts is None:
            hosts = ["localhost"]
        
        new_issues = []
        
        for host in hosts:
            for pattern in self.patterns.values():
                try:
                    issue = await self._check_pattern(pattern, host)
                    if issue:
                        new_issues.append(issue)
                except Exception as e:
                    logger.error(f"Error checking pattern {pattern.id}: {e}")
        
        return new_issues
    
    async def _check_pattern(self, pattern: DetectionPattern, host: str) -> Optional[DetectedIssue]:
        """
        Check if a specific pattern matches current conditions.
        """
        # Check cooldown
        cooldown_key = f"{pattern.id}:{host}"
        if cooldown_key in self.cooldowns:
            time_since = (datetime.utcnow() - self.cooldowns[cooldown_key]).total_seconds()
            if time_since < pattern.cooldown_seconds:
                return None  # Still in cooldown
        
        # Get current metric value
        value = await self.metrics.get_metric(pattern.metric_key, host)
        if value is None:
            return None
        
        # Update history
        history_key = f"{host}:{pattern.metric_key}"
        self.metric_history[history_key].append((datetime.utcnow(), value))
        if len(self.metric_history[history_key]) > self.history_max_points:
            self.metric_history[history_key].pop(0)
        
        # Check condition
        triggered = self._evaluate_condition(pattern.condition, value, pattern.threshold, history_key)
        
        if not triggered:
            return None
        
        # Check if already have active issue for this pattern+host
        existing_key = f"{pattern.id}:{host}"
        if existing_key in self.active_issues:
            existing = self.active_issues[existing_key]
            if existing.status not in [IssueStatus.RESOLVED]:
                return None  # Already tracking this issue
        
        # Create new issue!
        issue_id = self._generate_issue_id(pattern.id, host)
        issue = DetectedIssue(
            id=issue_id,
            pattern_id=pattern.id,
            pattern_name=pattern.name,
            category=pattern.category,
            severity=pattern.severity,
            status=IssueStatus.DETECTED,
            host=host,
            metric_value=value,
            threshold=pattern.threshold,
            message=self._create_issue_message(pattern, value, host),
            detected_at=datetime.utcnow(),
            suggested_workflow_id=pattern.suggested_workflow_id,
            auto_remediate=pattern.auto_remediate,
            icon=pattern.icon,
            raw_data={
                "metric_key": pattern.metric_key,
                "condition": pattern.condition,
                "tags": pattern.tags,
            }
        )
        
        # Track the issue
        self.active_issues[existing_key] = issue
        self.cooldowns[cooldown_key] = datetime.utcnow()
        self.stats["total_detections"] += 1
        
        logger.warning(
            "%s ISSUE DETECTED: %s on %s (value=%.2f, threshold=%.2f)",
            pattern.icon, pattern.name, host, value, pattern.threshold
        )
        
        return issue
    
    def _evaluate_condition(
        self, 
        condition: str, 
        value: float, 
        threshold: float,
        history_key: str
    ) -> bool:
        """Evaluate if the condition is met"""
        
        if condition == "gt":
            return value > threshold
        elif condition == "lt":
            return value < threshold
        elif condition == "eq":
            return value == threshold
        elif condition == "spike":
            # Check for sudden spike compared to baseline
            history = self.metric_history.get(history_key, [])
            if len(history) < 10:
                return False
            baseline = sum(v for _, v in history[:-5]) / max(len(history) - 5, 1)
            return value > (baseline * threshold)  # threshold is multiplier for spike
        elif condition == "drop":
            # Check for sudden drop
            history = self.metric_history.get(history_key, [])
            if len(history) < 10:
                return False
            baseline = sum(v for _, v in history[:-5]) / max(len(history) - 5, 1)
            return value < (baseline / threshold)
        
        return False
    
    def _create_issue_message(self, pattern: DetectionPattern, value: float, host: str) -> str:
        """Create a human-readable issue message"""
        condition_msgs = {
            "gt": f"{pattern.metric_key} is {value:.1f} (above threshold {pattern.threshold})",
            "lt": f"{pattern.metric_key} is {value:.1f} (below threshold {pattern.threshold})",
            "eq": f"{pattern.metric_key} triggered at {value:.1f}",
            "spike": f"{pattern.metric_key} spiked to {value:.1f} ({pattern.threshold}x baseline)",
            "drop": f"{pattern.metric_key} dropped to {value:.1f}",
        }
        return f"{pattern.description} on {host}: {condition_msgs.get(pattern.condition, '')}"
    
    def _generate_issue_id(self, pattern_id: str, host: str) -> str:
        """Generate a unique issue ID"""
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        unique = hashlib.md5(f"{pattern_id}{host}{timestamp}".encode()).hexdigest()[:8]
        return f"ISS-{timestamp}-{unique}"
    
    # ────────────────────────────────────────────────────────────────────────
    # ISSUE MANAGEMENT METHODS
    # ────────────────────────────────────────────────────────────────────────
    
    def get_active_issues(
        self, 
        severity: Optional[Severity] = None,
        category: Optional[Category] = None,
        limit: int = 100
    ) -> List[DetectedIssue]:
        """Get all active (non-resolved) issues"""
        issues = [
            i for i in self.active_issues.values() 
            if i.status != IssueStatus.RESOLVED
        ]
        
        if severity:
            issues = [i for i in issues if i.severity == severity]
        if category:
            issues = [i for i in issues if i.category == category]
        
        # Sort by severity (P0 first) then by time (newest first)
        issues.sort(key=lambda x: (x.severity.value, -x.detected_at.timestamp()))
        
        return issues[:limit]
    
    def get_issue(self, issue_id: str) -> Optional[DetectedIssue]:
        """Get a specific issue by ID"""
        for issue in self.active_issues.values():
            if issue.id == issue_id:
                return issue
        return None
    
    def acknowledge_issue(self, issue_id: str) -> bool:
        """Mark an issue as acknowledged"""
        for key, issue in self.active_issues.items():
            if issue.id == issue_id:
                issue.status = IssueStatus.ACKNOWLEDGED
                issue.acknowledged_at = datetime.utcnow()
                logger.info("✅ Issue %s acknowledged", issue_id)
                return True
        return False
    
    def start_remediation(self, issue_id: str) -> bool:
        """Mark remediation as started"""
        for key, issue in self.active_issues.items():
            if issue.id == issue_id:
                issue.status = IssueStatus.REMEDIATING
                issue.remediation_started = True
                logger.info("🔧 Remediation started for issue %s", issue_id)
                return True
        return False
    
    def resolve_issue(self, issue_id: str, result: str = "Resolved") -> bool:
        """Mark an issue as resolved"""
        for key, issue in self.active_issues.items():
            if issue.id == issue_id:
                issue.status = IssueStatus.RESOLVED
                issue.resolved_at = datetime.utcnow()
                issue.remediation_result = result
                self.stats["resolved"] += 1
                logger.info("✅ Issue %s resolved: %s", issue_id, result)
                return True
        return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get detection statistics"""
        active = [i for i in self.active_issues.values() if i.status != IssueStatus.RESOLVED]
        return {
            **self.stats,
            "active_issues": len(active),
            "by_severity": {
                "P0_CRITICAL": len([i for i in active if i.severity == Severity.P0_CRITICAL]),
                "P1_HIGH": len([i for i in active if i.severity == Severity.P1_HIGH]),
                "P2_MEDIUM": len([i for i in active if i.severity == Severity.P2_MEDIUM]),
                "P3_LOW": len([i for i in active if i.severity == Severity.P3_LOW]),
            },
            "by_category": {
                cat.value: len([i for i in active if i.category == cat])
                for cat in Category
            }
        }
    
    def get_patterns(self) -> List[Dict[str, Any]]:
        """Get all detection patterns for UI"""
        return [
            {
                "id": p.id,
                "name": p.name,
                "description": p.description,
                "category": p.category.value,
                "severity": p.severity.name,
                "metric_key": p.metric_key,
                "threshold": p.threshold,
                "auto_remediate": p.auto_remediate,
                "icon": p.icon,
                "tags": p.tags,
            }
            for p in self.patterns.values()
        ]


# ══════════════════════════════════════════════════════════════════════════════
# SINGLETON INSTANCE FOR API ACCESS
# ══════════════════════════════════════════════════════════════════════════════

# Global instance
_detector_instance: Optional[IssueDetector] = None


def get_detector() -> IssueDetector:
    """Get the global detector instance"""
    global _detector_instance
    if _detector_instance is None:
        _detector_instance = IssueDetector()
    return _detector_instance


# ══════════════════════════════════════════════════════════════════════════════
# DEMO / TESTING
# ══════════════════════════════════════════════════════════════════════════════

async def demo():
    """Demo the issue detector"""
    print("\n" + "="*80)
    print("🔍 AIOps Issue Detector Demo")
    print("="*80 + "\n")
    
    detector = get_detector()
    
    print(f"📋 Loaded {len(detector.patterns)} detection patterns:\n")
    for cat in Category:
        patterns = [p for p in detector.patterns.values() if p.category == cat]
        if patterns:
            print(f"  {cat.value.upper()}: {len(patterns)} patterns")
            for p in patterns:
                print(f"    {p.icon} {p.name} [{p.severity.name}]")
    
    print("\n" + "-"*80)
    print("🔄 Running detection cycle...")
    print("-"*80 + "\n")
    
    issues = await detector.run_detection_cycle(["localhost"])
    
    if issues:
        print(f"\n🚨 Detected {len(issues)} issues:\n")
        for issue in issues:
            print(f"  {issue.icon} [{issue.severity.name}] {issue.pattern_name}")
            print(f"     Host: {issue.host}")
            print(f"     Value: {issue.metric_value:.2f} (threshold: {issue.threshold})")
            print(f"     Suggested: {issue.suggested_workflow_id}")
            print()
    else:
        print("✅ No issues detected - system healthy!")
    
    print("\n📊 Stats:", detector.get_stats())


if __name__ == "__main__":
    import asyncio
    asyncio.run(demo())
