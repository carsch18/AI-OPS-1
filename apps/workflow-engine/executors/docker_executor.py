"""
Docker Executor - Production-Grade Container Management
========================================================

Features:
- Container lifecycle (start, stop, restart, kill, remove)
- Image operations (pull, build, tag)
- Log streaming with tail and follow
- Health check monitoring
- Resource stats and inspection
- Compose-style multi-container operations
- Connection to local or remote Docker daemons
"""

import os
import time
import logging
import threading
from typing import Optional, Dict, Any, List, Callable, Generator, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from contextlib import contextmanager

try:
    import docker
    from docker import DockerClient
    from docker.models.containers import Container
    from docker.models.images import Image
    from docker.errors import (
        DockerException, 
        ContainerError, 
        ImageNotFound, 
        APIError,
        NotFound
    )
    DOCKER_AVAILABLE = True
except ImportError:
    DOCKER_AVAILABLE = False
    DockerClient = None
    Container = None
    Image = None

# Configure logging
logger = logging.getLogger(__name__)


class ContainerAction(Enum):
    """Container lifecycle actions"""
    START = "start"
    STOP = "stop"
    RESTART = "restart"
    KILL = "kill"
    PAUSE = "pause"
    UNPAUSE = "unpause"
    REMOVE = "remove"


class ContainerStatus(Enum):
    """Container status states"""
    RUNNING = "running"
    EXITED = "exited"
    PAUSED = "paused"
    RESTARTING = "restarting"
    CREATED = "created"
    DEAD = "dead"
    REMOVING = "removing"
    UNKNOWN = "unknown"


@dataclass
class DockerExecutionResult:
    """Result of Docker operation"""
    action: str
    container_name: str
    success: bool
    message: str = ""
    exit_code: Optional[int] = None
    logs: str = ""
    stats: Optional[Dict[str, Any]] = None
    duration_ms: float = 0
    timestamp: datetime = field(default_factory=datetime.utcnow)
    error: Optional[str] = None
    container_id: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action,
            "container_name": self.container_name,
            "success": self.success,
            "message": self.message,
            "exit_code": self.exit_code,
            "logs": self.logs[:5000] if self.logs else "",  # Truncate logs
            "stats": self.stats,
            "duration_ms": self.duration_ms,
            "timestamp": self.timestamp.isoformat(),
            "error": self.error,
            "container_id": self.container_id
        }


@dataclass 
class ImageOperationResult:
    """Result of image operation"""
    action: str
    image_name: str
    success: bool
    message: str = ""
    image_id: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    size_bytes: int = 0
    duration_ms: float = 0
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action,
            "image_name": self.image_name,
            "success": self.success,
            "message": self.message,
            "image_id": self.image_id,
            "tags": self.tags,
            "size_bytes": self.size_bytes,
            "size_mb": round(self.size_bytes / (1024 * 1024), 2),
            "duration_ms": self.duration_ms,
            "error": self.error
        }


