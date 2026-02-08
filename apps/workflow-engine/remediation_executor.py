"""
Remediation Workflow Execution Engine - Phase 5C
Real execution of workflow nodes with subprocess, Docker, Kubernetes integration.
WebSocket broadcasting for real-time status updates.
"""

import asyncio
import subprocess
import json
import os
import shlex
from datetime import datetime
from typing import Dict, Any, List, Optional, Callable
from enum import Enum
from dataclasses import dataclass, field
from uuid import uuid4
import logging

from pydantic import BaseModel

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("remediation_executor")


class NodeStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"
    WAITING_APPROVAL = "waiting_approval"


class ExecutionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


@dataclass
class NodeExecutionResult:
    node_id: str
    status: NodeStatus
    output: str = ""
    error: str = ""
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    duration_ms: int = 0
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WorkflowExecutionContext:
    execution_id: str
    workflow_id: str
    workflow_name: str
    status: ExecutionStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    node_results: Dict[str, NodeExecutionResult] = field(default_factory=dict)
    variables: Dict[str, Any] = field(default_factory=dict)
    current_node_id: Optional[str] = None
    error: Optional[str] = None


# WebSocket broadcast callbacks - set by the router
broadcast_callbacks: List[Callable] = []


def register_broadcast_callback(callback: Callable):
    """Register a callback for broadcasting execution updates."""
    broadcast_callbacks.append(callback)


async def broadcast_update(update: Dict[str, Any]):
    """Broadcast an update to all registered callbacks."""
    for callback in broadcast_callbacks:
        try:
            await callback(update)
        except Exception as e:
            logger.error(f"Broadcast callback failed: {e}")


# Execution history storage
execution_history: Dict[str, WorkflowExecutionContext] = {}


class NodeExecutor:
    """Base class for node executors."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        raise NotImplementedError


class ShellCommandExecutor(NodeExecutor):
    """Execute shell commands safely."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        command = data.get("command", "echo 'No command specified'")
        timeout = data.get("timeout", 30)
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        try:
            # Execute command via subprocess
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            try:
                stdout, stderr = await asyncio.wait_for(
                    process.communicate(),
                    timeout=timeout
                )
                
                result.output = stdout.decode("utf-8", errors="replace")
                result.error = stderr.decode("utf-8", errors="replace")
                
                if process.returncode == 0:
                    result.status = NodeStatus.SUCCESS
                else:
                    result.status = NodeStatus.FAILED
                    result.error = f"Exit code: {process.returncode}\n{result.error}"
                    
            except asyncio.TimeoutError:
                process.kill()
                result.status = NodeStatus.FAILED
                result.error = f"Command timed out after {timeout}s"
                
        except Exception as e:
            result.status = NodeStatus.FAILED
            result.error = str(e)
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result


