"""
SSH Executor - Production-Grade Remote Command Execution
=========================================================

Features:
- Connection pooling for performance
- Key-based and password authentication
- Command execution with timeout and output streaming
- Retry logic with exponential backoff
- Secure credential management
- Comprehensive error handling and logging
"""

import os
import time
import socket
import logging
import threading
from typing import Optional, Dict, Any, Tuple, List, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from contextlib import contextmanager

import paramiko
from paramiko import SSHClient, AutoAddPolicy, RSAKey, Ed25519Key, ECDSAKey

# Configure logging
logger = logging.getLogger(__name__)


class AuthMethod(Enum):
    """SSH Authentication methods"""
    KEY = "key"
    PASSWORD = "password"
    AGENT = "agent"


@dataclass
class SSHCredentials:
    """Secure SSH credential storage"""
    hostname: str
    username: str = "root"
    port: int = 22
    password: Optional[str] = None
    private_key_path: Optional[str] = None
    private_key_passphrase: Optional[str] = None
    auth_method: AuthMethod = AuthMethod.KEY
    
    # Connection settings
    timeout: float = 30.0
    banner_timeout: float = 60.0
    auth_timeout: float = 30.0
    
    # Retry settings
    max_retries: int = 3
    retry_delay: float = 1.0
    retry_backoff: float = 2.0
    
    def __post_init__(self):
        """Validate credentials after initialization"""
        if self.auth_method == AuthMethod.KEY and not self.private_key_path:
            # Try default SSH key locations
            default_keys = [
                os.path.expanduser("~/.ssh/id_rsa"),
                os.path.expanduser("~/.ssh/id_ed25519"),
                os.path.expanduser("~/.ssh/id_ecdsa"),
            ]
            for key_path in default_keys:
                if os.path.exists(key_path):
                    self.private_key_path = key_path
                    break
        
        if self.auth_method == AuthMethod.PASSWORD and not self.password:
            raise ValueError("Password required for password authentication")


@dataclass
class SSHExecutionResult:
    """Result of SSH command execution"""
    command: str
    hostname: str
    exit_code: int
    stdout: str
    stderr: str
    duration_ms: float
    success: bool
    timestamp: datetime = field(default_factory=datetime.utcnow)
    error: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "command": self.command,
            "hostname": self.hostname,
            "exit_code": self.exit_code,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "duration_ms": self.duration_ms,
            "success": self.success,
            "timestamp": self.timestamp.isoformat(),
            "error": self.error
        }


class SSHConnectionPool:
    """
    Thread-safe SSH connection pool for connection reuse.
    Maintains persistent connections to avoid reconnection overhead.
    """
    
    def __init__(self, max_connections_per_host: int = 5, connection_ttl: int = 300):
        self._pools: Dict[str, List[Tuple[SSHClient, datetime]]] = {}
        self._lock = threading.Lock()
        self._max_connections = max_connections_per_host
        self._connection_ttl = timedelta(seconds=connection_ttl)
        
        # Start cleanup thread
        self._cleanup_stop = threading.Event()
        self._cleanup_thread = threading.Thread(target=self._cleanup_loop, daemon=True)
        self._cleanup_thread.start()
    
    def _get_pool_key(self, creds: SSHCredentials) -> str:
        """Generate unique key for host+user combination"""
        return f"{creds.username}@{creds.hostname}:{creds.port}"
    
    def get_connection(self, creds: SSHCredentials) -> Optional[SSHClient]:
        """Get an existing connection from the pool if available"""
        pool_key = self._get_pool_key(creds)
        
        with self._lock:
            if pool_key not in self._pools:
                return None
            
            pool = self._pools[pool_key]
            now = datetime.utcnow()
            
            # Find a valid connection
            while pool:
                client, created_at = pool.pop(0)
                
                # Check if connection is still valid
                if now - created_at < self._connection_ttl:
                    try:
                        # Verify connection is alive
                        transport = client.get_transport()
                        if transport and transport.is_active():
                            return client
                    except Exception:
                        pass
                
                # Connection is dead or expired, close it
                try:
                    client.close()
                except Exception:
                    pass
        
        return None
    
    def return_connection(self, creds: SSHCredentials, client: SSHClient):
        """Return a connection to the pool for reuse"""
        pool_key = self._get_pool_key(creds)
        
        with self._lock:
            if pool_key not in self._pools:
                self._pools[pool_key] = []
            
            pool = self._pools[pool_key]
            
            # Check if pool is full
            if len(pool) >= self._max_connections:
                # Close excess connection
                try:
                    client.close()
                except Exception:
                    pass
                return
            
            # Add connection to pool
            pool.append((client, datetime.utcnow()))
    
    def _cleanup_loop(self):
        """Background thread to cleanup expired connections"""
        while not self._cleanup_stop.wait(60):  # Check every minute
            self._cleanup_expired()
    
    def _cleanup_expired(self):
        """Remove expired connections from all pools"""
        now = datetime.utcnow()
        
        with self._lock:
            for pool_key in list(self._pools.keys()):
                pool = self._pools[pool_key]
                valid_connections = []
                
                for client, created_at in pool:
                    if now - created_at < self._connection_ttl:
                        try:
                            transport = client.get_transport()
                            if transport and transport.is_active():
                                valid_connections.append((client, created_at))
                                continue
                        except Exception:
                            pass
                    
                    # Close invalid/expired connection
                    try:
                        client.close()
                    except Exception:
                        pass
                
                if valid_connections:
                    self._pools[pool_key] = valid_connections
                else:
                    del self._pools[pool_key]
    
    def close_all(self):
        """Close all connections and stop cleanup thread"""
        self._cleanup_stop.set()
        
        with self._lock:
            for pool in self._pools.values():
                for client, _ in pool:
                    try:
                        client.close()
                    except Exception:
                        pass
            self._pools.clear()


