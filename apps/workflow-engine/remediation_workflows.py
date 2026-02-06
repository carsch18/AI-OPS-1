"""
Remediation Workflows - Visual Workflow System for Auto-Remediation
====================================================================
Converts static remediation templates into fully editable visual workflows.
Part of Phase 5A: Data Model Unification
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from enum import Enum
from datetime import datetime
import uuid
import json


router = APIRouter(prefix="/api/remediation-workflows", tags=["Remediation Workflows"])


# =============================================================================
# NODE TYPE DEFINITIONS
# =============================================================================

class NodeCategory(str, Enum):
    TRIGGER = "trigger"
    ACTION = "action"
    LOGIC = "logic"
    NOTIFICATION = "notification"
    SAFETY = "safety"


class NodeTypeDefinition(BaseModel):
    """Schema for defining a node type"""
    type: str
    name: str
    description: str
    category: NodeCategory
    icon: str  # Lucide icon name
    color: str  # Hex color for node header
    config_schema: Dict[str, Any]  # JSON Schema for node configuration
    inputs: int = 1  # Number of input connections
    outputs: int = 1  # Number of output connections


# All available node types for remediation workflows
NODE_TYPE_REGISTRY: Dict[str, NodeTypeDefinition] = {
    # =========== TRIGGER NODES ===========
    "alert_trigger": NodeTypeDefinition(
        type="alert_trigger",
        name="Alert Trigger",
        description="Triggers workflow when a matching alert is detected",
        category=NodeCategory.TRIGGER,
        icon="bell-ring",
        color="#ef4444",
        config_schema={
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Alert pattern to match (supports wildcards)"},
                "severity": {"type": "array", "items": {"type": "string", "enum": ["critical", "high", "medium", "low"]}},
                "hosts": {"type": "array", "items": {"type": "string"}, "description": "Specific hosts to match"}
            },
            "required": ["pattern"]
        },
        inputs=0,
        outputs=1
    ),
    
    "schedule_trigger": NodeTypeDefinition(
        type="schedule_trigger",
        name="Schedule Trigger",
        description="Triggers workflow on a time-based schedule",
        category=NodeCategory.TRIGGER,
        icon="clock",
        color="#ef4444",
        config_schema={
            "type": "object",
            "properties": {
                "cron": {"type": "string", "description": "Cron expression (e.g., '0 * * * *' for hourly)"},
                "timezone": {"type": "string", "default": "UTC"}
            },
            "required": ["cron"]
        },
        inputs=0,
        outputs=1
    ),
    
    "webhook_trigger": NodeTypeDefinition(
        type="webhook_trigger",
        name="Webhook Trigger",
        description="Triggers workflow from external HTTP request",
        category=NodeCategory.TRIGGER,
        icon="webhook",
        color="#ef4444",
        config_schema={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Webhook path suffix"},
                "method": {"type": "string", "enum": ["POST", "PUT"], "default": "POST"},
                "auth_required": {"type": "boolean", "default": True}
            },
            "required": ["path"]
        },
        inputs=0,
        outputs=1
    ),
    
    "manual_trigger": NodeTypeDefinition(
        type="manual_trigger",
        name="Manual Trigger",
        description="Workflow is triggered manually by a user",
        category=NodeCategory.TRIGGER,
        icon="hand",
        color="#ef4444",
        config_schema={
            "type": "object",
            "properties": {
                "require_confirmation": {"type": "boolean", "default": True},
                "allowed_roles": {"type": "array", "items": {"type": "string"}}
            }
        },
        inputs=0,
        outputs=1
    ),
    
    # =========== ACTION NODES ===========
    "shell_command": NodeTypeDefinition(
        type="shell_command",
        name="Shell Command",
        description="Execute a shell/bash command on the target host",
        category=NodeCategory.ACTION,
        icon="terminal",
        color="#3b82f6",
        config_schema={
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Command to execute"},
                "working_dir": {"type": "string", "default": "/tmp"},
                "timeout_seconds": {"type": "integer", "default": 60, "minimum": 1, "maximum": 3600},
                "retry_count": {"type": "integer", "default": 0, "minimum": 0, "maximum": 5},
                "retry_delay_seconds": {"type": "integer", "default": 5},
                "continue_on_failure": {"type": "boolean", "default": False},
                "capture_output": {"type": "boolean", "default": True}
            },
            "required": ["command"]
        }
    ),
    
    "ansible_playbook": NodeTypeDefinition(
        type="ansible_playbook",
        name="Ansible Playbook",
        description="Execute an Ansible playbook for infrastructure automation",
        category=NodeCategory.ACTION,
        icon="cog",
        color="#3b82f6",
        config_schema={
            "type": "object",
            "properties": {
                "playbook": {"type": "string", "description": "Playbook file name or path"},
                "inventory": {"type": "string", "default": "hosts.yml"},
                "extra_vars": {"type": "object", "additionalProperties": True},
                "limit": {"type": "string", "description": "Limit to specific hosts"},
                "tags": {"type": "array", "items": {"type": "string"}},
                "check_mode": {"type": "boolean", "default": False, "description": "Dry run mode"}
            },
            "required": ["playbook"]
        }
    ),
    
    "docker_action": NodeTypeDefinition(
        type="docker_action",
        name="Docker Action",
        description="Perform Docker container operations",
        category=NodeCategory.ACTION,
        icon="box",
        color="#3b82f6",
        config_schema={
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["restart", "stop", "start", "kill", "remove", "scale"]},
                "container": {"type": "string", "description": "Container name or ID"},
                "scale_count": {"type": "integer", "description": "Number of replicas (for scale action)"},
                "force": {"type": "boolean", "default": False}
            },
            "required": ["action", "container"]
        }
    ),
    
    "kubernetes_action": NodeTypeDefinition(
        type="kubernetes_action",
        name="Kubernetes Action",
        description="Perform Kubernetes cluster operations",
        category=NodeCategory.ACTION,
        icon="cloud",
        color="#3b82f6",
        config_schema={
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["rollout_restart", "scale", "delete_pod", "apply", "patch"]},
                "resource_type": {"type": "string", "enum": ["deployment", "statefulset", "daemonset", "pod", "service"]},
                "resource_name": {"type": "string"},
                "namespace": {"type": "string", "default": "default"},
                "replicas": {"type": "integer", "description": "For scale action"},
                "manifest": {"type": "string", "description": "YAML manifest for apply action"}
            },
            "required": ["action", "resource_type", "resource_name"]
        }
    ),
    
    "api_request": NodeTypeDefinition(
        type="api_request",
        name="API Request",
        description="Make an HTTP API request",
        category=NodeCategory.ACTION,
        icon="globe",
        color="#3b82f6",
        config_schema={
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "API endpoint URL"},
                "method": {"type": "string", "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"], "default": "GET"},
                "headers": {"type": "object", "additionalProperties": {"type": "string"}},
                "body": {"type": "object", "additionalProperties": True},
                "timeout_seconds": {"type": "integer", "default": 30},
                "expected_status": {"type": "array", "items": {"type": "integer"}, "default": [200, 201, 204]}
            },
            "required": ["url"]
        }
    ),
    
    "database_query": NodeTypeDefinition(
        type="database_query",
        name="Database Query",
        description="Execute a database query",
        category=NodeCategory.ACTION,
        icon="database",
        color="#3b82f6",
        config_schema={
            "type": "object",
            "properties": {
                "connection": {"type": "string", "description": "Database connection name"},
                "query": {"type": "string", "description": "SQL query to execute"},
                "params": {"type": "object", "additionalProperties": True},
                "readonly": {"type": "boolean", "default": True, "description": "Only allow SELECT queries"}
            },
            "required": ["connection", "query"]
        }
    ),
    
    "service_action": NodeTypeDefinition(
        type="service_action",
        name="Service Action",
        description="Manage system services (systemd/init)",
        category=NodeCategory.ACTION,
        icon="server",
        color="#3b82f6",
        config_schema={
            "type": "object",
            "properties": {
                "action": {"type": "string", "enum": ["restart", "start", "stop", "reload", "status"]},
                "service_name": {"type": "string"},
                "host": {"type": "string", "description": "Target host (defaults to issue host)"}
            },
            "required": ["action", "service_name"]
        }
    ),
    
    # =========== LOGIC NODES ===========
    "metric_check": NodeTypeDefinition(
        type="metric_check",
        name="Metric Check",
        description="Check a system metric against a threshold",
        category=NodeCategory.LOGIC,
        icon="activity",
        color="#8b5cf6",
        config_schema={
            "type": "object",
            "properties": {
                "metric": {"type": "string", "description": "Metric name (e.g., system.cpu, system.ram)"},
                "operator": {"type": "string", "enum": [">", "<", ">=", "<=", "==", "!="], "default": ">"},
                "threshold": {"type": "number"},
                "duration_seconds": {"type": "integer", "default": 0, "description": "Must be true for this duration"}
            },
            "required": ["metric", "operator", "threshold"]
        },
        outputs=2  # True path, False path
    ),
    
    "condition": NodeTypeDefinition(
        type="condition",
        name="Condition",
        description="Branch workflow based on a condition",
        category=NodeCategory.LOGIC,
        icon="git-branch",
        color="#8b5cf6",
        config_schema={
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "JavaScript expression to evaluate"},
                "true_label": {"type": "string", "default": "Yes"},
                "false_label": {"type": "string", "default": "No"}
            },
            "required": ["expression"]
        },
        outputs=2
    ),
    
    "delay": NodeTypeDefinition(
        type="delay",
        name="Delay",
        description="Wait for a specified duration before continuing",
        category=NodeCategory.LOGIC,
        icon="timer",
        color="#8b5cf6",
        config_schema={
            "type": "object",
            "properties": {
                "duration_seconds": {"type": "integer", "minimum": 1, "maximum": 86400},
                "reason": {"type": "string", "description": "Why are we waiting?"}
            },
            "required": ["duration_seconds"]
        }
    ),
    
    "loop": NodeTypeDefinition(
        type="loop",
        name="Loop",
        description="Repeat a set of actions",
        category=NodeCategory.LOGIC,
        icon="repeat",
        color="#8b5cf6",
        config_schema={
            "type": "object",
            "properties": {
                "max_iterations": {"type": "integer", "default": 10, "minimum": 1, "maximum": 100},
                "until_condition": {"type": "string", "description": "Stop when this condition is true"},
                "delay_between_seconds": {"type": "integer", "default": 1}
            }
        },
        outputs=2  # Loop body, Exit
    ),
    
    "parallel": NodeTypeDefinition(
        type="parallel",
        name="Parallel",
        description="Execute multiple branches simultaneously",
        category=NodeCategory.LOGIC,
        icon="git-merge",
        color="#8b5cf6",
        config_schema={
            "type": "object",
            "properties": {
                "branches": {"type": "integer", "default": 2, "minimum": 2, "maximum": 5},
                "wait_for_all": {"type": "boolean", "default": True, "description": "Wait for all branches to complete"}
            }
        },
        outputs=3  # Multiple parallel outputs
    ),
    
    # =========== NOTIFICATION NODES ===========
    "slack_notify": NodeTypeDefinition(
        type="slack_notify",
        name="Slack Notification",
        description="Send a notification to Slack",
        category=NodeCategory.NOTIFICATION,
        icon="message-square",
        color="#10b981",
        config_schema={
            "type": "object",
            "properties": {
                "channel": {"type": "string", "description": "Slack channel (e.g., #ops)"},
                "message": {"type": "string", "description": "Message template (supports variables)"},
                "mention_users": {"type": "array", "items": {"type": "string"}},
                "include_details": {"type": "boolean", "default": True}
            },
            "required": ["channel", "message"]
        }
    ),
    
    "email_notify": NodeTypeDefinition(
        type="email_notify",
        name="Email Notification",
        description="Send an email notification",
        category=NodeCategory.NOTIFICATION,
        icon="mail",
        color="#10b981",
        config_schema={
            "type": "object",
            "properties": {
                "to": {"type": "array", "items": {"type": "string"}, "description": "Recipient emails"},
                "subject": {"type": "string"},
                "body": {"type": "string", "description": "Email body (HTML supported)"},
                "priority": {"type": "string", "enum": ["high", "normal", "low"], "default": "normal"}
            },
            "required": ["to", "subject", "body"]
        }
    ),
    
    "pagerduty_alert": NodeTypeDefinition(
        type="pagerduty_alert",
        name="PagerDuty Alert",
        description="Trigger a PagerDuty incident",
        category=NodeCategory.NOTIFICATION,
        icon="phone",
        color="#10b981",
        config_schema={
            "type": "object",
            "properties": {
                "service_key": {"type": "string", "description": "PagerDuty service integration key"},
                "severity": {"type": "string", "enum": ["critical", "error", "warning", "info"]},
                "summary": {"type": "string"},
                "details": {"type": "object", "additionalProperties": True}
            },
            "required": ["service_key", "severity", "summary"]
        }
    ),
    
    "webhook_output": NodeTypeDefinition(
        type="webhook_output",
        name="Webhook Output",
        description="Send workflow results to an external webhook",
        category=NodeCategory.NOTIFICATION,
        icon="send",
        color="#10b981",
        config_schema={
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "method": {"type": "string", "enum": ["POST", "PUT"], "default": "POST"},
                "headers": {"type": "object", "additionalProperties": {"type": "string"}},
                "include_context": {"type": "boolean", "default": True}
            },
            "required": ["url"]
        }
    ),
    
    "log_entry": NodeTypeDefinition(
        type="log_entry",
        name="Log Entry",
        description="Write an entry to the audit log",
        category=NodeCategory.NOTIFICATION,
        icon="file-text",
        color="#10b981",
        config_schema={
            "type": "object",
            "properties": {
                "message": {"type": "string"},
                "level": {"type": "string", "enum": ["debug", "info", "warning", "error"], "default": "info"},
                "tags": {"type": "array", "items": {"type": "string"}}
            },
            "required": ["message"]
        }
    ),
    
    # =========== SAFETY NODES ===========
    "human_approval": NodeTypeDefinition(
        type="human_approval",
        name="Human Approval",
        description="Pause workflow and wait for human approval",
        category=NodeCategory.SAFETY,
        icon="user-check",
        color="#f59e0b",
        config_schema={
            "type": "object",
            "properties": {
                "approvers": {"type": "array", "items": {"type": "string"}, "description": "User IDs who can approve"},
                "timeout_minutes": {"type": "integer", "default": 60},
                "timeout_action": {"type": "string", "enum": ["approve", "reject", "escalate"], "default": "reject"},
                "message": {"type": "string", "description": "Message shown to approver"},
                "require_comment": {"type": "boolean", "default": False}
            }
        },
        outputs=2  # Approved, Rejected
    ),
    
    "rollback_checkpoint": NodeTypeDefinition(
        type="rollback_checkpoint",
        name="Rollback Checkpoint",
        description="Save current state for potential rollback",
        category=NodeCategory.SAFETY,
        icon="history",
        color="#f59e0b",
        config_schema={
            "type": "object",
            "properties": {
                "checkpoint_name": {"type": "string"},
                "capture_state": {"type": "array", "items": {"type": "string"}, "description": "What to capture"},
                "auto_rollback_on_failure": {"type": "boolean", "default": True}
            },
            "required": ["checkpoint_name"]
        }
    ),
    
    "confidence_gate": NodeTypeDefinition(
        type="confidence_gate",
        name="Confidence Gate",
        description="Only proceed if confidence score meets threshold",
        category=NodeCategory.SAFETY,
        icon="shield-check",
        color="#f59e0b",
        config_schema={
            "type": "object",
            "properties": {
                "min_confidence": {"type": "integer", "minimum": 0, "maximum": 100, "default": 80},
                "low_confidence_action": {"type": "string", "enum": ["require_approval", "abort", "notify"], "default": "require_approval"}
            }
        },
        outputs=2  # Passed, Failed
    )
}


# =============================================================================
# WORKFLOW DATA MODELS
# =============================================================================

class WorkflowNode(BaseModel):
    """A single node in a remediation workflow"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    type: str  # Must match a key in NODE_TYPE_REGISTRY
    position: Dict[str, float] = Field(default_factory=lambda: {"x": 0, "y": 0})
    data: Dict[str, Any] = Field(default_factory=dict)  # Node configuration
    