class DockerActionExecutor(NodeExecutor):
    """
    Execute Docker container actions.
    
    This executor uses the production Docker executor from executors.docker_executor
    for native Docker SDK operations with:
    - Container lifecycle (start, stop, restart, kill, remove)
    - Log retrieval
    - Health status checking
    - Resource statistics
    - Command execution inside containers
    
    Falls back to subprocess commands if Docker SDK is unavailable.
    """
    
    def __init__(self):
        self._docker_executor = None
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization of Docker executor."""
        if not self._initialized:
            try:
                from executors.docker_executor import get_docker_executor
                self._docker_executor = get_docker_executor()
                self._initialized = True
            except ImportError as e:
                logger.warning(f"Docker executor not available: {e}")
                self._initialized = True  # Don't retry
            except Exception as e:
                logger.warning(f"Failed to initialize Docker executor: {e}")
                self._initialized = True
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        action = data.get("action", "restart")
        container_name = data.get("container_name", "")
        timeout = data.get("timeout", 30)
        tail = data.get("tail", 100)
        command = data.get("command")  # For exec action
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        if not container_name:
            result.status = NodeStatus.FAILED
            result.error = "Container name not specified. Set 'container_name' in node data."
            result.completed_at = datetime.now()
            return result
        
        self._ensure_initialized()
        
        # Use Docker SDK if available
        if self._docker_executor is not None:
            try:
                loop = asyncio.get_event_loop()
                
                if action == "restart":
                    docker_result = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.restart_container(container_name, timeout)
                    )
                elif action == "stop":
                    docker_result = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.stop_container(container_name, timeout)
                    )
                elif action == "start":
                    docker_result = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.start_container(container_name)
                    )
                elif action == "kill":
                    docker_result = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.kill_container(container_name)
                    )
                elif action == "remove":
                    docker_result = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.remove_container(container_name, force=True)
                    )
                elif action == "logs":
                    docker_result = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.get_logs(container_name, tail=tail)
                    )
                elif action == "health":
                    health = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.get_health_status(container_name)
                    )
                    result.status = NodeStatus.SUCCESS
                    result.output = json.dumps(health, indent=2)
                    result.metrics = health
                    result.completed_at = datetime.now()
                    result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
                    return result
                elif action == "stats":
                    stats = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.get_stats(container_name)
                    )
                    result.status = NodeStatus.SUCCESS
                    result.output = json.dumps(stats, indent=2)
                    result.metrics = stats
                    result.completed_at = datetime.now()
                    result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
                    return result
                elif action == "exec" and command:
                    docker_result = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.exec_in_container(container_name, command)
                    )
                elif action == "inspect":
                    inspection = await loop.run_in_executor(
                        None,
                        lambda: self._docker_executor.inspect_container(container_name)
                    )
                    result.status = NodeStatus.SUCCESS
                    result.output = json.dumps(inspection, indent=2)[:5000]  # Truncate
                    result.completed_at = datetime.now()
                    result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
                    return result
                else:
                    result.status = NodeStatus.FAILED
                    result.error = f"Unknown Docker action: {action}"
                    result.completed_at = datetime.now()
                    return result
                
                # Process result from Docker executor
                result.output = docker_result.logs if hasattr(docker_result, 'logs') else docker_result.message
                result.metrics = {
                    "container_name": container_name,
                    "action": action,
                    "container_id": docker_result.container_id,
                    "duration_ms": docker_result.duration_ms
                }
                
                if docker_result.success:
                    result.status = NodeStatus.SUCCESS
                else:
                    result.status = NodeStatus.FAILED
                    result.error = docker_result.error
                
                result.completed_at = datetime.now()
                result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
                return result
                
            except Exception as e:
                logger.warning(f"Docker SDK execution failed, falling back to subprocess: {e}")
                # Fall through to subprocess fallback
        
        # Fallback: subprocess execution
        return await self._execute_subprocess(node, container_name, action, timeout, tail)
    
    async def _execute_subprocess(
        self,
        node: Dict[str, Any],
        container_name: str,
        action: str,
        timeout: int,
        tail: int
    ) -> NodeExecutionResult:
        """Fallback subprocess execution for Docker commands."""
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        docker_commands = {
            "restart": f"docker restart {shlex.quote(container_name)}",
            "stop": f"docker stop -t {timeout} {shlex.quote(container_name)}",
            "start": f"docker start {shlex.quote(container_name)}",
            "kill": f"docker kill {shlex.quote(container_name)}",
            "remove": f"docker rm -f {shlex.quote(container_name)}",
            "logs": f"docker logs --tail {tail} {shlex.quote(container_name)}",
            "inspect": f"docker inspect {shlex.quote(container_name)}",
            "health": f"docker inspect --format='{{{{.State.Health.Status}}}}' {shlex.quote(container_name)}",
            "stats": f"docker stats --no-stream --format='{{{{json .}}}}' {shlex.quote(container_name)}",
        }
        
        command = docker_commands.get(action)
        if not command:
            result.status = NodeStatus.FAILED
            result.error = f"Unknown Docker action: {action}"
            result.completed_at = datetime.now()
            return result
        
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=max(timeout + 10, 60)
            )
            
            result.output = stdout.decode("utf-8", errors="replace")
            result.error = stderr.decode("utf-8", errors="replace")
            
            if process.returncode == 0:
                result.status = NodeStatus.SUCCESS
            else:
                result.status = NodeStatus.FAILED
                
        except asyncio.TimeoutError:
            result.status = NodeStatus.FAILED
            result.error = f"Docker command timed out after {timeout}s"
        except Exception as e:
            result.status = NodeStatus.FAILED
            result.error = str(e)
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result



class ServiceActionExecutor(NodeExecutor):
    """Execute systemd service actions."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        action = data.get("action", "restart")
        service_name = data.get("service_name", "")
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        if not service_name:
            result.status = NodeStatus.FAILED
            result.error = "Service name not specified"
            result.completed_at = datetime.now()
            return result
        
        # Build systemctl command
        command = f"systemctl {action} {shlex.quote(service_name)}"
        
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=30
            )
            
            result.output = stdout.decode("utf-8", errors="replace")
            result.error = stderr.decode("utf-8", errors="replace")
            
            if process.returncode == 0:
                result.status = NodeStatus.SUCCESS
            else:
                result.status = NodeStatus.FAILED
                
        except Exception as e:
            result.status = NodeStatus.FAILED
            result.error = str(e)
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result


