"""
Workflow Executor - The HEART of the Automation Engine
Executes workflows node by node, handles branching, retries, and approvals

This is where the MAGIC happens! 🔥
"""

import asyncio
import json
import subprocess
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
import asyncpg
import httpx
import os

# ============================================================
# EXECUTION CONTEXT & DATA CLASSES
# ============================================================

@dataclass
class ExecutionContext:
    """Context passed through the entire workflow execution"""
    execution_id: str
    workflow_id: str
    workflow_name: str
    trigger_data: Dict[str, Any]
    variables: Dict[str, Any] = field(default_factory=dict)
    node_outputs: Dict[str, Any] = field(default_factory=dict)  # node_id -> output
    current_node_id: Optional[str] = None
    started_at: datetime = field(default_factory=datetime.utcnow)
    logs: List[Dict[str, Any]] = field(default_factory=list)
    
    def log(self, event: str, details: Any = None):
        """Add a log entry"""
        entry = {
            "timestamp": datetime.utcnow().isoformat(),
            "node_id": self.current_node_id,
            "event": event,
            "details": details
        }
        self.logs.append(entry)
        print(f"  [{self.execution_id[:8]}] {event}: {details}")
    
    def get_variable(self, path: str) -> Any:
        """Get a variable from context using dot notation
        Example: trigger.severity, nodes.node_123.output
        """
        parts = path.split(".")
        
        if parts[0] == "trigger":
            obj = self.trigger_data
        elif parts[0] == "nodes" and len(parts) > 1:
            node_id = parts[1]
            obj = self.node_outputs.get(node_id, {})
            parts = parts[2:]  # Skip 'nodes.node_id'
        elif parts[0] == "vars":
            obj = self.variables
            parts = parts[1:]
        else:
            obj = self.variables
        
        for part in parts[1:] if parts[0] in ["trigger", "vars"] else parts:
            if isinstance(obj, dict):
                obj = obj.get(part)
            else:
                return None
        
        return obj
    
    def interpolate_string(self, template: str) -> str:
        """Replace {{variable}} placeholders with actual values"""
        import re
        
        def replace_var(match):
            var_path = match.group(1).strip()
            value = self.get_variable(var_path)
            return str(value) if value is not None else ""
        
        return re.sub(r'\{\{(.+?)\}\}', replace_var, template)


