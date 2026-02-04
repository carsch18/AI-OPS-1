"""
Incident Type Configurations
Defines all incident types with severity, SLAs, escalation logic, and playbook mappings
"""

from enum import Enum
from typing import Dict, List, Optional
from dataclasses import dataclass

class IncidentType(str, Enum):
    """Enumeration of all supported incident types"""
    SITE_DOWNTIME = "site_downtime"
    HTTP_5XX_SPIKE = "http_5xx_spike"
    CDN_FAILURE = "cdn_failure"
    DDOS_ATTACK = "ddos_attack"
    PRODUCTION_EMERGENCY = "production_emergency"
    RESOURCE_SPIKE = "resource_spike"
    APP_ERROR_SPIKE = "app_error_spike"
    DB_LATENCY = "db_latency"
    PAGE_LOAD_SLOW = "page_load_slow"

class Severity(str, Enum):
    """Incident severity levels"""
    P0_CRITICAL = "P0 - Critical"      # Complete outage, immediate response
    P1_HIGH = "P1 - High"              # Major impact, urgent response
    P2_MEDIUM = "P2 - Medium"          # Moderate impact, scheduled response
    P3_LOW = "P3 - Low"                # Minor impact, queue for resolution

class IncidentStatus(str, Enum):
    """Incident lifecycle states"""
    DETECTED = "DETECTED"              # Just detected, not yet triaged
    OPEN = "OPEN"                      # Triaged and acknowledged
    INVESTIGATING = "INVESTIGATING"    # Root cause analysis in progress
    MITIGATING = "MITIGATING"         # Remediation in progress
    RESOLVED = "RESOLVED"              # Issue resolved, monitoring
    CLOSED = "CLOSED"                  # Incident closed with RCA

@dataclass
class EscalationRule:
    """Defines when and how to escalate an incident"""
    level: int                         # Escalation level (1, 2, 3)
    trigger_after_minutes: int         # Minutes after incident creation
    notify_roles: List[str]            # Roles to notify (e.g., ["oncall_engineer", "team_lead"])
    notify_channels: List[str]         # Notification channels (e.g., ["email", "slack", "pagerduty"])

@dataclass
class IncidentTypeConfig:
    """Complete configuration for an incident type"""
    incident_type: IncidentType
    name: str
    description: str
    default_severity: Severity
    response_sla_minutes: int          # Time to acknowledge/start response
    resolution_sla_minutes: int        # Time to resolve
    status_update_cadence_minutes: int # How often to send status updates
    escalation_rules: List[EscalationRule]
    playbook_name: str                 # Name of Ansible playbook to execute
    auto_trigger_playbook: bool        # Whether to automatically trigger playbook
    requires_human_approval: bool      # Whether playbook requires human approval
    detection_rules: Dict[str, any]    # Rules for auto-detection from alerts

# ============================================================================
# INCIDENT TYPE CONFIGURATIONS
# ============================================================================