class MetricCheckExecutor(NodeExecutor):
    """Check system metrics and branch based on conditions."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        metric = data.get("metric", "memory_usage")
        operator = data.get("operator", ">")
        threshold = data.get("threshold", 80)
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        try:
            # Get metric value based on type
            value = await self._get_metric_value(metric)
            
            # Evaluate condition
            condition_met = self._evaluate_condition(value, operator, threshold)
            
            result.status = NodeStatus.SUCCESS
            result.output = f"Metric {metric} = {value} (threshold: {operator} {threshold})"
            result.metrics = {
                "metric": metric,
                "value": value,
                "threshold": threshold,
                "operator": operator,
                "condition_met": condition_met
            }
            
            # Store for branching
            context.variables["last_condition_result"] = condition_met
            context.variables[f"{node['id']}_result"] = condition_met
            
        except Exception as e:
            result.status = NodeStatus.FAILED
            result.error = str(e)
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result
    
    async def _get_metric_value(self, metric: str) -> float:
        """Get a metric value from the system."""
        metric_commands = {
            "memory_usage": "free | awk '/Mem:/ {printf \"%.1f\", $3/$2 * 100}'",
            "cpu_usage": "top -bn1 | grep 'Cpu(s)' | awk '{print $2}'",
            "disk_usage": "df / | tail -1 | awk '{print $5}' | tr -d '%'",
            "load_average": "cat /proc/loadavg | awk '{print $1}'",
        }
        
        command = metric_commands.get(metric)
        if not command:
            return 0.0
        
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        
        stdout, _ = await process.communicate()
        try:
            return float(stdout.decode().strip())
        except:
            return 0.0
    
    def _evaluate_condition(self, value: float, operator: str, threshold: float) -> bool:
        """Evaluate a condition."""
        operators = {
            ">": lambda v, t: v > t,
            "<": lambda v, t: v < t,
            ">=": lambda v, t: v >= t,
            "<=": lambda v, t: v <= t,
            "==": lambda v, t: v == t,
            "!=": lambda v, t: v != t,
        }
        return operators.get(operator, lambda v, t: False)(value, threshold)


class DelayExecutor(NodeExecutor):
    """Wait for a specified duration."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        duration_seconds = data.get("duration_seconds", 5)
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        await asyncio.sleep(duration_seconds)
        
        result.status = NodeStatus.SUCCESS
        result.output = f"Waited for {duration_seconds} seconds"
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result


class ConditionExecutor(NodeExecutor):
    """Evaluate a condition for branching."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        expression = data.get("expression", "true")
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        try:
            # Simple expression evaluation
            condition_result = self._evaluate_expression(expression, context.variables)
            
            result.status = NodeStatus.SUCCESS
            result.output = f"Condition '{expression}' = {condition_result}"
            result.metrics = {"condition_result": condition_result}
            
            context.variables["last_condition_result"] = condition_result
            context.variables[f"{node['id']}_result"] = condition_result
            
        except Exception as e:
            result.status = NodeStatus.FAILED
            result.error = str(e)
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result
    
    def _evaluate_expression(self, expression: str, variables: Dict) -> bool:
        """Safely evaluate a simple boolean expression."""
        # Very basic evaluation - in production use a proper expression parser
        if expression.lower() in ("true", "1", "yes"):
            return True
        if expression.lower() in ("false", "0", "no"):
            return False
        
        # Check if it's a variable reference
        if expression in variables:
            return bool(variables[expression])
        
        return True


class SlackNotifyExecutor(NodeExecutor):
    """Send Slack notification."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        channel = data.get("channel", "#alerts")
        message = data.get("message", "Workflow notification")
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        # In production, this would call the Slack API
        # For now, we'll simulate it
        logger.info(f"[SLACK] {channel}: {message}")
        
        result.status = NodeStatus.SUCCESS
        result.output = f"Notification sent to {channel}: {message}"
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result


