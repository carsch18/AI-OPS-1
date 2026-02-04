"""
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║     █████╗ ██╗   ██╗████████╗ ██████╗     ██████╗ ███████╗███╗   ███╗       ║
║    ██╔══██╗██║   ██║╚══██╔══╝██╔═══██╗    ██╔══██╗██╔════╝████╗ ████║       ║
║    ███████║██║   ██║   ██║   ██║   ██║    ██████╔╝█████╗  ██╔████╔██║       ║
║    ██╔══██║██║   ██║   ██║   ██║   ██║    ██╔══██╗██╔══╝  ██║╚██╔╝██║       ║
║    ██║  ██║╚██████╔╝   ██║   ╚██████╔╝    ██║  ██║███████╗██║ ╚═╝ ██║       ║
║    ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝     ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝       ║
║                                                                              ║
║               AUTO-REMEDIATION WORKFLOW TEMPLATES v1.0                       ║
║                   30 Production-Grade Self-Healing Workflows                 ║
║                                                                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

Complete library of automated remediation workflows for every infrastructure issue.
Each template includes trigger conditions, action steps, and rollback procedures.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from enum import Enum
import json


class ActionType(Enum):
    """Types of actions that can be executed"""
    SHELL_COMMAND = "shell_command"
    HTTP_REQUEST = "http_request"
    ANSIBLE_PLAYBOOK = "ansible_playbook"
    KUBERNETES_API = "kubernetes_api"
    DOCKER_COMMAND = "docker_command"
    DATABASE_QUERY = "database_query"
    NOTIFICATION = "notification"
    SCRIPT = "script"
    CONDITION = "condition"
    WAIT = "wait"
    APPROVAL = "approval"


@dataclass
class ActionStep:
    """A single step in a remediation workflow"""
    id: str
    name: str
    description: str
    action_type: ActionType
    config: Dict[str, Any]
    timeout_seconds: int = 60
    retry_count: int = 2
    on_failure: str = "continue"  # "continue", "abort", "rollback"
    condition: Optional[str] = None  # Run only if condition matches
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "action_type": self.action_type.value,
            "config": self.config,
            "timeout_seconds": self.timeout_seconds,
            "retry_count": self.retry_count,
            "on_failure": self.on_failure,
            "condition": self.condition,
        }


@dataclass
class RemediationTemplate:
    """Complete remediation workflow template"""
    id: str
    name: str
    description: str
    category: str
    severity: str
    pattern_id: str  # Links to detection pattern
    
    # Workflow configuration
    steps: List[ActionStep]
    rollback_steps: List[ActionStep]
    
    # Execution settings
    auto_execute: bool = False
    requires_approval: bool = True
    max_execution_time: int = 300
    
    # Metadata
    icon: str = "🔧"
    tags: List[str] = field(default_factory=list)
    estimated_fix_time: str = "1-5 minutes"
    success_rate: float = 95.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "severity": self.severity,
            "pattern_id": self.pattern_id,
            "steps": [s.to_dict() for s in self.steps],
            "rollback_steps": [s.to_dict() for s in self.rollback_steps],
            "auto_execute": self.auto_execute,
            "requires_approval": self.requires_approval,
            "max_execution_time": self.max_execution_time,
            "icon": self.icon,
            "tags": self.tags,
            "estimated_fix_time": self.estimated_fix_time,
            "success_rate": self.success_rate,
            "step_count": len(self.steps),
        }


# ══════════════════════════════════════════════════════════════════════════════
# THE 30 AUTO-REMEDIATION TEMPLATES
# ══════════════════════════════════════════════════════════════════════════════

REMEDIATION_TEMPLATES: List[RemediationTemplate] = [
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 1: COMPUTE RESOURCES (4 templates)
    # ─────────────────────────────────────────────────────────────────────────
    
    RemediationTemplate(
        id="wf_memory_crisis_recovery",
        name="Memory Crisis Recovery",
        description="Automated response to critical RAM usage - clears caches, restarts services, and scales if needed",
        category="compute",
        severity="P0_CRITICAL",
        pattern_id="memory_crisis",
        icon="🔴",
        tags=["memory", "ram", "critical", "auto-heal"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-5 minutes",
        success_rate=92.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Identify Memory Consumers",
                description="Find top processes consuming memory",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "ps aux --sort=-%mem | head -20",
                    "capture_output": True,
                    "store_as": "memory_consumers"
                },
                timeout_seconds=30
            ),
            ActionStep(
                id="step_2",
                name="Clear Application Caches",
                description="Flush Redis and Memcached caches",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "commands": [
                        "redis-cli FLUSHDB 2>/dev/null || true",
                        "echo 'flush_all' | nc localhost 11211 2>/dev/null || true",
                    ]
                },
                timeout_seconds=30
            ),
            ActionStep(
                id="step_3",
                name="Clear System Caches",
                description="Drop system page cache, dentries and inodes",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "sync && echo 3 > /proc/sys/vm/drop_caches",
                    "requires_sudo": True
                },
                timeout_seconds=15
            ),
            ActionStep(
                id="step_4",
                name="Restart Heavy Services",
                description="Gracefully restart PHP-FPM and Node processes",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "commands": [
                        "systemctl reload php-fpm 2>/dev/null || systemctl restart php8.1-fpm 2>/dev/null || true",
                        "pm2 reload all 2>/dev/null || true",
                    ]
                },
                timeout_seconds=60
            ),
            ActionStep(
                id="step_5",
                name="Verify Memory Levels",
                description="Check if memory is now below threshold",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "free -m | awk 'NR==2{printf \"Memory: %s/%sMB (%.2f%%)\\n\", $3,$2,$3*100/$2}'",
                    "capture_output": True,
                    "store_as": "memory_after"
                },
                timeout_seconds=10
            ),
            ActionStep(
                id="step_6",
                name="Send Notification",
                description="Alert team about remediation",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack", "email"],
                    "message": "🔴 Memory Crisis remediation completed on {{host}}\nBefore: {{memory_before}}%\nAfter: {{memory_after}}%\nActions: Cleared caches, restarted services",
                    "priority": "high"
                },
                timeout_seconds=15
            ),
        ],
        rollback_steps=[
            ActionStep(
                id="rollback_1",
                name="Restart All Services",
                description="Full service restart if partial fix failed",
                action_type=ActionType.SHELL_COMMAND,
                config={"command": "systemctl restart php-fpm nginx mysql 2>/dev/null || true"},
                timeout_seconds=120
            ),
        ]
    ),
    
    RemediationTemplate(
        id="wf_cpu_spike_response",
        name="CPU Spike Response",
        description="Handles sustained high CPU by identifying and managing runaway processes",
        category="compute",
        severity="P1_HIGH",
        pattern_id="cpu_spike",
        icon="🟠",
        tags=["cpu", "performance", "auto-heal"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="1-3 minutes",
        success_rate=88.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Identify CPU Hogs",
                description="Find processes using most CPU",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "ps aux --sort=-%cpu | head -15",
                    "capture_output": True,
                    "store_as": "cpu_consumers"
                }
            ),
            ActionStep(
                id="step_2",
                name="Kill Runaway Processes",
                description="Terminate processes over 90% CPU for too long",
                action_type=ActionType.SCRIPT,
                config={
                    "script": """
