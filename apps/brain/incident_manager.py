import os
import uuid
import json
import asyncio
from datetime import datetime
from typing import Dict, List, Optional
import asyncpg

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aiops:aiops_password@localhost:5432/peekaping")

class IncidentManager:
    """
    Manages the lifecycle of incidents:
    Detection -> Logging -> Triage -> Escalation -> Resolution -> RCA
    """
    
    def __init__(self):
        self.db_pool = None
        
    async def initialize(self):
        """Initialize database pool"""
        try:
            self.db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
            await self._ensure_tables()
            print("✅ Incident Manager initialized")
        except Exception as e:
            print(f"❌ Incident Manager initialization error: {e}")
            
    async def run_migrations(self):
         """Run necessary database migrations for incidents"""
         await self._ensure_tables()

    async def _ensure_tables(self):
        """Ensure incident tables exist"""
        async with self.db_pool.acquire() as conn:
            # Upgrade incidents table with new fields for enhanced lifecycle
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS incidents (
                    id UUID PRIMARY KEY,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    title VARCHAR(255) NOT NULL,
                    description TEXT,
                    incident_type VARCHAR(50),
                    severity VARCHAR(20),
                    status VARCHAR(20) DEFAULT 'OPEN',
                    root_cause TEXT,
                    resolution TEXT,
                    closed_at TIMESTAMPTZ,
                    triaged_at TIMESTAMPTZ,
                    escalated_at TIMESTAMPTZ,
                    escalation_level INTEGER DEFAULT 0,
                    last_status_update TIMESTAMPTZ,
                    response_sla_minutes INTEGER,
                    resolution_sla_minutes INTEGER,
                    timeline JSONB DEFAULT '[]'::jsonb,
                    metadata JSONB DEFAULT '{}'::jsonb
                )
            ''')
            
            # Try to add new columns if upgrading existing table
            try:
                await conn.execute('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS incident_type VARCHAR(50)')
                await conn.execute('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ')
                await conn.execute('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ')
                await conn.execute('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0')
                await conn.execute('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS last_status_update TIMESTAMPTZ')
                await conn.execute('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS response_sla_minutes INTEGER')
                await conn.execute('ALTER TABLE incidents ADD COLUMN IF NOT EXISTS resolution_sla_minutes INTEGER')
            except Exception as e:
                # Columns might already exist
                pass
            
    async def create_incident(self, title: str, description: str, severity: str, 
                             source: str = "System", incident_type: str = None,
                             response_sla_minutes: int = None, resolution_sla_minutes: int = None) -> str:
        """Create a new incident"""
        incident_id = str(uuid.uuid4())
        timeline_event = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": "Incident Detected",
            "source": source,
            "details": description
        }
        
        async with self.db_pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO incidents 
                (id, title, description, severity, status, incident_type, 
                 response_sla_minutes, resolution_sla_minutes, timeline, metadata)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ''', uuid.UUID(incident_id), title, description, severity, "DETECTED",
                 incident_type, response_sla_minutes, resolution_sla_minutes,
                 json.dumps([timeline_event]), json.dumps({"source": source}))
            
        print(f"🔥 INCIDENT CREATED: [{severity}] {title} (ID: {incident_id}, Type: {incident_type})")
        return incident_id
        
    async def update_status(self, incident_id: str, status: str, note: str = ""):
        """Update incident status"""
        valid_statuses = ["OPEN", "INVESTIGATING", "MITIGATING", "RESOLVED", "CLOSED"]
        if status not in valid_statuses:
             raise ValueError(f"Invalid status: {status}")
             
        event = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": f"Status changed to {status}",
            "details": note
        }
        
        async with self.db_pool.acquire() as conn:
            # Append to timeline and update status
            await conn.execute('''
                UPDATE incidents 
                SET status = $1,
                    timeline = timeline || $2::jsonb
                WHERE id = $3
            ''', status, json.dumps([event]), uuid.UUID(str(incident_id)))
            
            if status == "CLOSED":
                await conn.execute('UPDATE incidents SET closed_at = NOW() WHERE id = $1', uuid.UUID(str(incident_id)))

    async def add_timeline_event(self, incident_id: str, event: str, details: str = ""):
        """Add a custom event to the timeline"""
        timeline_entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "event": event,
            "details": details
        }
        
        async with self.db_pool.acquire() as conn:
            await conn.execute('''
                UPDATE incidents 
                SET timeline = timeline || $1::jsonb
                WHERE id = $2
            ''', json.dumps([timeline_entry]), uuid.UUID(str(incident_id)))

    async def get_incident(self, incident_id: str) -> Dict:
        """Get incident details"""
        async with self.db_pool.acquire() as conn:
            row = await conn.fetchrow('SELECT * FROM incidents WHERE id = $1', uuid.UUID(str(incident_id)))
            if row:
                return dict(row)
            return None
            
    async def list_incidents(self, active_only: bool = True) -> List[Dict]:
        """List incidents"""
        query = 'SELECT * FROM incidents'
        if active_only:
            query += " WHERE status != 'CLOSED'"
        query += " ORDER BY created_at DESC"
        
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch(query)
            return [dict(r) for r in rows]

    async def generate_rca(self, incident_id: str) -> str:
        """Generate RCA markdown for an incident"""
        incident = await self.get_incident(incident_id)
        if not incident:
            return "Incident not found"
            
        timeline = json.loads(incident.get("timeline", "[]"))
        
        rca = f"""# Root Cause Analysis: {incident['title']}

**Date:** {datetime.utcnow().strftime('%Y-%m-%d')}
**Incident ID:** {incident_id}
**Severity:** {incident['severity']}
**Status:** {incident['status']}

## 1. Incident Summary
{incident['description']}

## 2. Timeline
"""
        for event in timeline:
            dt = datetime.fromisoformat(event['timestamp'])
            rca += f"- **{dt.strftime('%H:%M:%S UTC')}**: {event['event']} - {event.get('details', '')}\n"
            
        rca += f"""
## 3. Root Cause
{incident.get('root_cause') or "To be determined."}

## 4. Resolution
{incident.get('resolution') or "In progress."}

## 5. Corrective Actions
- [ ] Implement fix for root cause
- [ ] Add regression tests
- [ ] Update monitoring thresholds
"""
        return rca

    # ============================================================================
    # ENHANCED LIFECYCLE METHODS
    # ============================================================================
    
    async def triage_incident(self, incident_id: str) -> Dict:
        """
        Automatically triage an incident based on type and severity
        Sets initial response and assigns to on-call
        """
        incident = await self.get_incident(incident_id)
        if not incident:
            return {"success": False, "error": "Incident not found"}
        
        # Update status to OPEN and record triage
        async with self.db_pool.acquire() as conn:
            await conn.execute('''
                UPDATE incidents 
                SET status = 'OPEN', 
                    triaged_at = NOW(),
                    last_status_update = NOW()
                WHERE id = $1
            ''', uuid.UUID(incident_id))
        
        # Add timeline event
        await self.add_timeline_event(
            incident_id, 
            "Incident Triaged",
            f"Auto-triaged as {incident.get('severity')} priority"
        )
        
        print(f"✅ Incident {incident_id} triaged successfully")
        return {"success": True, "incident_id": incident_id}
    
    async def check_escalation(self, incident_id: str) -> Optional[Dict]:
        """
        Check if incident needs escalation based on age and SLA
        Returns escalation recommendation or None
        """
        incident = await self.get_incident(incident_id)
        if not incident or incident['status'] in ['RESOLVED', 'CLOSED']:
            return None
        
        created_at = incident['created_at']
        age_minutes = (datetime.utcnow() - created_at.replace(tzinfo=None)).total_seconds() / 60
        
        current_escalation_level = incident.get('escalation_level', 0)
        incident_type_str = incident.get('incident_type')
        
        if not incident_type_str:
            return None
        
        # Import here to avoid circular dependency
        from incident_types import get_escalation_for_age, IncidentType
        
        try:
            incident_type = IncidentType(incident_type_str)
            escalation_rule = get_escalation_for_age(incident_type, age_minutes)
            
            if escalation_rule and escalation_rule.level > current_escalation_level:
                return {
                    "should_escalate": True,
                    "level": escalation_rule.level,
                    "notify_roles": escalation_rule.notify_roles,
                    "notify_channels": escalation_rule.notify_channels,
                    "age_minutes": age_minutes
                }
        except:
            pass
        
        return None
    
    async def escalate_incident(self, incident_id: str, level: int, reason: str = "") -> bool:
        """Escalate an incident to a higher level"""
        async with self.db_pool.acquire() as conn:
            await conn.execute('''
                UPDATE incidents 
                SET escalation_level = $1,
                    escalated_at = NOW()
                WHERE id = $2
            ''', level, uuid.UUID(incident_id))
        
        await self.add_timeline_event(
            incident_id,
            f"Escalated to Level {level}",
            reason or f"Auto-escalated due to SLA breach"
        )
        
        print(f"📢 Incident {incident_id} escalated to level {level}")
        return True
    
    async def send_status_update(self, incident_id: str, update_text: str = "") -> bool:
        """Send a status update for an incident"""
        incident = await self.get_incident(incident_id)
        if not incident:
            return False
        
        # Update last status update time
        async with self.db_pool.acquire() as conn:
            await conn.execute('''
                UPDATE incidents 
                SET last_status_update = NOW()
                WHERE id = $1
            ''', uuid.UUID(incident_id))
        
        # Add to timeline
        status_text = update_text or f"Status: {incident['status']}"
        await self.add_timeline_event(incident_id, "Status Update", status_text)
        
        return True
    
    async def detect_root_cause(self, incident_id: str, ai_client = None) -> Optional[str]:
        """
        AI-assisted root cause detection
        Analyzes timeline and incident data to suggest root cause
        """
        incident = await self.get_incident(incident_id)
        if not incident:
            return None
        
        timeline = json.loads(incident.get('timeline', '[]'))
        
        # Build context for AI analysis
        timeline_text = "\n".join([
            f"- {event.get('timestamp')}: {event.get('event')} - {event.get('details', '')}"
            for event in timeline
        ])
        
        prompt = f"""Analyze this incident and suggest the root cause:

Incident: {incident['title']}
Description: {incident['description']}
Severity: {incident['severity']}
Type: {incident.get('incident_type', 'Unknown')}

Timeline:
{timeline_text}

Based on the above information, what is the likely root cause? Provide a concise 2-3 sentence analysis."""
        
        if ai_client:
            try:
                response = ai_client.chat.completions.create(
                    model="llama-3.3-70b",
                    messages=[{"role": "user", "content": prompt}],
                    max_tokens=200
                )
                root_cause = response.choices[0].message.content
                
                # Store in incident
                async with self.db_pool.acquire() as conn:
                    await conn.execute('''
                        UPDATE incidents SET root_cause = $1 WHERE id = $2
                    ''', root_cause, uuid.UUID(incident_id))
                
                return root_cause
            except Exception as e:
                print(f"AI root cause detection failed: {e}")
        
        # Fallback: rule-based detection
        return self._rule_based_root_cause(incident, timeline)
    
    def _rule_based_root_cause(self, incident: Dict, timeline: List[Dict]) -> str:
        """Rule-based root cause detection as fallback"""
        incident_type = incident.get('incident_type', '')
        
        root_causes = {
            'site_downtime': "Service failure or infrastructure issue causing complete unavailability",
            'http_5xx_spike': "Application error or database connection issue causing server errors",
            'cdn_failure': "CDN provider degradation or misconfiguration",
            'ddos_attack': "Malicious traffic overwhelming system resources",
            'resource_spike': "Resource leak or unexpected load increase",
            'db_latency': "Database query optimization needed or connection pool exhaustion",
            'page_load_slow': "Frontend resource loading issues or CDN cache miss rate",
            'app_error_spike': "Code bug introduced in recent deployment"
        }
        
        return root_causes.get(incident_type, "Root cause analysis pending")
    
    async def generate_preventive_measures(self, incident_id: str) -> List[str]:
        """Generate preventive measures based on incident type"""
        incident = await self.get_incident(incident_id)
        if not incident:
            return []
        
        incident_type = incident.get('incident_type', '')
        
        measures_map = {
            'site_downtime': [
                "Implement health check monitoring with automated failover",
                "Set up redundant service instances",
                "Configure auto-restart for critical services"
            ],
            'http_5xx_spike': [
                "Add error rate alerting with lower thresholds",
                "Implement automated rollback on error spike detection",
                "Add comprehensive error logging and tracking"
            ],
            'cdn_failure': [
                "Configure multi-CDN failover strategy",
                "Implement origin server direct access fallback",
                "Monitor CDN provider status proactively"
            ],
            'ddos_attack': [
                "Enable permanent rate limiting at multiple layers",
                "Implement IP reputation checking",
                "Configure automated DDoS protection rules"
            ],
            'resource_spike': [
                "Add resource usage trending and anomaly detection",
                "Implement auto-scaling based on resource metrics",
                "Set up automated cleanup of temporary resources"
            ],
            'db_latency': [
                "Add database query performance monitoring",
                "Implement query result caching",
                "Review and optimize slow query patterns"
            ],
            'page_load_slow': [
                "Implement frontend performance budgets",
                "Enable aggressive CDN caching policies",
                "Add performance monitoring for user sessions"
            ],
            'app_error_spike': [
                "Implement canary deployments",
                "Add automated testing for critical paths",
                "Set up error rate gates in deployment pipeline"
            ]
        }
        
        return measures_map.get(incident_type, [
            "Review monitoring coverage for this incident type",
            "Document incident response and update runbooks",
            "Conduct post-mortem with team"
        ])
    
    async def create_followup_tasks(self, incident_id: str) -> List[Dict]:
        """Generate follow-up tasks from RCA"""
        incident = await self.get_incident(incident_id)
        if not incident:
            return []
        
        preventive_measures = await self.generate_preventive_measures(incident_id)
        
        tasks = [
            {
                "title": f"Implement preventive measure: {measure}",
                "description": f"Follow-up from incident {incident_id[:8]}",
                "priority": "medium"
            }
            for measure in preventive_measures
        ]
        
        # Add standard tasks
        tasks.extend([
            {
                "title": "Update incident response runbook",
                "description": f"Document learnings from incident {incident_id[:8]}",
                "priority": "low"
            },
            {
                "title": "Review monitoring thresholds",
                "description": f"Adjust alerting based on incident {incident_id[:8]}",
                "priority": "medium"
            }
        ])
        
        return tasks

# Global instance
incident_manager = IncidentManager()
