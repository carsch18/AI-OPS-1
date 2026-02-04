"""
Pydantic Models for Workflow Engine API
Defines request/response schemas for all endpoints
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
import uuid


# ============================================================
# ENUMS
# ============================================================

class TriggerType(str, Enum):
    INCIDENT = "incident"
    ALERT = "alert"
    SCHEDULE = "schedule"
    MANUAL = "manual"
    WEBHOOK = "webhook"


class NodeType(str, Enum):
    TRIGGER = "trigger"
    ACTION = "action"
    CONDITION = "condition"
    APPROVAL = "approval"
    DELAY = "delay"


class NodeSubtype(str, Enum):
    # Triggers
    INCIDENT_CREATED = "incident_created"
    ALERT_FIRED = "alert_fired"
    SCHEDULED = "scheduled"
    MANUAL_TRIGGER = "manual_trigger"
    WEBHOOK_RECEIVED = "webhook_received"
    
    # Actions
    RUN_PLAYBOOK = "run_playbook"
    SSH_COMMAND = "ssh_command"
    SEND_EMAIL = "send_email"
    CREATE_INCIDENT = "create_incident"
    CALL_API = "call_api"
    RUN_SCRIPT = "run_script"
    
    # Flow Control
    IF_ELSE = "if_else"
    HUMAN_APPROVAL = "human_approval"
    DELAY_WAIT = "delay_wait"
    PARALLEL_SPLIT = "parallel_split"


class ExecutionStatus(str, Enum):
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class NodeExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    WAITING = "waiting"


# ============================================================
# NODE MODELS
# ============================================================

class NodePosition(BaseModel):
    x: int = 0
    y: int = 0


class WorkflowNodeCreate(BaseModel):
    node_type: NodeType
    node_subtype: Optional[str] = None
    label: str
    position_x: int = 0
    position_y: int = 0
    config: Dict[str, Any] = Field(default_factory=dict)
    is_start_node: bool = False


class WorkflowNodeUpdate(BaseModel):
    label: Optional[str] = None
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    config: Optional[Dict[str, Any]] = None
    is_start_node: Optional[bool] = None


class WorkflowNode(BaseModel):
    id: str
    workflow_id: str
    node_type: str
    node_subtype: Optional[str] = None
    label: str
    position_x: int
    position_y: int
    config: Dict[str, Any]
    is_start_node: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# EDGE MODELS
# ============================================================

class WorkflowEdgeCreate(BaseModel):
    source_node_id: str
    target_node_id: str
    source_handle: str = "default"  # 'success', 'failure', 'timeout'
    condition: Optional[Dict[str, Any]] = None


class WorkflowEdge(BaseModel):
    id: str
    workflow_id: str
    source_node_id: str
    target_node_id: str
    source_handle: str
    condition: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# WORKFLOW MODELS
# ============================================================

class WorkflowCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    trigger_type: TriggerType
    trigger_config: Dict[str, Any] = Field(default_factory=dict)
    is_active: bool = False
    nodes: List[WorkflowNodeCreate] = Field(default_factory=list)
    edges: List[WorkflowEdgeCreate] = Field(default_factory=list)


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trigger_type: Optional[TriggerType] = None
    trigger_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class Workflow(BaseModel):
    id: str
    name: str
    description: Optional[str]
    trigger_type: str
    trigger_config: Dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]
    version: int

    class Config:
        from_attributes = True


class WorkflowWithNodes(Workflow):
    nodes: List[WorkflowNode] = []
    edges: List[WorkflowEdge] = []


# ============================================================
# EXECUTION MODELS
# ============================================================

class ExecutionCreate(BaseModel):
    trigger_data: Dict[str, Any] = Field(default_factory=dict)


class WorkflowExecution(BaseModel):
    id: str
    workflow_id: Optional[str]
    workflow_name: Optional[str]
    trigger_data: Dict[str, Any]
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    current_node_id: Optional[str]
    execution_log: List[Dict[str, Any]]
    error_message: Optional[str]

    class Config:
        from_attributes = True


class NodeExecution(BaseModel):
    id: str
    execution_id: str
    node_id: Optional[str]
    node_type: Optional[str]
    node_label: Optional[str]
    status: str
    started_at: datetime
    completed_at: Optional[datetime]
    input_data: Dict[str, Any]
    output_data: Dict[str, Any]
    error_message: Optional[str]

    class Config:
        from_attributes = True


class ExecutionWithNodes(WorkflowExecution):
    node_executions: List[NodeExecution] = []


# ============================================================
# APPROVAL MODELS
# ============================================================

class ApprovalRequest(BaseModel):
    approver: str
    comment: Optional[str] = None


class ApprovalResponse(BaseModel):
    success: bool
    execution_id: str
    status: str
    message: str


# ============================================================
# TEMPLATE MODELS
# ============================================================

class WorkflowTemplate(BaseModel):
    id: str
    name: str
    description: Optional[str]
    category: Optional[str]
    template_data: Dict[str, Any]
    is_system: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ============================================================
# RESPONSE MODELS
# ============================================================

class WorkflowListResponse(BaseModel):
    workflows: List[Workflow]
    total: int


class ExecutionListResponse(BaseModel):
    executions: List[WorkflowExecution]
    total: int


class TemplateListResponse(BaseModel):
    templates: List[WorkflowTemplate]
    total: int


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    database: str