class NodeExecutionResult(Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    WAITING_APPROVAL = "waiting_approval"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"


@dataclass 
class NodeResult:
    """Result of executing a single node"""
    status: NodeExecutionResult
    output_handle: str = "default"  # Which output port to follow (success, failure, true, false, etc)
    output_data: Dict[str, Any] = field(default_factory=dict)
    error_message: Optional[str] = None
    should_continue: bool = True  # False if we need to pause (approval)


# ============================================================
# NODE EXECUTORS - One for each node type
# ============================================================

class BaseNodeExecutor:
    """Base class for all node executors"""
    
    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        raise NotImplementedError


class TriggerExecutor(BaseNodeExecutor):
    """Executes trigger nodes - just passes data through"""
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        context.log("Trigger activated", {
            "subtype": node["node_subtype"],
            "trigger_data": context.trigger_data
        })
        
        return NodeResult(
            status=NodeExecutionResult.SUCCESS,
            output_handle="default",
            output_data=context.trigger_data
        )


class PlaybookExecutor(BaseNodeExecutor):
    """Executes Ansible playbooks via SSH"""
    
    # SSH configuration
    SSH_HOST = os.getenv("SSH_HOST", "test@10.10.2.21")
    SSH_KEY = os.getenv("SSH_KEY", "/home/adityatiwari/.ssh/id_ed25519")
    PLAYBOOK_DIR = os.getenv("PLAYBOOK_DIR", "/playbooks")
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        config = node.get("config", {})
        playbook_name = config.get("playbook_name", "health_check.yml")
        timeout_seconds = config.get("timeout_seconds", 300)
        extra_vars = config.get("extra_vars", {})
        
        # Interpolate variables in extra_vars
        for key, value in extra_vars.items():
            if isinstance(value, str):
                extra_vars[key] = context.interpolate_string(value)
        
        # Add execution context to extra vars
        extra_vars.update({
            "execution_id": context.execution_id,
            "workflow_name": context.workflow_name,
            "trigger_data": json.dumps(context.trigger_data)
        })
        
        context.log("Executing playbook", {
            "playbook": playbook_name,
            "extra_vars": extra_vars,
            "timeout": timeout_seconds
        })
        
        try:
            # Build the ansible-playbook command
            extra_vars_str = " ".join([f"-e {k}='{v}'" for k, v in extra_vars.items()])
            
            # Execute via subprocess (could also use ansible-runner)
            cmd = f"ansible-playbook {self.PLAYBOOK_DIR}/{playbook_name} {extra_vars_str} -v"
            
            context.log("Running command", cmd)
            
            # Run the playbook
            process = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout_seconds
                )
                
                stdout_str = stdout.decode() if stdout else ""
                stderr_str = stderr.decode() if stderr else ""
                
                if process.returncode == 0:
                    context.log("Playbook completed successfully", {"output": stdout_str[-500:]})
                    return NodeResult(
                        status=NodeExecutionResult.SUCCESS,
                        output_handle="success",
                        output_data={
                            "returncode": 0,
                            "stdout": stdout_str,
                            "playbook": playbook_name
                        }
                    )
                else:
                    context.log("Playbook failed", {"stderr": stderr_str[-500:]})
                    return NodeResult(
                        status=NodeExecutionResult.FAILURE,
                        output_handle="failure",
                        output_data={
                            "returncode": process.returncode,
                            "stderr": stderr_str
                        },
                        error_message=f"Playbook failed with exit code {process.returncode}"
                    )
                    
            except asyncio.TimeoutError:
                process.kill()
                context.log("Playbook timeout", {"timeout": timeout_seconds})
                return NodeResult(
                    status=NodeExecutionResult.TIMEOUT,
                    output_handle="failure",
                    error_message=f"Playbook timed out after {timeout_seconds}s"
                )
                
        except Exception as e:
            context.log("Playbook execution error", str(e))
            return NodeResult(
                status=NodeExecutionResult.FAILURE,
                output_handle="failure",
                error_message=str(e)
            )


class SSHExecutor(BaseNodeExecutor):
    """Executes SSH commands on remote hosts"""
    
    SSH_HOSTS = {
        "ddev": {"host": "test@10.10.2.21", "key": "/home/adityatiwari/.ssh/id_ed25519"},
        "localhost": {"host": "localhost", "key": None}
    }
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        config = node.get("config", {})
        host_alias = config.get("host", "ddev")
        command = config.get("command", "echo 'No command specified'")
        timeout_seconds = config.get("timeout_seconds", 60)
        
        # Interpolate variables in command
        command = context.interpolate_string(command)
        
        host_config = self.SSH_HOSTS.get(host_alias, self.SSH_HOSTS["ddev"])
        
        context.log("Executing SSH command", {
            "host": host_alias,
            "command": command[:100] + "..." if len(command) > 100 else command
        })
        
        try:
            if host_alias == "localhost":
                # Local execution
                process = await asyncio.create_subprocess_shell(
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            else:
                # Remote SSH execution
                ssh_opts = "-o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10"
                if host_config["key"]:
                    ssh_opts += f" -i {host_config['key']}"
                
                full_cmd = f"ssh {ssh_opts} {host_config['host']} '{command}'"
                
                process = await asyncio.create_subprocess_shell(
                    full_cmd,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE
                )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout_seconds
                )
                
                stdout_str = stdout.decode() if stdout else ""
                stderr_str = stderr.decode() if stderr else ""
                
                if process.returncode == 0:
                    context.log("SSH command successful", {"output": stdout_str[-200:]})
                    return NodeResult(
                        status=NodeExecutionResult.SUCCESS,
                        output_handle="success",
                        output_data={
                            "returncode": 0,
                            "stdout": stdout_str,
                            "command": command
                        }
                    )
                else:
                    context.log("SSH command failed", {"stderr": stderr_str[-200:]})
                    return NodeResult(
                        status=NodeExecutionResult.FAILURE,
                        output_handle="failure",
                        output_data={
                            "returncode": process.returncode,
                            "stderr": stderr_str
                        },
                        error_message=f"Command failed with exit code {process.returncode}"
                    )
                    
            except asyncio.TimeoutError:
                process.kill()
                return NodeResult(
                    status=NodeExecutionResult.TIMEOUT,
                    output_handle="failure",
                    error_message=f"Command timed out after {timeout_seconds}s"
                )
                
        except Exception as e:
            context.log("SSH execution error", str(e))
            return NodeResult(
                status=NodeExecutionResult.FAILURE,
                output_handle="failure",
                error_message=str(e)
            )


