"""
Workflow Engine Microservice - Main API
N8N/Zapier-style visual workflow automation for AIOps

Port: 8001
"""

import os
import json
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database import init_db, close_db, get_db
from models import (
    # Workflow models
    WorkflowCreate, WorkflowUpdate, Workflow, WorkflowWithNodes,
    WorkflowListResponse,
    # Node models
    WorkflowNodeCreate, WorkflowNodeUpdate, WorkflowNode,
    # Edge models
    WorkflowEdgeCreate, WorkflowEdge,
    # Execution models
    ExecutionCreate, WorkflowExecution, ExecutionWithNodes,
    ExecutionListResponse, NodeExecution,
    # Approval models
    ApprovalRequest, ApprovalResponse,
    # Template models
    WorkflowTemplate, TemplateListResponse,
    # Response models
    HealthResponse,
    # Enums
    ExecutionStatus, NodeExecutionStatus
)
from node_registry import get_all_nodes, AVAILABLE_PLAYBOOKS
from workflow_executor import init_executor, get_executor, WorkflowExecutor
from trigger_system import init_trigger_manager, get_trigger_manager, TriggerManager
from approval_service import init_approval_service, get_approval_service, ApprovalService
from workflow_templates import init_template_service, get_template_service, TemplateService
from workflow_validation import validate_workflow, ValidationResult

# Phase 5E - Autonomous Triggering System
from confidence_scorer import get_confidence_scorer, calculate_confidence
from safety_guardrails import get_safety_guardrails, init_safety_guardrails
from auto_trigger import get_auto_trigger_manager, init_auto_trigger_manager

# Phase 7A - Real-Time Event Bus
from event_bus import get_event_bus, emit, EventType

load_dotenv()

# ============================================================
# APPLICATION SETUP
# ============================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - startup and shutdown"""
    # Startup
    print("🚀 Starting Workflow Engine...")
    await init_db()
    
    # Initialize all services
    pool = await get_db()
    if pool:
        # Core services
        executor = init_executor(pool)
        trigger_manager = init_trigger_manager(pool, executor)
        await trigger_manager.start()
        
        # Approval service
        init_approval_service(pool)
        
        # Template service + seeding
        template_svc = init_template_service(pool)
        await template_svc.seed_system_templates()
        
        # Phase 5E - Autonomous triggering system
        init_safety_guardrails()
        init_auto_trigger_manager(executor=executor)
        
        print("⚡ Workflow Engine fully initialized")
    
    yield
    
    # Shutdown
    trigger_mgr = get_trigger_manager()
    if trigger_mgr:
        await trigger_mgr.stop()
    await close_db()
    print("👋 Workflow Engine stopped")


app = FastAPI(
    title="Workflow Engine",
    description="N8N/Zapier-style visual workflow automation for AIOps",
    version="1.0.0",
    lifespan=lifespan
)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and mount remediation workflows router (Phase 5A - Visual Workflows)
from remediation_workflows import router as remediation_workflows_router
app.include_router(remediation_workflows_router)


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    pool = await get_db()
    db_status = "connected" if pool else "disconnected"
    return {
        "status": "healthy",
        "service": "workflow-engine",
        "version": "1.0.0",
        "database": db_status
    }


# ============================================================
# WEBSOCKET - REAL-TIME EVENTS (Phase 7A)
# ============================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, channels: str = "global"):
    """
    WebSocket endpoint for real-time event streaming.
    
    Query params:
        channels: Comma-separated list of channels to subscribe to
                  Default: "global"
                  Examples: "global", "issues,alerts", "execution:abc123"
    
    Event Types:
        - execution.* - Workflow execution events
        - issue.* - Issue detection events
        - remediation.* - Remediation events
        - approval.* - Approval workflow events
        - system.* - System health events
    """
    event_bus = get_event_bus()
    channel_list = [c.strip() for c in channels.split(",") if c.strip()]
    
    await event_bus.connections.connect(websocket, channel_list)
    
    try:
        while True:
            # Handle incoming messages from client
            data = await websocket.receive_json()
            
            # Handle subscribe/unsubscribe commands
            if data.get("action") == "subscribe":
                channel = data.get("channel")
                if channel:
                    await event_bus.connections.subscribe(websocket, channel)
                    await websocket.send_json({
                        "type": "subscribed",
                        "channel": channel
                    })
            
            elif data.get("action") == "unsubscribe":
                channel = data.get("channel")
                if channel:
                    await event_bus.connections.unsubscribe(websocket, channel)
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "channel": channel
                    })
            
            elif data.get("action") == "ping":
                await websocket.send_json({"type": "pong"})
            
            elif data.get("action") == "get_history":
                event_type = data.get("event_type")
                channel = data.get("channel")
                limit = data.get("limit", 50)
                history = event_bus.get_history(event_type, channel, limit)
                await websocket.send_json({
                    "type": "history",
                    "events": history
                })
    
    except WebSocketDisconnect:
        await event_bus.connections.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await event_bus.connections.disconnect(websocket)


@app.get("/api/events/stats")
async def get_event_stats():
    """Get event bus statistics."""
    event_bus = get_event_bus()
    return event_bus.get_stats()


@app.get("/api/events/history")
async def get_event_history(
    event_type: Optional[str] = None,
    channel: Optional[str] = None,
    limit: int = Query(50, le=200)
):
    """Get recent event history."""
    event_bus = get_event_bus()
    return {
        "events": event_bus.get_history(event_type, channel, limit),
        "total": len(event_bus.get_history())
    }


@app.post("/api/events/emit")
async def emit_test_event(
    event_type: str = "test.event",
    message: str = "Test event",
    channel: str = "global"
):
    """Emit a test event (for debugging)."""
    event = await emit(
        event_type,
        {"message": message, "timestamp": datetime.now().isoformat()},
        channel=channel
    )
    return {"success": True, "event_id": event.event_id}


# ============================================================
# WORKFLOW CRUD
# ============================================================

@app.get("/api/workflows", response_model=WorkflowListResponse)
async def list_workflows(
    active_only: bool = Query(False, description="Only show active workflows"),
    limit: int = Query(50, le=100),
    offset: int = Query(0)
):
    """List all workflows"""
    pool = await get_db()
    async with pool.acquire() as conn:
        # Build query
        query = "SELECT * FROM workflows"
        if active_only:
            query += " WHERE is_active = TRUE"
        query += " ORDER BY updated_at DESC LIMIT $1 OFFSET $2"
        
        rows = await conn.fetch(query, limit, offset)
        
        # Get total count
        count_query = "SELECT COUNT(*) FROM workflows"
        if active_only:
            count_query += " WHERE is_active = TRUE"
        total = await conn.fetchval(count_query)
        
        workflows = [
            Workflow(
                id=str(row['id']),
                name=row['name'],
                description=row['description'],
                trigger_type=row['trigger_type'],
                trigger_config=json.loads(row['trigger_config']) if row['trigger_config'] else {},
                is_active=row['is_active'],
                created_at=row['created_at'],
                updated_at=row['updated_at'],
                created_by=row['created_by'],
                version=row['version']
            )
            for row in rows
        ]
        
        return WorkflowListResponse(workflows=workflows, total=total)