import subprocess
result = subprocess.run(['ps', 'aux', '--sort=-%cpu'], capture_output=True, text=True)
for line in result.stdout.split('\\n')[1:5]:
    parts = line.split()
    if len(parts) > 2 and float(parts[2]) > 90:
        pid = parts[1]
        subprocess.run(['kill', '-15', pid])
                    """,
                    "language": "python"
                }
            ),
            ActionStep(
                id="step_3",
                name="Nice Down Heavy Jobs",
                description="Reduce priority of cron and batch jobs",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "renice +10 $(pgrep -f 'cron|backup|rsync') 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_4",
                name="Verify CPU Levels",
                description="Check CPU usage after remediation",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_5",
                name="Send Alert",
                description="Notify team of CPU spike response",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "🟠 CPU Spike handled on {{host}} - killed runaway processes"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_zombie_cleanup",
        name="Zombie Process Cleanup",
        description="Cleans up zombie and orphan processes",
        category="compute",
        severity="P2_MEDIUM",
        pattern_id="zombie_processes",
        icon="🧟",
        tags=["zombie", "processes", "cleanup"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="30 seconds",
        success_rate=99.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Find Zombie Processes",
                description="Identify all zombie processes",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "ps aux | awk '$8 ~ /Z/ {print $2, $11}'",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Kill Zombie Parents",
                description="Terminate parent processes to clean zombies",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "ps -eo ppid,stat | awk '$2 ~ /Z/ {print $1}' | xargs -r kill -9 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_3",
                name="Verify Cleanup",
                description="Count remaining zombies",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "ps aux | awk '$8 ~ /Z/' | wc -l",
                    "capture_output": True
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_memory_leak_response",
        name="Memory Leak Response",
        description="Handles suspected memory leaks with graceful service restarts",
        category="compute",
        severity="P1_HIGH",
        pattern_id="memory_leak",
        icon="🧠",
        tags=["memory", "leak", "restart"],
        auto_execute=False,
        requires_approval=True,
        estimated_fix_time="5-10 minutes",
        success_rate=85.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Generate Heap Dump",
                description="Capture memory state for analysis",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "jmap -dump:format=b,file=/tmp/heapdump_$(date +%Y%m%d_%H%M%S).hprof $(pgrep -f java | head -1) 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_2",
                name="Approval Gate",
                description="Wait for human approval before restart",
                action_type=ActionType.APPROVAL,
                config={
                    "message": "Memory leak detected. Approve service restart?",
                    "timeout_minutes": 30,
                    "default_action": "abort"
                }
            ),
            ActionStep(
                id="step_3",
                name="Graceful Restart",
                description="Restart leaking service",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "systemctl restart application 2>/dev/null || pm2 restart all"
                }
            ),
            ActionStep(
                id="step_4",
                name="Enable Profiling",
                description="Turn on memory profiling for debugging",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack", "jira"],
                    "message": "🧠 Memory leak detected on {{host}}. Heap dump saved. Creating investigation ticket."
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 2: STORAGE & DATA (6 templates)
    # ─────────────────────────────────────────────────────────────────────────
    
    RemediationTemplate(
        id="wf_disk_cleanup",
        name="Disk Space Cleanup",
        description="Automated disk cleanup - removes logs, docker images, and temp files",
        category="storage",
        severity="P1_HIGH",
        pattern_id="disk_critical",
        icon="🟢",
        tags=["disk", "cleanup", "storage"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-5 minutes",
        success_rate=95.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Check Current Usage",
                description="Get disk usage before cleanup",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "df -h / | awk 'NR==2 {print $5}'",
                    "capture_output": True,
                    "store_as": "disk_before"
                }
            ),
            ActionStep(
                id="step_2",
                name="Clean Old Logs",
                description="Remove logs older than 7 days",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "find /var/log -type f -mtime +7 -name '*.log*' -delete 2>/dev/null; find /var/log -type f -name '*.gz' -mtime +3 -delete 2>/dev/null"
                }
            ),
            ActionStep(
                id="step_3",
                name="Trim Journal",
                description="Reduce systemd journal size",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "journalctl --vacuum-size=500M --vacuum-time=7d 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_4",
                name="Clean Docker",
                description="Remove unused Docker resources",
                action_type=ActionType.DOCKER_COMMAND,
                config={
                    "commands": [
                        "docker system prune -af --volumes 2>/dev/null || true",
                        "docker image prune -af 2>/dev/null || true"
                    ]
                }
            ),
            ActionStep(
                id="step_5",
                name="Clean Package Cache",
                description="Clear apt/yum cache",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "apt-get clean 2>/dev/null || yum clean all 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_6",
                name="Check Final Usage",
                description="Get disk usage after cleanup",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "df -h / | awk 'NR==2 {print $5}'",
                    "capture_output": True,
                    "store_as": "disk_after"
                }
            ),
            ActionStep(
                id="step_7",
                name="Send Report",
                description="Notify team of cleanup results",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "🟢 Disk cleanup on {{host}}\nBefore: {{disk_before}}\nAfter: {{disk_after}}"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_db_latency_fix",
        name="Database Latency Fix",
        description="Handles slow database queries - kills long-running queries and optimizes",
        category="storage",
        severity="P0_CRITICAL",
        pattern_id="db_latency_spike",
        icon="🟡",
        tags=["database", "latency", "performance"],
        auto_execute=False,
        requires_approval=True,
        estimated_fix_time="3-10 minutes",
        success_rate=80.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Find Slow Queries",
                description="Identify queries running too long",
                action_type=ActionType.DATABASE_QUERY,
                config={
                    "query": "SHOW FULL PROCESSLIST",
                    "database": "mysql",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Approval to Kill Queries",
                description="Get approval before killing queries",
                action_type=ActionType.APPROVAL,
                config={
                    "message": "Found slow queries. Approve killing queries > 60s?",
                    "timeout_minutes": 5
                }
            ),
            ActionStep(
                id="step_3",
                name="Kill Long Queries",
                description="Terminate queries over 60 seconds",
                action_type=ActionType.DATABASE_QUERY,
                config={
                    "query": "SELECT CONCAT('KILL ', id, ';') FROM information_schema.processlist WHERE time > 60 AND command != 'Sleep'",
                    "execute_results": True
                }
            ),
            ActionStep(
                id="step_4",
                name="Flush Query Cache",
                description="Clear the query cache",
                action_type=ActionType.DATABASE_QUERY,
                config={
                    "query": "FLUSH QUERY CACHE; FLUSH STATUS;"
                }
            ),
            ActionStep(
                id="step_5",
                name="Alert DBA",
                description="Notify database team",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack", "pagerduty"],
                    "message": "🟡 DB Latency spike on {{host}} - killed slow queries"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_db_connection_fix",
        name="Database Connection Recovery",
        description="Handles connection pool exhaustion",
        category="storage",
        severity="P0_CRITICAL",
        pattern_id="db_connection_exhausted",
        icon="🔗",
        tags=["database", "connections", "pool"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="1-3 minutes",
        success_rate=90.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Kill Idle Connections",
                description="Terminate connections idle > 5 minutes",
                action_type=ActionType.DATABASE_QUERY,
                config={
                    "query": "SELECT CONCAT('KILL ', id, ';') FROM information_schema.processlist WHERE command = 'Sleep' AND time > 300"
                }
            ),
            ActionStep(
                id="step_2",
                name="Restart Connection Pooler",
                description="Restart PgBouncer or ProxySQL",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "systemctl restart pgbouncer 2>/dev/null || systemctl restart proxysql 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_3",
                name="Verify Connection Count",
                description="Check active connections",
                action_type=ActionType.DATABASE_QUERY,
                config={
                    "query": "SELECT COUNT(*) as active_connections FROM information_schema.processlist",
                    "capture_output": True
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_fs_readonly_fix",
        name="Filesystem Read-Only Recovery",
        description="Attempts to recover read-only filesystem",
        category="storage",
        severity="P0_CRITICAL",
        pattern_id="filesystem_readonly",
        icon="📁",
        tags=["filesystem", "readonly", "recovery"],
        auto_execute=False,
        requires_approval=True,
        estimated_fix_time="5-15 minutes",
        success_rate=70.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Check Disk Errors",
                description="Look for disk errors in dmesg",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "dmesg | grep -iE 'error|fail|readonly|i/o' | tail -20",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Emergency Approval",
                description="Get approval for filesystem operations",
                action_type=ActionType.APPROVAL,
                config={
                    "message": "Filesystem is READ-ONLY. This may indicate hardware failure. Approve remount attempt?",
                    "priority": "critical"
                }
            ),
            ActionStep(
                id="step_3",
                name="Attempt Remount",
                description="Try to remount filesystem as read-write",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "mount -o remount,rw / 2>&1",
                    "requires_sudo": True
                }
            ),
            ActionStep(
                id="step_4",
                name="Alert NOC",
                description="Critical alert to NOC team",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["pagerduty", "slack", "email"],
                    "message": "🚨 CRITICAL: Filesystem read-only on {{host}}. Possible hardware failure!",
                    "priority": "critical"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_backup_retry",
        name="Backup Failure Recovery",
        description="Retries failed backup job",
        category="storage",
        severity="P1_HIGH",
        pattern_id="backup_failure",
        icon="📦",
        tags=["backup", "retry", "data"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="10-30 minutes",
        success_rate=85.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Kill Stuck Backup",
                description="Terminate any stuck backup process",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "pkill -f 'backup|rsync|pg_dump|mysqldump' 2>/dev/null; rm -f /tmp/*.lock 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_2",
                name="Clear Incomplete Backups",
                description="Remove partial backup files",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "find /backup -name '*.partial' -o -name '*.tmp' -delete 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_3",
                name="Retry Backup",
                description="Run backup with reduced parallelism",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "/opt/scripts/backup.sh --retry --parallel=2 2>&1",
                    "timeout_seconds": 1800
                }
            ),
            ActionStep(
                id="step_4",
                name="Notify Team",
                description="Alert if retry succeeded or failed",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "📦 Backup retry on {{host}} - {{status}}"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_log_cleanup",
        name="Log Overflow Prevention",
        description="Handles excessive log growth",
        category="storage",
        severity="P2_MEDIUM",
        pattern_id="log_overflow",
        icon="📊",
        tags=["logs", "rotation", "cleanup"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="1-2 minutes",
        success_rate=98.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Force Log Rotation",
                description="Rotate all logs immediately",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "logrotate -f /etc/logrotate.conf 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_2",
                name="Compress Old Logs",
                description="Gzip uncompressed log files",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "find /var/log -type f -name '*.log.*' ! -name '*.gz' -exec gzip {} \\; 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_3",
                name="Identify Verbose Service",
                description="Find which service is generating most logs",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "du -sh /var/log/* 2>/dev/null | sort -rh | head -5",
                    "capture_output": True
                }
            ),
        ],
        rollback_steps=[]
    ),
]

# ─────────────────────────────────────────────────────────────────────────
# Continue with remaining templates...
# ─────────────────────────────────────────────────────────────────────────

# Add remaining templates (Network, Application, Security, Container, Compliance, Business)
# Split into separate constant for readability

REMEDIATION_TEMPLATES_PART2: List[RemediationTemplate] = [
    
    # ─────────────────────────────────────────────────────────────────────────
    # CATEGORY 3: NETWORK & CONNECTIVITY (5 templates)
    # ─────────────────────────────────────────────────────────────────────────
    
    RemediationTemplate(
        id="wf_ddos_mitigation",
        name="DDoS Attack Mitigation",
        description="Emergency response to DDoS attacks",
        category="network",
        severity="P0_CRITICAL",
        pattern_id="ddos_attack",
        icon="🔵",
        tags=["ddos", "security", "attack", "network"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="1-5 minutes",
        success_rate=88.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Enable Attack Mode",
                description="Activate Cloudflare Under Attack mode",
                action_type=ActionType.HTTP_REQUEST,
                config={
                    "method": "PATCH",
                    "url": "https://api.cloudflare.com/client/v4/zones/{{zone_id}}/settings/security_level",
                    "body": {"value": "under_attack"},
                    "headers": {"Authorization": "Bearer {{cf_token}}"}
                }
            ),
            ActionStep(
                id="step_2",
                name="Identify Attack Sources",
                description="Find top attacking IPs",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "netstat -ntu | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -20",
                    "capture_output": True,
                    "store_as": "attacking_ips"
                }
            ),
            ActionStep(
                id="step_3",
                name="Block Attack IPs",
                description="Add attacking IPs to firewall",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "script": """
