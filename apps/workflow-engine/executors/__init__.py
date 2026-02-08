"""
Executors Package - Production Execution Layer
===============================================

This package provides real execution capabilities for workflow remediation:
- SSH Executor: Remote command execution via SSH
- Docker Executor: Container lifecycle management
- API Executor: HTTP/webhook integrations

Usage:
    from executors import get_ssh_executor, ssh_execute
    from executors import get_docker_executor, docker_restart
    from executors import get_api_executor, api_get, api_post, api_webhook
    
    # Quick SSH execute
    result = ssh_execute("server.example.com", "systemctl restart nginx")
    
    # Quick Docker restart
    result = docker_restart("nginx-container")
    
    # Quick API call
    result = api_get("https://api.example.com/status")
"""

from .ssh_executor import (
    # Classes
    SSHExecutor,
    SSHConnectionPool,
    SSHCredentials,
    SSHExecutionResult,
    AuthMethod,
    
    # Global executor access
    get_ssh_executor,
    init_ssh_executor,
    
    # Convenience functions
    ssh_execute,
    ssh_test,
)

from .docker_executor import (
    # Classes
    DockerExecutor,
    DockerConnectionManager,
    DockerExecutionResult,
    ImageOperationResult,
    ContainerAction,
    ContainerStatus,
    
    # Global executor access
    get_docker_executor,
    init_docker_executor,
    
    # Convenience functions
    docker_restart,
    docker_logs,
    docker_exec,
    docker_health,
)

from .api_executor import (
    # Classes
    APIExecutor,
    AsyncAPIExecutor,
    APIExecutionResult,
    AuthConfig,
    AuthType,
    HTTPMethod,
    WebhookPayload,
    
    # Global executor access
    get_api_executor,
    init_api_executor,
    
    # Convenience functions
    api_get,
    api_post,
    api_webhook,
    api_slack,
)

__all__ = [
    # SSH Executor
    "SSHExecutor",
    "SSHConnectionPool", 
    "SSHCredentials",
    "SSHExecutionResult",
    "AuthMethod",
    "get_ssh_executor",
    "init_ssh_executor",
    "ssh_execute",
    "ssh_test",
    
    # Docker Executor  
    "DockerExecutor",
    "DockerConnectionManager",
    "DockerExecutionResult",
    "ImageOperationResult",
    "ContainerAction",
    "ContainerStatus",
    "get_docker_executor",
    "init_docker_executor",
    "docker_restart",
    "docker_logs",
    "docker_exec",
    "docker_health",
    
    # API Executor
    "APIExecutor",
    "AsyncAPIExecutor",
    "APIExecutionResult",
    "AuthConfig",
    "AuthType",
    "HTTPMethod",
    "WebhookPayload",
    "get_api_executor",
    "init_api_executor",
    "api_get",
    "api_post",
    "api_webhook",
    "api_slack",
]

__version__ = "1.0.0"


