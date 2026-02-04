"""
Approval Service - Human in the Loop Workflow Control
Manages approval requests, notifications, and timeout handling

🛡️ The safety valve for automated workflows!
"""

import asyncio
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
from enum import Enum

import asyncpg
import httpx

from workflow_executor import get_executor


# ============================================================
# APPROVAL MODELS
# ============================================================

class ApprovalStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


@dataclass
class ApprovalRequest:
    """An approval request waiting for human decision"""
    id: str
    execution_id: str
    workflow_id: str
    workflow_name: str
    node_id: str
    node_label: str
    requested_at: datetime
    expires_at: datetime
    approvers: List[str]
    status: ApprovalStatus
    description: str
    context: Dict[str, Any]
    notification_sent: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    comment: Optional[str] = None


# ============================================================
# APPROVAL SERVICE
# ============================================================

class ApprovalService:
    """
    Manages the human approval workflow:
    - Creates approval requests when workflows hit approval nodes
    - Sends email/Slack notifications to approvers
    - Handles timeout for unresponded approvals
    - Resumes workflow execution after approval/rejection
    """
    
    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool
        self.timeout_tasks: Dict[str, asyncio.Task] = {}
        
        # Notification config
        self.notification_email = "aiops@company.com"
        self.email_api = "http://localhost:8000/api/notifications/email"
    
    async def create_approval_request(
        self,
        execution_id: str,
        workflow_id: str,
        workflow_name: str,
        node_id: str,
        node_label: str,
        approvers: List[str],
        timeout_minutes: int,
        description: str = "",
        context: Dict[str, Any] = {}
    ) -> str:
        """Create a new approval request"""
        
        request_id = str(uuid.uuid4())
        requested_at = datetime.utcnow()
        expires_at = requested_at + timedelta(minutes=timeout_minutes)
        
        async with self.db_pool.acquire() as conn:
            # Check if there's already a pending approval for this execution
            existing = await conn.fetchval('''
                SELECT id FROM approval_requests 
                WHERE execution_id = $1 AND status = 'pending'
            ''', uuid.UUID(execution_id))
            
            if existing:
                print(f"⚠️ Approval request already exists for execution {execution_id}")
                return str(existing)
            
            # Create approval request record
            await conn.execute('''
                INSERT INTO approval_requests
                (id, execution_id, workflow_id, workflow_name, node_id, node_label,
                 requested_at, expires_at, approvers, status, description, context)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ''',
                uuid.UUID(request_id),
                uuid.UUID(execution_id),
                uuid.UUID(workflow_id),
                workflow_name,
                uuid.UUID(node_id),
                node_label,
                requested_at,
                expires_at,
                json.dumps(approvers),
                ApprovalStatus.PENDING.value,
                description,
                json.dumps(context)
            )
        
        print(f"🛡️ Created approval request: {request_id}")
        print(f"   Workflow: {workflow_name}")
        print(f"   Approvers: {approvers}")
        print(f"   Expires: {expires_at}")
        
        # Send notifications
        await self._send_approval_notification(
            request_id=request_id,
            execution_id=execution_id,
            workflow_name=workflow_name,
            node_label=node_label,
            approvers=approvers,
            description=description,
            timeout_minutes=timeout_minutes
        )
        
        # Start timeout task
        await self._start_timeout_task(request_id, timeout_minutes)
        
        return request_id
    
    async def approve(
        self,
        request_id: str,
        approved_by: str,
        comment: Optional[str] = None
    ) -> bool:
        """Approve a pending request"""
        return await self._resolve_request(
            request_id, 
            ApprovalStatus.APPROVED, 
            approved_by, 
            comment
        )
    
    async def reject(
        self,
        request_id: str,
        rejected_by: str,
        reason: Optional[str] = None
    ) -> bool:
        """Reject a pending request"""
        return await self._resolve_request(
            request_id, 
            ApprovalStatus.REJECTED, 
            rejected_by, 
            reason
        )
    
    async def _resolve_request(
        self,
        request_id: str,
        status: ApprovalStatus,
        resolved_by: str,
        comment: Optional[str]
    ) -> bool:
        """Resolve an approval request (approve/reject/timeout)"""
        
        async with self.db_pool.acquire() as conn:
            # Get request
            row = await conn.fetchrow(
                "SELECT * FROM approval_requests WHERE id = $1",
                uuid.UUID(request_id)
            )
            
            if not row:
                print(f"⚠️ Approval request not found: {request_id}")
                return False
            
            if row['status'] != ApprovalStatus.PENDING.value:
                print(f"⚠️ Approval request already resolved: {request_id}")
                return False
            
            # Update request
            await conn.execute('''
                UPDATE approval_requests
                SET status = $1, resolved_at = $2, resolved_by = $3, comment = $4
                WHERE id = $5
            ''',
                status.value,
                datetime.utcnow(),
                resolved_by,
                comment,
                uuid.UUID(request_id)
            )
        
        # Cancel timeout task
        if request_id in self.timeout_tasks:
            self.timeout_tasks[request_id].cancel()
            del self.timeout_tasks[request_id]
        
        print(f"{'✅' if status == ApprovalStatus.APPROVED else '❌'} Approval {status.value}: {request_id}")
        print(f"   By: {resolved_by}")
        if comment:
            print(f"   Comment: {comment}")
        
        # Resume workflow execution
        executor = get_executor()
        if executor:
            await executor.resume_after_approval(
                execution_id=str(row['execution_id']),
                approved=(status == ApprovalStatus.APPROVED),
                approved_by=resolved_by,
                comment=comment
            )
        
        return True
    
    async def _send_approval_notification(
        self,
        request_id: str,
        execution_id: str,
        workflow_name: str,
        node_label: str,
        approvers: List[str],
        description: str,
        timeout_minutes: int
    ):
        """Send notification to approvers"""
        
        # Build approval URL (for dashboard)
        approval_url = f"http://localhost:3000/approvals/{request_id}"
        
        # Build email content
        subject = f"🛡️ Approval Required: {workflow_name}"
        body = f"""
A workflow is waiting for your approval:

**Workflow**: {workflow_name}
**Node**: {node_label}
**Execution ID**: {execution_id}

{description}

This request will timeout in {timeout_minutes} minutes.

**To approve**: [Approve]({approval_url}?action=approve)
**To reject**: [Reject]({approval_url}?action=reject)

Or visit the AIOps Dashboard to review and take action.
"""
        
        try:
            async with httpx.AsyncClient() as client:
                await client.post(
                    self.email_api,
                    json={
                        "to": approvers,
                        "subject": subject,
                        "body": body,
                        "html": True
                    },
                    timeout=10.0
                )
                print(f"   📧 Notification sent to: {approvers}")
        except Exception as e:
            print(f"   ⚠️ Failed to send notification: {e}")
    
    async def _start_timeout_task(self, request_id: str, timeout_minutes: int):
        """Start a task that will timeout the request if not resolved"""
        
        async def timeout_handler():
            await asyncio.sleep(timeout_minutes * 60)
            await self._handle_timeout(request_id)
        
        task = asyncio.create_task(timeout_handler())
        self.timeout_tasks[request_id] = task
    
    async def _handle_timeout(self, request_id: str):
        """Handle an approval request timeout"""
        
        async with self.db_pool.acquire() as conn:
            # Check if still pending
            row = await conn.fetchrow(
                "SELECT * FROM approval_requests WHERE id = $1",
                uuid.UUID(request_id)
            )
            
            if not row or row['status'] != ApprovalStatus.PENDING.value:
                return  # Already resolved
            
            # Mark as timeout
            await conn.execute('''
                UPDATE approval_requests
                SET status = $1, resolved_at = $2, resolved_by = 'system'
                WHERE id = $3
            ''',
                ApprovalStatus.TIMEOUT.value,
                datetime.utcnow(),
                uuid.UUID(request_id)
            )
        
        print(f"⏰ Approval timeout: {request_id}")
        
        # Clean up task
        if request_id in self.timeout_tasks:
            del self.timeout_tasks[request_id]
        
        # Resume workflow with timeout status
        executor = get_executor()
        if executor:
            await executor.resume_after_approval(
                execution_id=str(row['execution_id']),
                approved=False,
                approved_by="system",
                comment="Approval request timed out"
            )
    
    async def get_pending_approvals(self) -> List[Dict[str, Any]]:
        """Get all pending approval requests"""
        
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch('''
                SELECT * FROM approval_requests
                WHERE status = 'pending'
                ORDER BY requested_at DESC
            ''')
            
            return [
                {
                    "id": str(row['id']),
                    "execution_id": str(row['execution_id']),
                    "workflow_id": str(row['workflow_id']),
                    "workflow_name": row['workflow_name'],
                    "node_label": row['node_label'],
                    "requested_at": row['requested_at'].isoformat(),
                    "expires_at": row['expires_at'].isoformat(),
                    "approvers": json.loads(row['approvers']),
                    "description": row['description'],
                    "context": json.loads(row['context']) if row['context'] else {}
                }
                for row in rows
            ]
    
    async def get_approval_history(
        self,
        workflow_id: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get approval history"""
        
        async with self.db_pool.acquire() as conn:
            if workflow_id:
                rows = await conn.fetch('''
                    SELECT * FROM approval_requests
                    WHERE workflow_id = $1
                    ORDER BY requested_at DESC
                    LIMIT $2
                ''', uuid.UUID(workflow_id), limit)
            else:
                rows = await conn.fetch('''
                    SELECT * FROM approval_requests
                    ORDER BY requested_at DESC
                    LIMIT $1
                ''', limit)
            
            return [
                {
                    "id": str(row['id']),
                    "execution_id": str(row['execution_id']),
                    "workflow_id": str(row['workflow_id']),
                    "workflow_name": row['workflow_name'],
                    "node_label": row['node_label'],
                    "requested_at": row['requested_at'].isoformat(),
                    "expires_at": row['expires_at'].isoformat(),
                    "status": row['status'],
                    "resolved_at": row['resolved_at'].isoformat() if row['resolved_at'] else None,
                    "resolved_by": row['resolved_by'],
                    "comment": row['comment']
                }
                for row in rows
            ]


# ============================================================
# SINGLETON
# ============================================================

_approval_service: Optional[ApprovalService] = None

def get_approval_service() -> Optional[ApprovalService]:
    return _approval_service

def init_approval_service(db_pool: asyncpg.Pool) -> ApprovalService:
    global _approval_service
    _approval_service = ApprovalService(db_pool)
    return _approval_service