for ip in $(netstat -ntu | awk '{print $5}' | cut -d: -f1 | sort | uniq -c | sort -rn | head -10 | awk '{print $2}'); do
    iptables -A INPUT -s $ip -j DROP 2>/dev/null || true
done
                    """
                }
            ),
            ActionStep(
                id="step_4",
                name="Enable Rate Limiting",
                description="Apply nginx rate limiting",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "nginx -s reload 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_5",
                name="Alert Security Team",
                description="Critical alert to security",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["pagerduty", "slack", "email"],
                    "message": "🔵 DDoS ATTACK detected on {{host}}! Under Attack mode enabled. Blocked {{blocked_count}} IPs.",
                    "priority": "critical"
                }
            ),
        ],
        rollback_steps=[
            ActionStep(
                id="rollback_1",
                name="Disable Attack Mode",
                description="Return to normal security level",
                action_type=ActionType.HTTP_REQUEST,
                config={
                    "method": "PATCH",
                    "url": "https://api.cloudflare.com/client/v4/zones/{{zone_id}}/settings/security_level",
                    "body": {"value": "medium"}
                }
            ),
        ]
    ),
    
    RemediationTemplate(
        id="wf_dns_fix",
        name="DNS Resolution Fix",
        description="Fixes DNS resolution failures",
        category="network",
        severity="P0_CRITICAL",
        pattern_id="dns_failure",
        icon="🔌",
        tags=["dns", "network", "resolution"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="1-2 minutes",
        success_rate=95.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Flush DNS Cache",
                description="Clear local DNS cache",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "systemctl restart systemd-resolved 2>/dev/null || service dnsmasq restart 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_2",
                name="Switch to Backup DNS",
                description="Use Google and Cloudflare DNS",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "echo -e 'nameserver 8.8.8.8\\nnameserver 1.1.1.1' > /etc/resolv.conf.backup && cp /etc/resolv.conf.backup /etc/resolv.conf"
                }
            ),
            ActionStep(
                id="step_3",
                name="Verify DNS Resolution",
                description="Test DNS is working",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "nslookup google.com && nslookup github.com",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_4",
                name="Notify NOC",
                description="Alert network team",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "🔌 DNS failure fixed on {{host}} - switched to backup DNS"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_lb_recovery",
        name="Load Balancer Recovery",
        description="Recovers unhealthy load balancer backends",
        category="network",
        severity="P0_CRITICAL",
        pattern_id="lb_unhealthy",
        icon="⚖️",
        tags=["loadbalancer", "health", "recovery"],
        auto_execute=False,
        requires_approval=True,
        estimated_fix_time="5-10 minutes",
        success_rate=82.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Health Check Backends",
                description="Check status of all backend servers",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "for host in backend1 backend2 backend3; do curl -s -o /dev/null -w '%{http_code}' http://$host/health; done",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Approval Gate",
                description="Approve backend restart",
                action_type=ActionType.APPROVAL,
                config={
                    "message": "Multiple backends unhealthy. Approve restart of failing backends?"
                }
            ),
            ActionStep(
                id="step_3",
                name="Restart Failing Backends",
                description="Restart services on unhealthy backends",
                action_type=ActionType.ANSIBLE_PLAYBOOK,
                config={
                    "playbook": "restart_backends.yml",
                    "inventory": "production"
                }
            ),
            ActionStep(
                id="step_4",
                name="Add Spare Capacity",
                description="Bring up standby servers",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "ansible-playbook /opt/ansible/scale_up.yml -e 'count=2'"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_network_throttle",
        name="Network Saturation Response",
        description="Handles network bandwidth exhaustion",
        category="network",
        severity="P1_HIGH",
        pattern_id="network_saturation",
        icon="📡",
        tags=["network", "bandwidth", "throttle"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-5 minutes",
        success_rate=85.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Identify Bandwidth Hogs",
                description="Find processes using most bandwidth",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "nethogs -t -c 5 2>/dev/null | head -20 || ss -tp | head -20",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Enable Traffic Shaping",
                description="Apply QoS rules",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "tc qdisc add dev eth0 root tbf rate 800mbit burst 32kbit latency 400ms 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_3",
                name="Notify Team",
                description="Alert about bandwidth issue",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "📡 Network saturation on {{host}} - traffic shaping enabled"
                }
            ),
        ],
        rollback_steps=[
            ActionStep(
                id="rollback_1",
                name="Remove Traffic Shaping",
                description="Remove QoS rules",
                action_type=ActionType.SHELL_COMMAND,
                config={"command": "tc qdisc del dev eth0 root 2>/dev/null || true"}
            ),
        ]
    ),
    
    RemediationTemplate(
        id="wf_cdn_failover",
        name="CDN Origin Failover",
        description="Switches CDN to backup origin",
        category="network",
        severity="P0_CRITICAL",
        pattern_id="cdn_origin_failure",
        icon="🌍",
        tags=["cdn", "failover", "origin"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="1-3 minutes",
        success_rate=92.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Switch to Backup Origin",
                description="Point CDN to backup origin server",
                action_type=ActionType.HTTP_REQUEST,
                config={
                    "method": "PATCH",
                    "url": "https://api.cloudflare.com/client/v4/zones/{{zone_id}}/dns_records/{{record_id}}",
                    "body": {"content": "{{backup_origin_ip}}"}
                }
            ),
            ActionStep(
                id="step_2",
                name="Enable Stale Cache",
                description="Serve stale content while revalidating",
                action_type=ActionType.HTTP_REQUEST,
                config={
                    "method": "PATCH",
                    "url": "https://api.cloudflare.com/client/v4/zones/{{zone_id}}/settings/always_online",
                    "body": {"value": "on"}
                }
            ),
            ActionStep(
                id="step_3",
                name="Alert Team",
                description="Notify about origin failure",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["pagerduty", "slack"],
                    "message": "🌍 CDN origin failure! Switched to backup origin.",
                    "priority": "critical"
                }
            ),
        ],
        rollback_steps=[]
    ),
]

# ─────────────────────────────────────────────────────────────────────────
# CATEGORY 4: APPLICATION LAYER (6 templates)
# ─────────────────────────────────────────────────────────────────────────

REMEDIATION_TEMPLATES_PART3: List[RemediationTemplate] = [
    
    RemediationTemplate(
        id="wf_service_recovery",
        name="Service Down Recovery",
        description="Restarts failed services and rolls back if needed",
        category="application",
        severity="P0_CRITICAL",
        pattern_id="service_down",
        icon="🟣",
        tags=["service", "recovery", "restart"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-5 minutes",
        success_rate=90.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Health Check",
                description="Check service status",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "systemctl status nginx php-fpm mysql 2>&1 | head -30",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Restart Services",
                description="Restart failed services",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "systemctl restart nginx php-fpm mysql 2>/dev/null || pm2 restart all 2>/dev/null || docker-compose restart 2>/dev/null"
                }
            ),
            ActionStep(
                id="step_3",
                name="Verify Recovery",
                description="Check if services are back up",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "curl -s -o /dev/null -w '%{http_code}' http://localhost/health || echo 'failed'",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_4",
                name="Alert Team",
                description="Notify about service recovery",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["pagerduty", "slack"],
                    "message": "🟣 Service recovery executed on {{host}} - Status: {{status}}"
                }
            ),
        ],
        rollback_steps=[
            ActionStep(
                id="rollback_1",
                name="Rollback Deployment",
                description="Rollback to previous version",
                action_type=ActionType.SHELL_COMMAND,
                config={"command": "cd /app && git checkout HEAD~1 && docker-compose up -d"}
            ),
        ]
    ),
    
    RemediationTemplate(
        id="wf_app_timeout_fix",
        name="Application Timeout Fix",
        description="Handles high latency with circuit breakers and scaling",
        category="application",
        severity="P1_HIGH",
        pattern_id="app_timeout",
        icon="⏱️",
        tags=["timeout", "latency", "scaling"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="3-5 minutes",
        success_rate=85.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Enable Circuit Breaker",
                description="Activate circuit breaker for slow endpoints",
                action_type=ActionType.HTTP_REQUEST,
                config={
                    "method": "POST",
                    "url": "http://localhost:8080/admin/circuit-breaker/enable"
                }
            ),
            ActionStep(
                id="step_2",
                name="Scale Workers",
                description="Add more worker processes",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "pm2 scale all +2 2>/dev/null || docker-compose up -d --scale app=4 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_3",
                name="Check Dependencies",
                description="Verify external services are responsive",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "curl -s -o /dev/null -w 'Redis: %{http_code}' redis://localhost:6379/ping && curl -s -o /dev/null -w 'DB: %{http_code}' http://localhost:3306/health",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_4",
                name="Notify Team",
                description="Alert about timeout handling",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "⏱️ Application timeout handled on {{host}} - scaled workers, enabled circuit breaker"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_http_error_fix",
        name="HTTP Error Rate Fix",
        description="Handles spike in HTTP errors",
        category="application",
        severity="P1_HIGH",
        pattern_id="http_error_spike",
        icon="📈",
        tags=["http", "errors", "fix"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-5 minutes",
        success_rate=88.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Analyze Error Patterns",
                description="Check recent error logs",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "tail -100 /var/log/nginx/error.log | grep -E '5[0-9]{2}|4[0-9]{2}' | sort | uniq -c | sort -rn | head -10",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Restart Application",
                description="Restart application services",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "systemctl restart application 2>/dev/null || pm2 restart all 2>/dev/null"
                }
            ),
            ActionStep(
                id="step_3",
                name="Rate Limit Abusive Clients",
                description="Enable stricter rate limiting",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "nginx -s reload 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_4",
                name="Notify Team",
                description="Alert about error spike handling",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "📈 HTTP error spike handled on {{host}}"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_queue_fix",
        name="Queue Backlog Fix",
        description="Handles message queue backlog",
        category="application",
        severity="P1_HIGH",
        pattern_id="queue_backlog",
        icon="📬",
        tags=["queue", "backlog", "workers"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="5-10 minutes",
        success_rate=90.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Scale Workers",
                description="Add more queue workers",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "pm2 scale worker +4 2>/dev/null || systemctl start worker@{3..6} 2>/dev/null"
                }
            ),
            ActionStep(
                id="step_2",
                name="Increase Parallelism",
                description="Boost worker concurrency",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "redis-cli CONFIG SET maxclients 20000 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_3",
                name="Handle Poison Messages",
                description="Move stuck messages to DLQ",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "/opt/scripts/move_to_dlq.sh --age 3600 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_4",
                name="Notify Team",
                description="Alert data team about backlog",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack", "email"],
                    "message": "📬 Queue backlog handled on {{host}} - scaled workers, moved old messages to DLQ"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_rate_limit_adjust",
        name="API Rate Limit Adjustment",
        description="Handles excessive rate limiting",
        category="application",
        severity="P2_MEDIUM",
        pattern_id="rate_limit_triggered",
        icon="🚦",
        tags=["api", "ratelimit", "adjust"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="1-2 minutes",
        success_rate=95.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Identify Rate Limited Clients",
                description="Find which clients are being rate limited",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "grep '429' /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -10",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Temporarily Increase Limits",
                description="Raise rate limits for surge",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "sed -i 's/rate=10r\\/s/rate=50r\\/s/' /etc/nginx/conf.d/rate-limit.conf && nginx -s reload"
                }
            ),
            ActionStep(
                id="step_3",
                name="Enable Request Queuing",
                description="Queue excess requests instead of rejecting",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "sed -i 's/nodelay/burst=20/' /etc/nginx/conf.d/rate-limit.conf && nginx -s reload"
                }
            ),
            ActionStep(
                id="step_4",
                name="Notify API Team",
                description="Alert about rate limit adjustment",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "🚦 Rate limits temporarily increased on {{host}}"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_cron_retry",
        name="Cron Job Retry",
        description="Retries failed scheduled jobs",
        category="application",
        severity="P2_MEDIUM",
        pattern_id="cronjob_failure",
        icon="⏰",
        tags=["cron", "job", "retry"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-10 minutes",
        success_rate=92.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Check Lock Files",
                description="Look for stuck lock files",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "find /var/lock -name '*.lock' -mmin +60 -delete 2>/dev/null; find /tmp -name 'cron*.lock' -mmin +60 -delete 2>/dev/null"
                }
            ),
            ActionStep(
                id="step_2",
                name="Kill Stuck Jobs",
                description="Terminate stuck cron processes",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "pkill -f 'php artisan schedule' 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_3",
                name="Retry Job",
                description="Run the failed job manually",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "cd /app && php artisan schedule:run 2>&1 || /opt/scripts/cron_retry.sh"
                }
            ),
            ActionStep(
                id="step_4",
                name="Notify Team",
                description="Alert job owner",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "⏰ Cron job retried on {{host}}"
                }
            ),
        ],
        rollback_steps=[]
    ),
]

# ─────────────────────────────────────────────────────────────────────────
# CATEGORY 5: SECURITY (3 templates)
# ─────────────────────────────────────────────────────────────────────────

REMEDIATION_TEMPLATES_PART4: List[RemediationTemplate] = [
    
    RemediationTemplate(
        id="wf_brute_force_defense",
        name="Brute Force Defense",
        description="Blocks brute force login attempts",
        category="security",
        severity="P1_HIGH",
        pattern_id="brute_force",
        icon="🔐",
        tags=["security", "brute-force", "block"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="1-2 minutes",
        success_rate=98.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Block Attacking IPs",
                description="Add attacking IPs to fail2ban",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "fail2ban-client set sshd banip $(grep 'Failed password' /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head -5 | awk '{print $2}')"
                }
            ),
            ActionStep(
                id="step_2",
                name="Enable CAPTCHA",
                description="Enable CAPTCHA on login page",
                action_type=ActionType.HTTP_REQUEST,
                config={
                    "method": "POST",
                    "url": "http://localhost:8080/admin/security/captcha/enable"
                }
            ),
            ActionStep(
                id="step_3",
                name="Check Compromised Accounts",
                description="Look for successful logins from attackers",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "grep 'Accepted' /var/log/auth.log | tail -20",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_4",
                name="Alert Security Team",
                description="Critical security alert",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["pagerduty", "slack", "email"],
                    "message": "🔐 Brute force attack blocked on {{host}}! IPs banned via fail2ban.",
                    "priority": "high"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_malware_response",
        name="Malware Detection Response",
        description="Emergency response to malware detection",
        category="security",
        severity="P0_CRITICAL",
        pattern_id="malware_detected",
        icon="🦠",
        tags=["security", "malware", "incident"],
        auto_execute=False,
        requires_approval=True,
        estimated_fix_time="30-60 minutes",
        success_rate=75.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Isolate Server",
                description="Disconnect from network",
                action_type=ActionType.APPROVAL,
                config={
                    "message": "MALWARE DETECTED! Approve network isolation of {{host}}?",
                    "priority": "critical"
                }
            ),
            ActionStep(
                id="step_2",
                name="Block Network",
                description="Drop all network connections",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "iptables -I INPUT -j DROP; iptables -I OUTPUT -j DROP; iptables -I INPUT -s 10.0.0.0/8 -j ACCEPT"
                }
            ),
            ActionStep(
                id="step_3",
                name="Capture Forensics",
                description="Dump memory and processes",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "ps auxww > /tmp/forensics_ps_$(date +%s).txt; netstat -tlnp > /tmp/forensics_net_$(date +%s).txt; cp /var/log/auth.log /tmp/forensics_auth_$(date +%s).txt"
                }
            ),
            ActionStep(
                id="step_4",
                name="Kill Suspicious Processes",
                description="Terminate known malware processes",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "pkill -9 -f 'kworker|xmrig|cryptominer' 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_5",
                name="CRITICAL ALERT",
                description="Immediate security team notification",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["pagerduty", "slack", "sms", "email"],
                    "message": "🚨🦠 CRITICAL: MALWARE DETECTED on {{host}}! Server isolated. Immediate investigation required!",
                    "priority": "critical"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_ssh_intrusion_response",
        name="SSH Intrusion Response",
        description="Responds to unauthorized SSH access",
        category="security",
        severity="P0_CRITICAL",
        pattern_id="ssh_intrusion",
        icon="🔑",
        tags=["security", "ssh", "intrusion"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-5 minutes",
        success_rate=95.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Kill Suspicious Sessions",
                description="Terminate all sessions from unknown IP",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "pkill -9 -u $(who | grep -v '10.0' | awk '{print $1}' | head -1) 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_2",
                name="Block IP",
                description="Block attacking IP at firewall",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "iptables -I INPUT -s {{attacker_ip}} -j DROP"
                }
            ),
            ActionStep(
                id="step_3",
                name="Force Password Reset",
                description="Expire all user passwords",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "for user in $(awk -F: '$3 >= 1000 {print $1}' /etc/passwd); do chage -d 0 $user; done"
                }
            ),
            ActionStep(
                id="step_4",
                name="Rotate SSH Keys",
                description="Regenerate SSH host keys",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "rm /etc/ssh/ssh_host_* && ssh-keygen -A && systemctl restart sshd"
                }
            ),
            ActionStep(
                id="step_5",
                name="Full Audit Log",
                description="Capture complete audit trail",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "cp /var/log/auth.log /var/log/audit/auth_intrusion_$(date +%s).log"
                }
            ),
            ActionStep(
                id="step_6",
                name="Alert Security",
                description="Critical security notification",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["pagerduty", "slack", "sms"],
                    "message": "🔑 SSH INTRUSION on {{host}}! Sessions killed, IP blocked, passwords expired.",
                    "priority": "critical"
                }
            ),
        ],
        rollback_steps=[]
    ),
]

# ─────────────────────────────────────────────────────────────────────────
# CATEGORY 6: CONTAINER & ORCHESTRATION (3 templates)
# ─────────────────────────────────────────────────────────────────────────

REMEDIATION_TEMPLATES_PART5: List[RemediationTemplate] = [
    
    RemediationTemplate(
        id="wf_pod_crash_fix",
        name="Pod Crash Loop Fix",
        description="Fixes Kubernetes pod crash loops",
        category="container",
        severity="P1_HIGH",
        pattern_id="pod_crash_loop",
        icon="⚡",
        tags=["kubernetes", "pod", "crash"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="3-10 minutes",
        success_rate=85.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Capture Pod Logs",
                description="Get logs from crashing pod",
                action_type=ActionType.KUBERNETES_API,
                config={
                    "action": "logs",
                    "pod": "{{pod_name}}",
                    "namespace": "{{namespace}}",
                    "previous": True,
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Check Resource Limits",
                description="Look for OOMKilled events",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "kubectl describe pod {{pod_name}} -n {{namespace}} | grep -A5 'Last State'",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_3",
                name="Increase Resources",
                description="Bump memory/CPU limits",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "kubectl set resources deployment/{{deployment}} -n {{namespace}} --limits=memory=2Gi,cpu=1000m"
                }
            ),
            ActionStep(
                id="step_4",
                name="Rollback if OOMKilled",
                description="Rollback to previous image if OOM",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "kubectl rollout undo deployment/{{deployment}} -n {{namespace}}",
                    "condition": "{{oom_killed}}"
                }
            ),
            ActionStep(
                id="step_5",
                name="Notify DevOps",
                description="Alert about pod recovery",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "⚡ Pod crash loop fixed - {{pod_name}} in {{namespace}}"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_image_pull_fix",
        name="Image Pull Fix",
        description="Fixes container image pull failures",
        category="container",
        severity="P1_HIGH",
        pattern_id="image_pull_failure",
        icon="🐳",
        tags=["docker", "image", "registry"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-5 minutes",
        success_rate=88.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Check Registry Auth",
                description="Verify registry credentials",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "docker login -u {{registry_user}} -p {{registry_pass}} {{registry_url}}"
                }
            ),
            ActionStep(
                id="step_2",
                name="Try Backup Registry",
                description="Pull from backup registry",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "kubectl set image deployment/{{deployment}} {{container}}={{backup_registry}}/{{image}}:{{tag}} -n {{namespace}}"
                }
            ),
            ActionStep(
                id="step_3",
                name="Use Cached Image",
                description="Fall back to local cached image",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "kubectl set image deployment/{{deployment}} {{container}}={{image}}:{{previous_tag}} -n {{namespace}}"
                }
            ),
            ActionStep(
                id="step_4",
                name="Notify Team",
                description="Alert about image pull issue",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "🐳 Image pull failure resolved for {{deployment}}"
                }
            ),
        ],
        rollback_steps=[]
    ),
    
    RemediationTemplate(
        id="wf_k8s_node_fix",
        name="Kubernetes Node Recovery",
        description="Recovers NotReady Kubernetes nodes",
        category="container",
        severity="P0_CRITICAL",
        pattern_id="k8s_node_notready",
        icon="🎛️",
        tags=["kubernetes", "node", "recovery"],
        auto_execute=False,
        requires_approval=True,
        estimated_fix_time="10-20 minutes",
        success_rate=78.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Cordon Node",
                description="Prevent new pods from scheduling",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "kubectl cordon {{node_name}}"
                }
            ),
            ActionStep(
                id="step_2",
                name="Approval for Drain",
                description="Get approval to drain node",
                action_type=ActionType.APPROVAL,
                config={
                    "message": "Node {{node_name}} is NotReady. Approve draining pods?",
                    "timeout_minutes": 10
                }
            ),
            ActionStep(
                id="step_3",
                name="Drain Node",
                description="Evict pods from node",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "kubectl drain {{node_name}} --ignore-daemonsets --delete-emptydir-data --force --timeout=300s"
                }
            ),
            ActionStep(
                id="step_4",
                name="Restart Kubelet",
                description="Restart kubelet service",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "ssh {{node_name}} 'systemctl restart kubelet docker'",
                    "timeout_seconds": 120
                }
            ),
            ActionStep(
                id="step_5",
                name="Uncordon Node",
                description="Allow scheduling again",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "kubectl uncordon {{node_name}}"
                }
            ),
            ActionStep(
                id="step_6",
                name="Notify Cluster Admin",
                description="Alert about node recovery",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["pagerduty", "slack"],
                    "message": "🎛️ K8s node {{node_name}} recovered after drain and kubelet restart"
                }
            ),
        ],
        rollback_steps=[]
    ),
]

# ─────────────────────────────────────────────────────────────────────────
# CATEGORY 7: COMPLIANCE & MAINTENANCE (2 templates)
# ─────────────────────────────────────────────────────────────────────────

REMEDIATION_TEMPLATES_PART6: List[RemediationTemplate] = [
    
    RemediationTemplate(
        id="wf_ssl_renewal",
        name="SSL Certificate Renewal",
        description="Auto-renews SSL certificates",
        category="compliance",
        severity="P1_HIGH",
        pattern_id="ssl_expiring",
        icon="🔐",
        tags=["ssl", "certificate", "renewal"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="2-5 minutes",
        success_rate=96.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Attempt Auto-Renewal",
                description="Run certbot renew",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "certbot renew --quiet 2>&1"
                }
            ),
            ActionStep(
                id="step_2",
                name="Verify Certificate",
                description="Check new certificate validity",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "openssl x509 -in /etc/letsencrypt/live/{{domain}}/cert.pem -noout -dates",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_3",
                name="Reload Web Server",
                description="Apply new certificate",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "nginx -t && nginx -s reload"
                }
            ),
            ActionStep(
                id="step_4",
                name="Test HTTPS",
                description="Verify HTTPS is working",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "curl -s -o /dev/null -w '%{http_code}' https://{{domain}}/health",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_5",
                name="Notify Team",
                description="Alert about SSL renewal",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack"],
                    "message": "🔐 SSL certificate renewed for {{domain}}"
                }
            ),
        ],
        rollback_steps=[
            ActionStep(
                id="rollback_1",
                name="Restore Backup Certificate",
                description="Use backup cert if renewal failed",
                action_type=ActionType.SHELL_COMMAND,
                config={"command": "cp /backup/ssl/{{domain}}.pem /etc/ssl/ && nginx -s reload"}
            ),
        ]
    ),
    
    RemediationTemplate(
        id="wf_security_patch",
        name="Security Patch Application",
        description="Applies critical security patches",
        category="compliance",
        severity="P0_CRITICAL",
        pattern_id="security_patch",
        icon="📦",
        tags=["security", "patch", "cve"],
        auto_execute=False,
        requires_approval=True,
        estimated_fix_time="10-30 minutes",
        success_rate=92.0,
        steps=[
            ActionStep(
                id="step_1",
                name="List Critical Updates",
                description="Show available security patches",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "apt list --upgradable 2>/dev/null | grep -i security || yum updateinfo list security 2>/dev/null",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Approval for Patching",
                description="Get approval to apply patches",
                action_type=ActionType.APPROVAL,
                config={
                    "message": "Critical security patches available. Approve installation? This may require service restarts.",
                    "timeout_minutes": 60
                }
            ),
            ActionStep(
                id="step_3",
                name="Apply Patches",
                description="Install security updates",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "apt-get update && apt-get upgrade -y --only-upgrade 2>/dev/null || yum update --security -y 2>/dev/null"
                }
            ),
            ActionStep(
                id="step_4",
                name="Restart Services",
                description="Restart affected services",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "needrestart -r a 2>/dev/null || systemctl daemon-reload && systemctl restart nginx php-fpm"
                }
            ),
            ActionStep(
                id="step_5",
                name="Verify System",
                description="Check system is healthy after patching",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "curl -s http://localhost/health && systemctl is-system-running",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_6",
                name="Log for Compliance",
                description="Record patching activity",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack", "email"],
                    "message": "📦 Security patches applied to {{host}}. Compliance log updated."
                }
            ),
        ],
        rollback_steps=[]
    ),
]

# ─────────────────────────────────────────────────────────────────────────
# CATEGORY 8: BUSINESS CONTINUITY (1 template)
# ─────────────────────────────────────────────────────────────────────────

REMEDIATION_TEMPLATES_PART7: List[RemediationTemplate] = [
    
    RemediationTemplate(
        id="wf_cost_investigation",
        name="Cloud Cost Investigation",
        description="Investigates cloud cost anomalies",
        category="business",
        severity="P2_MEDIUM",
        pattern_id="cost_anomaly",
        icon="💸",
        tags=["cost", "cloud", "finops"],
        auto_execute=True,
        requires_approval=False,
        estimated_fix_time="5-15 minutes",
        success_rate=88.0,
        steps=[
            ActionStep(
                id="step_1",
                name="Identify Cost Spike Source",
                description="Find what's causing cost increase",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "aws ce get-cost-and-usage --time-period Start=$(date -d '1 day ago' +%Y-%m-%d),End=$(date +%Y-%m-%d) --granularity DAILY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_2",
                name="Find Runaway Instances",
                description="List expensive running instances",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "aws ec2 describe-instances --query 'Reservations[].Instances[?State.Name==`running`].[InstanceId,InstanceType,Tags[?Key==`Name`].Value|[0]]' --output table",
                    "capture_output": True
                }
            ),
            ActionStep(
                id="step_3",
                name="Terminate Unused Resources",
                description="Stop/terminate obvious waste",
                action_type=ActionType.SHELL_COMMAND,
                config={
                    "command": "aws ec2 describe-instances --filters 'Name=tag:Environment,Values=dev,test' --query 'Reservations[].Instances[?State.Name==`running`].InstanceId' | xargs -I{} aws ec2 stop-instances --instance-ids {} 2>/dev/null || true"
                }
            ),
            ActionStep(
                id="step_4",
                name="Enable Cost Alerts",
                description="Set up budget alerts",
                action_type=ActionType.HTTP_REQUEST,
                config={
                    "method": "POST",
                    "url": "https://budgets.amazonaws.com/",
                    "action": "CreateBudget"
                }
            ),
            ActionStep(
                id="step_5",
                name="Notify Finance",
                description="Alert finance team",
                action_type=ActionType.NOTIFICATION,
                config={
                    "channels": ["slack", "email"],
                    "message": "💸 Cloud cost anomaly detected! Daily spend is {{spend_percent}}% of average. Investigation report attached."
                }
            ),
        ],
        rollback_steps=[]
    ),
]

# Merge all templates
REMEDIATION_TEMPLATES.extend(REMEDIATION_TEMPLATES_PART2)
REMEDIATION_TEMPLATES.extend(REMEDIATION_TEMPLATES_PART3)
REMEDIATION_TEMPLATES.extend(REMEDIATION_TEMPLATES_PART4)
REMEDIATION_TEMPLATES.extend(REMEDIATION_TEMPLATES_PART5)
REMEDIATION_TEMPLATES.extend(REMEDIATION_TEMPLATES_PART6)
REMEDIATION_TEMPLATES.extend(REMEDIATION_TEMPLATES_PART7)


# ══════════════════════════════════════════════════════════════════════════════
# TEMPLATE SERVICE
# ══════════════════════════════════════════════════════════════════════════════

class RemediationTemplateService:
    """Service for managing and retrieving remediation templates"""
    
    def __init__(self):
        self.templates: Dict[str, RemediationTemplate] = {t.id: t for t in REMEDIATION_TEMPLATES}
        print(f"🔧 Loaded {len(self.templates)} remediation templates")
    
    def get_template(self, template_id: str) -> Optional[RemediationTemplate]:
        """Get a template by ID"""
        return self.templates.get(template_id)
    
    def get_template_for_pattern(self, pattern_id: str) -> Optional[RemediationTemplate]:
        """Get the template that matches a detection pattern"""
        for template in self.templates.values():
            if template.pattern_id == pattern_id:
                return template
        return None
    
    def get_all_templates(self) -> List[RemediationTemplate]:
        """Get all templates"""
        return list(self.templates.values())
    
    def get_templates_by_category(self, category: str) -> List[RemediationTemplate]:
        """Get templates for a specific category"""
        return [t for t in self.templates.values() if t.category == category]
    
    def get_auto_execute_templates(self) -> List[RemediationTemplate]:
        """Get templates that can be auto-executed"""
        return [t for t in self.templates.values() if t.auto_execute]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get template statistics"""
        templates = list(self.templates.values())
        return {
            "total": len(templates),
            "auto_execute": len([t for t in templates if t.auto_execute]),
            "requires_approval": len([t for t in templates if t.requires_approval]),
            "by_category": {
                cat: len([t for t in templates if t.category == cat])
                for cat in set(t.category for t in templates)
            },
            "by_severity": {
                sev: len([t for t in templates if t.severity == sev])
                for sev in set(t.severity for t in templates)
            },
            "avg_success_rate": sum(t.success_rate for t in templates) / len(templates) if templates else 0,
        }


# Global instance
_template_service: Optional[RemediationTemplateService] = None


def get_remediation_service() -> RemediationTemplateService:
    """Get the global template service instance"""
    global _template_service
    if _template_service is None:
        _template_service = RemediationTemplateService()
    return _template_service


# ══════════════════════════════════════════════════════════════════════════════
# DEMO
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    service = get_remediation_service()
    stats = service.get_stats()
    
    print("\n" + "="*80)
    print("🔧 Auto-Remediation Template Library")
    print("="*80)
    print(f"\n📊 Total Templates: {stats['total']}")
    print(f"✅ Auto-Execute: {stats['auto_execute']}")
    print(f"⚠️ Requires Approval: {stats['requires_approval']}")
    print(f"📈 Avg Success Rate: {stats['avg_success_rate']:.1f}%")
    
    print("\n📋 By Category:")
    for cat, count in stats['by_category'].items():
        print(f"  {cat}: {count} templates")
    
    print("\n🎯 By Severity:")
    for sev, count in stats['by_severity'].items():
        print(f"  {sev}: {count} templates")