class SSHExecutor:
    """
    Production-grade SSH command executor.
    
    Features:
    - Connection pooling for performance
    - Multiple authentication methods
    - Command timeout and output streaming
    - Retry logic with exponential backoff
    - Comprehensive error handling
    
    Usage:
        executor = SSHExecutor()
        
        # Execute a command
        result = executor.execute(
            hostname="server.example.com",
            command="systemctl restart nginx",
            username="deploy",
            private_key_path="~/.ssh/deploy_key"
        )
        
        if result.success:
            print(f"Command completed: {result.stdout}")
        else:
            print(f"Command failed: {result.stderr}")
    """
    
    def __init__(self, connection_pool: Optional[SSHConnectionPool] = None):
        self._pool = connection_pool or SSHConnectionPool()
        self._credentials_store: Dict[str, SSHCredentials] = {}
    
    def register_host(self, alias: str, credentials: SSHCredentials):
        """Register credentials for a host alias for easy reuse"""
        self._credentials_store[alias] = credentials
        logger.info(f"Registered SSH host: {alias} -> {credentials.hostname}")
    
    def get_host(self, alias: str) -> Optional[SSHCredentials]:
        """Get registered credentials by alias"""
        return self._credentials_store.get(alias)
    
    def _create_client(self, creds: SSHCredentials) -> SSHClient:
        """Create and configure a new SSH client"""
        client = SSHClient()
        client.set_missing_host_key_policy(AutoAddPolicy())
        
        connect_kwargs = {
            "hostname": creds.hostname,
            "port": creds.port,
            "username": creds.username,
            "timeout": creds.timeout,
            "banner_timeout": creds.banner_timeout,
            "auth_timeout": creds.auth_timeout,
            "allow_agent": creds.auth_method == AuthMethod.AGENT,
            "look_for_keys": creds.auth_method == AuthMethod.KEY,
        }
        
        # Authentication method
        if creds.auth_method == AuthMethod.PASSWORD:
            connect_kwargs["password"] = creds.password
        elif creds.auth_method == AuthMethod.KEY and creds.private_key_path:
            key_path = os.path.expanduser(creds.private_key_path)
            
            # Try different key types
            key = None
            key_classes = [RSAKey, Ed25519Key, ECDSAKey]
            
            for key_class in key_classes:
                try:
                    key = key_class.from_private_key_file(
                        key_path, 
                        password=creds.private_key_passphrase
                    )
                    break
                except Exception:
                    continue
            
            if key:
                connect_kwargs["pkey"] = key
            else:
                # Fall back to letting paramiko auto-detect
                connect_kwargs["key_filename"] = key_path
                if creds.private_key_passphrase:
                    connect_kwargs["passphrase"] = creds.private_key_passphrase
        
        client.connect(**connect_kwargs)
        return client
    
    def _get_connection(self, creds: SSHCredentials) -> SSHClient:
        """Get a connection, either from pool or create new"""
        # Try to get from pool first
        client = self._pool.get_connection(creds)
        if client:
            logger.debug(f"Reusing pooled connection to {creds.hostname}")
            return client
        
        # Create new connection
        logger.debug(f"Creating new connection to {creds.hostname}")
        return self._create_client(creds)
    
    @contextmanager
    def _connection_context(self, creds: SSHCredentials):
        """Context manager for connection handling with pool return"""
        client = None
        try:
            client = self._get_connection(creds)
            yield client
        finally:
            if client:
                try:
                    # Return to pool for reuse
                    self._pool.return_connection(creds, client)
                except Exception:
                    try:
                        client.close()
                    except Exception:
                        pass
    
    def execute(
        self,
        hostname: str,
        command: str,
        username: str = "root",
        port: int = 22,
        password: Optional[str] = None,
        private_key_path: Optional[str] = None,
        private_key_passphrase: Optional[str] = None,
        timeout: float = 30.0,
        command_timeout: float = 300.0,
        max_retries: int = 3,
        stream_callback: Optional[Callable[[str, str], None]] = None,
        environment: Optional[Dict[str, str]] = None,
    ) -> SSHExecutionResult:
        """
        Execute a command on a remote host via SSH.
        
        Args:
            hostname: Target host
            command: Command to execute
            username: SSH username
            port: SSH port
            password: Password for authentication
            private_key_path: Path to private key file
            private_key_passphrase: Passphrase for encrypted key
            timeout: Connection timeout in seconds
            command_timeout: Command execution timeout in seconds
            max_retries: Maximum retry attempts
            stream_callback: Optional callback for real-time output (line, stream_type)
            environment: Optional environment variables to set
            
        Returns:
            SSHExecutionResult with command output and status
        """
        # Determine auth method
        if password:
            auth_method = AuthMethod.PASSWORD
        elif private_key_path:
            auth_method = AuthMethod.KEY
        else:
            auth_method = AuthMethod.AGENT
        
        creds = SSHCredentials(
            hostname=hostname,
            username=username,
            port=port,
            password=password,
            private_key_path=private_key_path,
            private_key_passphrase=private_key_passphrase,
            auth_method=auth_method,
            timeout=timeout,
            max_retries=max_retries,
        )
        
        return self.execute_with_credentials(
            creds, 
            command, 
            command_timeout=command_timeout,
            stream_callback=stream_callback,
            environment=environment
        )
    
    def execute_with_credentials(
        self,
        creds: SSHCredentials,
        command: str,
        command_timeout: float = 300.0,
        stream_callback: Optional[Callable[[str, str], None]] = None,
        environment: Optional[Dict[str, str]] = None,
    ) -> SSHExecutionResult:
        """Execute command using pre-configured credentials"""
        
        start_time = time.time()
        last_error = None
        retry_delay = creds.retry_delay
        
        for attempt in range(creds.max_retries):
            try:
                with self._connection_context(creds) as client:
                    # Prepare command with environment
                    full_command = command
                    if environment:
                        env_prefix = " ".join(f"{k}={v}" for k, v in environment.items())
                        full_command = f"{env_prefix} {command}"
                    
                    # Execute command
                    stdin, stdout, stderr = client.exec_command(
                        full_command,
                        timeout=command_timeout,
                        get_pty=False
                    )
                    
                    # Read output with streaming
                    stdout_data = []
                    stderr_data = []
                    
                    # Set up channel for reading
                    channel = stdout.channel
                    channel.settimeout(command_timeout)
                    
                    # Read until command completes
                    while not channel.exit_status_ready():
                        # Read stdout
                        if channel.recv_ready():
                            chunk = channel.recv(4096).decode('utf-8', errors='replace')
                            stdout_data.append(chunk)
                            if stream_callback:
                                for line in chunk.splitlines():
                                    stream_callback(line, 'stdout')
                        
                        # Read stderr
                        if channel.recv_stderr_ready():
                            chunk = channel.recv_stderr(4096).decode('utf-8', errors='replace')
                            stderr_data.append(chunk)
                            if stream_callback:
                                for line in chunk.splitlines():
                                    stream_callback(line, 'stderr')
                        
                        time.sleep(0.01)  # Small delay to prevent busy-waiting
                    
                    # Read any remaining output
                    stdout_data.append(stdout.read().decode('utf-8', errors='replace'))
                    stderr_data.append(stderr.read().decode('utf-8', errors='replace'))
                    
                    exit_code = channel.recv_exit_status()
                    duration_ms = (time.time() - start_time) * 1000
                    
                    stdout_str = "".join(stdout_data).strip()
                    stderr_str = "".join(stderr_data).strip()
                    
                    result = SSHExecutionResult(
                        command=command,
                        hostname=creds.hostname,
                        exit_code=exit_code,
                        stdout=stdout_str,
                        stderr=stderr_str,
                        duration_ms=duration_ms,
                        success=exit_code == 0
                    )
                    
                    logger.info(
                        f"SSH command executed on {creds.hostname}: "
                        f"exit_code={exit_code}, duration={duration_ms:.0f}ms"
                    )
                    
                    return result
                    
            except socket.timeout as e:
                last_error = f"Connection timeout: {e}"
                logger.warning(f"SSH timeout on {creds.hostname} (attempt {attempt + 1}): {e}")
                
            except paramiko.AuthenticationException as e:
                # Don't retry auth failures
                duration_ms = (time.time() - start_time) * 1000
                return SSHExecutionResult(
                    command=command,
                    hostname=creds.hostname,
                    exit_code=-1,
                    stdout="",
                    stderr="",
                    duration_ms=duration_ms,
                    success=False,
                    error=f"Authentication failed: {e}"
                )
                
            except paramiko.SSHException as e:
                last_error = f"SSH error: {e}"
                logger.warning(f"SSH error on {creds.hostname} (attempt {attempt + 1}): {e}")
                
            except Exception as e:
                last_error = f"Unexpected error: {e}"
                logger.error(f"Unexpected SSH error on {creds.hostname}: {e}")
            
            # Retry with backoff
            if attempt < creds.max_retries - 1:
                logger.info(f"Retrying SSH to {creds.hostname} in {retry_delay}s...")
                time.sleep(retry_delay)
                retry_delay *= creds.retry_backoff
        
        # All retries exhausted
        duration_ms = (time.time() - start_time) * 1000
        return SSHExecutionResult(
            command=command,
            hostname=creds.hostname,
            exit_code=-1,
            stdout="",
            stderr="",
            duration_ms=duration_ms,
            success=False,
            error=last_error or "Max retries exceeded"
        )
    
    def execute_on_alias(
        self,
        alias: str,
        command: str,
        command_timeout: float = 300.0,
        stream_callback: Optional[Callable[[str, str], None]] = None,
    ) -> SSHExecutionResult:
        """Execute command on a pre-registered host alias"""
        creds = self.get_host(alias)
        if not creds:
            return SSHExecutionResult(
                command=command,
                hostname=alias,
                exit_code=-1,
                stdout="",
                stderr="",
                duration_ms=0,
                success=False,
                error=f"Unknown host alias: {alias}"
            )
        
        return self.execute_with_credentials(
            creds, 
            command, 
            command_timeout=command_timeout,
            stream_callback=stream_callback
        )
    
    def test_connection(self, creds: SSHCredentials) -> Tuple[bool, str]:
        """Test SSH connectivity to a host"""
        try:
            with self._connection_context(creds) as client:
                stdin, stdout, stderr = client.exec_command("echo 'SSH_TEST_OK'", timeout=10)
                output = stdout.read().decode().strip()
                
                if output == "SSH_TEST_OK":
                    return True, f"Connection successful to {creds.hostname}"
                else:
                    return False, f"Unexpected response: {output}"
                    
        except paramiko.AuthenticationException as e:
            return False, f"Authentication failed: {e}"
        except Exception as e:
            return False, f"Connection failed: {e}"
    
    def execute_script(
        self,
        creds: SSHCredentials,
        script_content: str,
        interpreter: str = "/bin/bash",
        command_timeout: float = 600.0,
    ) -> SSHExecutionResult:
        """Execute a multi-line script on the remote host"""
        # Create a temporary script and execute it
        import base64
        encoded = base64.b64encode(script_content.encode()).decode()
        
        command = f"echo {encoded} | base64 -d | {interpreter}"
        return self.execute_with_credentials(creds, command, command_timeout=command_timeout)
    
    def close(self):
        """Close all connections and cleanup"""
        self._pool.close_all()