@app.post("/api/workflows", response_model=WorkflowWithNodes, status_code=201)
async def create_workflow(workflow: WorkflowCreate):
    """Create a new workflow with nodes and edges"""
    pool = await get_db()
    workflow_id = str(uuid.uuid4())
    
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Create workflow
            await conn.execute('''
                INSERT INTO workflows (id, name, description, trigger_type, trigger_config, is_active, created_by)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            ''', 
                uuid.UUID(workflow_id),
                workflow.name,
                workflow.description,
                workflow.trigger_type.value,
                json.dumps(workflow.trigger_config),
                workflow.is_active,
                "system"
            )
            
            # Create a mapping from temp IDs to real IDs for edges
            node_id_map = {}
            created_nodes = []
            
            # Create nodes
            for i, node in enumerate(workflow.nodes):
                node_id = str(uuid.uuid4())
                temp_id = f"node_{i}"  # Temporary ID for mapping
                node_id_map[temp_id] = node_id
                
                await conn.execute('''
                    INSERT INTO workflow_nodes 
                    (id, workflow_id, node_type, node_subtype, label, position_x, position_y, config, is_start_node)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ''',
                    uuid.UUID(node_id),
                    uuid.UUID(workflow_id),
                    node.node_type.value,
                    node.node_subtype,
                    node.label,
                    node.position_x,
                    node.position_y,
                    json.dumps(node.config),
                    node.is_start_node
                )
                
                created_nodes.append(WorkflowNode(
                    id=node_id,
                    workflow_id=workflow_id,
                    node_type=node.node_type.value,
                    node_subtype=node.node_subtype,
                    label=node.label,
                    position_x=node.position_x,
                    position_y=node.position_y,
                    config=node.config,
                    is_start_node=node.is_start_node,
                    created_at=datetime.utcnow()
                ))
            
            # Create edges (if provided, they should reference the created node IDs)
            created_edges = []
            for edge in workflow.edges:
                edge_id = str(uuid.uuid4())
                
                await conn.execute('''
                    INSERT INTO workflow_edges 
                    (id, workflow_id, source_node_id, target_node_id, source_handle, condition)
                    VALUES ($1, $2, $3, $4, $5, $6)
                ''',
                    uuid.UUID(edge_id),
                    uuid.UUID(workflow_id),
                    uuid.UUID(edge.source_node_id),
                    uuid.UUID(edge.target_node_id),
                    edge.source_handle,
                    json.dumps(edge.condition) if edge.condition else None
                )
                
                created_edges.append(WorkflowEdge(
                    id=edge_id,
                    workflow_id=workflow_id,
                    source_node_id=edge.source_node_id,
                    target_node_id=edge.target_node_id,
                    source_handle=edge.source_handle,
                    condition=edge.condition,
                    created_at=datetime.utcnow()
                ))
            
            print(f"✅ Created workflow: {workflow.name} ({workflow_id})")
            
            return WorkflowWithNodes(
                id=workflow_id,
                name=workflow.name,
                description=workflow.description,
                trigger_type=workflow.trigger_type.value,
                trigger_config=workflow.trigger_config,
                is_active=workflow.is_active,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
                created_by="system",
                version=1,
                nodes=created_nodes,
                edges=created_edges
            )


