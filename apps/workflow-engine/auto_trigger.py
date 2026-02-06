"""
Auto Trigger - Phase 5E
Autonomous triggering system that integrates confidence scoring and safety guardrails.

Features:
- Pattern matching for auto-association
- Confidence-based execution decisions
- Safety guardrails enforcement
- Approval queue for medium-confidence cases
- Notification for low-confidence cases
"""

import asyncio
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum
import logging
import re
import fnmatch

from confidence_scorer import (
    ConfidenceScorer, ConfidenceResult, ConfidenceLevel, 
    get_confidence_scorer, calculate_confidence
)
from safety_guardrails import (
    SafetyGuardrails, SafetyCheckResult, 
    get_safety_guardrails, init_safety_guardrails
)

logger = logging.getLogger("auto_trigger")


# ============================================================
# AUTO TRIGGER CONFIGURATION
# ============================================================

@dataclass 
class AutoTriggerConfig:
    """Configuration for autonomous triggering"""
    
    # Global enable/disable
    autonomous_mode_enabled: bool = True
    
    # Actions by confidence level
    high_confidence_action: str = "execute_automatically"  # or "queue_for_approval"
    medium_confidence_action: str = "queue_for_approval"   # or "notify_only"
    low_confidence_action: str = "notify_only"             # or "ignore"
    
    # Notification settings
    notify_on_auto_execution: bool = True
    notify_channel: str = "slack"  # slack, email, webhook, console
    
    # Queue settings
    approval_timeout_minutes: int = 15
    auto_approve_after_timeout: bool = False
    
    # Pattern matching
    default_pattern_threshold: float = 0.7  # 70% match required


# ============================================================
# APPROVAL QUEUE
# ============================================================

@dataclass
class ApprovalRequest:
    """A pending approval request"""
    id: str
    workflow_id: str
    workflow_name: str
    issue: Dict[str, Any]
    confidence: ConfidenceResult
    created_at: datetime
    timeout_at: datetime
    status: str = "pending"  # pending, approved, rejected, expired
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None


class ApprovalQueue:
    """Queue for medium-confidence execution requests"""
    
    def __init__(self):
        self.pending: Dict[str, ApprovalRequest] = {}
        self._lock = asyncio.Lock()
    
    async def add_request(
        self,
        workflow_id: str,
        workflow_name: str,
        issue: Dict[str, Any],
        confidence: ConfidenceResult,
        timeout_minutes: int = 15
    ) -> ApprovalRequest:
        """Add a request to the approval queue"""
        import uuid
        
        request = ApprovalRequest(
            id=str(uuid.uuid4()),
            workflow_id=workflow_id,
            workflow_name=workflow_name,
            issue=issue,
            confidence=confidence,
            created_at=datetime.utcnow(),
            timeout_at=datetime.utcnow() + timedelta(minutes=timeout_minutes)
        )
        
        async with self._lock:
            self.pending[request.id] = request
        
        logger.info(f"Added approval request {request.id} for workflow {workflow_name}")
        return request
    
    async def approve(self, request_id: str, approved_by: str = "user") -> Optional[ApprovalRequest]:
        """Approve a pending request"""
        async with self._lock:
            if request_id not in self.pending:
                return None
            
            request = self.pending[request_id]
            request.status = "approved"
            request.reviewed_by = approved_by
            request.reviewed_at = datetime.utcnow()
            
            del self.pending[request_id]
            return request
    
    async def reject(self, request_id: str, rejected_by: str = "user") -> Optional[ApprovalRequest]:
        """Reject a pending request"""
        async with self._lock:
            if request_id not in self.pending:
                return None
            
            request = self.pending[request_id]
            request.status = "rejected"
            request.reviewed_by = rejected_by
            request.reviewed_at = datetime.utcnow()
            
            del self.pending[request_id]
            return request
    
    async def check_timeouts(self, auto_approve: bool = False) -> List[ApprovalRequest]:
        """Check for expired requests and handle them"""
        expired = []
        now = datetime.utcnow()
        
        async with self._lock:
            for request_id in list(self.pending.keys()):
                request = self.pending[request_id]
                if request.timeout_at < now:
                    if auto_approve:
                        request.status = "approved"
                        request.reviewed_by = "system_timeout"
                    else:
                        request.status = "expired"
                    request.reviewed_at = now
                    expired.append(request)
                    del self.pending[request_id]
        
        return expired
    
    def get_pending(self) -> List[ApprovalRequest]:
        """Get all pending approval requests"""
        return list(self.pending.values())
    
    def get_request(self, request_id: str) -> Optional[ApprovalRequest]:
        """Get a specific request"""
        return self.pending.get(request_id)


