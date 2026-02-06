"""
Confidence Scorer - Phase 5E
Calculates confidence scores for auto-remediation decisions.

The confidence score (0-100) determines whether a workflow should:
- Execute automatically (high confidence >= 80)
- Queue for approval (medium confidence 50-79)
- Notify only (low confidence < 50)
"""

from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field
from enum import Enum
import re
import logging
import asyncio

logger = logging.getLogger("confidence_scorer")


# ============================================================
# CONFIDENCE LEVELS
# ============================================================

class ConfidenceLevel(Enum):
    HIGH = "high"       # >= 80: Execute automatically
    MEDIUM = "medium"   # 50-79: Queue for approval
    LOW = "low"         # < 50: Notify only


@dataclass
class ConfidenceResult:
    """Result of confidence calculation"""
    score: int  # 0-100
    level: ConfidenceLevel
    factors: Dict[str, int]  # Factor name -> score impact
    recommendation: str  # What to do based on score
    can_auto_execute: bool
    requires_approval: bool
    reason: str


# ============================================================
# CONFIDENCE FACTORS
# ============================================================

@dataclass
class ConfidenceFactors:
    """Factors that influence confidence scoring"""
    
    # Pattern matching quality (0-100)
    pattern_match_strength: float = 100.0
    
    # Historical success rate of this workflow (0-100)
    workflow_success_rate: float = 95.0
    
    # Hours since last similar issue (affects freshness)
    hours_since_similar: float = 24.0
    
    # Is the target a critical system?
    is_critical_system: bool = False
    
    # Number of auto-remediations in last hour for this host
    recent_remediation_count: int = 0
    
    # Time of day factor (night = more caution)
    is_off_hours: bool = False
    
    # Number of successful runs of this specific workflow
    total_successful_runs: int = 100
    
    # Number of failed runs
    total_failed_runs: int = 5
    
    # Has the workflow been recently modified?
    recently_modified: bool = False
    
    # Is this a dry-run? (always allow)
    dry_run: bool = False


# ============================================================
# CRITICAL SYSTEMS CONFIGURATION
# ============================================================

CRITICAL_HOSTS = {
    "db-primary",
    "db-replica-1",
    "db-replica-2",
    "payment-gateway",
    "auth-server",
    "api-gateway",
    "prod-master",
    "kubernetes-master",
    "etcd-1", "etcd-2", "etcd-3",
}

CRITICAL_SERVICES = {
    "postgresql",
    "mysql",
    "redis-cluster",
    "kafka",
    "elasticsearch-master",
    "vault",
    "consul",
}


# ============================================================
# CONFIDENCE CALCULATOR
# ============================================================