@app.get("/api/workflows/{workflow_id}", response_model=WorkflowWithNodes)
async def get_workflow(workflow_id: str):
    """Get a workflow with all nodes and edges"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Get workflow
        row = await conn.fetchrow(
            "SELECT * FROM workflows WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        
        if not row:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        # Get nodes
        node_rows = await conn.fetch(
            "SELECT * FROM workflow_nodes WHERE workflow_id = $1 ORDER BY created_at",
            uuid.UUID(workflow_id)
        )
        
        nodes = [
            WorkflowNode(
                id=str(n['id']),
                workflow_id=str(n['workflow_id']),
                node_type=n['node_type'],
                node_subtype=n['node_subtype'],
                label=n['label'],
                position_x=n['position_x'],
                position_y=n['position_y'],
                config=json.loads(n['config']) if n['config'] else {},
                is_start_node=n['is_start_node'],
                created_at=n['created_at']
            )
            for n in node_rows
        ]
        
        # Get edges
        edge_rows = await conn.fetch(
            "SELECT * FROM workflow_edges WHERE workflow_id = $1",
            uuid.UUID(workflow_id)
        )
        
        edges = [
            WorkflowEdge(
                id=str(e['id']),
                workflow_id=str(e['workflow_id']),
                source_node_id=str(e['source_node_id']),
                target_node_id=str(e['target_node_id']),
                source_handle=e['source_handle'],
                condition=json.loads(e['condition']) if e['condition'] else None,
                created_at=e['created_at']
            )
            for e in edge_rows
        ]
        
        return WorkflowWithNodes(
            id=str(row['id']),
            name=row['name'],
            description=row['description'],
            trigger_type=row['trigger_type'],
            trigger_config=json.loads(row['trigger_config']) if row['trigger_config'] else {},
            is_active=row['is_active'],
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            created_by=row['created_by'],
            version=row['version'],
            nodes=nodes,
            edges=edges
        )


@app.put("/api/workflows/{workflow_id}", response_model=Workflow)
async def update_workflow(workflow_id: str, workflow: WorkflowUpdate):
    """Update a workflow"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Check exists
        exists = await conn.fetchval(
            "SELECT 1 FROM workflows WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        # Build update query dynamically
        updates = []
        values = []
        param_num = 1
        
        if workflow.name is not None:
            updates.append(f"name = ${param_num}")
            values.append(workflow.name)
            param_num += 1
            
        if workflow.description is not None:
            updates.append(f"description = ${param_num}")
            values.append(workflow.description)
            param_num += 1
            
        if workflow.trigger_type is not None:
            updates.append(f"trigger_type = ${param_num}")
            values.append(workflow.trigger_type.value)
            param_num += 1
            
        if workflow.trigger_config is not None:
            updates.append(f"trigger_config = ${param_num}")
            values.append(json.dumps(workflow.trigger_config))
            param_num += 1
            
        if workflow.is_active is not None:
            updates.append(f"is_active = ${param_num}")
            values.append(workflow.is_active)
            param_num += 1
        
        # Always update timestamp and version
        updates.append("updated_at = NOW()")
        updates.append("version = version + 1")
        
        if updates:
            values.append(uuid.UUID(workflow_id))
            query = f"UPDATE workflows SET {', '.join(updates)} WHERE id = ${param_num} RETURNING *"
            row = await conn.fetchrow(query, *values)
            
            return Workflow(
                id=str(row['id']),
                name=row['name'],
                description=row['description'],
                trigger_type=row['trigger_type'],
                trigger_config=json.loads(row['trigger_config']) if row['trigger_config'] else {},
                is_active=row['is_active'],
                created_at=row['created_at'],
                updated_at=row['updated_at'],
                created_by=row['created_by'],
                version=row['version']
            )


@app.delete("/api/workflows/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a workflow and all its nodes/edges"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Cascading delete handles nodes and edges
        result = await conn.execute(
            "DELETE FROM workflows WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        print(f"🗑️ Deleted workflow: {workflow_id}")
        return {"success": True, "message": "Workflow deleted"}


# ============================================================
# NODE CRUD
# ============================================================

@app.post("/api/workflows/{workflow_id}/nodes", response_model=WorkflowNode, status_code=201)
async def add_node(workflow_id: str, node: WorkflowNodeCreate):
    """Add a node to a workflow"""
    pool = await get_db()
    node_id = str(uuid.uuid4())
    
    async with pool.acquire() as conn:
        # Verify workflow exists
        exists = await conn.fetchval(
            "SELECT 1 FROM workflows WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        await conn.execute('''
            INSERT INTO workflow_nodes 
            (id, workflow_id, node_type, node_subtype, label, position_x, position_y, config, is_start_node)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ''',
            uuid.UUID(node_id),
            uuid.UUID(workflow_id),
            node.node_type.value,
            node.node_subtype,
            node.label,
            node.position_x,
            node.position_y,
            json.dumps(node.config),
            node.is_start_node
        )
        
        # Update workflow timestamp
        await conn.execute(
            "UPDATE workflows SET updated_at = NOW() WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        
        return WorkflowNode(
            id=node_id,
            workflow_id=workflow_id,
            node_type=node.node_type.value,
            node_subtype=node.node_subtype,
            label=node.label,
            position_x=node.position_x,
            position_y=node.position_y,
            config=node.config,
            is_start_node=node.is_start_node,
            created_at=datetime.utcnow()
        )


@app.put("/api/nodes/{node_id}", response_model=WorkflowNode)
async def update_node(node_id: str, node: WorkflowNodeUpdate):
    """Update a node"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Get current node
        row = await conn.fetchrow(
            "SELECT * FROM workflow_nodes WHERE id = $1",
            uuid.UUID(node_id)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Build update
        updates = []
        values = []
        param_num = 1
        
        if node.label is not None:
            updates.append(f"label = ${param_num}")
            values.append(node.label)
            param_num += 1
            
        if node.position_x is not None:
            updates.append(f"position_x = ${param_num}")
            values.append(node.position_x)
            param_num += 1
            
        if node.position_y is not None:
            updates.append(f"position_y = ${param_num}")
            values.append(node.position_y)
            param_num += 1
            
        if node.config is not None:
            updates.append(f"config = ${param_num}")
            values.append(json.dumps(node.config))
            param_num += 1
            
        if node.is_start_node is not None:
            updates.append(f"is_start_node = ${param_num}")
            values.append(node.is_start_node)
            param_num += 1
        
        if updates:
            values.append(uuid.UUID(node_id))
            query = f"UPDATE workflow_nodes SET {', '.join(updates)} WHERE id = ${param_num} RETURNING *"
            updated = await conn.fetchrow(query, *values)
            
            # Update workflow timestamp
            await conn.execute(
                "UPDATE workflows SET updated_at = NOW() WHERE id = $1",
                updated['workflow_id']
            )
            
            return WorkflowNode(
                id=str(updated['id']),
                workflow_id=str(updated['workflow_id']),
                node_type=updated['node_type'],
                node_subtype=updated['node_subtype'],
                label=updated['label'],
                position_x=updated['position_x'],
                position_y=updated['position_y'],
                config=json.loads(updated['config']) if updated['config'] else {},
                is_start_node=updated['is_start_node'],
                created_at=updated['created_at']
            )
        
        raise HTTPException(status_code=400, detail="No fields to update")


@app.delete("/api/nodes/{node_id}")
async def delete_node(node_id: str):
    """Delete a node"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Get workflow ID first
        row = await conn.fetchrow(
            "SELECT workflow_id FROM workflow_nodes WHERE id = $1",
            uuid.UUID(node_id)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Node not found")
        
        # Delete node (edges cascade)
        await conn.execute(
            "DELETE FROM workflow_nodes WHERE id = $1",
            uuid.UUID(node_id)
        )
        
        # Update workflow timestamp
        await conn.execute(
            "UPDATE workflows SET updated_at = NOW() WHERE id = $1",
            row['workflow_id']
        )
        
        return {"success": True, "message": "Node deleted"}


# ============================================================
# EDGE CRUD
# ============================================================

@app.post("/api/workflows/{workflow_id}/edges", response_model=WorkflowEdge, status_code=201)
async def add_edge(workflow_id: str, edge: WorkflowEdgeCreate):
    """Add an edge between nodes"""
    pool = await get_db()
    edge_id = str(uuid.uuid4())
    
    async with pool.acquire() as conn:
        # Verify workflow and nodes exist
        exists = await conn.fetchval(
            "SELECT 1 FROM workflows WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        if not exists:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        source_exists = await conn.fetchval(
            "SELECT 1 FROM workflow_nodes WHERE id = $1 AND workflow_id = $2",
            uuid.UUID(edge.source_node_id), uuid.UUID(workflow_id)
        )
        target_exists = await conn.fetchval(
            "SELECT 1 FROM workflow_nodes WHERE id = $1 AND workflow_id = $2",
            uuid.UUID(edge.target_node_id), uuid.UUID(workflow_id)
        )
        
        if not source_exists or not target_exists:
            raise HTTPException(status_code=400, detail="Source or target node not found in workflow")
        
        await conn.execute('''
            INSERT INTO workflow_edges 
            (id, workflow_id, source_node_id, target_node_id, source_handle, condition)
            VALUES ($1, $2, $3, $4, $5, $6)
        ''',
            uuid.UUID(edge_id),
            uuid.UUID(workflow_id),
            uuid.UUID(edge.source_node_id),
            uuid.UUID(edge.target_node_id),
            edge.source_handle,
            json.dumps(edge.condition) if edge.condition else None
        )
        
        # Update workflow timestamp
        await conn.execute(
            "UPDATE workflows SET updated_at = NOW() WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        
        return WorkflowEdge(
            id=edge_id,
            workflow_id=workflow_id,
            source_node_id=edge.source_node_id,
            target_node_id=edge.target_node_id,
            source_handle=edge.source_handle,
            condition=edge.condition,
            created_at=datetime.utcnow()
        )


@app.delete("/api/edges/{edge_id}")
async def delete_edge(edge_id: str):
    """Delete an edge"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        result = await conn.execute(
            "DELETE FROM workflow_edges WHERE id = $1",
            uuid.UUID(edge_id)
        )
        
        if result == "DELETE 0":
            raise HTTPException(status_code=404, detail="Edge not found")
        
        return {"success": True, "message": "Edge deleted"}


# ============================================================
# EXECUTION ENDPOINTS
# ============================================================

@app.post("/api/workflows/{workflow_id}/execute", response_model=WorkflowExecution)
async def execute_workflow(
    workflow_id: str, 
    body: ExecutionCreate,
    background_tasks: BackgroundTasks
):
    """Start workflow execution (async - runs in background)"""
    pool = await get_db()
    executor = get_executor()
    
    if not executor:
        raise HTTPException(status_code=503, detail="Executor not initialized")
    
    async with pool.acquire() as conn:
        # Get workflow
        workflow = await conn.fetchrow(
            "SELECT * FROM workflows WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
    
    # Create execution ID upfront
    execution_id = str(uuid.uuid4())
    
    # Execute workflow in background
    async def run_workflow():
        try:
            await executor.execute_workflow(
                workflow_id=workflow_id,
                trigger_data=body.trigger_data,
                execution_id=execution_id
            )
        except Exception as e:
            print(f"❌ Background execution failed: {e}")
    
    # Start background task
    import asyncio
    asyncio.create_task(run_workflow())
    
    print(f"▶️ Started execution: {execution_id} for workflow: {workflow['name']}")
    
    return WorkflowExecution(
        id=execution_id,
        workflow_id=workflow_id,
        workflow_name=workflow['name'],
        trigger_data=body.trigger_data,
        status=ExecutionStatus.RUNNING.value,
        started_at=datetime.utcnow(),
        completed_at=None,
        current_node_id=None,
        execution_log=[{
            "timestamp": datetime.utcnow().isoformat(),
            "event": "Execution started",
            "details": body.trigger_data
        }],
        error_message=None
    )


@app.get("/api/workflows/{workflow_id}/executions", response_model=ExecutionListResponse)
async def list_executions(
    workflow_id: str,
    limit: int = Query(20, le=100),
    status: Optional[str] = None
):
    """Get execution history for a workflow"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        query = "SELECT * FROM workflow_executions WHERE workflow_id = $1"
        params = [uuid.UUID(workflow_id)]
        
        if status:
            query += " AND status = $2"
            params.append(status)
        
        query += " ORDER BY started_at DESC LIMIT $" + str(len(params) + 1)
        params.append(limit)
        
        rows = await conn.fetch(query, *params)
        
        executions = [
            WorkflowExecution(
                id=str(row['id']),
                workflow_id=str(row['workflow_id']) if row['workflow_id'] else None,
                workflow_name=row['workflow_name'],
                trigger_data=json.loads(row['trigger_data']) if row['trigger_data'] else {},
                status=row['status'],
                started_at=row['started_at'],
                completed_at=row['completed_at'],
                current_node_id=str(row['current_node_id']) if row['current_node_id'] else None,
                execution_log=json.loads(row['execution_log']) if row['execution_log'] else [],
                error_message=row['error_message']
            )
            for row in rows
        ]
        
        return ExecutionListResponse(executions=executions, total=len(executions))


@app.get("/api/executions/{execution_id}", response_model=ExecutionWithNodes)
async def get_execution(execution_id: str):
    """Get detailed execution status with node results"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Get execution
        row = await conn.fetchrow(
            "SELECT * FROM workflow_executions WHERE id = $1",
            uuid.UUID(execution_id)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Execution not found")
        
        # Get node executions
        node_rows = await conn.fetch(
            "SELECT * FROM node_executions WHERE execution_id = $1 ORDER BY started_at",
            uuid.UUID(execution_id)
        )
        
        node_executions = [
            NodeExecution(
                id=str(n['id']),
                execution_id=str(n['execution_id']),
                node_id=str(n['node_id']) if n['node_id'] else None,
                node_type=n['node_type'],
                node_label=n['node_label'],
                status=n['status'],
                started_at=n['started_at'],
                completed_at=n['completed_at'],
                input_data=json.loads(n['input_data']) if n['input_data'] else {},
                output_data=json.loads(n['output_data']) if n['output_data'] else {},
                error_message=n['error_message']
            )
            for n in node_rows
        ]
        
        return ExecutionWithNodes(
            id=str(row['id']),
            workflow_id=str(row['workflow_id']) if row['workflow_id'] else None,
            workflow_name=row['workflow_name'],
            trigger_data=json.loads(row['trigger_data']) if row['trigger_data'] else {},
            status=row['status'],
            started_at=row['started_at'],
            completed_at=row['completed_at'],
            current_node_id=str(row['current_node_id']) if row['current_node_id'] else None,
            execution_log=json.loads(row['execution_log']) if row['execution_log'] else [],
            error_message=row['error_message'],
            node_executions=node_executions
        )


# ============================================================
# APPROVAL ENDPOINTS
# ============================================================

@app.get("/api/pending-approvals", response_model=ExecutionListResponse)
async def get_pending_approvals():
    """Get all executions waiting for approval"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM workflow_executions WHERE status = $1 ORDER BY started_at DESC",
            ExecutionStatus.WAITING_APPROVAL.value
        )
        
        executions = [
            WorkflowExecution(
                id=str(row['id']),
                workflow_id=str(row['workflow_id']) if row['workflow_id'] else None,
                workflow_name=row['workflow_name'],
                trigger_data=json.loads(row['trigger_data']) if row['trigger_data'] else {},
                status=row['status'],
                started_at=row['started_at'],
                completed_at=row['completed_at'],
                current_node_id=str(row['current_node_id']) if row['current_node_id'] else None,
                execution_log=json.loads(row['execution_log']) if row['execution_log'] else [],
                error_message=row['error_message']
            )
            for row in rows
        ]
        
        return ExecutionListResponse(executions=executions, total=len(executions))


@app.post("/api/executions/{execution_id}/approve", response_model=ApprovalResponse)
async def approve_execution(execution_id: str, body: ApprovalRequest):
    """Approve an execution gate and continue"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Get execution
        row = await conn.fetchrow(
            "SELECT * FROM workflow_executions WHERE id = $1",
            uuid.UUID(execution_id)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Execution not found")
        
        if row['status'] != ExecutionStatus.WAITING_APPROVAL.value:
            raise HTTPException(status_code=400, detail="Execution is not waiting for approval")
        
        # Update log
        execution_log = json.loads(row['execution_log']) if row['execution_log'] else []
        execution_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "event": "Approved",
            "approver": body.approver,
            "comment": body.comment
        })
        
        # Update status to running
        await conn.execute('''
            UPDATE workflow_executions 
            SET status = $1, execution_log = $2
            WHERE id = $3
        ''',
            ExecutionStatus.RUNNING.value,
            json.dumps(execution_log),
            uuid.UUID(execution_id)
        )
        
        print(f"✅ Approved execution: {execution_id} by {body.approver}")
        
        # TODO: In Phase 4, this will resume execution
        
        return ApprovalResponse(
            success=True,
            execution_id=execution_id,
            status="running",
            message=f"Approved by {body.approver}"
        )


@app.post("/api/executions/{execution_id}/reject", response_model=ApprovalResponse)
async def reject_execution(execution_id: str, body: ApprovalRequest):
    """Reject an execution gate and stop"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Get execution
        row = await conn.fetchrow(
            "SELECT * FROM workflow_executions WHERE id = $1",
            uuid.UUID(execution_id)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Execution not found")
        
        if row['status'] != ExecutionStatus.WAITING_APPROVAL.value:
            raise HTTPException(status_code=400, detail="Execution is not waiting for approval")
        
        # Update log
        execution_log = json.loads(row['execution_log']) if row['execution_log'] else []
        execution_log.append({
            "timestamp": datetime.utcnow().isoformat(),
            "event": "Rejected",
            "approver": body.approver,
            "comment": body.comment
        })
        
        # Update status to cancelled
        await conn.execute('''
            UPDATE workflow_executions 
            SET status = $1, execution_log = $2, completed_at = NOW(), error_message = $3
            WHERE id = $4
        ''',
            ExecutionStatus.CANCELLED.value,
            json.dumps(execution_log),
            f"Rejected by {body.approver}: {body.comment or 'No reason given'}",
            uuid.UUID(execution_id)
        )
        
        print(f"❌ Rejected execution: {execution_id} by {body.approver}")
        
        return ApprovalResponse(
            success=True,
            execution_id=execution_id,
            status="cancelled",
            message=f"Rejected by {body.approver}"
        )


# ============================================================
# TEMPLATE ENDPOINTS
# ============================================================

@app.get("/api/templates", response_model=TemplateListResponse)
async def list_templates(category: Optional[str] = None):
    """List workflow templates"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        query = "SELECT * FROM workflow_templates"
        params = []
        
        if category:
            query += " WHERE category = $1"
            params.append(category)
        
        query += " ORDER BY name"
        
        rows = await conn.fetch(query, *params) if params else await conn.fetch(query)
        
        templates = [
            WorkflowTemplate(
                id=str(row['id']),
                name=row['name'],
                description=row['description'],
                category=row['category'],
                template_data=json.loads(row['template_data']) if row['template_data'] else {},
                is_system=row['is_system'],
                created_at=row['created_at']
            )
            for row in rows
        ]
        
        return TemplateListResponse(templates=templates, total=len(templates))


@app.post("/api/templates/{template_id}/create-workflow", response_model=WorkflowWithNodes)
async def create_from_template(template_id: str, name: str = Query(...)):
    """Create a workflow from a template"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Get template
        row = await conn.fetchrow(
            "SELECT * FROM workflow_templates WHERE id = $1",
            uuid.UUID(template_id)
        )
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        
        template_data = json.loads(row['template_data']) if row['template_data'] else {}
        
        # Create workflow from template data
        workflow_create = WorkflowCreate(
            name=name,
            description=row['description'],
            trigger_type=template_data.get('trigger_type', 'manual'),
            trigger_config=template_data.get('trigger_config', {}),
            is_active=False,
            nodes=[WorkflowNodeCreate(**n) for n in template_data.get('nodes', [])],
            edges=[WorkflowEdgeCreate(**e) for e in template_data.get('edges', [])]
        )
        
        return await create_workflow(workflow_create)


# ============================================================
# NODE REGISTRY ENDPOINTS
# ============================================================

@app.get("/api/node-types")
async def get_node_types():
    """Get all available node types for the workflow builder"""
    nodes = get_all_nodes()
    return {
        "nodes": nodes,
        "categories": ["trigger", "action", "flow"],
        "total": len(nodes)
    }


@app.get("/api/playbooks")
async def get_playbooks():
    """Get all available Ansible playbooks"""
    return {
        "playbooks": AVAILABLE_PLAYBOOKS,
        "total": len(AVAILABLE_PLAYBOOKS)
    }


# ============================================================
# TRIGGER ENDPOINTS
# ============================================================

@app.post("/api/webhook/{workflow_id}")
async def webhook_trigger(workflow_id: str, request: Request):
    """Webhook endpoint to trigger a specific workflow"""
    trigger_mgr = get_trigger_manager()
    if not trigger_mgr:
        raise HTTPException(status_code=503, detail="Trigger manager not initialized")
    
    try:
        body = await request.json()
    except:
        body = {}
    
    headers = dict(request.headers)
    
    execution_id = await trigger_mgr.trigger_by_webhook(workflow_id, body, headers)
    
    return {
        "success": True,
        "execution_id": execution_id,
        "message": f"Workflow {workflow_id} triggered via webhook"
    }


@app.post("/api/trigger/incident")
async def trigger_by_incident(incident: Dict[str, Any], event_type: str = "created"):
    """Trigger workflows when an incident occurs (called by Brain API)"""
    trigger_mgr = get_trigger_manager()
    if not trigger_mgr:
        raise HTTPException(status_code=503, detail="Trigger manager not initialized")
    
    execution_ids = await trigger_mgr.trigger_by_incident(incident, event_type)
    
    return {
        "success": True,
        "execution_ids": execution_ids,
        "workflows_triggered": len(execution_ids)
    }


@app.post("/api/trigger/alert")
async def trigger_by_alert(alert: Dict[str, Any]):
    """Trigger workflows when an alert fires (called by monitoring systems)"""
    trigger_mgr = get_trigger_manager()
    if not trigger_mgr:
        raise HTTPException(status_code=503, detail="Trigger manager not initialized")
    
    execution_ids = await trigger_mgr.trigger_by_alert(alert)
    
    return {
        "success": True,
        "execution_ids": execution_ids,
        "workflows_triggered": len(execution_ids)
    }


@app.post("/api/trigger/event/{event_name}")
async def trigger_by_event(event_name: str, event_data: Dict[str, Any] = {}):
    """Trigger workflows by custom event name"""
    trigger_mgr = get_trigger_manager()
    if not trigger_mgr:
        raise HTTPException(status_code=503, detail="Trigger manager not initialized")
    
    execution_ids = await trigger_mgr.trigger_by_event(event_name, event_data)
    
    return {
        "success": True,
        "execution_ids": execution_ids,
        "workflows_triggered": len(execution_ids)
    }


@app.post("/api/trigger/reload")
async def reload_triggers():
    """Reload all workflow triggers (call after workflow changes)"""
    trigger_mgr = get_trigger_manager()
    if not trigger_mgr:
        raise HTTPException(status_code=503, detail="Trigger manager not initialized")
    
    await trigger_mgr.reload_triggers()
    
    return {
        "success": True,
        "message": "Triggers reloaded"
    }


# ============================================================
# VALIDATION ENDPOINT
# ============================================================

@app.post("/api/workflows/validate")
async def validate_workflow_endpoint(
    nodes: List[Dict[str, Any]],
    edges: List[Dict[str, Any]],
    workflow_name: str = "Workflow"
):
    """Validate a workflow before saving or executing"""
    result = validate_workflow(nodes, edges, workflow_name)
    return result.to_dict()


@app.get("/api/workflows/{workflow_id}/validate")
async def validate_saved_workflow(workflow_id: str):
    """Validate an existing workflow"""
    pool = await get_db()
    
    async with pool.acquire() as conn:
        # Get nodes
        nodes = await conn.fetch(
            "SELECT * FROM workflow_nodes WHERE workflow_id = $1",
            uuid.UUID(workflow_id)
        )
        
        # Get edges
        edges = await conn.fetch(
            "SELECT * FROM workflow_edges WHERE workflow_id = $1",
            uuid.UUID(workflow_id)
        )
        
        # Get workflow name
        workflow = await conn.fetchrow(
            "SELECT name FROM workflows WHERE id = $1",
            uuid.UUID(workflow_id)
        )
        
        if not workflow:
            raise HTTPException(status_code=404, detail="Workflow not found")
        
        # Convert to dicts
        node_list = [dict(n) for n in nodes]
        edge_list = [dict(e) for e in edges]
        
        result = validate_workflow(node_list, edge_list, workflow["name"])
        return result.to_dict()


# ============================================================
# APPROVAL SERVICE ENDPOINTS
# ============================================================

@app.get("/api/approvals/pending")
async def get_pending_approvals():
    """Get all pending approval requests"""
    approval_svc = get_approval_service()
    if not approval_svc:
        raise HTTPException(status_code=503, detail="Approval service not initialized")
    
    approvals = await approval_svc.get_pending_approvals()
    return {"approvals": approvals, "count": len(approvals)}


@app.post("/api/approvals/{request_id}/approve")
async def approve_request(
    request_id: str,
    approved_by: str = "admin",
    comment: Optional[str] = None
):
    """Approve a pending approval request"""
    approval_svc = get_approval_service()
    if not approval_svc:
        raise HTTPException(status_code=503, detail="Approval service not initialized")
    
    success = await approval_svc.approve(request_id, approved_by, comment)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to approve - request may not exist or already resolved")
    
    return {"success": True, "message": "Request approved, workflow resuming"}


@app.post("/api/approvals/{request_id}/reject")
async def reject_request(
    request_id: str,
    rejected_by: str = "admin",
    reason: Optional[str] = None
):
    """Reject a pending approval request"""
    approval_svc = get_approval_service()
    if not approval_svc:
        raise HTTPException(status_code=503, detail="Approval service not initialized")
    
    success = await approval_svc.reject(request_id, rejected_by, reason)
    
    if not success:
        raise HTTPException(status_code=400, detail="Failed to reject - request may not exist or already resolved")
    
    return {"success": True, "message": "Request rejected, workflow continuing on rejection path"}


@app.get("/api/approvals/history")
async def get_approval_history(
    workflow_id: Optional[str] = None,
    limit: int = Query(50, le=100)
):
    """Get approval history"""
    approval_svc = get_approval_service()
    if not approval_svc:
        raise HTTPException(status_code=503, detail="Approval service not initialized")
    
    history = await approval_svc.get_approval_history(workflow_id, limit)
    return {"history": history, "count": len(history)}


# ============================================================
# ISSUE DETECTION ENGINE API
# The brain that watches everything and suggests remediation
# ============================================================

from issue_detector import (
    get_detector, 
    IssueDetector, 
    Severity, 
    Category, 
    IssueStatus
)


@app.get("/api/issues")
async def list_issues(
    severity: Optional[str] = Query(None, description="Filter by severity: P0_CRITICAL, P1_HIGH, P2_MEDIUM, P3_LOW"),
    category: Optional[str] = Query(None, description="Filter by category: compute, storage, network, application, security, container, compliance, business"),
    limit: int = Query(100, le=500)
):
    """
    🔍 List all active (non-resolved) issues.
    Returns issues sorted by severity (P0 first) then by detection time.
    """
    detector = get_detector()
    
    # Parse filters
    sev_filter = None
    if severity:
        try:
            sev_filter = Severity[severity]
        except KeyError:
            raise HTTPException(status_code=400, detail=f"Invalid severity: {severity}")
    
    cat_filter = None
    if category:
        try:
            cat_filter = Category(category.lower())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    
    issues = detector.get_active_issues(severity=sev_filter, category=cat_filter, limit=limit)
    
    return {
        "issues": [issue.to_dict() for issue in issues],
        "count": len(issues),
        "filters": {
            "severity": severity,
            "category": category,
        }
    }


@app.post("/api/issues/detect")
async def run_detection(
    hosts: Optional[List[str]] = None,
    background_tasks: BackgroundTasks = None
):
    """
    🔄 Run a detection cycle to find new issues.
    Can optionally specify which hosts to scan.
    """
    detector = get_detector()
    
    if hosts is None:
        hosts = ["localhost"]
    
    # Run detection
    new_issues = await detector.run_detection_cycle(hosts)
    
    return {
        "success": True,
        "new_issues_found": len(new_issues),
        "issues": [issue.to_dict() for issue in new_issues],
        "message": f"Detection cycle complete. Found {len(new_issues)} new issues."
    }


# ---- STATIC ROUTES (must be before parameterized routes) ----

@app.get("/api/issues/stats")
async def get_detection_stats():
    """
    📊 Get detection statistics and metrics.
    """
    detector = get_detector()
    stats = detector.get_stats()
    
    return {
        "stats": stats,
        "timestamp": datetime.utcnow().isoformat()
    }


@app.get("/api/issues/patterns")
async def list_detection_patterns():
    """
    📋 List all available detection patterns.
    These are the 30 issue types the system can detect.
    """
    detector = get_detector()
    patterns = detector.get_patterns()
    
    # Group by category
    by_category = {}
    for pattern in patterns:
        cat = pattern["category"]
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(pattern)
    
    return {
        "patterns": patterns,
        "total": len(patterns),
        "by_category": by_category
    }


# ---- PARAMETERIZED ROUTES ----

@app.get("/api/issues/{issue_id}")
async def get_issue(issue_id: str):
    """
    📋 Get details of a specific issue by ID.
    """
    detector = get_detector()
    issue = detector.get_issue(issue_id)
    
    if not issue:
        raise HTTPException(status_code=404, detail=f"Issue not found: {issue_id}")
    
    return issue.to_dict()


@app.get("/api/issues/{issue_id}/suggested-workflow")
async def get_suggested_workflow(issue_id: str):
    """
    💡 Get the suggested remediation workflow for an issue.
    Returns the workflow template that can fix this issue.
    """
    detector = get_detector()
    issue = detector.get_issue(issue_id)
    
    if not issue:
        raise HTTPException(status_code=404, detail=f"Issue not found: {issue_id}")
    
    # Get template service to fetch workflow details
    template_svc = get_template_service()
    
    return {
        "issue_id": issue.id,
        "issue_name": issue.pattern_name,
        "suggested_workflow_id": issue.suggested_workflow_id,
        "auto_remediate": issue.auto_remediate,
        "severity": issue.severity.name,
        "message": f"Suggested workflow: {issue.suggested_workflow_id}",
        "can_auto_execute": issue.auto_remediate,
    }


@app.post("/api/issues/{issue_id}/acknowledge")
async def acknowledge_issue(issue_id: str):
    """
    ✅ Acknowledge an issue (mark as seen by team).
    """
    detector = get_detector()
    success = detector.acknowledge_issue(issue_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Issue not found: {issue_id}")
    
    return {"success": True, "message": f"Issue {issue_id} acknowledged"}


@app.post("/api/issues/{issue_id}/execute")
async def execute_remediation(
    issue_id: str, 
    background_tasks: BackgroundTasks
):
    """
    ▶️ Execute the suggested remediation workflow for an issue.
    This will start the automated fix.
    """
    detector = get_detector()
    issue = detector.get_issue(issue_id)
    
    if not issue:
        raise HTTPException(status_code=404, detail=f"Issue not found: {issue_id}")
    
    # Mark remediation as started
    detector.start_remediation(issue_id)
    
    # TODO: Actually execute the workflow
    # For now, just mark it as started
    
    return {
        "success": True,
        "message": f"Remediation started for issue {issue_id}",
        "workflow_id": issue.suggested_workflow_id,
        "issue": issue.to_dict()
    }


@app.post("/api/issues/{issue_id}/resolve")
async def resolve_issue(
    issue_id: str,
    result: str = "Manually resolved"
):
    """
    ✅ Mark an issue as resolved.
    """
    detector = get_detector()
    success = detector.resolve_issue(issue_id, result)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Issue not found: {issue_id}")
    
    return {"success": True, "message": f"Issue {issue_id} resolved: {result}"}


# ============================================================
# REMEDIATION TEMPLATE API (Phase 3: Smart Suggestion Engine)
# Links detected issues to auto-healing workflows
# ============================================================

from auto_remediation import (
    get_remediation_service,
    RemediationTemplateService,
)


@app.get("/api/remediation/templates")
async def list_remediation_templates(
    category: Optional[str] = Query(None, description="Filter by category"),
    auto_execute_only: bool = Query(False, description="Only show auto-executable templates")
):
    """
    📋 List all available remediation templates.
    These are the 30 workflow templates for auto-healing.
    """
    service = get_remediation_service()
    
    if category:
        templates = service.get_templates_by_category(category)
    elif auto_execute_only:
        templates = service.get_auto_execute_templates()
    else:
        templates = service.get_all_templates()
    
    return {
        "templates": [t.to_dict() for t in templates],
        "total": len(templates),
        "filters": {
            "category": category,
            "auto_execute_only": auto_execute_only,
        }
    }


@app.get("/api/remediation/templates/{template_id}")
async def get_remediation_template(template_id: str):
    """
    📋 Get a specific remediation template by ID.
    """
    service = get_remediation_service()
    template = service.get_template(template_id)
    
    if not template:
        raise HTTPException(status_code=404, detail=f"Template not found: {template_id}")
    
    return template.to_dict()


@app.get("/api/remediation/stats")
async def get_remediation_stats():
    """
    📊 Get remediation template statistics.
    """
    service = get_remediation_service()
    return service.get_stats()


@app.get("/api/issues/{issue_id}/remediation")
async def get_remediation_for_issue(issue_id: str):
    """
    🔧 Get the complete remediation workflow for a detected issue.
    This is the SMART SUGGESTION ENGINE - links issues to fixes automatically!
    """
    detector = get_detector()
    issue = detector.get_issue(issue_id)
    
    if not issue:
        raise HTTPException(status_code=404, detail=f"Issue not found: {issue_id}")
    
    # Get the matching remediation template
    service = get_remediation_service()
    template = service.get_template_for_pattern(issue.pattern_id)
    
    if not template:
        return {
            "issue_id": issue.id,
            "issue_name": issue.pattern_name,
            "has_remediation": False,
            "message": f"No remediation template found for pattern: {issue.pattern_id}"
        }
    
    return {
        "issue_id": issue.id,
        "issue_name": issue.pattern_name,
        "issue_severity": issue.severity.name,
        "has_remediation": True,
        "template": template.to_dict(),
        "auto_execute": template.auto_execute,
        "requires_approval": template.requires_approval,
        "estimated_fix_time": template.estimated_fix_time,
        "success_rate": template.success_rate,
        "message": f"Remediation available: {template.name}"
    }


@app.post("/api/issues/{issue_id}/auto-remediate")
async def auto_remediate_issue(
    issue_id: str,
    background_tasks: BackgroundTasks
):
    """
    🚀 EXECUTE AUTO-REMEDIATION for an issue.
    This triggers the complete self-healing workflow.
    """
    detector = get_detector()
    issue = detector.get_issue(issue_id)
    
    if not issue:
        raise HTTPException(status_code=404, detail=f"Issue not found: {issue_id}")
    
    # Get the matching template
    service = get_remediation_service()
    template = service.get_template_for_pattern(issue.pattern_id)
    
    if not template:
        raise HTTPException(
            status_code=400, 
            detail=f"No remediation template for pattern: {issue.pattern_id}"
        )
    
    if not template.auto_execute and template.requires_approval:
        raise HTTPException(
            status_code=400,
            detail="This remediation requires manual approval. Use /api/issues/{id}/request-approval instead."
        )
    
    # Mark remediation as started
    detector.start_remediation(issue_id)
    
    # In production, this would execute the actual workflow steps
    # For now, log and schedule background execution
    print(f"🚀 Auto-remediating: {issue.pattern_name} with {template.name}")
    print(f"   Steps: {len(template.steps)}")
    
    # TODO: Execute workflow steps via executor
    # background_tasks.add_task(execute_remediation_workflow, issue, template)
    
    return {
        "success": True,
        "message": f"Auto-remediation started for {issue.pattern_name}",
        "issue_id": issue.id,
        "template_id": template.id,
        "template_name": template.name,
        "steps_count": len(template.steps),
        "estimated_time": template.estimated_fix_time,
        "status": "executing"
    }


@app.get("/api/remediation/categories")
async def list_remediation_categories():
    """
    📂 List all remediation categories with counts.
    """
    service = get_remediation_service()
    stats = service.get_stats()
    
    categories = []
    icons = {
        "compute": "🖥️",
        "storage": "💾",
        "network": "🌐",
        "application": "📱",
        "security": "🔒",
        "container": "🐳",
        "compliance": "📋",
        "business": "💰"
    }
    
    for cat, count in stats['by_category'].items():
        categories.append({
            "name": cat,
            "icon": icons.get(cat, "📦"),
            "template_count": count
        })
    
    return {
        "categories": sorted(categories, key=lambda x: -x['template_count']),
        "total_categories": len(categories)
    }


# ============================================================
# PHASE 5E: AUTONOMOUS TRIGGERING SYSTEM
# ============================================================

@app.get("/api/autonomous/status")
async def get_autonomous_status():
    """
    📊 Get the current autonomous triggering system status.
    Returns kill switch status, rate limits, and recent activity.
    """
    manager = get_auto_trigger_manager()
    guardrails = get_safety_guardrails()
    
    if not manager:
        return {
            "enabled": False,
            "error": "Auto-trigger manager not initialized"
        }
    
    return {
        **manager.get_status(),
        "safety": guardrails.get_status() if guardrails else {}
    }


@app.post("/api/autonomous/enable")
async def enable_autonomous_mode():
    """
    ✅ Enable autonomous triggering mode.
    High-confidence issues will be auto-remediated.
    """
    manager = get_auto_trigger_manager()
    if not manager:
        raise HTTPException(status_code=503, detail="Auto-trigger manager not initialized")
    
    manager.enable_autonomous_mode()
    
    return {
        "success": True,
        "message": "Autonomous mode enabled",
        "status": manager.get_status()
    }


@app.post("/api/autonomous/disable")
async def disable_autonomous_mode():
    """
    🛑 Disable autonomous triggering mode.
    Issues will require manual intervention.
    """
    manager = get_auto_trigger_manager()
    if not manager:
        raise HTTPException(status_code=503, detail="Auto-trigger manager not initialized")
    
    manager.disable_autonomous_mode()
    
    return {
        "success": True,
        "message": "Autonomous mode disabled",
        "status": manager.get_status()
    }


@app.post("/api/autonomous/kill-switch")
async def toggle_kill_switch(enable: bool = True, reason: str = "Manual activation"):
    """
    🚨 Toggle the global kill switch for ALL autonomous operations.
    When enabled, no automatic remediations will execute.
    """
    guardrails = get_safety_guardrails()
    if not guardrails:
        raise HTTPException(status_code=503, detail="Safety guardrails not initialized")
    
    if enable:
        guardrails.enable_kill_switch(reason=reason, enabled_by="api")
        return {
            "success": True,
            "kill_switch": "enabled",
            "reason": reason,
            "message": "⚠️ KILL SWITCH ACTIVATED - All autonomous operations halted"
        }
    else:
        guardrails.disable_kill_switch(disabled_by="api")
        return {
            "success": True,
            "kill_switch": "disabled",
            "message": "Kill switch deactivated - Autonomous operations can resume"
        }


@app.get("/api/autonomous/confidence/{workflow_id}")
async def calculate_workflow_confidence(
    workflow_id: str,
    issue_title: str = "Test Issue",
    issue_severity: str = "high",
    host: str = "server-01"
):
    """
    📊 Calculate the confidence score for auto-remediating an issue.
    Returns score (0-100), level, and detailed factor breakdown.
    """
    scorer = get_confidence_scorer()
    
    # Build mock issue and workflow data
    issue = {
        "title": issue_title,
        "severity": issue_severity,
        "host": host
    }
    
    workflow = {
        "id": workflow_id,
        "success_rate": 95,  # Would load from DB in production
    }
    
    context = {
        "host": host,
        "pattern_match": 0.9
    }
    
    result = scorer.calculate(workflow, issue, context)
    
    return {
        "workflow_id": workflow_id,
        "confidence_score": result.score,
        "confidence_level": result.level.value,
        "can_auto_execute": result.can_auto_execute,
        "requires_approval": result.requires_approval,
        "recommendation": result.recommendation,
        "reason": result.reason,
        "factors": result.factors
    }


@app.get("/api/autonomous/pending-approvals")
async def get_pending_auto_approvals():
    """
    📋 Get list of workflows awaiting approval.
    These are medium-confidence matches that need human review.
    """
    manager = get_auto_trigger_manager()
    if not manager:
        return {"pending": [], "count": 0}
    
    pending = manager.get_pending_approvals()
    return {
        "pending": pending,
        "count": len(pending)
    }


@app.post("/api/autonomous/approve/{request_id}")
async def approve_auto_request(request_id: str, approved_by: str = "user"):
    """
    ✅ Approve a pending autonomous remediation request.
    """
    manager = get_auto_trigger_manager()
    if not manager:
        raise HTTPException(status_code=503, detail="Auto-trigger manager not initialized")
    
    result = await manager.approve_request(request_id, approved_by)
    
    if not result:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    return {
        "success": True,
        "action": result.action_taken,
        "workflow_id": result.workflow_id,
        "execution_id": result.execution_id,
        "message": result.message
    }


@app.post("/api/autonomous/reject/{request_id}")
async def reject_auto_request(request_id: str, rejected_by: str = "user"):
    """
    ❌ Reject a pending autonomous remediation request.
    """
    manager = get_auto_trigger_manager()
    if not manager:
        raise HTTPException(status_code=503, detail="Auto-trigger manager not initialized")
    
    success = await manager.reject_request(request_id, rejected_by)
    
    if not success:
        raise HTTPException(status_code=404, detail="Approval request not found")
    
    return {
        "success": True,
        "message": "Request rejected"
    }


@app.get("/api/autonomous/recent-triggers")
async def get_recent_auto_triggers(limit: int = 20):
    """
    📜 Get recent auto-trigger activity log.
    """
    manager = get_auto_trigger_manager()
    if not manager:
        return {"triggers": [], "count": 0}
    
    triggers = manager.get_recent_triggers(limit)
    return {
        "triggers": triggers,
        "count": len(triggers)
    }


@app.get("/api/autonomous/audit-log")
async def get_autonomous_audit_log(limit: int = 100):
    """
    📋 Get the safety audit log for autonomous operations.
    """
    guardrails = get_safety_guardrails()
    if not guardrails:
        return {"log": [], "count": 0}
    
    log = guardrails.get_audit_log(limit)
    return {
        "log": log,
        "count": len(log)
    }


@app.post("/api/autonomous/process-issue")
async def process_issue_autonomous(
    issue_title: str,
    issue_severity: str = "high",
    host: str = "server-01",
    message: str = ""
):
    """
    🤖 Process an issue through the autonomous triggering system.
    Will find matching workflows, calculate confidence, and take appropriate action.
    """
    manager = get_auto_trigger_manager()
    if not manager:
        raise HTTPException(status_code=503, detail="Auto-trigger manager not initialized")
    
    issue = {
        "title": issue_title,
        "message": message,
        "severity": issue_severity,
        "host": host
    }
    
    results = await manager.process_issue(issue)
    
    return {
        "processed": True,
        "issue": issue,
        "results": [
            {
                "workflow_id": r.workflow_id,
                "triggered": r.triggered,
                "action_taken": r.action_taken,
                "confidence_score": r.confidence.score,
                "confidence_level": r.confidence.level.value,
                "message": r.message
            }
            for r in results
        ],
        "count": len(results)
    }


# ============================================================
# SSH EXECUTOR ENDPOINTS (Phase 6A)
# ============================================================

class SSHTestRequest(BaseModel):
    hostname: str
    username: str = "root"
    port: int = 22
    password: Optional[str] = None
    private_key_path: Optional[str] = None

class SSHExecuteRequest(BaseModel):
    hostname: str
    command: str
    username: str = "root"
    port: int = 22
    password: Optional[str] = None
    private_key_path: Optional[str] = None
    timeout: int = 30
    command_timeout: int = 300


@app.post("/api/ssh/test")
async def test_ssh_connection(request: SSHTestRequest):
    """Test SSH connectivity to a host."""
    try:
        from executors.ssh_executor import get_ssh_executor, SSHCredentials, AuthMethod
        
        # Determine auth method
        if request.password:
            auth_method = AuthMethod.PASSWORD
        elif request.private_key_path:
            auth_method = AuthMethod.KEY
        else:
            auth_method = AuthMethod.AGENT
        
        creds = SSHCredentials(
            hostname=request.hostname,
            username=request.username,
            port=request.port,
            password=request.password,
            private_key_path=request.private_key_path,
            auth_method=auth_method
        )
        
        executor = get_ssh_executor()
        
        # Run in thread pool since it's sync
        import asyncio
        loop = asyncio.get_event_loop()
        success, message = await loop.run_in_executor(
            None,
            lambda: executor.test_connection(creds)
        )
        
        return {
            "success": success,
            "message": message,
            "host": request.hostname
        }
        
    except ImportError:
        return {
            "success": False,
            "message": "SSH executor not available. Run: pip install paramiko",
            "host": request.hostname
        }
    except Exception as e:
        return {
            "success": False,
            "message": str(e),
            "host": request.hostname
        }


@app.post("/api/ssh/execute")
async def execute_ssh_command(request: SSHExecuteRequest):
    """Execute a command on a remote host via SSH."""
    try:
        from executors.ssh_executor import get_ssh_executor
        
        executor = get_ssh_executor()
        
        # Run in thread pool since it's sync
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: executor.execute(
                hostname=request.hostname,
                command=request.command,
                username=request.username,
                port=request.port,
                password=request.password,
                private_key_path=request.private_key_path,
                timeout=request.timeout,
                command_timeout=request.command_timeout
            )
        )
        
        return {
            "success": result.success,
            "hostname": result.hostname,
            "command": result.command,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "duration_ms": result.duration_ms,
            "error": result.error
        }
        
    except ImportError:
        raise HTTPException(
            status_code=503, 
            detail="SSH executor not available. Run: pip install paramiko"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/ssh/hosts")
async def list_ssh_hosts():
    """List registered SSH hosts from credential manager."""
    try:
        from executors.credential_config import get_credential_manager
        
        manager = get_credential_manager()
        hosts = manager.list_hosts()
        
        return {
            "hosts": hosts,
            "count": len(hosts)
        }
        
    except ImportError:
        return {
            "hosts": [],
            "count": 0,
            "message": "Credential manager not available"
        }


@app.post("/api/ssh/hosts")
async def register_ssh_host(
    alias: str,
    hostname: str,
    username: str = "root",
    port: int = 22,
    private_key_path: Optional[str] = None,
    password: Optional[str] = None,
    tags: Optional[List[str]] = None
):
    """Register a new SSH host for quick access."""
    try:
        from executors.credential_config import get_credential_manager, HostConfig
        
        manager = get_credential_manager()
        
        config = HostConfig(
            alias=alias,
            hostname=hostname,
            username=username,
            port=port,
            private_key_path=private_key_path,
            password=password,
            tags=tags or []
        )
        
        manager.add_host(config)
        
        return {
            "success": True,
            "message": f"Host '{alias}' registered successfully",
            "alias": alias,
            "hostname": hostname
        }
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Credential manager not available"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================
# DOCKER EXECUTOR ENDPOINTS (Phase 6B)
# ============================================================

class DockerContainerActionRequest(BaseModel):
    container_name: str
    action: str = "restart"  # start, stop, restart, kill, remove
    timeout: int = 30

class DockerExecRequest(BaseModel):
    container_name: str
    command: str
    workdir: Optional[str] = None
    user: Optional[str] = None


@app.get("/api/docker/containers")
async def list_docker_containers(all: bool = False):
    """List Docker containers."""
    try:
        from executors.docker_executor import get_docker_executor
        
        executor = get_docker_executor()
        containers = executor.list_containers(all=all)
        
        return {
            "containers": containers,
            "count": len(containers)
        }
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Docker executor not available. Run: pip install docker"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/docker/container/action")
async def docker_container_action(request: DockerContainerActionRequest):
    """Perform action on Docker container."""
    try:
        from executors.docker_executor import get_docker_executor, ContainerAction
        
        executor = get_docker_executor()
        
        # Map action string to ContainerAction enum
        action_map = {
            "start": ContainerAction.START,
            "stop": ContainerAction.STOP,
            "restart": ContainerAction.RESTART,
            "kill": ContainerAction.KILL,
            "pause": ContainerAction.PAUSE,
            "unpause": ContainerAction.UNPAUSE,
            "remove": ContainerAction.REMOVE,
        }
        
        action = action_map.get(request.action.lower())
        if not action:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid action: {request.action}. Valid: {list(action_map.keys())}"
            )
        
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: executor.container_action(
                request.container_name,
                action,
                timeout=request.timeout
            )
        )
        
        return result.to_dict()
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Docker executor not available. Run: pip install docker"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/docker/container/{container_name}/logs")
async def get_docker_logs(
    container_name: str,
    tail: int = 100,
    timestamps: bool = True
):
    """Get container logs."""
    try:
        from executors.docker_executor import get_docker_executor
        
        executor = get_docker_executor()
        
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: executor.get_logs(container_name, tail=tail, timestamps=timestamps)
        )
        
        return result.to_dict()
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Docker executor not available"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/docker/container/{container_name}/health")
async def get_docker_health(container_name: str):
    """Get container health status."""
    try:
        from executors.docker_executor import get_docker_executor
        
        executor = get_docker_executor()
        
        import asyncio
        loop = asyncio.get_event_loop()
        health = await loop.run_in_executor(
            None,
            lambda: executor.get_health_status(container_name)
        )
        
        return health
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Docker executor not available"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/docker/container/{container_name}/stats")
async def get_docker_stats(container_name: str):
    """Get container resource statistics."""
    try:
        from executors.docker_executor import get_docker_executor
        
        executor = get_docker_executor()
        
        import asyncio
        loop = asyncio.get_event_loop()
        stats = await loop.run_in_executor(
            None,
            lambda: executor.get_stats(container_name)
        )
        
        return stats
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Docker executor not available"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/docker/container/exec")
async def docker_exec_command(request: DockerExecRequest):
    """Execute command inside a running container."""
    try:
        from executors.docker_executor import get_docker_executor
        
        executor = get_docker_executor()
        
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: executor.exec_in_container(
                request.container_name,
                request.command,
                workdir=request.workdir,
                user=request.user
            )
        )
        
        return result.to_dict()
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Docker executor not available"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/docker/images")
async def list_docker_images():
    """List local Docker images."""
    try:
        from executors.docker_executor import get_docker_executor
        
        executor = get_docker_executor()
        
        import asyncio
        loop = asyncio.get_event_loop()
        images = await loop.run_in_executor(
            None,
            executor.list_images
        )
        
        return {
            "images": images,
            "count": len(images)
        }
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Docker executor not available"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/docker/image/pull")
async def pull_docker_image(image_name: str, tag: str = "latest"):
    """Pull Docker image from registry."""
    try:
        from executors.docker_executor import get_docker_executor
        
        executor = get_docker_executor()
        
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: executor.pull_image(image_name, tag=tag)
        )
        
        return result.to_dict()
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Docker executor not available"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# API EXECUTOR ENDPOINTS (Phase 6D)
# ============================================================

class APIRequestPayload(BaseModel):
    url: str
    method: str = "GET"
    headers: Optional[Dict[str, str]] = None
    body: Optional[Dict[str, Any]] = None
    params: Optional[Dict[str, str]] = None
    timeout: int = 30
    auth_type: Optional[str] = None  # bearer, basic, api_key
    token: Optional[str] = None
    api_key: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None

class WebhookPayloadModel(BaseModel):
    url: str
    webhook_type: str = "generic"  # generic, slack, pagerduty, opsgenie
    payload: Optional[Dict[str, Any]] = None
    text: Optional[str] = None  # For Slack
    routing_key: Optional[str] = None  # For PagerDuty
    summary: Optional[str] = None


@app.post("/api/http/request")
async def make_http_request(request: APIRequestPayload):
    """Make an HTTP request using the API executor."""
    try:
        from executors.api_executor import get_api_executor, AuthConfig, AuthType as ApiAuthType
        
        executor = get_api_executor()
        
        # Build auth
        auth = None
        if request.auth_type == "bearer" and request.token:
            auth = AuthConfig(auth_type=ApiAuthType.BEARER, token=request.token)
        elif request.auth_type == "basic" and request.username:
            auth = AuthConfig(
                auth_type=ApiAuthType.BASIC,
                username=request.username,
                password=request.password
            )
        elif request.auth_type == "api_key" and request.api_key:
            auth = AuthConfig(
                auth_type=ApiAuthType.API_KEY_HEADER,
                api_key=request.api_key
            )
        
        import asyncio
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: executor.request(
                method=request.method.upper(),
                url=request.url,
                headers=request.headers,
                json=request.body,
                params=request.params,
                auth=auth,
                timeout=request.timeout
            )
        )
        
        return result.to_dict()
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="API executor not available. Run: pip install httpx"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/webhook/send")
async def send_webhook(request: WebhookPayloadModel):
    """Send a webhook notification."""
    try:
        from executors.api_executor import get_api_executor
        
        executor = get_api_executor()
        
        import asyncio
        loop = asyncio.get_event_loop()
        
        if request.webhook_type == "slack":
            result = await loop.run_in_executor(
                None,
                lambda: executor.call_slack_webhook(
                    request.url,
                    request.text or "Alert from AIOps"
                )
            )
        elif request.webhook_type == "pagerduty":
            result = await loop.run_in_executor(
                None,
                lambda: executor.call_pagerduty(
                    routing_key=request.routing_key or "",
                    event_action="trigger",
                    dedup_key=f"aiops-{datetime.now().timestamp()}",
                    summary=request.summary or "AIOps Alert",
                    source="aiops-platform"
                )
            )
        else:
            result = await loop.run_in_executor(
                None,
                lambda: executor.send_webhook(request.url, request.payload or {})
            )
        
        return result.to_dict()
        
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="API executor not available"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/executor/stats")
async def get_api_executor_stats():
    """Get API executor statistics."""
    try:
        from executors.api_executor import get_api_executor
        
        executor = get_api_executor()
        stats = executor.get_stats()
        
        return {
            "executor": "api",
            "stats": stats
        }
        
    except ImportError:
        return {
            "executor": "api",
            "stats": None,
            "message": "API executor not available"
        }


# ============================================================
# RUN SERVER
# ============================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)




