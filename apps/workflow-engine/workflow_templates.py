"""
Workflow Templates - Pre-built Automation Workflows
Ready-to-use templates for common AIOps scenarios

📋 One-click deployment of best practices!
"""

import json
import uuid
from typing import Dict, List, Any
from datetime import datetime

import asyncpg


# ============================================================
# TEMPLATE DEFINITIONS - 8 Ready-to-use workflows!
# ============================================================

SYSTEM_TEMPLATES = [
    # ============================================================
    # Template 1: Basic Incident Response
    # ============================================================
    {
        "name": "Basic Incident Response",
        "description": "Automatically respond to new incidents by running diagnostics and notifying the team",
        "category": "incident_response",
        "template_data": {
            "trigger_type": "incident",
            "trigger_config": {
                "incident_events": ["created"],
                "severity_filter": "all"
            },
            "nodes": [
                {
                    "node_type": "trigger",
                    "node_subtype": "incident_created",
                    "label": "Incident Created",
                    "position_x": 100,
                    "position_y": 200,
                    "config": {},
                    "is_start_node": True
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Run Diagnostics",
                    "position_x": 350,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "health_check.yml",
                        "timeout_seconds": 120
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "send_email",
                    "label": "Notify Team",
                    "position_x": 600,
                    "position_y": 200,
                    "config": {
                        "recipients": "ops-team@company.com",
                        "subject": "🚨 Incident Alert: {{trigger.incident.title}}",
                        "body_template": "New incident created.\n\nTitle: {{trigger.incident.title}}\nSeverity: {{trigger.incident.severity}}\n\nDiagnostics have been run automatically."
                    }
                }
            ],
            "edges": [
                {"source_idx": 0, "target_idx": 1, "source_handle": "default"},
                {"source_idx": 1, "target_idx": 2, "source_handle": "success"}
            ]
        }
    },
    
    # ============================================================
    # Template 2: Critical Incident with Approval
    # ============================================================
    {
        "name": "Critical Incident with Approval Gate",
        "description": "For critical incidents, run diagnostics, require human approval, then execute remediation",
        "category": "incident_response",
        "template_data": {
            "trigger_type": "incident",
            "trigger_config": {
                "incident_events": ["created"],
                "severity_filter": "critical"
            },
            "nodes": [
                {
                    "node_type": "trigger",
                    "node_subtype": "incident_created",
                    "label": "Critical Incident",
                    "position_x": 100,
                    "position_y": 200,
                    "config": {},
                    "is_start_node": True
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Collect Diagnostics",
                    "position_x": 350,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "health_check.yml",
                        "timeout_seconds": 120
                    }
                },
                {
                    "node_type": "flow",
                    "node_subtype": "human_approval",
                    "label": "Approve Remediation",
                    "position_x": 600,
                    "position_y": 200,
                    "config": {
                        "approvers": "sre-lead@company.com",
                        "timeout_minutes": 15,
                        "notification_channels": "email"
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Execute Remediation",
                    "position_x": 850,
                    "position_y": 150,
                    "config": {
                        "playbook_name": "restart_service.yml",
                        "timeout_seconds": 180
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "send_email",
                    "label": "Notify Rejection",
                    "position_x": 850,
                    "position_y": 280,
                    "config": {
                        "recipients": "ops-team@company.com",
                        "subject": "⛔ Remediation Rejected: {{trigger.incident.title}}",
                        "body_template": "The proposed remediation was rejected. Manual intervention required."
                    }
                }
            ],
            "edges": [
                {"source_idx": 0, "target_idx": 1, "source_handle": "default"},
                {"source_idx": 1, "target_idx": 2, "source_handle": "success"},
                {"source_idx": 2, "target_idx": 3, "source_handle": "approved"},
                {"source_idx": 2, "target_idx": 4, "source_handle": "rejected"}
            ]
        }
    },
    
    # ============================================================
    # Template 3: Scheduled Maintenance
    # ============================================================
    {
        "name": "Scheduled Maintenance Window",
        "description": "Run maintenance tasks on a schedule - clean logs, rotate certificates, update packages",
        "category": "maintenance",
        "template_data": {
            "trigger_type": "schedule",
            "trigger_config": {
                "schedule_type": "cron",
                "cron_expression": "0 2 * * 0"  # Every Sunday at 2 AM
            },
            "nodes": [
                {
                    "node_type": "trigger",
                    "node_subtype": "scheduled",
                    "label": "Weekly Maintenance",
                    "position_x": 100,
                    "position_y": 200,
                    "config": {},
                    "is_start_node": True
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Cleanup Logs",
                    "position_x": 350,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "cleanup_logs.yml",
                        "timeout_seconds": 300
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Rotate Certs",
                    "position_x": 600,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "rotate_certs.yml",
                        "timeout_seconds": 180
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "send_email",
                    "label": "Report Completion",
                    "position_x": 850,
                    "position_y": 200,
                    "config": {
                        "recipients": "ops-team@company.com",
                        "subject": "✅ Weekly Maintenance Complete",
                        "body_template": "Weekly maintenance tasks completed successfully."
                    }
                }
            ],
            "edges": [
                {"source_idx": 0, "target_idx": 1, "source_handle": "default"},
                {"source_idx": 1, "target_idx": 2, "source_handle": "success"},
                {"source_idx": 2, "target_idx": 3, "source_handle": "success"}
            ]
        }
    },
    
    # ============================================================
    # Template 4: Alert Triage with Conditions
    # ============================================================
    {
        "name": "Smart Alert Triage",
        "description": "Route alerts based on severity - critical gets immediate action, others queue for review",
        "category": "alerting",
        "template_data": {
            "trigger_type": "alert",
            "trigger_config": {
                "severity_filter": "all"
            },
            "nodes": [
                {
                    "node_type": "trigger",
                    "node_subtype": "alert_fired",
                    "label": "Alert Received",
                    "position_x": 100,
                    "position_y": 200,
                    "config": {},
                    "is_start_node": True
                },
                {
                    "node_type": "flow",
                    "node_subtype": "if_else",
                    "label": "Check Severity",
                    "position_x": 350,
                    "position_y": 200,
                    "config": {
                        "left_value": "{{trigger.severity}}",
                        "condition_type": "equals",
                        "right_value": "critical"
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Immediate Response",
                    "position_x": 600,
                    "position_y": 100,
                    "config": {
                        "playbook_name": "emergency_response.yml",
                        "timeout_seconds": 60
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "call_api",
                    "label": "Create Ticket",
                    "position_x": 600,
                    "position_y": 300,
                    "config": {
                        "url": "http://localhost:8000/api/incidents",
                        "method": "POST",
                        "body": {
                            "title": "{{trigger.alert.name}}",
                            "severity": "{{trigger.severity}}",
                            "source": "alert-workflow"
                        }
                    }
                }
            ],
            "edges": [
                {"source_idx": 0, "target_idx": 1, "source_handle": "default"},
                {"source_idx": 1, "target_idx": 2, "source_handle": "true"},
                {"source_idx": 1, "target_idx": 3, "source_handle": "false"}
            ]
        }
    },
    
    # ============================================================
    # Template 5: Webhook CI/CD Integration
    # ============================================================
    {
        "name": "CI/CD Deployment Workflow",
        "description": "Triggered by webhook from CI/CD pipeline - deploy, verify health, and notify",
        "category": "deployment",
        "template_data": {
            "trigger_type": "webhook",
            "trigger_config": {},
            "nodes": [
                {
                    "node_type": "trigger",
                    "node_subtype": "webhook_received",
                    "label": "Deployment Request",
                    "position_x": 100,
                    "position_y": 200,
                    "config": {},
                    "is_start_node": True
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Deploy Application",
                    "position_x": 350,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "deploy_app.yml",
                        "timeout_seconds": 600,
                        "extra_vars": {
                            "version": "{{trigger.payload.version}}",
                            "environment": "{{trigger.payload.environment}}"
                        }
                    }
                },
                {
                    "node_type": "flow",
                    "node_subtype": "delay_wait",
                    "label": "Wait for Startup",
                    "position_x": 600,
                    "position_y": 200,
                    "config": {
                        "duration_seconds": 30,
                        "reason": "Waiting for application to start"
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Health Check",
                    "position_x": 850,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "health_check.yml",
                        "timeout_seconds": 60
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "send_email",
                    "label": "Notify Success",
                    "position_x": 1100,
                    "position_y": 200,
                    "config": {
                        "recipients": "devops@company.com",
                        "subject": "✅ Deployment Complete: v{{trigger.payload.version}}",
                        "body_template": "Deployment successful!\n\nVersion: {{trigger.payload.version}}\nEnvironment: {{trigger.payload.environment}}"
                    }
                }
            ],
            "edges": [
                {"source_idx": 0, "target_idx": 1, "source_handle": "default"},
                {"source_idx": 1, "target_idx": 2, "source_handle": "success"},
                {"source_idx": 2, "target_idx": 3, "source_handle": "default"},
                {"source_idx": 3, "target_idx": 4, "source_handle": "success"}
            ]
        }
    },
    
    # ============================================================
    # Template 6: Database Backup
    # ============================================================
    {
        "name": "Database Backup Routine",
        "description": "Scheduled database backup with verification and cloud storage upload",
        "category": "backup",
        "template_data": {
            "trigger_type": "schedule",
            "trigger_config": {
                "schedule_type": "cron",
                "cron_expression": "0 1 * * *"  # Every day at 1 AM
            },
            "nodes": [
                {
                    "node_type": "trigger",
                    "node_subtype": "scheduled",
                    "label": "Daily Backup",
                    "position_x": 100,
                    "position_y": 200,
                    "config": {},
                    "is_start_node": True
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Dump Database",
                    "position_x": 350,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "database_backup.yml",
                        "timeout_seconds": 1800
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "ssh_command",
                    "label": "Verify Backup",
                    "position_x": 600,
                    "position_y": 200,
                    "config": {
                        "host": "ddev",
                        "command": "ls -la /backups/*.sql.gz | tail -1",
                        "timeout_seconds": 30
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "send_email",
                    "label": "Notify Complete",
                    "position_x": 850,
                    "position_y": 200,
                    "config": {
                        "recipients": "dba@company.com",
                        "subject": "✅ Daily Backup Complete",
                        "body_template": "Database backup completed successfully."
                    }
                }
            ],
            "edges": [
                {"source_idx": 0, "target_idx": 1, "source_handle": "default"},
                {"source_idx": 1, "target_idx": 2, "source_handle": "success"},
                {"source_idx": 2, "target_idx": 3, "source_handle": "success"}
            ]
        }
    },
    
    # ============================================================
    # Template 7: Scaling Response
    # ============================================================
    {
        "name": "Auto-Scaling Response",
        "description": "Respond to high load alerts by scaling up, waiting, then verifying capacity",
        "category": "scaling",
        "template_data": {
            "trigger_type": "alert",
            "trigger_config": {
                "severity_filter": "warning"
            },
            "nodes": [
                {
                    "node_type": "trigger",
                    "node_subtype": "alert_fired",
                    "label": "High Load Alert",
                    "position_x": 100,
                    "position_y": 200,
                    "config": {},
                    "is_start_node": True
                },
                {
                    "node_type": "flow",
                    "node_subtype": "human_approval",
                    "label": "Approve Scale-Up",
                    "position_x": 350,
                    "position_y": 200,
                    "config": {
                        "approvers": "infra-team@company.com",
                        "timeout_minutes": 5,
                        "notification_channels": "both"
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Scale Up Pods",
                    "position_x": 600,
                    "position_y": 150,
                    "config": {
                        "playbook_name": "scale_deployment.yml",
                        "timeout_seconds": 180,
                        "extra_vars": {
                            "replicas": "{{trigger.alert.suggested_replicas}}"
                        }
                    }
                },
                {
                    "node_type": "flow",
                    "node_subtype": "delay_wait",
                    "label": "Wait for Scale",
                    "position_x": 850,
                    "position_y": 150,
                    "config": {
                        "duration_seconds": 60,
                        "reason": "Waiting for new pods to become ready"
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Verify Capacity",
                    "position_x": 1100,
                    "position_y": 150,
                    "config": {
                        "playbook_name": "verify_capacity.yml",
                        "timeout_seconds": 60
                    }
                }
            ],
            "edges": [
                {"source_idx": 0, "target_idx": 1, "source_handle": "default"},
                {"source_idx": 1, "target_idx": 2, "source_handle": "approved"},
                {"source_idx": 2, "target_idx": 3, "source_handle": "success"},
                {"source_idx": 3, "target_idx": 4, "source_handle": "default"}
            ]
        }
    },
    
    # ============================================================
    # Template 8: Security Incident Response
    # ============================================================
    {
        "name": "Security Incident Playbook",
        "description": "Respond to security alerts - isolate, investigate, notify security team, require approval for remediation",
        "category": "security",
        "template_data": {
            "trigger_type": "event",
            "trigger_config": {
                "event_name": "security_alert"
            },
            "nodes": [
                {
                    "node_type": "trigger",
                    "node_subtype": "incident_created",
                    "label": "Security Alert",
                    "position_x": 100,
                    "position_y": 200,
                    "config": {},
                    "is_start_node": True
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Isolate System",
                    "position_x": 350,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "network_isolate.yml",
                        "timeout_seconds": 60
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "run_playbook",
                    "label": "Collect Evidence",
                    "position_x": 600,
                    "position_y": 200,
                    "config": {
                        "playbook_name": "forensic_collection.yml",
                        "timeout_seconds": 300
                    }
                },
                {
                    "node_type": "action",
                    "node_subtype": "send_email",
                    "label": "Alert Security Team",
                    "position_x": 850,
                    "position_y": 200,
                    "config": {
                        "recipients": "security@company.com",
                        "subject": "🔒 SECURITY INCIDENT: Immediate Action Required",
                        "body_template": "A security incident has been detected!\n\nSystem has been isolated. Evidence collection in progress.\n\nPlease review immediately."
                    }
                },
                {
                    "node_type": "flow",
                    "node_subtype": "human_approval",
                    "label": "Approve Recovery",
                    "position_x": 1100,
                    "position_y": 200,
                    "config": {
                        "approvers": "security-lead@company.com",
                        "timeout_minutes": 60,
                        "notification_channels": "email"
                    }
                }
            ],
            "edges": [
                {"source_idx": 0, "target_idx": 1, "source_handle": "default"},
                {"source_idx": 1, "target_idx": 2, "source_handle": "success"},
                {"source_idx": 2, "target_idx": 3, "source_handle": "success"},
                {"source_idx": 3, "target_idx": 4, "source_handle": "success"}
            ]
        }
    }
]


# ============================================================
# TEMPLATE SERVICE
# ============================================================

class TemplateService:
    """Manages workflow templates"""
    
    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool
    
    async def seed_system_templates(self):
        """Insert all system templates into the database"""
        
        async with self.db_pool.acquire() as conn:
            for template in SYSTEM_TEMPLATES:
                # Check if already exists
                exists = await conn.fetchval(
                    "SELECT 1 FROM workflow_templates WHERE name = $1 AND is_system = true",
                    template["name"]
                )
                
                if not exists:
                    await conn.execute('''
                        INSERT INTO workflow_templates 
                        (id, name, description, category, template_data, is_system)
                        VALUES ($1, $2, $3, $4, $5, true)
                    ''',
                        uuid.uuid4(),
                        template["name"],
                        template["description"],
                        template["category"],
                        json.dumps(template["template_data"])
                    )
                    print(f"   📋 Added template: {template['name']}")
        
        print(f"✅ Seeded {len(SYSTEM_TEMPLATES)} system templates")
    
    async def get_all_templates(self) -> List[Dict]:
        """Get all available templates"""
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT id, name, description, category, is_system, created_at
                FROM workflow_templates
                ORDER BY is_system DESC, category, name
            ''')
            
            return [
                {
                    "id": str(row["id"]),
                    "name": row["name"],
                    "description": row["description"],
                    "category": row["category"],
                    "is_system": row["is_system"],
                    "created_at": row["created_at"].isoformat()
                }
                for row in rows
            ]
    
    async def get_template(self, template_id: str) -> Dict:
        """Get a template with full data"""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT * FROM workflow_templates WHERE id = $1",
                uuid.UUID(template_id)
            )
            
            if not row:
                return None
            
            return {
                "id": str(row["id"]),
                "name": row["name"],
                "description": row["description"],
                "category": row["category"],
                "template_data": json.loads(row["template_data"]),
                "is_system": row["is_system"],
                "created_at": row["created_at"].isoformat()
            }


# ============================================================
# SINGLETON
# ============================================================

_template_service: "TemplateService" = None

def get_template_service() -> "TemplateService":
    return _template_service

def init_template_service(db_pool: asyncpg.Pool) -> TemplateService:
    global _template_service
    _template_service = TemplateService(db_pool)
    return _template_service
