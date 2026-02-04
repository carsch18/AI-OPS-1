"""
Trigger System - Event Listeners, Webhooks, and Schedulers
Watches for events and kicks off workflow executions

🎯 Multiple trigger sources all feeding into the executor!
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass
from enum import Enum
import asyncpg
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from workflow_executor import WorkflowExecutor, get_executor


# ============================================================
# TRIGGER TYPES
# ============================================================

class TriggerType(Enum):
    MANUAL = "manual"
    INCIDENT = "incident"
    ALERT = "alert"
    WEBHOOK = "webhook"
    SCHEDULE = "schedule"
    EVENT = "event"


# ============================================================
# TRIGGER MANAGER
# ============================================================

class TriggerManager:
    """
    Manages all workflow triggers:
    - Schedules cron/interval jobs
    - Handles incoming webhooks
    - Listens for events from other services
    - Processes HITL callbacks
    """
    
    def __init__(self, db_pool: asyncpg.Pool, executor: WorkflowExecutor):
        self.db_pool = db_pool
        self.executor = executor
        self.scheduler = AsyncIOScheduler()
        self.event_handlers: Dict[str, List[str]] = {}  # event_type -> [workflow_ids]
        self._running = False
    
    async def start(self):
        """Start the trigger manager"""
        print("🎯 Starting Trigger Manager...")
        
        # Load and schedule all active scheduled workflows
        await self._load_scheduled_triggers()
        
        # Load event subscriptions
        await self._load_event_triggers()
        
        # Start the scheduler
        self.scheduler.start()
        self._running = True
        
        print(f"✅ Trigger Manager started with {len(self.scheduler.get_jobs())} scheduled jobs")
    
    async def stop(self):
        """Stop the trigger manager"""
        print("🛑 Stopping Trigger Manager...")
        self.scheduler.shutdown(wait=False)
        self._running = False
    
    async def _load_scheduled_triggers(self):
        """Load all scheduled workflows and add them to the scheduler"""
        async with self.db_pool.acquire() as conn:
            workflows = await conn.fetch('''
                SELECT id, name, trigger_type, trigger_config 
                FROM workflows 
                WHERE is_active = true AND trigger_type = 'schedule'
            ''')
            
            for workflow in workflows:
                await self._add_scheduled_trigger(
                    str(workflow["id"]),
                    workflow["name"],
                    json.loads(workflow["trigger_config"]) if workflow["trigger_config"] else {}
                )
    
    async def _add_scheduled_trigger(self, workflow_id: str, name: str, config: Dict):
        """Add a scheduled workflow to the scheduler"""
        schedule_type = config.get("schedule_type", "interval")
        
        if schedule_type == "cron":
            # Cron expression
            cron_expr = config.get("cron_expression", "0 0 * * *")  # Default: daily at midnight
            try:
                parts = cron_expr.split()
                trigger = CronTrigger(
                    minute=parts[0] if len(parts) > 0 else "0",
                    hour=parts[1] if len(parts) > 1 else "0",
                    day=parts[2] if len(parts) > 2 else "*",
                    month=parts[3] if len(parts) > 3 else "*",
                    day_of_week=parts[4] if len(parts) > 4 else "*"
                )
            except Exception as e:
                print(f"⚠️ Invalid cron expression for {name}: {e}")
                return
        else:
            # Interval
            interval_minutes = config.get("interval_minutes", 60)
            trigger = IntervalTrigger(minutes=interval_minutes)
        
        job_id = f"workflow_{workflow_id}"
        
        # Remove existing job if present
        existing = self.scheduler.get_job(job_id)
        if existing:
            existing.remove()
        
        # Add new job
        self.scheduler.add_job(
            self._execute_scheduled_workflow,
            trigger=trigger,
            id=job_id,
            args=[workflow_id, name],
            replace_existing=True
        )
        
        print(f"   📅 Scheduled: {name} ({schedule_type})")
    
    async def _execute_scheduled_workflow(self, workflow_id: str, name: str):
        """Execute a scheduled workflow"""
        print(f"\n⏰ Scheduled trigger fired: {name}")
        
        trigger_data = {
            "trigger_type": "schedule",
            "triggered_at": datetime.utcnow().isoformat(),
            "workflow_id": workflow_id
        }
        
        await self.executor.execute_workflow(workflow_id, trigger_data)
    
    async def _load_event_triggers(self):
        """Load workflows that trigger on events"""
        async with self.db_pool.acquire() as conn:
            workflows = await conn.fetch('''
                SELECT id, trigger_type, trigger_config 
                FROM workflows 
                WHERE is_active = true AND trigger_type IN ('incident', 'alert', 'event')
            ''')
            
            for workflow in workflows:
                trigger_type = workflow["trigger_type"]
                config = json.loads(workflow["trigger_config"]) if workflow["trigger_config"] else {}
                
                # Determine event type to listen for
                if trigger_type == "incident":
                    event_types = config.get("incident_events", ["created"])
                    for event_type in event_types:
                        event_key = f"incident_{event_type}"
                        if event_key not in self.event_handlers:
                            self.event_handlers[event_key] = []
                        self.event_handlers[event_key].append(str(workflow["id"]))
                
                elif trigger_type == "alert":
                    severity = config.get("severity_filter", "all")
                    event_key = f"alert_{severity}"
                    if event_key not in self.event_handlers:
                        self.event_handlers[event_key] = []
                    self.event_handlers[event_key].append(str(workflow["id"]))
                
                elif trigger_type == "event":
                    event_name = config.get("event_name", "custom")
                    event_key = f"event_{event_name}"
                    if event_key not in self.event_handlers:
                        self.event_handlers[event_key] = []
                    self.event_handlers[event_key].append(str(workflow["id"]))
            
            print(f"   🔔 Loaded {len(self.event_handlers)} event triggers")
    
    # ========================================
    # PUBLIC TRIGGER METHODS
    # ========================================
    
    async def trigger_by_incident(self, incident: Dict[str, Any], event_type: str = "created"):
        """Trigger workflows when an incident is created/updated"""
        event_key = f"incident_{event_type}"
        workflow_ids = self.event_handlers.get(event_key, [])
        
        if not workflow_ids:
            return []
        
        print(f"\n🚨 Incident {event_type}: Triggering {len(workflow_ids)} workflows")
        
        trigger_data = {
            "trigger_type": "incident",
            "event_type": event_type,
            "incident": incident,
            "triggered_at": datetime.utcnow().isoformat()
        }
        
        execution_ids = []
        for workflow_id in workflow_ids:
            try:
                exec_id = await self.executor.execute_workflow(workflow_id, trigger_data)
                execution_ids.append(exec_id)
            except Exception as e:
                print(f"   ⚠️ Failed to trigger workflow {workflow_id}: {e}")
        
        return execution_ids
    
    async def trigger_by_alert(self, alert: Dict[str, Any]):
        """Trigger workflows when an alert fires"""
        severity = alert.get("severity", "unknown").lower()
        
        # Try specific severity first, then "all"
        workflow_ids = self.event_handlers.get(f"alert_{severity}", [])
        workflow_ids += self.event_handlers.get("alert_all", [])
        
        if not workflow_ids:
            return []
        
        print(f"\n🔔 Alert received (severity: {severity}): Triggering {len(workflow_ids)} workflows")
        
        trigger_data = {
            "trigger_type": "alert",
            "alert": alert,
            "severity": severity,
            "triggered_at": datetime.utcnow().isoformat()
        }
        
        execution_ids = []
        for workflow_id in set(workflow_ids):  # Dedupe
            try:
                exec_id = await self.executor.execute_workflow(workflow_id, trigger_data)
                execution_ids.append(exec_id)
            except Exception as e:
                print(f"   ⚠️ Failed to trigger workflow {workflow_id}: {e}")
        
        return execution_ids
    
    async def trigger_by_webhook(self, workflow_id: str, payload: Dict[str, Any], headers: Dict[str, str] = {}):
        """Trigger a specific workflow via webhook"""
        print(f"\n🌐 Webhook received for workflow {workflow_id}")
        
        trigger_data = {
            "trigger_type": "webhook",
            "payload": payload,
            "headers": headers,
            "triggered_at": datetime.utcnow().isoformat()
        }
        
        return await self.executor.execute_workflow(workflow_id, trigger_data)
    
    async def trigger_by_event(self, event_name: str, event_data: Dict[str, Any]):
        """Trigger workflows by custom event name"""
        event_key = f"event_{event_name}"
        workflow_ids = self.event_handlers.get(event_key, [])
        
        if not workflow_ids:
            return []
        
        print(f"\n📢 Custom event '{event_name}': Triggering {len(workflow_ids)} workflows")
        
        trigger_data = {
            "trigger_type": "event",
            "event_name": event_name,
            "event_data": event_data,
            "triggered_at": datetime.utcnow().isoformat()
        }
        
        execution_ids = []
        for workflow_id in workflow_ids:
            try:
                exec_id = await self.executor.execute_workflow(workflow_id, trigger_data)
                execution_ids.append(exec_id)
            except Exception as e:
                print(f"   ⚠️ Failed to trigger workflow {workflow_id}: {e}")
        
        return execution_ids
    
    async def trigger_manual(self, workflow_id: str, triggered_by: str = "user", params: Dict[str, Any] = {}):
        """Manually trigger a workflow"""
        print(f"\n👆 Manual trigger: workflow {workflow_id} by {triggered_by}")
        
        trigger_data = {
            "trigger_type": "manual",
            "triggered_by": triggered_by,
            "params": params,
            "triggered_at": datetime.utcnow().isoformat()
        }
        
        return await self.executor.execute_workflow(workflow_id, trigger_data)
    
    # ========================================
    # WORKFLOW MANAGEMENT
    # ========================================
    
    async def reload_triggers(self):
        """Reload all triggers (call after workflow changes)"""
        print("🔄 Reloading triggers...")
        
        # Clear existing
        for job in self.scheduler.get_jobs():
            job.remove()
        self.event_handlers.clear()
        
        # Reload
        await self._load_scheduled_triggers()
        await self._load_event_triggers()
        
        print(f"✅ Triggers reloaded: {len(self.scheduler.get_jobs())} scheduled, {len(self.event_handlers)} event-based")
    
    async def add_workflow_trigger(self, workflow_id: str, name: str, trigger_type: str, trigger_config: Dict):
        """Add a trigger for a new/updated workflow"""
        if trigger_type == "schedule":
            await self._add_scheduled_trigger(workflow_id, name, trigger_config)
        elif trigger_type in ["incident", "alert", "event"]:
            # Just reload event triggers for simplicity
            await self._load_event_triggers()
    
    async def remove_workflow_trigger(self, workflow_id: str):
        """Remove triggers for a deleted/deactivated workflow"""
        job_id = f"workflow_{workflow_id}"
        job = self.scheduler.get_job(job_id)
        if job:
            job.remove()
        
        # Remove from event handlers
        for event_key in list(self.event_handlers.keys()):
            if workflow_id in self.event_handlers[event_key]:
                self.event_handlers[event_key].remove(workflow_id)


# ============================================================
# SINGLETON
# ============================================================

_trigger_manager: Optional[TriggerManager] = None

def get_trigger_manager() -> Optional[TriggerManager]:
    return _trigger_manager

def init_trigger_manager(db_pool: asyncpg.Pool, executor: WorkflowExecutor) -> TriggerManager:
    global _trigger_manager
    _trigger_manager = TriggerManager(db_pool, executor)
    return _trigger_manager