class EmailExecutor(BaseNodeExecutor):
    """Sends email notifications"""
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        config = node.get("config", {})
        recipients = config.get("recipients", "")
        subject = config.get("subject", "AIOps Workflow Notification")
        body_template = config.get("body_template", "Workflow executed successfully")
        
        # Interpolate variables
        subject = context.interpolate_string(subject)
        body = context.interpolate_string(body_template)
        
        context.log("Sending email", {
            "recipients": recipients,
            "subject": subject
        })
        
        try:
            # Call the Brain API to send email (it already has email_service)
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "http://localhost:8000/api/notifications/email",
                    json={
                        "to": recipients.split(","),
                        "subject": subject,
                        "body": body,
                        "execution_id": context.execution_id
                    },
                    timeout=30.0
                )
                
                if response.status_code == 200:
                    context.log("Email sent successfully")
                    return NodeResult(
                        status=NodeExecutionResult.SUCCESS,
                        output_handle="success",
                        output_data={"sent_to": recipients}
                    )
                else:
                    return NodeResult(
                        status=NodeExecutionResult.FAILURE,
                        output_handle="failure",
                        error_message=f"Email API returned {response.status_code}"
                    )
                    
        except Exception as e:
            # If email API not available, log and continue
            context.log("Email sending failed (continuing)", str(e))
            return NodeResult(
                status=NodeExecutionResult.SUCCESS,  # Don't fail workflow on email issues
                output_handle="success",
                output_data={"status": "email_skipped", "reason": str(e)}
            )


class HTTPExecutor(BaseNodeExecutor):
    """Makes HTTP API calls"""
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        config = node.get("config", {})
        url = config.get("url", "")
        method = config.get("method", "POST")
        headers = config.get("headers", {})
        body = config.get("body", {})
        
        # Interpolate URL and body
        url = context.interpolate_string(url)
        if isinstance(body, str):
            body = context.interpolate_string(body)
            try:
                body = json.loads(body)
            except:
                pass
        
        context.log("Making HTTP request", {
            "method": method,
            "url": url
        })
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    json=body if method in ["POST", "PUT", "PATCH"] else None,
                    timeout=60.0
                )
                
                try:
                    response_data = response.json()
                except:
                    response_data = response.text
                
                if response.is_success:
                    context.log("HTTP request successful", {"status": response.status_code})
                    return NodeResult(
                        status=NodeExecutionResult.SUCCESS,
                        output_handle="success",
                        output_data={
                            "status_code": response.status_code,
                            "response": response_data
                        }
                    )
                else:
                    context.log("HTTP request failed", {"status": response.status_code})
                    return NodeResult(
                        status=NodeExecutionResult.FAILURE,
                        output_handle="failure",
                        output_data={"status_code": response.status_code},
                        error_message=f"HTTP {response.status_code}"
                    )
                    
        except Exception as e:
            context.log("HTTP request error", str(e))
            return NodeResult(
                status=NodeExecutionResult.FAILURE,
                output_handle="failure",
                error_message=str(e)
            )