class ConfidenceScorer:
    """
    Calculate confidence scores for auto-remediation decisions.
    
    Scoring algorithm:
    - Start with base score of 100
    - Apply various penalty/bonus factors
    - Clamp final score between 0-100
    """
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self.thresholds = {
            "high": self.config.get("high_threshold", 80),
            "medium": self.config.get("medium_threshold", 50),
        }
        
        # Track recent calculations for debugging
        self.recent_calculations: List[ConfidenceResult] = []
    
    def calculate(
        self,
        workflow: Dict[str, Any],
        issue: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None
    ) -> ConfidenceResult:
        """
        Calculate confidence score for auto-remediation.
        
        Args:
            workflow: The workflow definition
            issue: The issue/alert that triggered this
            context: Additional context (host info, metrics, etc.)
        
        Returns:
            ConfidenceResult with score, level, and recommendation
        """
        context = context or {}
        factors = self._collect_factors(workflow, issue, context)
        
        # Start with base score
        score = 100
        factor_impacts: Dict[str, int] = {}
        
        # Factor 1: Pattern match strength
        pattern_penalty = int((1 - factors.pattern_match_strength / 100) * 30)
        score -= pattern_penalty
        factor_impacts["pattern_match"] = -pattern_penalty
        
        # Factor 2: Historical success rate
        success_penalty = int((1 - factors.workflow_success_rate / 100) * 25)
        score -= success_penalty
        factor_impacts["success_rate"] = -success_penalty
        
        # Factor 3: Recent recurrence (be cautious if happening frequently)
        if factors.hours_since_similar < 1:
            score -= 20
            factor_impacts["recent_recurrence"] = -20
        elif factors.hours_since_similar < 4:
            score -= 10
            factor_impacts["recent_recurrence"] = -10
        
        # Factor 4: Critical system penalty
        if factors.is_critical_system:
            score -= 15
            factor_impacts["critical_system"] = -15
        
        # Factor 5: Rate limiting (too many recent remediations)
        if factors.recent_remediation_count >= 3:
            score -= 25
            factor_impacts["rate_limit"] = -25
        elif factors.recent_remediation_count >= 2:
            score -= 15
            factor_impacts["rate_limit"] = -15
        elif factors.recent_remediation_count >= 1:
            score -= 5
            factor_impacts["rate_limit"] = -5
        
        # Factor 6: Off-hours caution
        if factors.is_off_hours:
            score -= 10
            factor_impacts["off_hours"] = -10
        
        # Factor 7: Track record (boost for proven workflows)
        if factors.total_successful_runs > 50 and factors.total_failed_runs < 3:
            score += 10
            factor_impacts["proven_workflow"] = 10
        
        # Factor 8: Recently modified workflow (be cautious)
        if factors.recently_modified:
            score -= 15
            factor_impacts["recently_modified"] = -15
        
        # Factor 9: Dry-run override
        if factors.dry_run:
            score = 100
            factor_impacts["dry_run"] = 100
        
        # Clamp score
        score = max(0, min(100, score))
        
        # Determine level
        if score >= self.thresholds["high"]:
            level = ConfidenceLevel.HIGH
        elif score >= self.thresholds["medium"]:
            level = ConfidenceLevel.MEDIUM
        else:
            level = ConfidenceLevel.LOW
        
        # Build result
        result = ConfidenceResult(
            score=score,
            level=level,
            factors=factor_impacts,
            recommendation=self._get_recommendation(level),
            can_auto_execute=(level == ConfidenceLevel.HIGH),
            requires_approval=(level == ConfidenceLevel.MEDIUM),
            reason=self._get_reason(level, factor_impacts),
        )
        
        # Track for debugging
        self.recent_calculations.append(result)
        if len(self.recent_calculations) > 100:
            self.recent_calculations.pop(0)
        
        logger.info(f"Confidence score: {score} ({level.value}) - {result.reason}")
        
        return result
    
    def _collect_factors(
        self,
        workflow: Dict[str, Any],
        issue: Dict[str, Any],
        context: Dict[str, Any]
    ) -> ConfidenceFactors:
        """Collect all factors that influence confidence scoring"""
        
        factors = ConfidenceFactors()
        
        # Pattern matching
        if "pattern_match" in context:
            factors.pattern_match_strength = context["pattern_match"] * 100
        
        # Success rate from workflow metadata
        if "success_rate" in workflow:
            factors.workflow_success_rate = workflow["success_rate"]
        
        # Check if critical system
        host = issue.get("host", "") or context.get("host", "")
        service = issue.get("service", "") or context.get("service", "")
        factors.is_critical_system = (
            host in CRITICAL_HOSTS or 
            service in CRITICAL_SERVICES
        )
        
        # Recent remediation count
        factors.recent_remediation_count = context.get("recent_remediation_count", 0)
        
        # Hours since similar issue
        if "last_similar_issue" in context:
            try:
                last_issue_time = datetime.fromisoformat(context["last_similar_issue"])
                hours = (datetime.utcnow() - last_issue_time).total_seconds() / 3600
                factors.hours_since_similar = max(0, hours)
            except:
                pass
        
        # Off-hours check (10 PM - 6 AM local time = more cautious)
        current_hour = datetime.now().hour
        factors.is_off_hours = current_hour < 6 or current_hour >= 22
        
        # Workflow track record
        if "execution_stats" in workflow:
            stats = workflow["execution_stats"]
            factors.total_successful_runs = stats.get("successful", 0)
            factors.total_failed_runs = stats.get("failed", 0)
        
        # Recently modified check
        if "updated_at" in workflow:
            try:
                updated = datetime.fromisoformat(workflow["updated_at"].replace("Z", "+00:00"))
                hours_since_update = (datetime.utcnow() - updated.replace(tzinfo=None)).total_seconds() / 3600
                factors.recently_modified = hours_since_update < 24
            except:
                pass
        
        # Dry-run mode
        factors.dry_run = context.get("dry_run", False)
        
        return factors
    
    def _get_recommendation(self, level: ConfidenceLevel) -> str:
        """Get recommendation based on confidence level"""
        recommendations = {
            ConfidenceLevel.HIGH: "Execute automatically - high confidence in positive outcome",
            ConfidenceLevel.MEDIUM: "Queue for approval - review recommended before execution",
            ConfidenceLevel.LOW: "Notify only - manual intervention recommended",
        }
        return recommendations.get(level, "Unknown")
    
    def _get_reason(self, level: ConfidenceLevel, factors: Dict[str, int]) -> str:
        """Generate human-readable reason for the score"""
        negative_factors = [(k, v) for k, v in factors.items() if v < 0]
        positive_factors = [(k, v) for k, v in factors.items() if v > 0]
        
        parts = []
        
        if negative_factors:
            worst = min(negative_factors, key=lambda x: x[1])
            factor_names = {
                "pattern_match": "pattern matching",
                "success_rate": "historical success rate",
                "recent_recurrence": "recent issue recurrence",
                "critical_system": "critical system target",
                "rate_limit": "rate limiting",
                "off_hours": "off-hours execution",
                "recently_modified": "recently modified workflow",
            }
            parts.append(f"Main concern: {factor_names.get(worst[0], worst[0])}")
        
        if positive_factors:
            best = max(positive_factors, key=lambda x: x[1])
            parts.append(f"Positive: {best[0]}")
        
        return "; ".join(parts) if parts else f"Confidence level: {level.value}"


# ============================================================
# SINGLETON INSTANCE
# ============================================================

_scorer: Optional[ConfidenceScorer] = None


def get_confidence_scorer() -> ConfidenceScorer:
    """Get or create the confidence scorer instance"""
    global _scorer
    if _scorer is None:
        _scorer = ConfidenceScorer()
    return _scorer


def calculate_confidence(
    workflow: Dict[str, Any],
    issue: Dict[str, Any],
    context: Optional[Dict[str, Any]] = None
) -> ConfidenceResult:
    """Convenience function to calculate confidence score"""
    return get_confidence_scorer().calculate(workflow, issue, context)