class DockerConnectionManager:
    """
    Manages Docker daemon connections.
    Supports local and remote Docker hosts.
    """
    
    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize Docker connection.
        
        Args:
            base_url: Docker daemon URL. If None, uses environment or local socket.
                     Examples:
                     - None (auto-detect)
                     - "unix:///var/run/docker.sock"
                     - "tcp://192.168.1.100:2376"
        """
        self._base_url = base_url
        self._client: Optional[DockerClient] = None
        self._lock = threading.Lock()
    
    @property
    def client(self) -> DockerClient:
        """Get or create Docker client"""
        if self._client is None:
            with self._lock:
                if self._client is None:
                    self._client = self._create_client()
        return self._client
    
    def _create_client(self) -> DockerClient:
        """Create Docker client with appropriate configuration"""
        if not DOCKER_AVAILABLE:
            raise RuntimeError("Docker SDK not available. Run: pip install docker")
        
        try:
            if self._base_url:
                client = docker.DockerClient(base_url=self._base_url)
            else:
                # Auto-detect from environment or default socket
                client = docker.from_env()
            
            # Verify connection
            client.ping()
            logger.info(f"Connected to Docker daemon: {client.version()['Version']}")
            
            return client
            
        except Exception as e:
            logger.error(f"Failed to connect to Docker: {e}")
            raise
    
    def is_connected(self) -> bool:
        """Check if connected to Docker daemon"""
        try:
            self.client.ping()
            return True
        except Exception:
            return False
    
    def get_version(self) -> Dict[str, Any]:
        """Get Docker daemon version info"""
        return self.client.version()
    
    def close(self):
        """Close Docker connection"""
        if self._client:
            try:
                self._client.close()
            except Exception:
                pass
            self._client = None


class DockerExecutor:
    """
    Production-grade Docker container executor.
    
    Features:
    - Container lifecycle management
    - Image operations
    - Log streaming
    - Health monitoring
    - Resource stats
    
    Usage:
        executor = DockerExecutor()
        
        # Restart a container
        result = executor.restart_container("nginx")
        
        # Get logs
        result = executor.get_logs("nginx", tail=100)
        
        # Pull an image
        result = executor.pull_image("nginx:latest")
    """
    
    def __init__(self, connection_manager: Optional[DockerConnectionManager] = None):
        self._connection = connection_manager or DockerConnectionManager()
    
    @property
    def client(self) -> DockerClient:
        return self._connection.client
    
    # =========================================================
    # CONTAINER OPERATIONS
    # =========================================================
    
    def get_container(self, name_or_id: str) -> Optional[Container]:
        """Get container by name or ID"""
        try:
            return self.client.containers.get(name_or_id)
        except NotFound:
            return None
        except Exception as e:
            logger.error(f"Error getting container {name_or_id}: {e}")
            return None
    
    def list_containers(
        self, 
        all: bool = False,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """List containers with optional filtering"""
        try:
            containers = self.client.containers.list(all=all, filters=filters)
            return [
                {
                    "id": c.short_id,
                    "name": c.name,
                    "image": c.image.tags[0] if c.image.tags else c.image.short_id,
                    "status": c.status,
                    "created": c.attrs.get("Created", ""),
                    "ports": c.ports,
                    "labels": c.labels
                }
                for c in containers
            ]
        except Exception as e:
            logger.error(f"Error listing containers: {e}")
            return []
    
    def container_action(
        self, 
        name_or_id: str, 
        action: ContainerAction,
        timeout: int = 30,
        force: bool = False
    ) -> DockerExecutionResult:
        """
        Perform action on container.
        
        Args:
            name_or_id: Container name or ID
            action: Action to perform
            timeout: Timeout for stop/restart operations
            force: Force remove (for remove action)
        """
        start_time = time.time()
        
        container = self.get_container(name_or_id)
        if not container:
            return DockerExecutionResult(
                action=action.value,
                container_name=name_or_id,
                success=False,
                error=f"Container not found: {name_or_id}"
            )
        
        try:
            if action == ContainerAction.START:
                container.start()
                message = f"Container '{name_or_id}' started"
                
            elif action == ContainerAction.STOP:
                container.stop(timeout=timeout)
                message = f"Container '{name_or_id}' stopped"
                
            elif action == ContainerAction.RESTART:
                container.restart(timeout=timeout)
                message = f"Container '{name_or_id}' restarted"
                
            elif action == ContainerAction.KILL:
                container.kill()
                message = f"Container '{name_or_id}' killed"
                
            elif action == ContainerAction.PAUSE:
                container.pause()
                message = f"Container '{name_or_id}' paused"
                
            elif action == ContainerAction.UNPAUSE:
                container.unpause()
                message = f"Container '{name_or_id}' unpaused"
                
            elif action == ContainerAction.REMOVE:
                container.remove(force=force)
                message = f"Container '{name_or_id}' removed"
            
            else:
                return DockerExecutionResult(
                    action=action.value,
                    container_name=name_or_id,
                    success=False,
                    error=f"Unknown action: {action.value}"
                )
            
            duration_ms = (time.time() - start_time) * 1000
            
            # Refresh container state (if not removed)
            if action != ContainerAction.REMOVE:
                container.reload()
            
            return DockerExecutionResult(
                action=action.value,
                container_name=name_or_id,
                success=True,
                message=message,
                container_id=container.short_id if action != ContainerAction.REMOVE else None,
                duration_ms=duration_ms
            )
            
        except APIError as e:
            duration_ms = (time.time() - start_time) * 1000
            return DockerExecutionResult(
                action=action.value,
                container_name=name_or_id,
                success=False,
                error=f"Docker API error: {e.explanation}",
                duration_ms=duration_ms
            )
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return DockerExecutionResult(
                action=action.value,
                container_name=name_or_id,
                success=False,
                error=str(e),
                duration_ms=duration_ms
            )
    
    # Convenience methods
    def start_container(self, name_or_id: str) -> DockerExecutionResult:
        return self.container_action(name_or_id, ContainerAction.START)
    
    def stop_container(self, name_or_id: str, timeout: int = 30) -> DockerExecutionResult:
        return self.container_action(name_or_id, ContainerAction.STOP, timeout=timeout)
    
    def restart_container(self, name_or_id: str, timeout: int = 30) -> DockerExecutionResult:
        return self.container_action(name_or_id, ContainerAction.RESTART, timeout=timeout)
    
    def kill_container(self, name_or_id: str) -> DockerExecutionResult:
        return self.container_action(name_or_id, ContainerAction.KILL)
    
    def remove_container(self, name_or_id: str, force: bool = False) -> DockerExecutionResult:
        return self.container_action(name_or_id, ContainerAction.REMOVE, force=force)
    
    # =========================================================
    # LOGS
    # =========================================================
    
    def get_logs(
        self, 
        name_or_id: str,
        tail: int = 100,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
        timestamps: bool = True,
        stdout: bool = True,
        stderr: bool = True
    ) -> DockerExecutionResult:
        """Get container logs"""
        start_time = time.time()
        
        container = self.get_container(name_or_id)
        if not container:
            return DockerExecutionResult(
                action="logs",
                container_name=name_or_id,
                success=False,
                error=f"Container not found: {name_or_id}"
            )
        
        try:
            logs = container.logs(
                tail=tail,
                since=since,
                until=until,
                timestamps=timestamps,
                stdout=stdout,
                stderr=stderr,
                stream=False
            )
            
            log_text = logs.decode('utf-8', errors='replace') if isinstance(logs, bytes) else str(logs)
            duration_ms = (time.time() - start_time) * 1000
            
            return DockerExecutionResult(
                action="logs",
                container_name=name_or_id,
                success=True,
                logs=log_text,
                message=f"Retrieved {len(log_text)} bytes of logs",
                container_id=container.short_id,
                duration_ms=duration_ms
            )
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return DockerExecutionResult(
                action="logs",
                container_name=name_or_id,
                success=False,
                error=str(e),
                duration_ms=duration_ms
            )
    
    def stream_logs(
        self,
        name_or_id: str,
        callback: Callable[[str], None],
        tail: int = 10,
        follow: bool = True
    ) -> bool:
        """
        Stream container logs to callback.
        Returns False if container not found.
        """
        container = self.get_container(name_or_id)
        if not container:
            return False
        
        try:
            for line in container.logs(stream=True, follow=follow, tail=tail):
                text = line.decode('utf-8', errors='replace').strip()
                if text:
                    callback(text)
            return True
        except Exception as e:
            logger.error(f"Error streaming logs: {e}")
            return False
    
    # =========================================================
    # HEALTH & STATS
    # =========================================================
    
    def get_health_status(self, name_or_id: str) -> Dict[str, Any]:
        """Get container health status"""
        container = self.get_container(name_or_id)
        if not container:
            return {"status": "not_found", "healthy": False}
        
        try:
            container.reload()
            state = container.attrs.get("State", {})
            health = state.get("Health", {})
            
            return {
                "status": container.status,
                "running": state.get("Running", False),
                "healthy": health.get("Status", "none") == "healthy",
                "health_status": health.get("Status", "none"),
                "health_failing_streak": health.get("FailingStreak", 0),
                "exit_code": state.get("ExitCode"),
                "error": state.get("Error", ""),
                "started_at": state.get("StartedAt"),
                "finished_at": state.get("FinishedAt")
            }
        except Exception as e:
            return {"status": "error", "healthy": False, "error": str(e)}
    
    def get_stats(self, name_or_id: str, stream: bool = False) -> Dict[str, Any]:
        """Get container resource statistics"""
        container = self.get_container(name_or_id)
        if not container:
            return {"error": f"Container not found: {name_or_id}"}
        
        try:
            stats = container.stats(stream=stream)
            
            if stream:
                # Return first stats snapshot
                stats = next(stats)
            
            # Parse stats
            cpu_delta = stats.get('cpu_stats', {}).get('cpu_usage', {}).get('total_usage', 0) - \
                       stats.get('precpu_stats', {}).get('cpu_usage', {}).get('total_usage', 0)
            system_delta = stats.get('cpu_stats', {}).get('system_cpu_usage', 0) - \
                          stats.get('precpu_stats', {}).get('system_cpu_usage', 0)
            
            cpu_percent = 0.0
            if system_delta > 0:
                num_cpus = len(stats.get('cpu_stats', {}).get('cpu_usage', {}).get('percpu_usage', []))
                cpu_percent = (cpu_delta / system_delta) * num_cpus * 100.0
            
            memory_stats = stats.get('memory_stats', {})
            memory_usage = memory_stats.get('usage', 0)
            memory_limit = memory_stats.get('limit', 1)
            memory_percent = (memory_usage / memory_limit) * 100.0
            
            networks = stats.get('networks', {})
            network_rx = sum(n.get('rx_bytes', 0) for n in networks.values())
            network_tx = sum(n.get('tx_bytes', 0) for n in networks.values())
            
            return {
                "container": name_or_id,
                "cpu_percent": round(cpu_percent, 2),
                "memory_usage_bytes": memory_usage,
                "memory_limit_bytes": memory_limit,
                "memory_percent": round(memory_percent, 2),
                "memory_usage_mb": round(memory_usage / (1024 * 1024), 2),
                "network_rx_bytes": network_rx,
                "network_tx_bytes": network_tx,
                "network_rx_mb": round(network_rx / (1024 * 1024), 2),
                "network_tx_mb": round(network_tx / (1024 * 1024), 2),
                "pids_current": stats.get('pids_stats', {}).get('current', 0)
            }
            
        except Exception as e:
            return {"error": str(e)}
    
    def inspect_container(self, name_or_id: str) -> Dict[str, Any]:
        """Get detailed container inspection"""
        container = self.get_container(name_or_id)
        if not container:
            return {"error": f"Container not found: {name_or_id}"}
        
        try:
            return container.attrs
        except Exception as e:
            return {"error": str(e)}
    
    # =========================================================
    # EXECUTE COMMAND
    # =========================================================
    
    def exec_in_container(
        self,
        name_or_id: str,
        command: str,
        workdir: Optional[str] = None,
        environment: Optional[Dict[str, str]] = None,
        user: Optional[str] = None,
        tty: bool = False,
        privileged: bool = False
    ) -> DockerExecutionResult:
        """Execute command inside running container"""
        start_time = time.time()
        
        container = self.get_container(name_or_id)
        if not container:
            return DockerExecutionResult(
                action="exec",
                container_name=name_or_id,
                success=False,
                error=f"Container not found: {name_or_id}"
            )
        
        if container.status != "running":
            return DockerExecutionResult(
                action="exec",
                container_name=name_or_id,
                success=False,
                error=f"Container is not running (status: {container.status})"
            )
        
        try:
            exit_code, output = container.exec_run(
                cmd=command,
                workdir=workdir,
                environment=environment,
                user=user,
                tty=tty,
                privileged=privileged,
                demux=False
            )
            
            output_text = output.decode('utf-8', errors='replace') if isinstance(output, bytes) else str(output)
            duration_ms = (time.time() - start_time) * 1000
            
            return DockerExecutionResult(
                action="exec",
                container_name=name_or_id,
                success=exit_code == 0,
                exit_code=exit_code,
                logs=output_text,
                message=f"Command executed with exit code {exit_code}",
                container_id=container.short_id,
                duration_ms=duration_ms,
                error=None if exit_code == 0 else f"Exit code: {exit_code}"
            )
            
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return DockerExecutionResult(
                action="exec",
                container_name=name_or_id,
                success=False,
                error=str(e),
                duration_ms=duration_ms
            )
    
    # =========================================================
    # IMAGE OPERATIONS
    # =========================================================
    
    def pull_image(
        self,
        image_name: str,
        tag: str = "latest",
        progress_callback: Optional[Callable[[Dict], None]] = None
    ) -> ImageOperationResult:
        """Pull image from registry"""
        start_time = time.time()
        full_name = f"{image_name}:{tag}"
        
        try:
            # Pull with optional progress
            image = self.client.images.pull(image_name, tag=tag)
            
            duration_ms = (time.time() - start_time) * 1000
            
            return ImageOperationResult(
                action="pull",
                image_name=full_name,
                success=True,
                message=f"Successfully pulled {full_name}",
                image_id=image.short_id,
                tags=image.tags,
                size_bytes=image.attrs.get('Size', 0),
                duration_ms=duration_ms
            )
            
        except ImageNotFound:
            duration_ms = (time.time() - start_time) * 1000
            return ImageOperationResult(
                action="pull",
                image_name=full_name,
                success=False,
                error=f"Image not found: {full_name}",
                duration_ms=duration_ms
            )
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return ImageOperationResult(
                action="pull",
                image_name=full_name,
                success=False,
                error=str(e),
                duration_ms=duration_ms
            )
    
    def list_images(self, name: Optional[str] = None) -> List[Dict[str, Any]]:
        """List local images"""
        try:
            images = self.client.images.list(name=name)
            return [
                {
                    "id": img.short_id,
                    "tags": img.tags,
                    "size_bytes": img.attrs.get('Size', 0),
                    "size_mb": round(img.attrs.get('Size', 0) / (1024 * 1024), 2),
                    "created": img.attrs.get('Created', '')
                }
                for img in images
            ]
        except Exception as e:
            logger.error(f"Error listing images: {e}")
            return []
    
    def remove_image(
        self, 
        image_name: str, 
        force: bool = False,
        noprune: bool = False
    ) -> ImageOperationResult:
        """Remove local image"""
        start_time = time.time()
        
        try:
            self.client.images.remove(image_name, force=force, noprune=noprune)
            duration_ms = (time.time() - start_time) * 1000
            
            return ImageOperationResult(
                action="remove",
                image_name=image_name,
                success=True,
                message=f"Successfully removed {image_name}",
                duration_ms=duration_ms
            )
            
        except ImageNotFound:
            duration_ms = (time.time() - start_time) * 1000
            return ImageOperationResult(
                action="remove",
                image_name=image_name,
                success=False,
                error=f"Image not found: {image_name}",
                duration_ms=duration_ms
            )
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            return ImageOperationResult(
                action="remove",
                image_name=image_name,
                success=False,
                error=str(e),
                duration_ms=duration_ms
            )
    
    # =========================================================
    # DOCKER COMPOSE OPERATIONS
    # =========================================================
    
    def compose_up(
        self,
        compose_file: str,
        project_name: Optional[str] = None,
        services: Optional[List[str]] = None,
        detach: bool = True,
        build: bool = False
    ) -> DockerExecutionResult:
        """
        Run docker-compose up via subprocess.
        Note: Uses docker compose CLI as Python SDK doesn't support compose natively.
        """
        import subprocess
        
        start_time = time.time()
        
        cmd = ["docker", "compose", "-f", compose_file]
        
        if project_name:
            cmd.extend(["-p", project_name])
        
        cmd.append("up")
        
        if detach:
            cmd.append("-d")
        
        if build:
            cmd.append("--build")
        
        if services:
            cmd.extend(services)
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=300
            )
            
            duration_ms = (time.time() - start_time) * 1000
            
            return DockerExecutionResult(
                action="compose_up",
                container_name=compose_file,
                success=result.returncode == 0,
                exit_code=result.returncode,
                logs=result.stdout,
                error=result.stderr if result.returncode != 0 else None,
                message=f"docker compose up {'succeeded' if result.returncode == 0 else 'failed'}",
                duration_ms=duration_ms
            )
            
        except subprocess.TimeoutExpired:
            return DockerExecutionResult(
                action="compose_up",
                container_name=compose_file,
                success=False,
                error="Command timed out after 300s"
            )
        except Exception as e:
            return DockerExecutionResult(
                action="compose_up",
                container_name=compose_file,
                success=False,
                error=str(e)
            )
    
    def compose_down(
        self,
        compose_file: str,
        project_name: Optional[str] = None,
        volumes: bool = False,
        remove_orphans: bool = False
    ) -> DockerExecutionResult:
        """Run docker-compose down"""
        import subprocess
        
        start_time = time.time()
        
        cmd = ["docker", "compose", "-f", compose_file]
        
        if project_name:
            cmd.extend(["-p", project_name])
        
        cmd.append("down")
        
        if volumes:
            cmd.append("-v")
        
        if remove_orphans:
            cmd.append("--remove-orphans")
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120
            )
            
            duration_ms = (time.time() - start_time) * 1000
            
            return DockerExecutionResult(
                action="compose_down",
                container_name=compose_file,
                success=result.returncode == 0,
                exit_code=result.returncode,
                logs=result.stdout,
                error=result.stderr if result.returncode != 0 else None,
                message=f"docker compose down {'succeeded' if result.returncode == 0 else 'failed'}",
                duration_ms=duration_ms
            )
            
        except Exception as e:
            return DockerExecutionResult(
                action="compose_down",
                container_name=compose_file,
                success=False,
                error=str(e)
            )
    
    def close(self):
        """Close Docker connection"""
        self._connection.close()


# ============================================================
# GLOBAL EXECUTOR INSTANCE
# ============================================================

_docker_executor: Optional[DockerExecutor] = None
_docker_executor_lock = threading.Lock()


def get_docker_executor() -> DockerExecutor:
    """Get the global Docker executor instance"""
    global _docker_executor
    
    if _docker_executor is None:
        with _docker_executor_lock:
            if _docker_executor is None:
                _docker_executor = DockerExecutor()
    
    return _docker_executor


def init_docker_executor(base_url: Optional[str] = None) -> DockerExecutor:
    """Initialize the global Docker executor with optional remote URL"""
    global _docker_executor
    
    with _docker_executor_lock:
        if _docker_executor:
            _docker_executor.close()
        
        connection = DockerConnectionManager(base_url=base_url)
        _docker_executor = DockerExecutor(connection)
    
    return _docker_executor


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

def docker_restart(container_name: str, timeout: int = 30) -> DockerExecutionResult:
    """Convenience function to restart a container"""
    return get_docker_executor().restart_container(container_name, timeout)


def docker_logs(container_name: str, tail: int = 100) -> DockerExecutionResult:
    """Convenience function to get container logs"""
    return get_docker_executor().get_logs(container_name, tail=tail)


def docker_exec(container_name: str, command: str) -> DockerExecutionResult:
    """Convenience function to execute command in container"""
    return get_docker_executor().exec_in_container(container_name, command)


def docker_health(container_name: str) -> Dict[str, Any]:
    """Convenience function to get container health"""
    return get_docker_executor().get_health_status(container_name)