class WorkflowEdge(BaseModel):
    """A connection between two nodes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    source: str  # Source node ID
    target: str  # Target node ID
    source_handle: Optional[str] = None  # For nodes with multiple outputs
    target_handle: Optional[str] = None
    label: Optional[str] = None


class RemediationWorkflowMetadata(BaseModel):
    """Metadata specific to remediation workflows"""
    category: str = "general"  # compute, storage, network, security, database, application
    severity_match: List[str] = Field(default_factory=lambda: ["critical", "high", "medium"])
    auto_trigger_enabled: bool = False
    confidence_threshold: int = 80
    estimated_duration_seconds: int = 60
    success_rate: float = 0.0
    execution_count: int = 0
    last_executed: Optional[datetime] = None


class RemediationWorkflow(BaseModel):
    """Complete remediation workflow definition"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    workflow_type: Literal["custom", "remediation", "system_template"] = "remediation"
    is_system_template: bool = False  # True for built-in templates that can't be deleted
    version: str = "1.0.0"
    
    # Workflow structure
    nodes: List[WorkflowNode] = Field(default_factory=list)
    edges: List[WorkflowEdge] = Field(default_factory=list)
    
    # Remediation-specific metadata
    metadata: RemediationWorkflowMetadata = Field(default_factory=RemediationWorkflowMetadata)
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = "system"