INCIDENT_CONFIGS: Dict[IncidentType, IncidentTypeConfig] = {
    
    # 1. Site Downtime - Complete service unavailability
    IncidentType.SITE_DOWNTIME: IncidentTypeConfig(
        incident_type=IncidentType.SITE_DOWNTIME,
        name="Site Downtime",
        description="Complete website or service unavailability",
        default_severity=Severity.P0_CRITICAL,
        response_sla_minutes=5,
        resolution_sla_minutes=30,
        status_update_cadence_minutes=5,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=10, 
                          notify_roles=["oncall_engineer", "team_lead"],
                          notify_channels=["email", "slack", "pagerduty"]),
            EscalationRule(level=2, trigger_after_minutes=20,
                          notify_roles=["engineering_manager", "vp_engineering"],
                          notify_channels=["email", "slack", "pagerduty", "phone"])
        ],
        playbook_name="site_downtime.yml",
        auto_trigger_playbook=True,
        requires_human_approval=False,  # Auto-execute for critical downtime
        detection_rules={
            "alert_category": "availability",
            "metric_names": ["site_down", "service_down"],
            "severity": "critical"
        }
    ),
    
    # 2. HTTP 5xx Spike - Server error rate increase
    IncidentType.HTTP_5XX_SPIKE: IncidentTypeConfig(
        incident_type=IncidentType.HTTP_5XX_SPIKE,
        name="HTTP 5xx Error Spike",
        description="Elevated server error rate (5xx responses)",
        default_severity=Severity.P1_HIGH,
        response_sla_minutes=10,
        resolution_sla_minutes=60,
        status_update_cadence_minutes=15,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=20,
                          notify_roles=["oncall_engineer"],
                          notify_channels=["slack", "email"]),
            EscalationRule(level=2, trigger_after_minutes=45,
                          notify_roles=["team_lead", "oncall_engineer"],
                          notify_channels=["slack", "email", "pagerduty"])
        ],
        playbook_name="http_5xx_spike.yml",
        auto_trigger_playbook=True,
        requires_human_approval=True,  # Requires approval for restarts/rollbacks
        detection_rules={
            "alert_category": "performance",
            "metric_names": ["http_5xx_rate", "error_rate"],
            "severity": "critical"
        }
    ),
    
    # 3. CDN Failure - Cloudflare/CDN provider issues
    IncidentType.CDN_FAILURE: IncidentTypeConfig(
        incident_type=IncidentType.CDN_FAILURE,
        name="CDN/Cloudflare Failure",
        description="CDN provider degradation or failure",
        default_severity=Severity.P1_HIGH,
        response_sla_minutes=10,
        resolution_sla_minutes=30,
        status_update_cadence_minutes=10,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=15,
                          notify_roles=["oncall_engineer", "devops_lead"],
                          notify_channels=["slack", "email"])
        ],
        playbook_name="cdn_failure.yml",
        auto_trigger_playbook=True,
        requires_human_approval=False,
        detection_rules={
            "alert_category": "security",
            "metric_names": ["cdn_status"],
            "severity": "critical"
        }
    ),
    
    # 4. DDoS Attack - DDoS or brute force attempts
    IncidentType.DDOS_ATTACK: IncidentTypeConfig(
        incident_type=IncidentType.DDOS_ATTACK,
        name="DDoS/Brute Force Attack",
        description="DDoS attack or brute force login attempts detected",
        default_severity=Severity.P0_CRITICAL,
        response_sla_minutes=5,
        resolution_sla_minutes=20,
        status_update_cadence_minutes=5,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=10,
                          notify_roles=["security_oncall", "oncall_engineer"],
                          notify_channels=["slack", "pagerduty"]),
            EscalationRule(level=2, trigger_after_minutes=15,
                          notify_roles=["security_lead", "engineering_manager"],
                          notify_channels=["slack", "pagerduty", "phone"])
        ],
        playbook_name="ddos_mitigation.yml",
        auto_trigger_playbook=True,
        requires_human_approval=False,  # Auto-execute security mitigations
        detection_rules={
            "alert_category": "security",
            "metric_names": ["ddos_detected", "brute_force_attempts"],
            "severity": "critical"
        }
    ),
    
    # 5. Production Emergency - Critical production failures
    IncidentType.PRODUCTION_EMERGENCY: IncidentTypeConfig(
        incident_type=IncidentType.PRODUCTION_EMERGENCY,
        name="Production Emergency",
        description="Critical production failure requiring immediate attention",
        default_severity=Severity.P0_CRITICAL,
        response_sla_minutes=2,
        resolution_sla_minutes=30,
        status_update_cadence_minutes=5,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=5,
                          notify_roles=["oncall_engineer", "team_lead", "engineering_manager"],
                          notify_channels=["pagerduty", "phone", "slack"]),
            EscalationRule(level=2, trigger_after_minutes=10,
                          notify_roles=["vp_engineering", "cto"],
                          notify_channels=["pagerduty", "phone"])
        ],
        playbook_name="production_emergency.yml",
        auto_trigger_playbook=True,
        requires_human_approval=True,  # Critical incidents require human decision
        detection_rules={
            "alert_category": "incidents",
            "metric_names": ["service_down"],
            "severity": "critical"
        }
    ),
    
    # 6. Resource Spike - CPU/RAM/Disk spikes
    IncidentType.RESOURCE_SPIKE: IncidentTypeConfig(
        incident_type=IncidentType.RESOURCE_SPIKE,
        name="Resource Spike (CPU/RAM/Disk)",
        description="Abnormal resource consumption spike",
        default_severity=Severity.P2_MEDIUM,
        response_sla_minutes=15,
        resolution_sla_minutes=60,
        status_update_cadence_minutes=20,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=30,
                          notify_roles=["oncall_engineer"],
                          notify_channels=["slack"])
        ],
        playbook_name="resource_spike.yml",
        auto_trigger_playbook=True,
        requires_human_approval=True,  # Requires approval to kill processes
        detection_rules={
            "alert_category": "infrastructure",
            "metric_names": ["cpu_spike", "memory_spike", "disk_spike"],
            "severity": ["warning", "critical"]
        }
    ),
    
    # 7. Application Error Spike - Application error rate increase
    IncidentType.APP_ERROR_SPIKE: IncidentTypeConfig(
        incident_type=IncidentType.APP_ERROR_SPIKE,
        name="Application Error Spike",
        description="Elevated application error rate",
        default_severity=Severity.P2_MEDIUM,
        response_sla_minutes=15,
        resolution_sla_minutes=90,
        status_update_cadence_minutes=20,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=45,
                          notify_roles=["oncall_engineer", "backend_lead"],
                          notify_channels=["slack", "email"])
        ],
        playbook_name="app_error_spike.yml",
        auto_trigger_playbook=True,
        requires_human_approval=True,
        detection_rules={
            "alert_category": "application",
            "metric_names": ["error_spike", "exception_rate"],
            "severity": ["warning", "critical"]
        }
    ),
    
    # 8. Database Latency - Database query slowness
    IncidentType.DB_LATENCY: IncidentTypeConfig(
        incident_type=IncidentType.DB_LATENCY,
        name="Database Latency Issue",
        description="Database queries experiencing high latency",
        default_severity=Severity.P1_HIGH,
        response_sla_minutes=10,
        resolution_sla_minutes=45,
        status_update_cadence_minutes=15,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=20,
                          notify_roles=["oncall_engineer", "database_admin"],
                          notify_channels=["slack", "pagerduty"])
        ],
        playbook_name="db_latency.yml",
        auto_trigger_playbook=True,
        requires_human_approval=True,  # Requires approval to kill queries
        detection_rules={
            "alert_category": "database",
            "metric_names": ["db_latency", "query_slow"],
            "severity": ["warning", "critical"]
        }
    ),
    
    # 9. Page Load Slowness - Frontend performance degradation
    IncidentType.PAGE_LOAD_SLOW: IncidentTypeConfig(
        incident_type=IncidentType.PAGE_LOAD_SLOW,
        name="Page Load Slowness",
        description="Frontend page load times degraded",
        default_severity=Severity.P2_MEDIUM,
        response_sla_minutes=20,
        resolution_sla_minutes=120,
        status_update_cadence_minutes=30,
        escalation_rules=[
            EscalationRule(level=1, trigger_after_minutes=60,
                          notify_roles=["oncall_engineer", "frontend_lead"],
                          notify_channels=["slack"])
        ],
        playbook_name="page_load_slow.yml",
        auto_trigger_playbook=True,
        requires_human_approval=False,  # Safe operations like cache purge
        detection_rules={
            "alert_category": "performance",
            "metric_names": ["page_load_slow", "frontend_latency"],
            "severity": "warning"
        }
    )
}

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_incident_config(incident_type: IncidentType) -> IncidentTypeConfig:
    """Get configuration for an incident type"""
    return INCIDENT_CONFIGS.get(incident_type)