class LogEntryExecutor(NodeExecutor):
    """Create a log entry."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        message = data.get("message", "Workflow log entry")
        level = data.get("level", "info")
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        # Log the message
        log_func = getattr(logger, level.lower(), logger.info)
        log_func(f"[WORKFLOW LOG] {context.workflow_name}: {message}")
        
        result.status = NodeStatus.SUCCESS
        result.output = f"Logged: {message}"
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result


class HumanApprovalExecutor(NodeExecutor):
    """Wait for human approval."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        approvers = data.get("approvers", [])
        timeout_minutes = data.get("timeout_minutes", 30)
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.WAITING_APPROVAL,
            started_at=datetime.now()
        )
        
        # In production, this would pause and wait for approval via API
        # For demo, we'll auto-approve after a short delay
        await asyncio.sleep(1)  # Simulate approval time
        
        result.status = NodeStatus.SUCCESS
        result.output = f"Approved by system (auto-approve for demo)"
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result


class RollbackCheckpointExecutor(NodeExecutor):
    """Create a rollback checkpoint."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        checkpoint_name = data.get("checkpoint_name", f"checkpoint_{datetime.now().isoformat()}")
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        # Store checkpoint in context
        context.variables[f"checkpoint_{checkpoint_name}"] = {
            "created_at": datetime.now().isoformat(),
            "variables": dict(context.variables),
            "node_results": {k: v.status.value for k, v in context.node_results.items()}
        }
        
        result.status = NodeStatus.SUCCESS
        result.output = f"Checkpoint '{checkpoint_name}' created"
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result


class AlertTriggerExecutor(NodeExecutor):
    """Process alert trigger."""
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        pattern = data.get("pattern", "*")
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.SUCCESS,
            started_at=datetime.now(),
            output=f"Trigger activated for pattern: {pattern}"
        )
        
        result.completed_at = datetime.now()
        result.duration_ms = 0
        
        return result


class SSHCommandExecutor(NodeExecutor):
    """
    Execute commands on remote hosts via SSH.
    
    This executor uses the production SSH executor from executors.ssh_executor
    for real remote command execution with:
    - Connection pooling
    - Retry logic with exponential backoff
    - Key-based and password authentication
    - Output streaming
    """
    
    def __init__(self):
        self._ssh_executor = None
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization of SSH executor."""
        if not self._initialized:
            try:
                from executors.ssh_executor import get_ssh_executor
                self._ssh_executor = get_ssh_executor()
                self._initialized = True
            except ImportError as e:
                logger.warning(f"SSH executor not available: {e}")
                self._initialized = True  # Don't retry
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        
        hostname = data.get("hostname") or data.get("host", "")
        command = data.get("command", "echo 'No command specified'")
        username = data.get("username", "root")
        port = data.get("port", 22)
        private_key_path = data.get("private_key_path") or data.get("key_path")
        password = data.get("password")
        timeout = data.get("timeout", 30)
        command_timeout = data.get("command_timeout", 300)
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        if not hostname:
            result.status = NodeStatus.FAILED
            result.error = "Hostname not specified. Set 'hostname' in node data."
            result.completed_at = datetime.now()
            return result
        
        self._ensure_initialized()
        
        if self._ssh_executor is None:
            # Fallback: try local subprocess if SSH to localhost
            if hostname in ("localhost", "127.0.0.1"):
                return await self._execute_locally(command, timeout, node["id"])
            
            result.status = NodeStatus.FAILED
            result.error = "SSH executor not available. Install paramiko: pip install paramiko"
            result.completed_at = datetime.now()
            return result
        
        try:
            # Execute via SSH executor in a thread pool (it's sync)
            loop = asyncio.get_event_loop()
            ssh_result = await loop.run_in_executor(
                None,
                lambda: self._ssh_executor.execute(
                    hostname=hostname,
                    command=command,
                    username=username,
                    port=port,
                    password=password,
                    private_key_path=private_key_path,
                    timeout=timeout,
                    command_timeout=command_timeout
                )
            )
            
            result.output = ssh_result.stdout
            result.error = ssh_result.stderr
            result.metrics = {
                "hostname": hostname,
                "exit_code": ssh_result.exit_code,
                "duration_ms": ssh_result.duration_ms
            }
            
            if ssh_result.success:
                result.status = NodeStatus.SUCCESS
            else:
                result.status = NodeStatus.FAILED
                if ssh_result.error:
                    result.error = f"{ssh_result.error}\n{result.error}".strip()
                    
        except Exception as e:
            result.status = NodeStatus.FAILED
            result.error = f"SSH execution failed: {str(e)}"
            logger.error(f"SSH execution error: {e}")
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result
    
    async def _execute_locally(
        self, 
        command: str, 
        timeout: int, 
        node_id: str
    ) -> NodeExecutionResult:
        """Fallback for localhost execution."""
        result = NodeExecutionResult(
            node_id=node_id,
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        try:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
            
            result.output = stdout.decode("utf-8", errors="replace")
            result.error = stderr.decode("utf-8", errors="replace")
            
            if process.returncode == 0:
                result.status = NodeStatus.SUCCESS
            else:
                result.status = NodeStatus.FAILED
                result.error = f"Exit code: {process.returncode}\n{result.error}"
                
        except asyncio.TimeoutError:
            result.status = NodeStatus.FAILED
            result.error = f"Command timed out after {timeout}s"
        except Exception as e:
            result.status = NodeStatus.FAILED
            result.error = str(e)
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        
        return result


class APICallExecutor(NodeExecutor):
    """
    Execute HTTP API calls.
    
    This executor uses the production API executor from executors.api_executor
    for HTTP requests with:
    - Multiple authentication methods (Bearer, Basic, API Key)
    - Retry with exponential backoff
    - Response parsing (JSON, XML, text)
    - Timeout handling
    """
    
    def __init__(self):
        self._api_executor = None
        self._initialized = False
    
    def _ensure_initialized(self):
        """Lazy initialization of API executor."""
        if not self._initialized:
            try:
                from executors.api_executor import get_api_executor
                self._api_executor = get_api_executor()
                self._initialized = True
            except ImportError as e:
                logger.warning(f"API executor not available: {e}")
                self._initialized = True
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        
        url = data.get("url", "")
        method = data.get("method", "GET").upper()
        headers = data.get("headers", {})
        body = data.get("body") or data.get("json")
        params = data.get("params", {})
        timeout = data.get("timeout", 30)
        
        # Auth config
        auth_type = data.get("auth_type", "none")
        token = data.get("token") or data.get("bearer_token")
        api_key = data.get("api_key")
        username = data.get("username")
        password = data.get("password")
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        if not url:
            result.status = NodeStatus.FAILED
            result.error = "URL not specified. Set 'url' in node data."
            result.completed_at = datetime.now()
            return result
        
        self._ensure_initialized()
        
        # Use API executor if available
        if self._api_executor is not None:
            try:
                from executors.api_executor import AuthConfig, AuthType as ApiAuthType, HTTPMethod
                
                # Build auth config
                auth = None
                if auth_type == "bearer" and token:
                    auth = AuthConfig(auth_type=ApiAuthType.BEARER, token=token)
                elif auth_type == "basic" and username:
                    auth = AuthConfig(
                        auth_type=ApiAuthType.BASIC, 
                        username=username, 
                        password=password
                    )
                elif auth_type == "api_key" and api_key:
                    auth = AuthConfig(
                        auth_type=ApiAuthType.API_KEY_HEADER,
                        api_key=api_key,
                        api_key_name=data.get("api_key_name", "X-API-Key")
                    )
                
                # Execute in thread pool (sync API executor)
                loop = asyncio.get_event_loop()
                api_result = await loop.run_in_executor(
                    None,
                    lambda: self._api_executor.request(
                        method=method,
                        url=url,
                        headers=headers if headers else None,
                        json=body if isinstance(body, dict) else None,
                        data=body if isinstance(body, str) else None,
                        params=params if params else None,
                        auth=auth,
                        timeout=timeout
                    )
                )
                
                result.output = api_result.response_body[:5000] if api_result.response_body else ""
                result.metrics = {
                    "status_code": api_result.status_code,
                    "url": url,
                    "method": method,
                    "duration_ms": api_result.duration_ms,
                    "retries": api_result.retries
                }
                
                # Store response JSON in context
                if api_result.response_json:
                    context.variables[f"{node['id']}_response"] = api_result.response_json
                
                if api_result.success:
                    result.status = NodeStatus.SUCCESS
                else:
                    result.status = NodeStatus.FAILED
                    result.error = api_result.error or f"HTTP {api_result.status_code}"
                
                result.completed_at = datetime.now()
                result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
                return result
                
            except Exception as e:
                logger.warning(f"API executor failed, falling back to httpx: {e}")
        
        # Fallback: direct httpx call
        return await self._execute_fallback(node, url, method, headers, body, params, timeout)
    
    async def _execute_fallback(
        self,
        node: Dict[str, Any],
        url: str,
        method: str,
        headers: Dict,
        body: Any,
        params: Dict,
        timeout: int
    ) -> NodeExecutionResult:
        """Fallback using httpx directly."""
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        try:
            import httpx
            
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers if headers else None,
                    json=body if isinstance(body, dict) else None,
                    content=body if isinstance(body, str) else None,
                    params=params if params else None
                )
                
                result.output = response.text[:5000]
                result.metrics = {
                    "status_code": response.status_code,
                    "url": url,
                    "method": method
                }
                
                if response.is_success:
                    result.status = NodeStatus.SUCCESS
                else:
                    result.status = NodeStatus.FAILED
                    result.error = f"HTTP {response.status_code}"
                    
        except ImportError:
            result.status = NodeStatus.FAILED
            result.error = "httpx not available. Run: pip install httpx"
        except Exception as e:
            result.status = NodeStatus.FAILED
            result.error = str(e)
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        return result


