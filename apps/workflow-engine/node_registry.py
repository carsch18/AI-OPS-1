"""
Node Registry - Defines all available node types for the workflow builder
Each node has a schema for configuration and execution logic
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from enum import Enum


@dataclass
class ConfigField:
    """Definition of a configuration field for a node"""
    name: str
    label: str
    type: str  # 'text', 'select', 'number', 'boolean', 'json', 'code'
    required: bool = False
    default: Any = None
    options: List[Dict[str, str]] = field(default_factory=list)  # For 'select' type
    placeholder: str = ""
    description: str = ""


@dataclass
class PortDefinition:
    """Definition of input/output ports on a node"""
    name: str
    label: str
    type: str = "default"  # 'default', 'success', 'failure', 'timeout'


@dataclass
class NodeDefinition:
    """Complete definition of a node type"""
    type: str
    subtype: str
    category: str  # 'trigger', 'action', 'flow'
    label: str
    description: str
    icon: str  # Emoji or icon name
    color: str  # Hex color for UI
    inputs: List[PortDefinition] = field(default_factory=list)
    outputs: List[PortDefinition] = field(default_factory=list)
    config_fields: List[ConfigField] = field(default_factory=list)


# ============================================================
# NODE DEFINITIONS
# ============================================================

NODE_REGISTRY: Dict[str, NodeDefinition] = {
    
    # ========================================
    # TRIGGER NODES
    # ========================================
    
    "incident_created": NodeDefinition(
        type="trigger",
        subtype="incident_created",
        category="trigger",
        label="Incident Created",
        description="Triggers when a new incident is created",
        icon="🔥",
        color="#8B5CF6",  # Purple
        inputs=[],
        outputs=[
            PortDefinition("default", "On Trigger")
        ],
        config_fields=[
            ConfigField(
                name="severity_filter",
                label="Severity Filter",
                type="select",
                options=[
                    {"value": "any", "label": "Any Severity"},
                    {"value": "P0", "label": "P0 - Critical"},
                    {"value": "P1", "label": "P1 - High"},
                    {"value": "P2", "label": "P2 - Medium"},
                    {"value": "P3", "label": "P3 - Low"}
                ],
                default="any"
            ),
            ConfigField(
                name="type_filter",
                label="Incident Type",
                type="select",
                options=[
                    {"value": "any", "label": "Any Type"},
                    {"value": "site_downtime", "label": "Site Downtime"},
                    {"value": "http_5xx_spike", "label": "HTTP 5xx Spike"},
                    {"value": "ddos_attack", "label": "DDoS Attack"},
                    {"value": "resource_spike", "label": "Resource Spike"},
                    {"value": "db_latency", "label": "Database Latency"}
                ],
                default="any"
            )
        ]
    ),
    
    "alert_fired": NodeDefinition(
        type="trigger",
        subtype="alert_fired",
        category="trigger",
        label="Alert Fired",
        description="Triggers when an alert is fired",
        icon="🚨",
        color="#8B5CF6",
        inputs=[],
        outputs=[
            PortDefinition("default", "On Alert")
        ],
        config_fields=[
            ConfigField(
                name="category",
                label="Alert Category",
                type="select",
                options=[
                    {"value": "any", "label": "Any Category"},
                    {"value": "availability", "label": "Availability"},
                    {"value": "performance", "label": "Performance"},
                    {"value": "infrastructure", "label": "Infrastructure"},
                    {"value": "database", "label": "Database"},
                    {"value": "security", "label": "Security"}
                ],
                default="any"
            ),
            ConfigField(
                name="severity",
                label="Minimum Severity",
                type="select",
                options=[
                    {"value": "any", "label": "Any"},
                    {"value": "warning", "label": "Warning"},
                    {"value": "critical", "label": "Critical"}
                ],
                default="any"
            )
        ]
    ),
    
    "scheduled": NodeDefinition(
        type="trigger",
        subtype="scheduled",
        category="trigger",
        label="Scheduled",
        description="Triggers on a schedule (cron)",
        icon="⏰",
        color="#8B5CF6",
        inputs=[],
        outputs=[
            PortDefinition("default", "On Schedule")
        ],
        config_fields=[
            ConfigField(
                name="cron_expression",
                label="Cron Expression",
                type="text",
                required=True,
                placeholder="0 0 * * *",
                description="Standard cron format (minute hour day month weekday)"
            ),
            ConfigField(
                name="timezone",
                label="Timezone",
                type="text",
                default="UTC"
            )
        ]
    ),
    
    "manual_trigger": NodeDefinition(
        type="trigger",
        subtype="manual_trigger",
        category="trigger",
        label="Manual Trigger",
        description="Triggers manually from the UI",
        icon="👆",
        color="#8B5CF6",
        inputs=[],
        outputs=[
            PortDefinition("default", "On Trigger")
        ],
        config_fields=[
            ConfigField(
                name="input_fields",
                label="Input Fields",
                type="json",
                description="Define input fields to show when triggering manually"
            )
        ]
    ),
    
    "webhook_received": NodeDefinition(
        type="trigger",
        subtype="webhook_received",
        category="trigger",
        label="Webhook",
        description="Triggers on incoming webhook",
        icon="🔗",
        color="#8B5CF6",
        inputs=[],
        outputs=[
            PortDefinition("default", "On Request")
        ],
        config_fields=[
            ConfigField(
                name="path",
                label="Webhook Path",
                type="text",
                placeholder="/my-hook"
            ),
            ConfigField(
                name="method",
                label="HTTP Method",
                type="select",
                options=[
                    {"value": "POST", "label": "POST"},
                    {"value": "GET", "label": "GET"}
                ],
                default="POST"
            )
        ]
    ),
    
    # ========================================
    # ACTION NODES
    # ========================================
    
    "run_playbook": NodeDefinition(
        type="action",
        subtype="run_playbook",
        category="action",
        label="Run Playbook",
        description="Execute an Ansible playbook",
        icon="📋",
        color="#10B981",  # Green
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("success", "Success"),
            PortDefinition("failure", "Failure")
        ],
        config_fields=[
            ConfigField(
                name="playbook_name",
                label="Playbook",
                type="select",
                required=True,
                options=[
                    {"value": "ddev_restart.yml", "label": "DDEV Restart"},
                    {"value": "ddev_health_check.yml", "label": "DDEV Health Check"},
                    {"value": "ddev_logs.yml", "label": "DDEV Collect Logs"},
                    {"value": "ddos_mitigation.yml", "label": "DDoS Mitigation"},
                    {"value": "resource_spike.yml", "label": "Resource Spike"},
                    {"value": "db_latency.yml", "label": "DB Latency Fix"},
                    {"value": "netdata_restart.yml", "label": "Netdata Restart"},
                    {"value": "clear_cache.yml", "label": "Clear Cache"},
                    {"value": "health_check.yml", "label": "General Health Check"}
                ]
            ),
            ConfigField(
                name="extra_vars",
                label="Extra Variables",
                type="json",
                description="Additional variables to pass to the playbook"
            ),
            ConfigField(
                name="timeout_seconds",
                label="Timeout (seconds)",
                type="number",
                default=300
            )
        ]
    ),
    
    "ssh_command": NodeDefinition(
        type="action",
        subtype="ssh_command",
        category="action",
        label="SSH Command",
        description="Execute a command via SSH",
        icon="💻",
        color="#10B981",
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("success", "Success"),
            PortDefinition("failure", "Failure")
        ],
        config_fields=[
            ConfigField(
                name="host",
                label="Host",
                type="select",
                options=[
                    {"value": "ddev", "label": "DDEV Server (10.10.2.21)"},
                    {"value": "localhost", "label": "Local"}
                ],
                default="ddev"
            ),
            ConfigField(
                name="command",
                label="Command",
                type="code",
                required=True,
                placeholder="cd ~/d1/regenics && ddev status"
            ),
            ConfigField(
                name="timeout_seconds",
                label="Timeout (seconds)",
                type="number",
                default=60
            )
        ]
    ),
    
    "send_email": NodeDefinition(
        type="action",
        subtype="send_email",
        category="action",
        label="Send Email",
        description="Send an email notification",
        icon="📧",
        color="#10B981",
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("success", "Success"),
            PortDefinition("failure", "Failure")
        ],
        config_fields=[
            ConfigField(
                name="recipients",
                label="Recipients",
                type="text",
                required=True,
                placeholder="team@example.com, oncall@example.com"
            ),
            ConfigField(
                name="subject",
                label="Subject",
                type="text",
                required=True,
                placeholder="[AIOps] {{incident.title}}"
            ),
            ConfigField(
                name="body_template",
                label="Body Template",
                type="code",
                placeholder="Incident: {{incident.title}}\nSeverity: {{incident.severity}}"
            )
        ]
    ),
    
    "create_incident": NodeDefinition(
        type="action",
        subtype="create_incident",
        category="action",
        label="Create Incident",
        description="Create a new incident",
        icon="🎫",
        color="#10B981",
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("success", "Success"),
            PortDefinition("failure", "Failure")
        ],
        config_fields=[
            ConfigField(
                name="title",
                label="Title",
                type="text",
                required=True
            ),
            ConfigField(
                name="severity",
                label="Severity",
                type="select",
                options=[
                    {"value": "P0", "label": "P0 - Critical"},
                    {"value": "P1", "label": "P1 - High"},
                    {"value": "P2", "label": "P2 - Medium"},
                    {"value": "P3", "label": "P3 - Low"}
                ],
                default="P2"
            ),
            ConfigField(
                name="type",
                label="Incident Type",
                type="select",
                options=[
                    {"value": "site_downtime", "label": "Site Downtime"},
                    {"value": "http_5xx_spike", "label": "HTTP 5xx Spike"},
                    {"value": "resource_spike", "label": "Resource Spike"},
                    {"value": "other", "label": "Other"}
                ]
            )
        ]
    ),
    
    "call_api": NodeDefinition(
        type="action",
        subtype="call_api",
        category="action",
        label="HTTP Request",
        description="Make an HTTP request to an API",
        icon="🌐",
        color="#10B981",
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("success", "Success"),
            PortDefinition("failure", "Failure")
        ],
        config_fields=[
            ConfigField(
                name="url",
                label="URL",
                type="text",
                required=True,
                placeholder="https://api.example.com/endpoint"
            ),
            ConfigField(
                name="method",
                label="Method",
                type="select",
                options=[
                    {"value": "GET", "label": "GET"},
                    {"value": "POST", "label": "POST"},
                    {"value": "PUT", "label": "PUT"},
                    {"value": "DELETE", "label": "DELETE"}
                ],
                default="POST"
            ),
            ConfigField(
                name="headers",
                label="Headers",
                type="json"
            ),
            ConfigField(
                name="body",
                label="Body",
                type="json"
            )
        ]
    ),
    
    # ========================================
    # FLOW CONTROL NODES
    # ========================================
    
    "human_approval": NodeDefinition(
        type="approval",
        subtype="human_approval",
        category="flow",
        label="Human Approval",
        description="Pause and wait for human approval",
        icon="👤",
        color="#F59E0B",  # Orange
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("approved", "Approved"),
            PortDefinition("rejected", "Rejected"),
            PortDefinition("timeout", "Timeout")
        ],
        config_fields=[
            ConfigField(
                name="approvers",
                label="Approvers",
                type="text",
                placeholder="admin, oncall (comma-separated)"
            ),
            ConfigField(
                name="timeout_minutes",
                label="Timeout (minutes)",
                type="number",
                default=30
            ),
            ConfigField(
                name="auto_action",
                label="On Timeout",
                type="select",
                options=[
                    {"value": "reject", "label": "Auto-Reject"},
                    {"value": "approve", "label": "Auto-Approve"},
                    {"value": "none", "label": "Keep Waiting"}
                ],
                default="reject"
            ),
            ConfigField(
                name="notification_channels",
                label="Notify Via",
                type="select",
                options=[
                    {"value": "email", "label": "Email"},
                    {"value": "dashboard", "label": "Dashboard Only"},
                    {"value": "both", "label": "Email + Dashboard"}
                ],
                default="both"
            )
        ]
    ),
    
    "if_else": NodeDefinition(
        type="condition",
        subtype="if_else",
        category="flow",
        label="If/Else",
        description="Branch based on a condition",
        icon="🔀",
        color="#F59E0B",
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("true", "True"),
            PortDefinition("false", "False")
        ],
        config_fields=[
            ConfigField(
                name="condition_type",
                label="Condition Type",
                type="select",
                options=[
                    {"value": "equals", "label": "Equals"},
                    {"value": "not_equals", "label": "Not Equals"},
                    {"value": "contains", "label": "Contains"},
                    {"value": "greater_than", "label": "Greater Than"},
                    {"value": "less_than", "label": "Less Than"}
                ],
                default="equals"
            ),
            ConfigField(
                name="left_value",
                label="Left Value",
                type="text",
                required=True,
                placeholder="{{trigger.severity}}"
            ),
            ConfigField(
                name="right_value",
                label="Right Value",
                type="text",
                required=True,
                placeholder="P0"
            )
        ]
    ),
    
    "delay_wait": NodeDefinition(
        type="delay",
        subtype="delay_wait",
        category="flow",
        label="Delay",
        description="Wait for a specified time",
        icon="⏳",
        color="#F59E0B",
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("default", "Continue")
        ],
        config_fields=[
            ConfigField(
                name="duration_seconds",
                label="Duration (seconds)",
                type="number",
                default=10,
                required=True
            ),
            ConfigField(
                name="reason",
                label="Reason (for logs)",
                type="text",
                placeholder="Waiting for service restart..."
            )
        ]
    ),
    
    "loop_retry": NodeDefinition(
        type="flow",
        subtype="loop_retry",
        category="flow",
        label="Retry Loop",
        description="Retry an action on failure",
        icon="🔄",
        color="#F59E0B",
        inputs=[
            PortDefinition("default", "Input")
        ],
        outputs=[
            PortDefinition("success", "Final Success"),
            PortDefinition("exhausted", "All Retries Failed")
        ],
        config_fields=[
            ConfigField(
                name="max_retries",
                label="Max Retries",
                type="number",
                default=3
            ),
            ConfigField(
                name="delay_between_seconds",
                label="Delay Between (seconds)",
                type="number",
                default=10
            )
        ]
    )
}


def get_node_definition(subtype: str) -> Optional[NodeDefinition]:
    """Get node definition by subtype"""
    return NODE_REGISTRY.get(subtype)


def get_nodes_by_category(category: str) -> List[NodeDefinition]:
    """Get all nodes in a category"""
    return [n for n in NODE_REGISTRY.values() if n.category == category]


def get_all_nodes() -> List[Dict[str, Any]]:
    """Get all nodes as serializable dicts for API"""
    return [
        {
            "type": node.type,
            "subtype": node.subtype,
            "category": node.category,
            "label": node.label,
            "description": node.description,
            "icon": node.icon,
            "color": node.color,
            "inputs": [{"name": p.name, "label": p.label, "type": p.type} for p in node.inputs],
            "outputs": [{"name": p.name, "label": p.label, "type": p.type} for p in node.outputs],
            "config_fields": [
                {
                    "name": f.name,
                    "label": f.label,
                    "type": f.type,
                    "required": f.required,
                    "default": f.default,
                    "options": f.options,
                    "placeholder": f.placeholder,
                    "description": f.description
                }
                for f in node.config_fields
            ]
        }
        for node in NODE_REGISTRY.values()
    ]


# Available playbooks for the UI
AVAILABLE_PLAYBOOKS = [
    {"name": "ddev_restart.yml", "label": "DDEV Restart", "description": "Restart DDEV services"},
    {"name": "ddev_health_check.yml", "label": "DDEV Health Check", "description": "Check DDEV health"},
    {"name": "ddev_logs.yml", "label": "DDEV Collect Logs", "description": "Collect DDEV logs"},
    {"name": "ddos_mitigation.yml", "label": "DDoS Mitigation", "description": "Block attackers, enable rate limiting"},
    {"name": "resource_spike.yml", "label": "Resource Spike", "description": "Handle CPU/memory spikes"},
    {"name": "db_latency.yml", "label": "DB Latency Fix", "description": "Fix database latency issues"},
    {"name": "netdata_restart.yml", "label": "Netdata Restart", "description": "Restart Netdata container"},
    {"name": "clear_cache.yml", "label": "Clear Cache", "description": "Clear application caches"},
    {"name": "health_check.yml", "label": "General Health Check", "description": "Run full health check"},
    {"name": "site_downtime.yml", "label": "Site Downtime Recovery", "description": "Recover from site downtime"},
    {"name": "http_5xx_spike.yml", "label": "HTTP 5xx Spike", "description": "Handle 5xx error spikes"},
    {"name": "production_emergency.yml", "label": "Production Emergency", "description": "Full emergency recovery"},
]