class ConditionExecutor(BaseNodeExecutor):
    """Evaluates conditions and routes to true/false branches"""
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        config = node.get("config", {})
        condition_type = config.get("condition_type", "equals")
        left_value = config.get("left_value", "")
        right_value = config.get("right_value", "")
        
        # Interpolate values
        left = context.interpolate_string(str(left_value))
        right = context.interpolate_string(str(right_value))
        
        context.log("Evaluating condition", {
            "type": condition_type,
            "left": left,
            "right": right
        })
        
        # Evaluate condition
        result = False
        
        if condition_type == "equals":
            result = left == right
        elif condition_type == "not_equals":
            result = left != right
        elif condition_type == "contains":
            result = right in left
        elif condition_type == "greater_than":
            try:
                result = float(left) > float(right)
            except:
                result = left > right
        elif condition_type == "less_than":
            try:
                result = float(left) < float(right)
            except:
                result = left < right
        
        context.log("Condition result", {"result": result})
        
        return NodeResult(
            status=NodeExecutionResult.SUCCESS,
            output_handle="true" if result else "false",
            output_data={"condition_result": result}
        )


class DelayExecutor(BaseNodeExecutor):
    """Waits for a specified duration"""
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        config = node.get("config", {})
        duration_seconds = config.get("duration_seconds", 10)
        reason = config.get("reason", "Workflow delay")
        
        context.log("Starting delay", {
            "seconds": duration_seconds,
            "reason": reason
        })
        
        await asyncio.sleep(duration_seconds)
        
        context.log("Delay completed")
        
        return NodeResult(
            status=NodeExecutionResult.SUCCESS,
            output_handle="default",
            output_data={"waited_seconds": duration_seconds}
        )


class ApprovalExecutor(BaseNodeExecutor):
    """Pauses execution for human approval"""
    
    async def execute(self, node: Dict, context: ExecutionContext) -> NodeResult:
        config = node.get("config", {})
        approvers = config.get("approvers", "admin")
        timeout_minutes = config.get("timeout_minutes", 30)
        notification_channels = config.get("notification_channels", "dashboard")
        
        context.log("Requesting human approval", {
            "approvers": approvers,
            "timeout_minutes": timeout_minutes
        })
        
        # Update execution status in database
        async with self.db_pool.acquire() as conn:
            # Create approval request
            await conn.execute('''
                UPDATE workflow_executions 
                SET status = 'waiting_approval',
                    current_node_id = $1,
                    execution_log = $2::jsonb
                WHERE id = $3
            ''',
                uuid.UUID(node["id"]),
                json.dumps(context.logs),
                uuid.UUID(context.execution_id)
            )
        
        # Send notifications if email channel is enabled
        if notification_channels in ["email", "both"]:
            try:
                async with httpx.AsyncClient() as client:
                    await client.post(
                        "http://localhost:8000/api/notifications/approval-required",
                        json={
                            "execution_id": context.execution_id,
                            "workflow_name": context.workflow_name,
                            "approvers": approvers.split(","),
                            "timeout_minutes": timeout_minutes
                        },
                        timeout=10.0
                    )
            except:
                pass  # Best effort notification
        
        # Return waiting status - execution will be resumed later
        return NodeResult(
            status=NodeExecutionResult.WAITING_APPROVAL,
            output_handle="approved",  # Will be changed based on actual approval
            output_data={
                "approvers": approvers,
                "timeout_minutes": timeout_minutes
            },
            should_continue=False  # Stop execution here
        )


# ============================================================
# MAIN WORKFLOW EXECUTOR
# ============================================================