# =============================================================================
# PRE-BUILT REMEDIATION WORKFLOW TEMPLATES
# =============================================================================

def create_system_templates() -> List[RemediationWorkflow]:
    """Generate all system remediation workflow templates"""
    templates = []
    
    # =========================================================================
    # 1. MEMORY CLEANUP WORKFLOW
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_memory_cleanup",
        name="Memory Cleanup",
        description="Comprehensive memory cleanup when system memory exceeds threshold. Kills zombie processes, clears caches, and verifies recovery.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="compute",
            severity_match=["critical", "high"],
            auto_trigger_enabled=True,
            confidence_threshold=85,
            estimated_duration_seconds=45,
            success_rate=95.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "High Memory*", "severity": ["critical", "high"]}),
            WorkflowNode(id="check_mem", type="metric_check", position={"x": 250, "y": 100}, data={"metric": "system.ram", "operator": ">", "threshold": 85}),
            WorkflowNode(id="kill_zombies", type="shell_command", position={"x": 250, "y": 200}, data={"command": "ps aux | grep -E '^.*Z' | awk '{print $2}' | xargs -r kill -9 2>/dev/null || true", "timeout_seconds": 30}),
            WorkflowNode(id="clear_cache", type="shell_command", position={"x": 250, "y": 300}, data={"command": "sync && echo 3 > /proc/sys/vm/drop_caches", "timeout_seconds": 30}),
            WorkflowNode(id="verify", type="metric_check", position={"x": 250, "y": 400}, data={"metric": "system.ram", "operator": "<", "threshold": 75}),
            WorkflowNode(id="notify_success", type="slack_notify", position={"x": 100, "y": 500}, data={"channel": "#ops", "message": "Memory cleanup completed successfully. RAM usage now at {{metrics.ram}}%"}),
            WorkflowNode(id="notify_failure", type="slack_notify", position={"x": 400, "y": 500}, data={"channel": "#ops", "message": "Memory cleanup FAILED. Manual intervention required. Host: {{issue.host}}"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="check_mem"),
            WorkflowEdge(source="check_mem", target="kill_zombies", source_handle="true"),
            WorkflowEdge(source="kill_zombies", target="clear_cache"),
            WorkflowEdge(source="clear_cache", target="verify"),
            WorkflowEdge(source="verify", target="notify_success", source_handle="true", label="Recovered"),
            WorkflowEdge(source="verify", target="notify_failure", source_handle="false", label="Still High"),
        ]
    ))
    
    # =========================================================================
    # 2. CPU SPIKE MITIGATION
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_cpu_spike",
        name="CPU Spike Mitigation",
        description="Handles CPU spikes by identifying and managing runaway processes.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="compute",
            severity_match=["critical", "high"],
            auto_trigger_enabled=True,
            confidence_threshold=80,
            estimated_duration_seconds=60,
            success_rate=92.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "High CPU*", "severity": ["critical", "high"]}),
            WorkflowNode(id="identify_process", type="shell_command", position={"x": 250, "y": 100}, data={"command": "ps aux --sort=-%cpu | head -5", "capture_output": True}),
            WorkflowNode(id="approval", type="human_approval", position={"x": 250, "y": 200}, data={"message": "High CPU detected. Top processes identified. Approve to kill top consumer?", "timeout_minutes": 5, "timeout_action": "reject"}),
            WorkflowNode(id="kill_top", type="shell_command", position={"x": 100, "y": 300}, data={"command": "kill -9 $(ps aux --sort=-%cpu | awk 'NR==2 {print $2}')", "continue_on_failure": True}),
            WorkflowNode(id="verify", type="metric_check", position={"x": 100, "y": 400}, data={"metric": "system.cpu", "operator": "<", "threshold": 80}),
            WorkflowNode(id="notify", type="slack_notify", position={"x": 250, "y": 500}, data={"channel": "#ops", "message": "CPU spike mitigated on {{issue.host}}. Current CPU: {{metrics.cpu}}%"}),
            WorkflowNode(id="log_rejection", type="log_entry", position={"x": 400, "y": 300}, data={"message": "CPU mitigation rejected by operator", "level": "warning"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="identify_process"),
            WorkflowEdge(source="identify_process", target="approval"),
            WorkflowEdge(source="approval", target="kill_top", source_handle="approved"),
            WorkflowEdge(source="approval", target="log_rejection", source_handle="rejected"),
            WorkflowEdge(source="kill_top", target="verify"),
            WorkflowEdge(source="verify", target="notify"),
            WorkflowEdge(source="log_rejection", target="notify"),
        ]
    ))
    
    # =========================================================================
    # 3. DISK SPACE CLEANUP
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_disk_cleanup",
        name="Disk Space Cleanup",
        description="Frees disk space by removing old logs, temp files, and docker artifacts.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="storage",
            severity_match=["critical", "high", "medium"],
            auto_trigger_enabled=True,
            confidence_threshold=90,
            estimated_duration_seconds=120,
            success_rate=98.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "Disk Space*", "severity": ["critical", "high"]}),
            WorkflowNode(id="check_disk", type="shell_command", position={"x": 250, "y": 80}, data={"command": "df -h / | tail -1 | awk '{print $5}'", "capture_output": True}),
            WorkflowNode(id="clean_logs", type="shell_command", position={"x": 250, "y": 160}, data={"command": "find /var/log -type f -name '*.log' -mtime +7 -delete 2>/dev/null || true", "timeout_seconds": 60}),
            WorkflowNode(id="clean_tmp", type="shell_command", position={"x": 250, "y": 240}, data={"command": "find /tmp -type f -atime +3 -delete 2>/dev/null || true", "timeout_seconds": 60}),
            WorkflowNode(id="clean_docker", type="docker_action", position={"x": 250, "y": 320}, data={"action": "remove", "container": "__dangling_images__"}),
            WorkflowNode(id="verify", type="shell_command", position={"x": 250, "y": 400}, data={"command": "df -h / | tail -1 | awk '{print $5}'", "capture_output": True}),
            WorkflowNode(id="notify", type="slack_notify", position={"x": 250, "y": 480}, data={"channel": "#ops", "message": "Disk cleanup completed on {{issue.host}}. Space freed."}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="check_disk"),
            WorkflowEdge(source="check_disk", target="clean_logs"),
            WorkflowEdge(source="clean_logs", target="clean_tmp"),
            WorkflowEdge(source="clean_tmp", target="clean_docker"),
            WorkflowEdge(source="clean_docker", target="verify"),
            WorkflowEdge(source="verify", target="notify"),
        ]
    ))
    
    # =========================================================================
    # 4. SERVICE RESTART
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_service_restart",
        name="Service Restart",
        description="Gracefully restarts a crashed or unresponsive service.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="application",
            severity_match=["critical", "high"],
            auto_trigger_enabled=False,
            confidence_threshold=75,
            estimated_duration_seconds=30,
            success_rate=90.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "Service Down*"}),
            WorkflowNode(id="checkpoint", type="rollback_checkpoint", position={"x": 250, "y": 80}, data={"checkpoint_name": "pre_restart", "capture_state": ["service_config"]}),
            WorkflowNode(id="restart", type="service_action", position={"x": 250, "y": 160}, data={"action": "restart", "service_name": "{{issue.service}}"}),
            WorkflowNode(id="wait", type="delay", position={"x": 250, "y": 240}, data={"duration_seconds": 10, "reason": "Wait for service to stabilize"}),
            WorkflowNode(id="health_check", type="api_request", position={"x": 250, "y": 320}, data={"url": "http://localhost:{{issue.port}}/health", "method": "GET", "timeout_seconds": 10}),
            WorkflowNode(id="notify", type="slack_notify", position={"x": 250, "y": 400}, data={"channel": "#ops", "message": "Service {{issue.service}} restarted successfully on {{issue.host}}"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="checkpoint"),
            WorkflowEdge(source="checkpoint", target="restart"),
            WorkflowEdge(source="restart", target="wait"),
            WorkflowEdge(source="wait", target="health_check"),
            WorkflowEdge(source="health_check", target="notify"),
        ]
    ))
    
    # =========================================================================
    # 5. CONTAINER RESTART
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_container_restart",
        name="Container Restart",
        description="Restarts a Docker container that has crashed or become unresponsive.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="application",
            severity_match=["critical", "high"],
            auto_trigger_enabled=True,
            confidence_threshold=85,
            estimated_duration_seconds=45,
            success_rate=94.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "Container*Down*"}),
            WorkflowNode(id="inspect", type="shell_command", position={"x": 250, "y": 80}, data={"command": "docker inspect {{issue.container}} --format '{{.State.Status}}'", "capture_output": True}),
            WorkflowNode(id="restart", type="docker_action", position={"x": 250, "y": 160}, data={"action": "restart", "container": "{{issue.container}}"}),
            WorkflowNode(id="wait", type="delay", position={"x": 250, "y": 240}, data={"duration_seconds": 15, "reason": "Wait for container to be ready"}),
            WorkflowNode(id="verify", type="shell_command", position={"x": 250, "y": 320}, data={"command": "docker inspect {{issue.container}} --format '{{.State.Running}}'", "capture_output": True}),
            WorkflowNode(id="notify", type="slack_notify", position={"x": 250, "y": 400}, data={"channel": "#ops", "message": "Container {{issue.container}} restarted and running on {{issue.host}}"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="inspect"),
            WorkflowEdge(source="inspect", target="restart"),
            WorkflowEdge(source="restart", target="wait"),
            WorkflowEdge(source="wait", target="verify"),
            WorkflowEdge(source="verify", target="notify"),
        ]
    ))
    
    # =========================================================================
    # 6. DATABASE CONNECTION POOL RESET
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_db_pool_reset",
        name="Database Pool Reset",
        description="Resets database connection pools when connections are exhausted.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="database",
            severity_match=["critical", "high"],
            auto_trigger_enabled=False,
            confidence_threshold=70,
            estimated_duration_seconds=20,
            success_rate=88.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "*Connection Pool*Exhausted*"}),
            WorkflowNode(id="approval", type="human_approval", position={"x": 250, "y": 80}, data={"message": "Database connection pool exhausted. Approve to kill idle connections?", "timeout_minutes": 10}),
            WorkflowNode(id="kill_idle", type="database_query", position={"x": 100, "y": 180}, data={"connection": "default", "query": "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND query_start < NOW() - INTERVAL '10 minutes'"}),
            WorkflowNode(id="verify", type="database_query", position={"x": 100, "y": 280}, data={"connection": "default", "query": "SELECT count(*) FROM pg_stat_activity", "readonly": True}),
            WorkflowNode(id="notify", type="slack_notify", position={"x": 250, "y": 380}, data={"channel": "#ops", "message": "Database connection pool reset completed. Active connections: {{result}}"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="approval"),
            WorkflowEdge(source="approval", target="kill_idle", source_handle="approved"),
            WorkflowEdge(source="kill_idle", target="verify"),
            WorkflowEdge(source="verify", target="notify"),
            WorkflowEdge(source="approval", target="notify", source_handle="rejected"),
        ]
    ))
    
    # =========================================================================
    # 7. NETWORK CONNECTIVITY FIX
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_network_fix",
        name="Network Connectivity Fix",
        description="Diagnoses and attempts to fix network connectivity issues.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="network",
            severity_match=["critical"],
            auto_trigger_enabled=False,
            confidence_threshold=60,
            estimated_duration_seconds=90,
            success_rate=75.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "Network*Unreachable*"}),
            WorkflowNode(id="ping_test", type="shell_command", position={"x": 250, "y": 80}, data={"command": "ping -c 3 8.8.8.8", "timeout_seconds": 15, "continue_on_failure": True}),
            WorkflowNode(id="dns_test", type="shell_command", position={"x": 250, "y": 160}, data={"command": "nslookup google.com", "timeout_seconds": 10, "continue_on_failure": True}),
            WorkflowNode(id="restart_network", type="service_action", position={"x": 250, "y": 240}, data={"action": "restart", "service_name": "networking"}),
            WorkflowNode(id="wait", type="delay", position={"x": 250, "y": 320}, data={"duration_seconds": 10}),
            WorkflowNode(id="verify", type="shell_command", position={"x": 250, "y": 400}, data={"command": "ping -c 1 8.8.8.8", "timeout_seconds": 10}),
            WorkflowNode(id="notify", type="slack_notify", position={"x": 250, "y": 480}, data={"channel": "#ops", "message": "Network connectivity restored on {{issue.host}}"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="ping_test"),
            WorkflowEdge(source="ping_test", target="dns_test"),
            WorkflowEdge(source="dns_test", target="restart_network"),
            WorkflowEdge(source="restart_network", target="wait"),
            WorkflowEdge(source="wait", target="verify"),
            WorkflowEdge(source="verify", target="notify"),
        ]
    ))
    
    # =========================================================================
    # 8. SSL CERTIFICATE RENEWAL
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_ssl_renewal",
        name="SSL Certificate Renewal",
        description="Automatically renews SSL certificates using certbot.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="security",
            severity_match=["high", "medium"],
            auto_trigger_enabled=True,
            confidence_threshold=95,
            estimated_duration_seconds=180,
            success_rate=97.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "SSL*Expir*"}),
            WorkflowNode(id="backup_cert", type="shell_command", position={"x": 250, "y": 80}, data={"command": "cp -r /etc/letsencrypt /etc/letsencrypt.backup.$(date +%Y%m%d)"}),
            WorkflowNode(id="renew", type="shell_command", position={"x": 250, "y": 160}, data={"command": "certbot renew --non-interactive", "timeout_seconds": 300}),
            WorkflowNode(id="reload_nginx", type="service_action", position={"x": 250, "y": 240}, data={"action": "reload", "service_name": "nginx"}),
            WorkflowNode(id="verify", type="shell_command", position={"x": 250, "y": 320}, data={"command": "openssl s_client -connect localhost:443 -servername $(hostname) < /dev/null 2>/dev/null | openssl x509 -noout -dates", "capture_output": True}),
            WorkflowNode(id="notify", type="email_notify", position={"x": 250, "y": 400}, data={"to": ["security@company.com"], "subject": "SSL Certificate Renewed", "body": "SSL certificate has been automatically renewed on {{issue.host}}"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="backup_cert"),
            WorkflowEdge(source="backup_cert", target="renew"),
            WorkflowEdge(source="renew", target="reload_nginx"),
            WorkflowEdge(source="reload_nginx", target="verify"),
            WorkflowEdge(source="verify", target="notify"),
        ]
    ))
    
    # =========================================================================
    # 9. KUBERNETES POD RESTART
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_k8s_pod_restart",
        name="Kubernetes Pod Restart",
        description="Restarts a failing Kubernetes pod by triggering a rollout restart.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="application",
            severity_match=["critical", "high"],
            auto_trigger_enabled=True,
            confidence_threshold=80,
            estimated_duration_seconds=120,
            success_rate=91.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "*Pod*CrashLoop*"}),
            WorkflowNode(id="get_logs", type="shell_command", position={"x": 250, "y": 80}, data={"command": "kubectl logs {{issue.pod}} -n {{issue.namespace}} --tail=50", "capture_output": True}),
            WorkflowNode(id="rollout", type="kubernetes_action", position={"x": 250, "y": 160}, data={"action": "rollout_restart", "resource_type": "deployment", "resource_name": "{{issue.deployment}}", "namespace": "{{issue.namespace}}"}),
            WorkflowNode(id="wait", type="delay", position={"x": 250, "y": 240}, data={"duration_seconds": 60, "reason": "Wait for rollout to complete"}),
            WorkflowNode(id="verify", type="shell_command", position={"x": 250, "y": 320}, data={"command": "kubectl get pods -n {{issue.namespace}} -l app={{issue.app}} -o jsonpath='{.items[0].status.phase}'"}),
            WorkflowNode(id="notify", type="slack_notify", position={"x": 250, "y": 400}, data={"channel": "#k8s-ops", "message": "Pod {{issue.pod}} in namespace {{issue.namespace}} has been restarted. Status: {{result}}"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="get_logs"),
            WorkflowEdge(source="get_logs", target="rollout"),
            WorkflowEdge(source="rollout", target="wait"),
            WorkflowEdge(source="wait", target="verify"),
            WorkflowEdge(source="verify", target="notify"),
        ]
    ))
    
    # =========================================================================
    # 10. LOG ROTATION
    # =========================================================================
    templates.append(RemediationWorkflow(
        id="wf_log_rotation",
        name="Emergency Log Rotation",
        description="Emergency log rotation when log files grow too large.",
        workflow_type="system_template",
        is_system_template=True,
        metadata=RemediationWorkflowMetadata(
            category="storage",
            severity_match=["high", "medium"],
            auto_trigger_enabled=True,
            confidence_threshold=95,
            estimated_duration_seconds=30,
            success_rate=99.0
        ),
        nodes=[
            WorkflowNode(id="trigger", type="alert_trigger", position={"x": 250, "y": 0}, data={"pattern": "Log File*Large*"}),
            WorkflowNode(id="rotate", type="shell_command", position={"x": 250, "y": 100}, data={"command": "logrotate -f /etc/logrotate.conf", "timeout_seconds": 60}),
            WorkflowNode(id="compress", type="shell_command", position={"x": 250, "y": 200}, data={"command": "gzip /var/log/*.1 2>/dev/null || true", "timeout_seconds": 120}),
            WorkflowNode(id="notify", type="log_entry", position={"x": 250, "y": 300}, data={"message": "Emergency log rotation completed on {{issue.host}}", "level": "info"}),
        ],
        edges=[
            WorkflowEdge(source="trigger", target="rotate"),
            WorkflowEdge(source="rotate", target="compress"),
            WorkflowEdge(source="compress", target="notify"),
        ]
    ))
    
    return templates