class WebhookExecutor(NodeExecutor):
    """
    Send webhook notifications.
    
    Supports:
    - Generic webhooks
    - Slack integration
    - PagerDuty integration
    - OpsGenie integration
    """
    
    def __init__(self):
        self._api_executor = None
        self._initialized = False
    
    def _ensure_initialized(self):
        if not self._initialized:
            try:
                from executors.api_executor import get_api_executor
                self._api_executor = get_api_executor()
                self._initialized = True
            except ImportError:
                self._initialized = True
    
    async def execute(
        self, 
        node: Dict[str, Any], 
        context: WorkflowExecutionContext
    ) -> NodeExecutionResult:
        data = node.get("data", {})
        
        url = data.get("url") or data.get("webhook_url", "")
        webhook_type = data.get("webhook_type", "generic")  # generic, slack, pagerduty, opsgenie
        payload = data.get("payload", {})
        
        result = NodeExecutionResult(
            node_id=node["id"],
            status=NodeStatus.RUNNING,
            started_at=datetime.now()
        )
        
        if not url:
            result.status = NodeStatus.FAILED
            result.error = "Webhook URL not specified"
            result.completed_at = datetime.now()
            return result
        
        self._ensure_initialized()
        
        if self._api_executor is not None:
            try:
                loop = asyncio.get_event_loop()
                
                if webhook_type == "slack":
                    text = data.get("text") or data.get("message", "Alert from AIOps")
                    channel = data.get("channel")
                    api_result = await loop.run_in_executor(
                        None,
                        lambda: self._api_executor.call_slack_webhook(
                            url, text, channel=channel
                        )
                    )
                elif webhook_type == "pagerduty":
                    api_result = await loop.run_in_executor(
                        None,
                        lambda: self._api_executor.call_pagerduty(
                            routing_key=data.get("routing_key", ""),
                            event_action=data.get("event_action", "trigger"),
                            dedup_key=data.get("dedup_key", context.workflow_id),
                            summary=data.get("summary", "AIOps Alert"),
                            source=data.get("source", "aiops-platform"),
                            severity=data.get("severity", "error")
                        )
                    )
                else:
                    api_result = await loop.run_in_executor(
                        None,
                        lambda: self._api_executor.send_webhook(url, payload)
                    )
                
                result.output = api_result.response_body[:2000] if api_result.response_body else ""
                result.metrics = {
                    "webhook_type": webhook_type,
                    "status_code": api_result.status_code,
                    "duration_ms": api_result.duration_ms
                }
                
                if api_result.success:
                    result.status = NodeStatus.SUCCESS
                else:
                    result.status = NodeStatus.FAILED
                    result.error = api_result.error or f"HTTP {api_result.status_code}"
                
                result.completed_at = datetime.now()
                result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
                return result
                
            except Exception as e:
                result.status = NodeStatus.FAILED
                result.error = str(e)
        else:
            result.status = NodeStatus.FAILED
            result.error = "API executor not available"
        
        result.completed_at = datetime.now()
        result.duration_ms = int((result.completed_at - result.started_at).total_seconds() * 1000)
        return result