class WorkflowExecutor:
    """
    The main workflow execution engine!
    
    Handles:
    - DAG traversal from trigger to completion
    - Node execution with proper error handling
    - Branching based on node outputs
    - Approval pausing and resumption
    - Execution logging and status updates
    """
    
    def __init__(self, db_pool: asyncpg.Pool):
        self.db_pool = db_pool
        
        # Register all node executors
        self.executors: Dict[str, BaseNodeExecutor] = {
            # Triggers
            "incident_created": TriggerExecutor(db_pool),
            "alert_fired": TriggerExecutor(db_pool),
            "scheduled": TriggerExecutor(db_pool),
            "manual_trigger": TriggerExecutor(db_pool),
            "webhook_received": TriggerExecutor(db_pool),
            # Actions
            "run_playbook": PlaybookExecutor(db_pool),
            "ssh_command": SSHExecutor(db_pool),
            "send_email": EmailExecutor(db_pool),
            "call_api": HTTPExecutor(db_pool),
            "create_incident": HTTPExecutor(db_pool),  # Uses Brain API
            # Flow Control
            "human_approval": ApprovalExecutor(db_pool),
            "if_else": ConditionExecutor(db_pool),
            "delay_wait": DelayExecutor(db_pool),
        }
    
    async def execute_workflow(
        self,
        workflow_id: str,
        trigger_data: Dict[str, Any],
        execution_id: Optional[str] = None
    ) -> str:
        """
        Execute a complete workflow from start to finish
        
        Returns: execution_id
        """
        execution_id = execution_id or str(uuid.uuid4())
        
        print(f"\n🚀 Starting workflow execution: {execution_id}")
        print(f"   Workflow ID: {workflow_id}")
        
        async with self.db_pool.acquire() as conn:
            # Load workflow
            workflow = await conn.fetchrow(
                "SELECT * FROM workflows WHERE id = $1",
                uuid.UUID(workflow_id)
            )
            
            if not workflow:
                raise ValueError(f"Workflow {workflow_id} not found")
            
            # Load nodes
            nodes = await conn.fetch(
                "SELECT * FROM workflow_nodes WHERE workflow_id = $1",
                uuid.UUID(workflow_id)
            )
            
            # Load edges
            edges = await conn.fetch(
                "SELECT * FROM workflow_edges WHERE workflow_id = $1",
                uuid.UUID(workflow_id)
            )
            
            # Build execution context
            context = ExecutionContext(
                execution_id=execution_id,
                workflow_id=workflow_id,
                workflow_name=workflow["name"],
                trigger_data=trigger_data
            )
            
            # Create execution record
            await conn.execute('''
                INSERT INTO workflow_executions 
                (id, workflow_id, workflow_name, trigger_data, status, started_at, execution_log)
                VALUES ($1, $2, $3, $4, 'running', NOW(), $5::jsonb)
            ''',
                uuid.UUID(execution_id),
                uuid.UUID(workflow_id),
                workflow["name"],
                json.dumps(trigger_data),
                json.dumps([])
            )
            
            context.log("Workflow execution started", {"trigger_data": trigger_data})
        
        # Build node lookup and edge graph
        node_map = {str(node["id"]): dict(node) for node in nodes}
        
        # Build adjacency list: source_node_id -> [(target_node_id, source_handle)]
        edge_graph: Dict[str, List[Tuple[str, str]]] = {}
        for edge in edges:
            source_id = str(edge["source_node_id"])
            target_id = str(edge["target_node_id"])
            source_handle = edge["source_handle"] or "default"
            
            if source_id not in edge_graph:
                edge_graph[source_id] = []
            edge_graph[source_id].append((target_id, source_handle))
        
        # Find start node (trigger node)
        start_node_id = None
        for node_id, node in node_map.items():
            if node["node_type"] == "trigger" or node["is_start_node"]:
                start_node_id = node_id
                break
        
        if not start_node_id:
            context.log("ERROR: No start/trigger node found")
            await self._update_execution_status(execution_id, "failed", context, "No start node")
            return execution_id
        
        # Execute nodes starting from trigger
        try:
            await self._execute_node_chain(
                start_node_id,
                node_map,
                edge_graph,
                context
            )
            
            # Check final status
            if context.logs[-1]["event"] == "Workflow waiting for approval":
                await self._update_execution_status(execution_id, "waiting_approval", context)
            else:
                await self._update_execution_status(execution_id, "completed", context)
                print(f"\n✅ Workflow completed: {execution_id}")
                
        except Exception as e:
            context.log("Workflow execution failed", str(e))
            await self._update_execution_status(execution_id, "failed", context, str(e))
            print(f"\n❌ Workflow failed: {execution_id} - {e}")
        
        return execution_id
    
    async def _execute_node_chain(
        self,
        node_id: str,
        node_map: Dict[str, Dict],
        edge_graph: Dict[str, List[Tuple[str, str]]],
        context: ExecutionContext
    ):
        """Execute a node and follow edges to next nodes"""
        
        node = node_map.get(node_id)
        if not node:
            context.log("Node not found", {"node_id": node_id})
            return
        
        context.current_node_id = node_id
        subtype = node["node_subtype"]
        
        context.log(f"Executing node: {node['label']}", {
            "type": node["node_type"],
            "subtype": subtype
        })
        
        # Record node execution start
        node_exec_id = str(uuid.uuid4())
        async with self.db_pool.acquire() as conn:
            await conn.execute('''
                INSERT INTO node_executions
                (id, execution_id, node_id, node_type, node_label, status, started_at, input_data)
                VALUES ($1, $2, $3, $4, $5, 'running', NOW(), $6::jsonb)
            ''',
                uuid.UUID(node_exec_id),
                uuid.UUID(context.execution_id),
                uuid.UUID(node_id),
                node["node_type"],
                node["label"],
                json.dumps({"trigger": context.trigger_data})
            )
        
        # Get executor
        executor = self.executors.get(subtype)
        if not executor:
            context.log(f"No executor for subtype: {subtype}")
            result = NodeResult(
                status=NodeExecutionResult.FAILURE,
                error_message=f"Unknown node subtype: {subtype}"
            )
        else:
            # Execute the node
            node_dict = dict(node)
            node_dict["id"] = node_id
            if node_dict.get("config"):
                node_dict["config"] = json.loads(node_dict["config"]) if isinstance(node_dict["config"], str) else node_dict["config"]
            
            result = await executor.execute(node_dict, context)
        
        # Store node output in context
        context.node_outputs[node_id] = result.output_data
        
        # Update node execution record
        async with self.db_pool.acquire() as conn:
            await conn.execute('''
                UPDATE node_executions 
                SET status = $1, completed_at = NOW(), output_data = $2::jsonb, error_message = $3
                WHERE id = $4
            ''',
                result.status.value,
                json.dumps(result.output_data),
                result.error_message,
                uuid.UUID(node_exec_id)
            )
        
        # Check if we should continue
        if not result.should_continue:
            context.log("Workflow waiting for approval")
            return
        
        # Find next nodes based on output handle
        next_nodes = edge_graph.get(node_id, [])
        
        matching_edges = [
            target_id for target_id, handle in next_nodes
            if handle == result.output_handle or handle == "default"
        ]
        
        if not matching_edges:
            context.log("No next nodes, workflow path complete", {
                "output_handle": result.output_handle
            })
            return
        
        # Execute next nodes (could be parallel in future)
        for next_node_id in matching_edges:
            await self._execute_node_chain(
                next_node_id,
                node_map,
                edge_graph,
                context
            )
    
    async def resume_after_approval(
        self,
        execution_id: str,
        approved: bool,
        approved_by: str,
        comment: Optional[str] = None
    ):
        """Resume a paused workflow after human approval/rejection"""
        
        print(f"\n{'✅' if approved else '❌'} Resuming execution: {execution_id}")
        print(f"   Decision: {'APPROVED' if approved else 'REJECTED'} by {approved_by}")
        
        async with self.db_pool.acquire() as conn:
            # Get execution
            execution = await conn.fetchrow(
                "SELECT * FROM workflow_executions WHERE id = $1",
                uuid.UUID(execution_id)
            )
            
            if not execution:
                raise ValueError(f"Execution {execution_id} not found")
            
            if execution["status"] != "waiting_approval":
                raise ValueError(f"Execution is not waiting for approval")
            
            current_node_id = str(execution["current_node_id"])
            workflow_id = str(execution["workflow_id"])
            
            # Load workflow data
            nodes = await conn.fetch(
                "SELECT * FROM workflow_nodes WHERE workflow_id = $1",
                execution["workflow_id"]
            )
            edges = await conn.fetch(
                "SELECT * FROM workflow_edges WHERE workflow_id = $1",
                execution["workflow_id"]
            )
            
            # Build context from stored logs
            stored_logs = json.loads(execution["execution_log"]) if execution["execution_log"] else []
            context = ExecutionContext(
                execution_id=execution_id,
                workflow_id=workflow_id,
                workflow_name=execution["workflow_name"],
                trigger_data=json.loads(execution["trigger_data"]) if execution["trigger_data"] else {},
                logs=stored_logs
            )
            
            context.log(f"Approval decision: {'APPROVED' if approved else 'REJECTED'}", {
                "by": approved_by,
                "comment": comment
            })
            
            # Update status
            await conn.execute('''
                UPDATE workflow_executions 
                SET status = 'running', execution_log = $1::jsonb
                WHERE id = $2
            ''',
                json.dumps(context.logs),
                uuid.UUID(execution_id)
            )
        
        # Build node lookup and edge graph
        node_map = {str(node["id"]): dict(node) for node in nodes}
        edge_graph: Dict[str, List[Tuple[str, str]]] = {}
        for edge in edges:
            source_id = str(edge["source_node_id"])
            target_id = str(edge["target_node_id"])
            source_handle = edge["source_handle"] or "default"
            
            if source_id not in edge_graph:
                edge_graph[source_id] = []
            edge_graph[source_id].append((target_id, source_handle))
        
        # Find next nodes based on approval result
        output_handle = "approved" if approved else "rejected"
        next_nodes = edge_graph.get(current_node_id, [])
        matching_edges = [
            target_id for target_id, handle in next_nodes
            if handle == output_handle
        ]
        
        try:
            for next_node_id in matching_edges:
                await self._execute_node_chain(
                    next_node_id,
                    node_map,
                    edge_graph,
                    context
                )
            
            await self._update_execution_status(execution_id, "completed", context)
            print(f"\n✅ Workflow completed after approval: {execution_id}")
            
        except Exception as e:
            context.log("Workflow execution failed after approval", str(e))
            await self._update_execution_status(execution_id, "failed", context, str(e))
            print(f"\n❌ Workflow failed after approval: {execution_id} - {e}")
    
    async def _update_execution_status(
        self,
        execution_id: str,
        status: str,
        context: ExecutionContext,
        error_message: Optional[str] = None
    ):
        """Update execution status in database"""
        async with self.db_pool.acquire() as conn:
            await conn.execute('''
                UPDATE workflow_executions 
                SET status = $1, 
                    completed_at = CASE WHEN $1 IN ('completed', 'failed') THEN NOW() ELSE NULL END,
                    execution_log = $2::jsonb,
                    error_message = $3
                WHERE id = $4
            ''',
                status,
                json.dumps(context.logs),
                error_message,
                uuid.UUID(execution_id)
            )


# ============================================================
# WORKFLOW EXECUTOR SINGLETON
# ============================================================

_executor: Optional[WorkflowExecutor] = None

def get_executor() -> Optional[WorkflowExecutor]:
    return _executor

def init_executor(db_pool: asyncpg.Pool):
    global _executor
    _executor = WorkflowExecutor(db_pool)
    return _executor