# ============================================================
# PATTERN MATCHER
# ============================================================

class PatternMatcher:
    """Match issues to workflows based on patterns"""
    
    def __init__(self):
        # Cache of workflow patterns
        self.workflow_patterns: Dict[str, Dict[str, Any]] = {}
    
    def register_workflow(
        self,
        workflow_id: str,
        patterns: List[str],
        severity_filter: List[str] = None,
        host_filter: List[str] = None
    ):
        """Register a workflow with its trigger patterns"""
        self.workflow_patterns[workflow_id] = {
            "patterns": patterns,
            "severity_filter": severity_filter or ["critical", "high", "medium", "low"],
            "host_filter": host_filter
        }
    
    def find_matching_workflows(self, issue: Dict[str, Any]) -> List[tuple]:
        """
        Find workflows that match the given issue.
        
        Returns list of (workflow_id, match_score) tuples.
        """
        matches = []
        
        issue_title = issue.get("title", "").lower()
        issue_message = issue.get("message", "").lower()
        issue_severity = issue.get("severity", "medium").lower()
        issue_host = issue.get("host", "")
        
        for workflow_id, config in self.workflow_patterns.items():
            # Check severity filter
            if issue_severity not in config["severity_filter"]:
                continue
            
            # Check host filter
            if config["host_filter"]:
                host_match = any(
                    fnmatch.fnmatch(issue_host, pattern)
                    for pattern in config["host_filter"]
                )
                if not host_match:
                    continue
            
            # Check pattern match
            best_score = 0.0
            for pattern in config["patterns"]:
                pattern = pattern.lower()
                
                # Wildcard match
                if "*" in pattern:
                    if fnmatch.fnmatch(issue_title, pattern):
                        best_score = max(best_score, 0.9)
                    elif fnmatch.fnmatch(issue_message, pattern):
                        best_score = max(best_score, 0.8)
                # Exact match
                elif pattern in issue_title:
                    best_score = max(best_score, 1.0)
                elif pattern in issue_message:
                    best_score = max(best_score, 0.9)
                # Fuzzy match (words present)
                else:
                    pattern_words = set(pattern.split())
                    title_words = set(issue_title.split())
                    overlap = len(pattern_words & title_words) / len(pattern_words) if pattern_words else 0
                    best_score = max(best_score, overlap * 0.7)
            
            if best_score > 0:
                matches.append((workflow_id, best_score))
        
        # Sort by score descending
        matches.sort(key=lambda x: x[1], reverse=True)
        return matches


# ============================================================
# AUTO TRIGGER MANAGER
# ============================================================

@dataclass
class AutoTriggerResult:
    """Result of an auto-trigger attempt"""
    triggered: bool
    action_taken: str  # "executed", "queued", "notified", "blocked", "skipped"
    workflow_id: str
    confidence: ConfidenceResult
    safety_check: Optional[SafetyCheckResult] = None
    execution_id: Optional[str] = None
    approval_request_id: Optional[str] = None
    message: str = ""


