"""
Safety Guardrails - Phase 5E
Implements safety features for autonomous remediation:
- Blast radius limits (max executions per host/time)
- Global kill switch
- Rate limiting
- Audit logging
- Rollback checkpoints
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from enum import Enum
import logging
import json
from collections import defaultdict

logger = logging.getLogger("safety_guardrails")


# ============================================================
# SAFETY CONFIGURATION
# ============================================================

@dataclass
class SafetyConfig:
    """Configuration for safety guardrails"""
    
    # Kill switch - if True, NO autonomous executions allowed
    kill_switch_enabled: bool = False
    kill_switch_reason: str = ""
    kill_switch_enabled_at: Optional[datetime] = None
    kill_switch_enabled_by: str = ""
    
    # Rate limiting
    max_executions_per_host_per_hour: int = 3
    max_executions_globally_per_minute: int = 10
    max_executions_globally_per_hour: int = 50
    
    # Blast radius
    max_concurrent_auto_remediations: int = 5
    max_hosts_affected_per_minute: int = 10
    
    # Confidence thresholds for auto-execution
    min_confidence_for_auto_execution: int = 80
    min_confidence_for_approval_queue: int = 50
    
    # Cooldown periods
    cooldown_after_failure_minutes: int = 30
    cooldown_same_workflow_minutes: int = 5


# ============================================================
# EXECUTION TRACKER
# ============================================================

@dataclass
class ExecutionRecord:
    """Record of a workflow execution for tracking"""
    workflow_id: str
    host: str
    started_at: datetime
    status: str  # running, completed, failed
    is_autonomous: bool
    confidence_score: int


class ExecutionTracker:
    """
    Tracks workflow executions for rate limiting and blast radius control.
    Uses in-memory storage with sliding window expiration.
    """
    
    def __init__(self, window_hours: int = 2):
        self.executions: List[ExecutionRecord] = []
        self.window = timedelta(hours=window_hours)
        self.current_autonomous_count = 0
        self._lock = asyncio.Lock()
    
    async def record_execution(
        self,
        workflow_id: str,
        host: str,
        is_autonomous: bool,
        confidence_score: int = 0
    ):
        """Record a new execution"""
        async with self._lock:
            record = ExecutionRecord(
                workflow_id=workflow_id,
                host=host,
                started_at=datetime.utcnow(),
                status="running",
                is_autonomous=is_autonomous,
                confidence_score=confidence_score
            )
            self.executions.append(record)
            
            if is_autonomous:
                self.current_autonomous_count += 1
            
            # Prune old records
            self._prune_old_records()
    
    async def complete_execution(self, workflow_id: str, status: str):
        """Mark an execution as complete"""
        async with self._lock:
            for record in reversed(self.executions):
                if record.workflow_id == workflow_id and record.status == "running":
                    record.status = status
                    if record.is_autonomous:
                        self.current_autonomous_count = max(0, self.current_autonomous_count - 1)
                    break
    
    def _prune_old_records(self):
        """Remove records older than the window"""
        cutoff = datetime.utcnow() - self.window
        self.executions = [e for e in self.executions if e.started_at > cutoff]
    
    def get_executions_for_host(self, host: str, minutes: int = 60) -> int:
        """Count executions for a host in the last N minutes"""
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        self._prune_old_records()
        return sum(1 for e in self.executions if e.host == host and e.started_at > cutoff)
    
    def get_global_executions(self, minutes: int = 60) -> int:
        """Count all executions in the last N minutes"""
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        self._prune_old_records()
        return sum(1 for e in self.executions if e.started_at > cutoff)
    
    def get_autonomous_executions(self, minutes: int = 60) -> int:
        """Count autonomous executions in the last N minutes"""
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        self._prune_old_records()
        return sum(1 for e in self.executions if e.is_autonomous and e.started_at > cutoff)
    
    def get_workflow_last_execution(self, workflow_id: str) -> Optional[datetime]:
        """Get the last execution time for a workflow"""
        for record in reversed(self.executions):
            if record.workflow_id == workflow_id:
                return record.started_at
        return None
    
    def get_unique_hosts_affected(self, minutes: int = 60) -> int:
        """Count unique hosts affected in the time window"""
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        self._prune_old_records()
        hosts = set(e.host for e in self.executions if e.started_at > cutoff)
        return len(hosts)
    
    def get_recent_failures(self, minutes: int = 60) -> int:
        """Count recent failed executions"""
        cutoff = datetime.utcnow() - timedelta(minutes=minutes)
        self._prune_old_records()
        return sum(1 for e in self.executions if e.status == "failed" and e.started_at > cutoff)


# ============================================================
# SAFETY GUARDRAILS
# ============================================================

@dataclass
class SafetyCheckResult:
    """Result of a safety check"""
    allowed: bool
    reason: str
    violations: List[str]
    warnings: List[str]


class SafetyGuardrails:
    """
    Implements safety checks for autonomous remediation.
    All autonomous executions must pass through these guardrails.
    """
    
    def __init__(self, config: Optional[SafetyConfig] = None):
        self.config = config or SafetyConfig()
        self.tracker = ExecutionTracker()
        self.audit_log: List[Dict[str, Any]] = []
    
    async def check_can_execute(
        self,
        workflow_id: str,
        host: str,
        confidence_score: int,
        is_autonomous: bool = True
    ) -> SafetyCheckResult:
        """
        Check if a workflow execution is allowed.
        
        Returns SafetyCheckResult with allowed=True if safe to proceed.
        """
        violations = []
        warnings = []
        
        # Check 1: Kill switch
        if self.config.kill_switch_enabled:
            violations.append(f"Kill switch is ENABLED: {self.config.kill_switch_reason}")
            return SafetyCheckResult(
                allowed=False,
                reason="Global kill switch is enabled",
                violations=violations,
                warnings=warnings
            )
        
        # For non-autonomous (manual) executions, skip other checks
        if not is_autonomous:
            return SafetyCheckResult(
                allowed=True,
                reason="Manual execution bypasses safety limits",
                violations=[],
                warnings=[]
            )
        
        # Check 2: Confidence threshold
        if confidence_score < self.config.min_confidence_for_auto_execution:
            violations.append(
                f"Confidence {confidence_score} below threshold {self.config.min_confidence_for_auto_execution}"
            )
        
        # Check 3: Rate limit - per host
        host_executions = self.tracker.get_executions_for_host(host, minutes=60)
        if host_executions >= self.config.max_executions_per_host_per_hour:
            violations.append(
                f"Host rate limit exceeded: {host_executions}/{self.config.max_executions_per_host_per_hour} per hour for {host}"
            )
        
        # Check 4: Rate limit - global per minute
        global_per_min = self.tracker.get_global_executions(minutes=1)
        if global_per_min >= self.config.max_executions_globally_per_minute:
            violations.append(
                f"Global rate limit exceeded: {global_per_min}/{self.config.max_executions_globally_per_minute} per minute"
            )
        
        # Check 5: Rate limit - global per hour
        global_per_hour = self.tracker.get_global_executions(minutes=60)
        if global_per_hour >= self.config.max_executions_globally_per_hour:
            violations.append(
                f"Global hourly limit exceeded: {global_per_hour}/{self.config.max_executions_globally_per_hour} per hour"
            )
        
        # Check 6: Concurrent autonomous limit
        if self.tracker.current_autonomous_count >= self.config.max_concurrent_auto_remediations:
            violations.append(
                f"Max concurrent autonomous remediations reached: {self.tracker.current_autonomous_count}/{self.config.max_concurrent_auto_remediations}"
            )
        
        # Check 7: Blast radius - hosts affected
        hosts_affected = self.tracker.get_unique_hosts_affected(minutes=1)
        if hosts_affected >= self.config.max_hosts_affected_per_minute:
            violations.append(
                f"Blast radius limit: {hosts_affected} hosts affected in the last minute"
            )
        
        # Check 8: Cooldown after failure
        recent_failures = self.tracker.get_recent_failures(
            minutes=self.config.cooldown_after_failure_minutes
        )
        if recent_failures >= 3:
            violations.append(
                f"Cooldown active: {recent_failures} failures in the last {self.config.cooldown_after_failure_minutes} minutes"
            )
        
        # Check 9: Same workflow cooldown
        last_execution = self.tracker.get_workflow_last_execution(workflow_id)
        if last_execution:
            minutes_since = (datetime.utcnow() - last_execution).total_seconds() / 60
            if minutes_since < self.config.cooldown_same_workflow_minutes:
                warnings.append(
                    f"Same workflow executed {minutes_since:.1f} minutes ago"
                )
        
        # Add warnings for approaching limits
        if host_executions >= self.config.max_executions_per_host_per_hour - 1:
            warnings.append(f"Approaching host rate limit for {host}")
        
        if global_per_hour >= self.config.max_executions_globally_per_hour * 0.8:
            warnings.append("Approaching global hourly limit")
        
        allowed = len(violations) == 0
        
        return SafetyCheckResult(
            allowed=allowed,
            reason="All safety checks passed" if allowed else f"Blocked: {violations[0]}",
            violations=violations,
            warnings=warnings
        )
    
    async def record_execution_start(
        self,
        workflow_id: str,
        host: str,
        is_autonomous: bool,
        confidence_score: int,
        user: str = "system"
    ):
        """Record the start of an execution for tracking and audit"""
        await self.tracker.record_execution(
            workflow_id=workflow_id,
            host=host,
            is_autonomous=is_autonomous,
            confidence_score=confidence_score
        )
        
        # Audit log
        self._audit_log("execution_started", {
            "workflow_id": workflow_id,
            "host": host,
            "is_autonomous": is_autonomous,
            "confidence_score": confidence_score,
            "user": user
        })
    
    async def record_execution_complete(
        self,
        workflow_id: str,
        status: str,
        duration_ms: int = 0
    ):
        """Record completion of an execution"""
        await self.tracker.complete_execution(workflow_id, status)
        
        self._audit_log("execution_completed", {
            "workflow_id": workflow_id,
            "status": status,
            "duration_ms": duration_ms
        })
    
    def enable_kill_switch(self, reason: str, enabled_by: str = "admin"):
        """Enable the global kill switch"""
        self.config.kill_switch_enabled = True
        self.config.kill_switch_reason = reason
        self.config.kill_switch_enabled_at = datetime.utcnow()
        self.config.kill_switch_enabled_by = enabled_by
        
        self._audit_log("kill_switch_enabled", {
            "reason": reason,
            "enabled_by": enabled_by
        })
        
        logger.warning(f"🛑 KILL SWITCH ENABLED by {enabled_by}: {reason}")
    
    def disable_kill_switch(self, disabled_by: str = "admin"):
        """Disable the global kill switch"""
        self.config.kill_switch_enabled = False
        self.config.kill_switch_reason = ""
        self.config.kill_switch_enabled_at = None
        self.config.kill_switch_enabled_by = ""
        
        self._audit_log("kill_switch_disabled", {
            "disabled_by": disabled_by
        })
        
        logger.info(f"✅ Kill switch disabled by {disabled_by}")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current safety status"""
        return {
            "kill_switch": {
                "enabled": self.config.kill_switch_enabled,
                "reason": self.config.kill_switch_reason,
                "enabled_at": self.config.kill_switch_enabled_at.isoformat() if self.config.kill_switch_enabled_at else None,
                "enabled_by": self.config.kill_switch_enabled_by,
            },
            "rate_limits": {
                "executions_per_host_per_hour": self.config.max_executions_per_host_per_hour,
                "executions_globally_per_minute": self.config.max_executions_globally_per_minute,
                "executions_globally_per_hour": self.config.max_executions_globally_per_hour,
                "max_concurrent_auto_remediations": self.config.max_concurrent_auto_remediations,
            },
            "current_stats": {
                "current_autonomous_count": self.tracker.current_autonomous_count,
                "executions_last_hour": self.tracker.get_global_executions(minutes=60),
                "autonomous_last_hour": self.tracker.get_autonomous_executions(minutes=60),
                "hosts_affected_last_minute": self.tracker.get_unique_hosts_affected(minutes=1),
                "recent_failures": self.tracker.get_recent_failures(minutes=60),
            },
            "thresholds": {
                "min_confidence_auto": self.config.min_confidence_for_auto_execution,
                "min_confidence_approval": self.config.min_confidence_for_approval_queue,
            }
        }
    
    def _audit_log(self, event_type: str, data: Dict[str, Any]):
        """Add entry to audit log"""
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event_type": event_type,
            **data
        }
        self.audit_log.append(entry)
        
        # Keep only last 1000 entries
        if len(self.audit_log) > 1000:
            self.audit_log = self.audit_log[-1000:]
        
        logger.info(f"Audit: {event_type} - {json.dumps(data)}")
    
    def get_audit_log(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get recent audit log entries"""
        return self.audit_log[-limit:]


# ============================================================
# SINGLETON INSTANCE
# ============================================================

_guardrails: Optional[SafetyGuardrails] = None


def get_safety_guardrails() -> SafetyGuardrails:
    """Get or create the safety guardrails instance"""
    global _guardrails
    if _guardrails is None:
        _guardrails = SafetyGuardrails()
    return _guardrails


def init_safety_guardrails(config: Optional[SafetyConfig] = None) -> SafetyGuardrails:
    """Initialize safety guardrails with custom config"""
    global _guardrails
    _guardrails = SafetyGuardrails(config)
    return _guardrails