# In-memory storage for workflows (will be replaced with database later)
_workflows_db: Dict[str, RemediationWorkflow] = {}


def initialize_templates():
    """Initialize the system templates"""
    global _workflows_db
    templates = create_system_templates()
    for template in templates:
        _workflows_db[template.id] = template
    print(f"Initialized {len(templates)} system remediation workflow templates")


# Initialize on module load
initialize_templates()


# =============================================================================
# API ENDPOINTS
# =============================================================================

@router.get("/nodes")
async def get_node_types():
    """Get all available node types for remediation workflows"""
    return {
        "node_types": [node.dict() for node in NODE_TYPE_REGISTRY.values()],
        "categories": [cat.value for cat in NodeCategory]
    }


@router.get("/nodes/{node_type}")
async def get_node_schema(node_type: str):
    """Get the configuration schema for a specific node type"""
    if node_type not in NODE_TYPE_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Node type '{node_type}' not found")
    return NODE_TYPE_REGISTRY[node_type].dict()


@router.get("")
async def list_workflows(
    workflow_type: Optional[str] = None,
    category: Optional[str] = None,
    include_system: bool = True
):
    """List all remediation workflows"""
    workflows = list(_workflows_db.values())
    
    if workflow_type:
        workflows = [w for w in workflows if w.workflow_type == workflow_type]
    
    if category:
        workflows = [w for w in workflows if w.metadata.category == category]
    
    if not include_system:
        workflows = [w for w in workflows if not w.is_system_template]
    
    return {
        "workflows": [w.dict() for w in workflows],
        "total": len(workflows)
    }