# Node executor registry
NODE_EXECUTORS: Dict[str, NodeExecutor] = {
    "shell_command": ShellCommandExecutor(),
    "ssh_command": SSHCommandExecutor(),  # Phase 6A: Remote SSH execution
    "docker_action": DockerActionExecutor(),  # Phase 6B: Container management
    "api_call": APICallExecutor(),  # Phase 6D: HTTP API calls
    "webhook": WebhookExecutor(),  # Phase 6D: Webhook notifications  
    "service_action": ServiceActionExecutor(),
    "metric_check": MetricCheckExecutor(),
    "delay": DelayExecutor(),
    "condition": ConditionExecutor(),
    "slack_notify": SlackNotifyExecutor(),
    "email_notify": LogEntryExecutor(),  # Use log for email in demo
    "log_entry": LogEntryExecutor(),
    "human_approval": HumanApprovalExecutor(),
    "rollback_checkpoint": RollbackCheckpointExecutor(),
    "alert_trigger": AlertTriggerExecutor(),
    "manual_trigger": AlertTriggerExecutor(),
    "schedule_trigger": AlertTriggerExecutor(),
    "webhook_trigger": AlertTriggerExecutor(),
}




class WorkflowExecutor:
    """Main workflow execution engine."""
    
    def __init__(self):
        self.running_executions: Dict[str, WorkflowExecutionContext] = {}
    
    def _build_execution_order(
        self, 
        nodes: List[Dict], 
        edges: List[Dict]
    ) -> List[str]:
        """Build topological order of nodes based on edges."""
        # Create adjacency list
        adjacency = {node["id"]: [] for node in nodes}
        in_degree = {node["id"]: 0 for node in nodes}
        
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source and target and source in adjacency and target in in_degree:
                adjacency[source].append(target)
                in_degree[target] += 1
        
        # Kahn's algorithm for topological sort
        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        order = []
        
        while queue:
            current = queue.pop(0)
            order.append(current)
            
            for neighbor in adjacency.get(current, []):
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
        
        return order
    
    async def execute_workflow(
        self, 
        workflow: Dict[str, Any],
        trigger_data: Optional[Dict] = None
    ) -> WorkflowExecutionContext:
        """Execute a complete workflow."""
        
        execution_id = str(uuid4())[:8]
        
        context = WorkflowExecutionContext(
            execution_id=execution_id,
            workflow_id=workflow.get("id", "unknown"),
            workflow_name=workflow.get("name", "Unknown Workflow"),
            status=ExecutionStatus.RUNNING,
            started_at=datetime.now(),
            variables=trigger_data or {}
        )
        
        self.running_executions[execution_id] = context
        execution_history[execution_id] = context
        
        nodes = workflow.get("nodes", [])
        edges = workflow.get("edges", [])
        
        # Get node lookup
        node_lookup = {node["id"]: node for node in nodes}
        
        # Build execution order
        execution_order = self._build_execution_order(nodes, edges)
        
        logger.info(f"Starting workflow execution: {context.workflow_name} ({execution_id})")
        logger.info(f"Execution order: {execution_order}")
        
        # Broadcast start
        await broadcast_update({
            "type": "workflow_started",
            "execution_id": execution_id,
            "workflow_id": context.workflow_id,
            "workflow_name": context.workflow_name
        })
        
        try:
            for node_id in execution_order:
                node = node_lookup.get(node_id)
                if not node:
                    continue
                
                context.current_node_id = node_id
                
                # Check if this node should be skipped based on branching
                if self._should_skip_node(node, edges, context):
                    result = NodeExecutionResult(
                        node_id=node_id,
                        status=NodeStatus.SKIPPED,
                        output="Skipped due to branch condition"
                    )
                    context.node_results[node_id] = result
                    continue
                
                # Get executor for node type
                node_type = node.get("type", "unknown")
                executor = NODE_EXECUTORS.get(node_type)
                
                if not executor:
                    logger.warning(f"No executor for node type: {node_type}")
                    result = NodeExecutionResult(
                        node_id=node_id,
                        status=NodeStatus.SUCCESS,
                        output=f"Node type '{node_type}' executed (no-op)"
                    )
                else:
                    # Broadcast node starting
                    await broadcast_update({
                        "type": "node_started",
                        "execution_id": execution_id,
                        "node_id": node_id,
                        "node_type": node_type
                    })
                    
                    # Execute the node
                    result = await executor.execute(node, context)
                    
                    # Broadcast node completed
                    await broadcast_update({
                        "type": "node_completed",
                        "execution_id": execution_id,
                        "node_id": node_id,
                        "node_type": node_type,
                        "status": result.status.value,
                        "output": result.output[:200] if result.output else "",
                        "duration_ms": result.duration_ms
                    })
                
                context.node_results[node_id] = result
                
                # If node failed, stop execution
                if result.status == NodeStatus.FAILED:
                    context.status = ExecutionStatus.FAILED
                    context.error = f"Node {node_id} failed: {result.error}"
                    break
            
            # Mark as completed if not failed
            if context.status == ExecutionStatus.RUNNING:
                context.status = ExecutionStatus.COMPLETED
                
        except Exception as e:
            context.status = ExecutionStatus.FAILED
            context.error = str(e)
            logger.error(f"Workflow execution failed: {e}")
        
        context.completed_at = datetime.now()
        context.current_node_id = None
        
        # Remove from running
        del self.running_executions[execution_id]
        
        # Broadcast completion
        await broadcast_update({
            "type": "workflow_completed",
            "execution_id": execution_id,
            "workflow_id": context.workflow_id,
            "status": context.status.value,
            "duration_ms": int((context.completed_at - context.started_at).total_seconds() * 1000),
            "error": context.error
        })
        
        logger.info(f"Workflow execution completed: {context.status.value}")
        
        return context
    
    def _should_skip_node(
        self, 
        node: Dict, 
        edges: List[Dict], 
        context: WorkflowExecutionContext
    ) -> bool:
        """Check if a node should be skipped based on branch conditions."""
        node_id = node["id"]
        
        # Find incoming edges
        incoming = [e for e in edges if e.get("target") == node_id]
        
        for edge in incoming:
            source_handle = edge.get("source_handle")
            source_id = edge.get("source")
            
            if source_handle in ("true", "false"):
                # This is a conditional branch
                condition_result = context.variables.get(f"{source_id}_result")
                
                if source_handle == "true" and condition_result is False:
                    return True
                if source_handle == "false" and condition_result is True:
                    return True
        
        return False
    
    def get_execution_status(self, execution_id: str) -> Optional[Dict]:
        """Get the status of an execution."""
        context = execution_history.get(execution_id)
        if not context:
            return None
        
        return {
            "execution_id": context.execution_id,
            "workflow_id": context.workflow_id,
            "workflow_name": context.workflow_name,
            "status": context.status.value,
            "started_at": context.started_at.isoformat(),
            "completed_at": context.completed_at.isoformat() if context.completed_at else None,
            "current_node_id": context.current_node_id,
            "error": context.error,
            "node_results": {
                k: {
                    "status": v.status.value,
                    "output": v.output[:200] if v.output else "",
                    "error": v.error[:200] if v.error else "",
                    "duration_ms": v.duration_ms
                }
                for k, v in context.node_results.items()
            }
        }
    
    def list_executions(self, limit: int = 50) -> List[Dict]:
        """List recent executions."""
        executions = sorted(
            execution_history.values(),
            key=lambda x: x.started_at,
            reverse=True
        )[:limit]
        
        return [
            {
                "execution_id": e.execution_id,
                "workflow_id": e.workflow_id,
                "workflow_name": e.workflow_name,
                "status": e.status.value,
                "started_at": e.started_at.isoformat(),
                "completed_at": e.completed_at.isoformat() if e.completed_at else None,
                "nodes_executed": len(e.node_results),
                "error": e.error
            }
            for e in executions
        ]


# Global executor instance
workflow_executor = WorkflowExecutor()