def detect_incident_type_from_alert(category: str, metric_name: str, severity: str) -> Optional[IncidentType]:
    """
    Auto-detect incident type from alert metadata
    Returns the most appropriate incident type or None
    """
    for inc_type, config in INCIDENT_CONFIGS.items():
        rules = config.detection_rules
        
        # Check category match
        if rules.get("alert_category") != category:
            continue
            
        # Check metric name match
        metric_names = rules.get("metric_names", [])
        if not any(mn in metric_name for mn in metric_names):
            continue
            
        # Check severity match
        rule_severity = rules.get("severity")
        if isinstance(rule_severity, list):
            if severity not in rule_severity:
                continue
        elif rule_severity and rule_severity != severity:
            continue
            
        # Match found
        return inc_type
    
    return None

def get_escalation_for_age(incident_type: IncidentType, age_minutes: int) -> Optional[EscalationRule]:
    """
    Get applicable escalation rule based on incident age
    Returns the highest escalation level that should be triggered
    """
    config = get_incident_config(incident_type)
    if not config:
        return None
    
    applicable_escalations = [
        rule for rule in config.escalation_rules
        if age_minutes >= rule.trigger_after_minutes
    ]
    
    if not applicable_escalations:
        return None
    
    # Return highest level escalation
    return max(applicable_escalations, key=lambda r: r.level)

def should_send_status_update(incident_type: IncidentType, minutes_since_last_update: int) -> bool:
    """Check if a status update should be sent based on cadence"""
    config = get_incident_config(incident_type)
    if not config:
        return False
    
    return minutes_since_last_update >= config.status_update_cadence_minutes