class AutoTriggerManager:
    """
    Main manager for autonomous triggering.
    
    Workflow:
    1. Receive an issue/alert
    2. Find matching workflows
    3. Calculate confidence for each match
    4. Check safety guardrails
    5. Execute based on confidence level and config
    """
    
    def __init__(
        self,
        config: Optional[AutoTriggerConfig] = None,
        executor = None  # WorkflowExecutor or RemediationExecutor
    ):
        self.config = config or AutoTriggerConfig()
        self.executor = executor
        self.scorer = get_confidence_scorer()
        self.guardrails = get_safety_guardrails()
        self.approval_queue = ApprovalQueue()
        self.pattern_matcher = PatternMatcher()
        
        # Track recent triggers
        self.recent_triggers: List[AutoTriggerResult] = []
    
    def set_executor(self, executor):
        """Set the workflow executor"""
        self.executor = executor
    
    async def process_issue(
        self,
        issue: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> List[AutoTriggerResult]:
        """
        Process an incoming issue and trigger appropriate workflows.
        
        Args:
            issue: The issue/alert data
            context: Additional context (host metrics, history, etc.)
        
        Returns:
            List of AutoTriggerResult for each matching workflow
        """
        results = []
        context = context or {}
        
        # Check global autonomous mode
        if not self.config.autonomous_mode_enabled:
            logger.info("Autonomous mode is disabled, skipping auto-trigger")
            return results
        
        # Find matching workflows
        matches = self.pattern_matcher.find_matching_workflows(issue)
        
        if not matches:
            logger.debug(f"No matching workflows for issue: {issue.get('title', 'unknown')}")
            return results
        
        logger.info(f"Found {len(matches)} matching workflows for issue")
        
        # Process each match
        for workflow_id, pattern_score in matches:
            result = await self._process_match(
                workflow_id=workflow_id,
                pattern_score=pattern_score,
                issue=issue,
                context=context
            )
            results.append(result)
            
            # Track
            self.recent_triggers.append(result)
            if len(self.recent_triggers) > 100:
                self.recent_triggers.pop(0)
        
        return results
    
    async def _process_match(
        self,
        workflow_id: str,
        pattern_score: float,
        issue: Dict[str, Any],
        context: Dict[str, Any]
    ) -> AutoTriggerResult:
        """Process a single workflow match"""
        
        # Get workflow details (mock for now)
        workflow = await self._get_workflow(workflow_id)
        
        # Add pattern score to context
        context["pattern_match"] = pattern_score
        
        # Calculate confidence
        confidence = self.scorer.calculate(workflow, issue, context)
        
        # Check safety guardrails
        host = issue.get("host", "") or context.get("host", "unknown")
        safety_check = await self.guardrails.check_can_execute(
            workflow_id=workflow_id,
            host=host,
            confidence_score=confidence.score,
            is_autonomous=True
        )
        
        # Determine action based on confidence and safety
        if not safety_check.allowed:
            return AutoTriggerResult(
                triggered=False,
                action_taken="blocked",
                workflow_id=workflow_id,
                confidence=confidence,
                safety_check=safety_check,
                message=f"Blocked by safety: {safety_check.reason}"
            )
        
        # Take action based on confidence level
        if confidence.level == ConfidenceLevel.HIGH:
            return await self._handle_high_confidence(
                workflow_id, workflow, issue, confidence, context, host
            )
        
        elif confidence.level == ConfidenceLevel.MEDIUM:
            return await self._handle_medium_confidence(
                workflow_id, workflow, issue, confidence
            )
        
        else:  # LOW
            return await self._handle_low_confidence(
                workflow_id, workflow, issue, confidence
            )
    
    async def _handle_high_confidence(
        self,
        workflow_id: str,
        workflow: Dict[str, Any],
        issue: Dict[str, Any],
        confidence: ConfidenceResult,
        context: Dict[str, Any],
        host: str
    ) -> AutoTriggerResult:
        """Handle high-confidence matches"""
        
        action = self.config.high_confidence_action
        
        if action == "execute_automatically":
            # Record the execution
            await self.guardrails.record_execution_start(
                workflow_id=workflow_id,
                host=host,
                is_autonomous=True,
                confidence_score=confidence.score
            )
            
            # Execute the workflow
            execution_id = None
            if self.executor:
                try:
                    trigger_data = {
                        "trigger_type": "autonomous",
                        "issue": issue,
                        "confidence_score": confidence.score,
                        "triggered_at": datetime.utcnow().isoformat()
                    }
                    execution_id = await self.executor.execute_workflow(
                        workflow_id, trigger_data
                    )
                except Exception as e:
                    logger.error(f"Auto-execution failed: {e}")
                    await self.guardrails.record_execution_complete(
                        workflow_id, "failed"
                    )
                    return AutoTriggerResult(
                        triggered=False,
                        action_taken="execution_failed",
                        workflow_id=workflow_id,
                        confidence=confidence,
                        message=str(e)
                    )
            
            # Notify if configured
            if self.config.notify_on_auto_execution:
                await self._send_notification(
                    "auto_execution",
                    workflow,
                    issue,
                    confidence
                )
            
            return AutoTriggerResult(
                triggered=True,
                action_taken="executed",
                workflow_id=workflow_id,
                confidence=confidence,
                execution_id=execution_id,
                message=f"Auto-executed with confidence {confidence.score}"
            )
        
        else:
            # Fall through to queue
            return await self._handle_medium_confidence(
                workflow_id, workflow, issue, confidence
            )
    
    async def _handle_medium_confidence(
        self,
        workflow_id: str,
        workflow: Dict[str, Any],
        issue: Dict[str, Any],
        confidence: ConfidenceResult
    ) -> AutoTriggerResult:
        """Handle medium-confidence matches"""
        
        action = self.config.medium_confidence_action
        
        if action == "queue_for_approval":
            # Add to approval queue
            request = await self.approval_queue.add_request(
                workflow_id=workflow_id,
                workflow_name=workflow.get("name", workflow_id),
                issue=issue,
                confidence=confidence,
                timeout_minutes=self.config.approval_timeout_minutes
            )
            
            # Notify about pending approval
            await self._send_notification(
                "approval_required",
                workflow,
                issue,
                confidence
            )
            
            return AutoTriggerResult(
                triggered=False,
                action_taken="queued",
                workflow_id=workflow_id,
                confidence=confidence,
                approval_request_id=request.id,
                message=f"Queued for approval (confidence: {confidence.score})"
            )
        
        else:
            # Just notify
            return await self._handle_low_confidence(
                workflow_id, workflow, issue, confidence
            )
    
    async def _handle_low_confidence(
        self,
        workflow_id: str,
        workflow: Dict[str, Any],
        issue: Dict[str, Any],
        confidence: ConfidenceResult
    ) -> AutoTriggerResult:
        """Handle low-confidence matches"""
        
        action = self.config.low_confidence_action
        
        if action == "notify_only":
            await self._send_notification(
                "low_confidence_match",
                workflow,
                issue,
                confidence
            )
            
            return AutoTriggerResult(
                triggered=False,
                action_taken="notified",
                workflow_id=workflow_id,
                confidence=confidence,
                message=f"Notification sent (low confidence: {confidence.score})"
            )
        
        else:
            return AutoTriggerResult(
                triggered=False,
                action_taken="skipped",
                workflow_id=workflow_id,
                confidence=confidence,
                message=f"Skipped (low confidence: {confidence.score})"
            )
    
    async def _get_workflow(self, workflow_id: str) -> Dict[str, Any]:
        """Get workflow details (stub - would load from DB)"""
        # This would typically load from database
        return {
            "id": workflow_id,
            "name": f"Workflow {workflow_id}",
            "success_rate": 95,
        }
    
    async def _send_notification(
        self,
        notification_type: str,
        workflow: Dict[str, Any],
        issue: Dict[str, Any],
        confidence: ConfidenceResult
    ):
        """Send a notification (stub - would integrate with notification service)"""
        message = f"[{notification_type.upper()}] Workflow '{workflow.get('name')}' " \
                  f"matched issue '{issue.get('title', 'unknown')}' " \
                  f"with confidence {confidence.score} ({confidence.level.value})"
        
        logger.info(f"📢 Notification: {message}")
        # In production, this would send to Slack, email, etc.
    
    # ========================================
    # APPROVAL HANDLING
    # ========================================
    
    async def approve_request(
        self,
        request_id: str,
        approved_by: str = "user"
    ) -> Optional[AutoTriggerResult]:
        """Approve a pending request and execute the workflow"""
        
        request = await self.approval_queue.approve(request_id, approved_by)
        if not request:
            return None
        
        # Execute the workflow
        host = request.issue.get("host", "unknown")
        
        await self.guardrails.record_execution_start(
            workflow_id=request.workflow_id,
            host=host,
            is_autonomous=False,  # Not autonomous since approved
            confidence_score=request.confidence.score,
            user=approved_by
        )
        
        execution_id = None
        if self.executor:
            try:
                trigger_data = {
                    "trigger_type": "approved",
                    "issue": request.issue,
                    "confidence_score": request.confidence.score,
                    "approved_by": approved_by,
                    "triggered_at": datetime.utcnow().isoformat()
                }
                execution_id = await self.executor.execute_workflow(
                    request.workflow_id, trigger_data
                )
            except Exception as e:
                logger.error(f"Failed to execute approved workflow: {e}")
                return AutoTriggerResult(
                    triggered=False,
                    action_taken="execution_failed",
                    workflow_id=request.workflow_id,
                    confidence=request.confidence,
                    message=str(e)
                )
        
        return AutoTriggerResult(
            triggered=True,
            action_taken="executed",
            workflow_id=request.workflow_id,
            confidence=request.confidence,
            execution_id=execution_id,
            message=f"Approved and executed by {approved_by}"
        )
    
    async def reject_request(
        self,
        request_id: str,
        rejected_by: str = "user"
    ) -> bool:
        """Reject a pending approval request"""
        request = await self.approval_queue.reject(request_id, rejected_by)
        return request is not None
    
    # ========================================
    # STATUS AND CONTROL
    # ========================================
    
    def enable_autonomous_mode(self):
        """Enable autonomous triggering"""
        self.config.autonomous_mode_enabled = True
        logger.info("✅ Autonomous mode ENABLED")
    
    def disable_autonomous_mode(self):
        """Disable autonomous triggering"""
        self.config.autonomous_mode_enabled = False
        logger.info("🛑 Autonomous mode DISABLED")
    
    def get_status(self) -> Dict[str, Any]:
        """Get current auto-trigger status"""
        return {
            "autonomous_mode_enabled": self.config.autonomous_mode_enabled,
            "config": {
                "high_confidence_action": self.config.high_confidence_action,
                "medium_confidence_action": self.config.medium_confidence_action,
                "low_confidence_action": self.config.low_confidence_action,
                "approval_timeout_minutes": self.config.approval_timeout_minutes,
            },
            "pending_approvals": len(self.approval_queue.pending),
            "recent_triggers": len(self.recent_triggers),
            "safety_status": self.guardrails.get_status(),
        }
    
    def get_pending_approvals(self) -> List[Dict[str, Any]]:
        """Get list of pending approval requests"""
        pending = self.approval_queue.get_pending()
        return [
            {
                "id": r.id,
                "workflow_id": r.workflow_id,
                "workflow_name": r.workflow_name,
                "issue_title": r.issue.get("title", "unknown"),
                "confidence_score": r.confidence.score,
                "confidence_level": r.confidence.level.value,
                "created_at": r.created_at.isoformat(),
                "timeout_at": r.timeout_at.isoformat(),
            }
            for r in pending
        ]
    
    def get_recent_triggers(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent trigger results"""
        return [
            {
                "workflow_id": r.workflow_id,
                "action_taken": r.action_taken,
                "triggered": r.triggered,
                "confidence_score": r.confidence.score,
                "confidence_level": r.confidence.level.value,
                "message": r.message,
            }
            for r in self.recent_triggers[-limit:]
        ]


# ============================================================
# SINGLETON INSTANCE
# ============================================================

_auto_trigger_manager: Optional[AutoTriggerManager] = None


def get_auto_trigger_manager() -> Optional[AutoTriggerManager]:
    """Get the auto trigger manager instance"""
    return _auto_trigger_manager


def init_auto_trigger_manager(
    config: Optional[AutoTriggerConfig] = None,
    executor = None
) -> AutoTriggerManager:
    """Initialize the auto trigger manager"""
    global _auto_trigger_manager
    _auto_trigger_manager = AutoTriggerManager(config, executor)
    return _auto_trigger_manager