@router.get("/{workflow_id}")
async def get_workflow(workflow_id: str):
    """Get a single workflow by ID"""
    if workflow_id not in _workflows_db:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    return _workflows_db[workflow_id].dict()


@router.post("")
async def create_workflow(workflow: RemediationWorkflow):
    """Create a new remediation workflow"""
    if workflow.id in _workflows_db:
        raise HTTPException(status_code=400, detail=f"Workflow '{workflow.id}' already exists")
    
    workflow.is_system_template = False  # Users can't create system templates
    workflow.workflow_type = "custom"
    workflow.created_at = datetime.utcnow()
    workflow.updated_at = datetime.utcnow()
    
    _workflows_db[workflow.id] = workflow
    return workflow.dict()


@router.put("/{workflow_id}")
async def update_workflow(workflow_id: str, workflow: RemediationWorkflow):
    """Update an existing workflow"""
    if workflow_id not in _workflows_db:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    
    existing = _workflows_db[workflow_id]
    if existing.is_system_template:
        raise HTTPException(status_code=403, detail="Cannot modify system templates. Clone it first.")
    
    workflow.id = workflow_id
    workflow.updated_at = datetime.utcnow()
    _workflows_db[workflow_id] = workflow
    return workflow.dict()


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a workflow"""
    if workflow_id not in _workflows_db:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    
    if _workflows_db[workflow_id].is_system_template:
        raise HTTPException(status_code=403, detail="Cannot delete system templates")
    
    del _workflows_db[workflow_id]
    return {"message": "Workflow deleted", "id": workflow_id}


@router.post("/{workflow_id}/clone")
async def clone_workflow(workflow_id: str, new_name: Optional[str] = None):
    """Clone a workflow (typically to customize a system template)"""
    if workflow_id not in _workflows_db:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    
    original = _workflows_db[workflow_id]
    
    # Create a deep copy
    cloned = RemediationWorkflow(
        id=str(uuid.uuid4()),
        name=new_name or f"{original.name} (Copy)",
        description=original.description,
        workflow_type="custom",
        is_system_template=False,
        version="1.0.0",
        nodes=[WorkflowNode(**n.dict()) for n in original.nodes],
        edges=[WorkflowEdge(**e.dict()) for e in original.edges],
        metadata=RemediationWorkflowMetadata(**original.metadata.dict()),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        created_by="user"
    )
    
    # Reset execution stats
    cloned.metadata.execution_count = 0
    cloned.metadata.last_executed = None
    cloned.metadata.success_rate = 0.0
    
    _workflows_db[cloned.id] = cloned
    return cloned.dict()


@router.get("/categories/summary")
async def get_category_summary():
    """Get summary of workflows by category"""
    summary = {}
    for workflow in _workflows_db.values():
        cat = workflow.metadata.category
        if cat not in summary:
            summary[cat] = {"total": 0, "system": 0, "custom": 0}
        summary[cat]["total"] += 1
        if workflow.is_system_template:
            summary[cat]["system"] += 1
        else:
            summary[cat]["custom"] += 1
    return summary


# =============================================================================
# WORKFLOW EXECUTION ENDPOINTS - Phase 5C
# =============================================================================

from remediation_executor import workflow_executor, execution_history
from pydantic import BaseModel as PydanticBaseModel
import asyncio


class ExecuteWorkflowRequest(PydanticBaseModel):
    trigger_data: Optional[Dict[str, Any]] = None
    dry_run: bool = False


@router.post("/{workflow_id}/execute")
async def execute_workflow(workflow_id: str, request: ExecuteWorkflowRequest = None):
    """Execute a remediation workflow"""
    if workflow_id not in _workflows_db:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    
    workflow = _workflows_db[workflow_id]
    
    # Convert to dict for executor
    workflow_dict = workflow.dict()
    
    # Trigger data from request
    trigger_data = request.trigger_data if request else None
    
    # Update execution stats
    workflow.metadata.execution_count += 1
    workflow.metadata.last_executed = datetime.utcnow()
    
    # Execute the workflow
    context = await workflow_executor.execute_workflow(workflow_dict, trigger_data)
    
    # Update success rate
    total_executions = workflow.metadata.execution_count
    if context.status.value == "completed":
        # Weighted success rate
        current_rate = workflow.metadata.success_rate
        workflow.metadata.success_rate = (current_rate * (total_executions - 1) + 100) / total_executions
    else:
        current_rate = workflow.metadata.success_rate
        workflow.metadata.success_rate = (current_rate * (total_executions - 1)) / total_executions
    
    return {
        "execution_id": context.execution_id,
        "workflow_id": workflow_id,
        "workflow_name": workflow.name,
        "status": context.status.value,
        "started_at": context.started_at.isoformat(),
        "completed_at": context.completed_at.isoformat() if context.completed_at else None,
        "duration_ms": int((context.completed_at - context.started_at).total_seconds() * 1000) if context.completed_at else None,
        "node_results": {
            k: {
                "status": v.status.value,
                "output": v.output[:500] if v.output else "",
                "error": v.error[:200] if v.error else "",
                "duration_ms": v.duration_ms
            }
            for k, v in context.node_results.items()
        },
        "error": context.error
    }


@router.post("/{workflow_id}/execute-async")
async def execute_workflow_async(workflow_id: str, request: ExecuteWorkflowRequest = None):
    """Start workflow execution in background and return immediately"""
    if workflow_id not in _workflows_db:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found")
    
    workflow = _workflows_db[workflow_id]
    workflow_dict = workflow.dict()
    trigger_data = request.trigger_data if request else None
    
    # Update execution stats
    workflow.metadata.execution_count += 1
    workflow.metadata.last_executed = datetime.utcnow()
    
    # Start execution in background
    import uuid
    execution_id = str(uuid.uuid4())[:8]
    
    async def run_in_background():
        await workflow_executor.execute_workflow(workflow_dict, trigger_data)
    
    asyncio.create_task(run_in_background())
    
    return {
        "execution_id": execution_id,
        "workflow_id": workflow_id,
        "status": "started",
        "message": "Workflow execution started in background. Use /executions/{execution_id} to track progress."
    }


@router.get("/executions/list")
async def list_executions(limit: int = 50):
    """List recent workflow executions"""
    return workflow_executor.list_executions(limit)


@router.get("/executions/{execution_id}")
async def get_execution_status(execution_id: str):
    """Get the status of a workflow execution"""
    status = workflow_executor.get_execution_status(execution_id)
    if not status:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")
    return status


@router.get("/executions/{execution_id}/logs")
async def get_execution_logs(execution_id: str):
    """Get detailed logs for an execution"""
    if execution_id not in execution_history:
        raise HTTPException(status_code=404, detail=f"Execution '{execution_id}' not found")
    
    context = execution_history[execution_id]
    
    logs = []
    for node_id, result in context.node_results.items():
        logs.append({
            "node_id": node_id,
            "status": result.status.value,
            "started_at": result.started_at.isoformat() if result.started_at else None,
            "completed_at": result.completed_at.isoformat() if result.completed_at else None,
            "duration_ms": result.duration_ms,
            "output": result.output,
            "error": result.error,
            "metrics": result.metrics
        })
    
    return {
        "execution_id": execution_id,
        "workflow_name": context.workflow_name,
        "status": context.status.value,
        "logs": logs
    }