# ============================================================
# GLOBAL EXECUTOR INSTANCE
# ============================================================

_ssh_executor: Optional[SSHExecutor] = None
_ssh_executor_lock = threading.Lock()


def get_ssh_executor() -> SSHExecutor:
    """Get the global SSH executor instance"""
    global _ssh_executor
    
    if _ssh_executor is None:
        with _ssh_executor_lock:
            if _ssh_executor is None:
                _ssh_executor = SSHExecutor()
    
    return _ssh_executor


def init_ssh_executor(connection_pool: Optional[SSHConnectionPool] = None) -> SSHExecutor:
    """Initialize the global SSH executor with optional custom pool"""
    global _ssh_executor
    
    with _ssh_executor_lock:
        if _ssh_executor:
            _ssh_executor.close()
        _ssh_executor = SSHExecutor(connection_pool)
    
    return _ssh_executor


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

def ssh_execute(
    hostname: str,
    command: str,
    username: str = "root",
    port: int = 22,
    password: Optional[str] = None,
    private_key_path: Optional[str] = None,
    timeout: float = 30.0,
    command_timeout: float = 300.0,
) -> SSHExecutionResult:
    """
    Convenience function to execute SSH command.
    
    Example:
        result = ssh_execute("server.example.com", "uptime")
        print(result.stdout)
    """
    executor = get_ssh_executor()
    return executor.execute(
        hostname=hostname,
        command=command,
        username=username,
        port=port,
        password=password,
        private_key_path=private_key_path,
        timeout=timeout,
        command_timeout=command_timeout,
    )


def ssh_test(hostname: str, username: str = "root", port: int = 22) -> Tuple[bool, str]:
    """Quick test SSH connectivity to a host"""
    creds = SSHCredentials(hostname=hostname, username=username, port=port)
    executor = get_ssh_executor()
    return executor.test_connection(creds)
