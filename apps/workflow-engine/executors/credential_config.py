"""
Credential Configuration - Secure Host Credential Storage
==========================================================

Manages SSH and other credentials for remote execution.
Supports loading from:
- Environment variables
- Configuration files
- Secrets management systems (future: Vault, AWS Secrets Manager)

Security:
- Credentials are never logged
- Passwords are masked in debug output
- Private keys are validated but not exposed
"""

import os
import json
import logging
from typing import Dict, Optional, Any, List
from dataclasses import dataclass, asdict
from pathlib import Path
from enum import Enum

from .ssh_executor import SSHCredentials, AuthMethod

logger = logging.getLogger(__name__)


class CredentialSource(Enum):
    """Source of credential configuration"""
    ENV = "environment"
    FILE = "file"
    MEMORY = "memory"
    VAULT = "vault"  # Future: HashiCorp Vault integration


@dataclass
class HostConfig:
    """Configuration for a managed host"""
    alias: str
    hostname: str
    username: str = "root"
    port: int = 22
    auth_method: str = "key"
    private_key_path: Optional[str] = None
    password: Optional[str] = None
    description: Optional[str] = None
    tags: List[str] = None
    
    def __post_init__(self):
        if self.tags is None:
            self.tags = []
    
    def to_ssh_credentials(self) -> SSHCredentials:
        """Convert to SSHCredentials for executor"""
        return SSHCredentials(
            hostname=self.hostname,
            username=self.username,
            port=self.port,
            password=self.password,
            private_key_path=self.private_key_path,
            auth_method=AuthMethod(self.auth_method)
        )
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary (without password)"""
        d = asdict(self)
        d['password'] = '***' if self.password else None
        return d


class CredentialManager:
    """
    Centralized credential management for all executors.
    
    Usage:
        cred_manager = CredentialManager()
        
        # Load from config file
        cred_manager.load_from_file("hosts.json")
        
        # Or add hosts manually
        cred_manager.add_host(HostConfig(
            alias="web-server",
            hostname="192.168.1.100",
            username="deploy",
            private_key_path="~/.ssh/deploy_key"
        ))
        
        # Get credentials for execution
        creds = cred_manager.get_credentials("web-server")
    """
    
    def __init__(self):
        self._hosts: Dict[str, HostConfig] = {}
        self._source: CredentialSource = CredentialSource.MEMORY
    
    def add_host(self, config: HostConfig) -> None:
        """Add a host configuration"""
        self._hosts[config.alias] = config
        logger.info(f"Added host: {config.alias} -> {config.hostname}")
    
    def remove_host(self, alias: str) -> bool:
        """Remove a host configuration"""
        if alias in self._hosts:
            del self._hosts[alias]
            logger.info(f"Removed host: {alias}")
            return True
        return False
    
    def get_host(self, alias: str) -> Optional[HostConfig]:
        """Get host configuration by alias"""
        return self._hosts.get(alias)
    
    def get_credentials(self, alias: str) -> Optional[SSHCredentials]:
        """Get SSH credentials for a host alias"""
        host = self.get_host(alias)
        if host:
            return host.to_ssh_credentials()
        return None
    
    def list_hosts(self) -> List[Dict[str, Any]]:
        """List all configured hosts (safe for display)"""
        return [host.to_dict() for host in self._hosts.values()]
    
    def find_hosts_by_tag(self, tag: str) -> List[HostConfig]:
        """Find all hosts with a specific tag"""
        return [h for h in self._hosts.values() if tag in h.tags]
    
    def load_from_file(self, config_path: str) -> int:
        """
        Load host configurations from a JSON file.
        
        File format:
        {
            "hosts": [
                {
                    "alias": "web-1",
                    "hostname": "192.168.1.10",
                    "username": "deploy",
                    "private_key_path": "~/.ssh/deploy_key",
                    "tags": ["web", "production"]
                },
                ...
            ]
        }
        
        Returns number of hosts loaded.
        """
        path = Path(config_path).expanduser()
        
        if not path.exists():
            logger.warning(f"Config file not found: {path}")
            return 0
        
        try:
            with open(path) as f:
                data = json.load(f)
            
            hosts = data.get("hosts", [])
            loaded = 0
            
            for host_data in hosts:
                try:
                    config = HostConfig(**host_data)
                    self.add_host(config)
                    loaded += 1
                except Exception as e:
                    logger.error(f"Failed to load host config: {e}")
            
            self._source = CredentialSource.FILE
            logger.info(f"Loaded {loaded} hosts from {path}")
            return loaded
            
        except Exception as e:
            logger.error(f"Failed to load config file: {e}")
            return 0
    
    def load_from_env(self, prefix: str = "SSH_HOST_") -> int:
        """
        Load host configurations from environment variables.
        
        Expected format:
        SSH_HOST_web1_HOSTNAME=192.168.1.10
        SSH_HOST_web1_USERNAME=deploy
        SSH_HOST_web1_KEY_PATH=~/.ssh/deploy_key
        
        Returns number of hosts loaded.
        """
        hosts_data: Dict[str, Dict[str, str]] = {}
        
        for key, value in os.environ.items():
            if not key.startswith(prefix):
                continue
            
            # Parse: SSH_HOST_<alias>_<property>
            parts = key[len(prefix):].split("_", 1)
            if len(parts) != 2:
                continue
            
            alias, prop = parts
            alias = alias.lower()
            
            if alias not in hosts_data:
                hosts_data[alias] = {"alias": alias}
            
            # Map env properties to config fields
            prop_map = {
                "HOSTNAME": "hostname",
                "HOST": "hostname",
                "USERNAME": "username",
                "USER": "username",
                "PORT": "port",
                "PASSWORD": "password",
                "KEY_PATH": "private_key_path",
                "KEY": "private_key_path",
                "AUTH": "auth_method",
            }
            
            if prop in prop_map:
                hosts_data[alias][prop_map[prop]] = value
        
        loaded = 0
        for alias, data in hosts_data.items():
            if "hostname" not in data:
                continue
            
            try:
                # Convert port to int
                if "port" in data:
                    data["port"] = int(data["port"])
                
                config = HostConfig(**data)
                self.add_host(config)
                loaded += 1
            except Exception as e:
                logger.error(f"Failed to load host from env: {e}")
        
        if loaded > 0:
            self._source = CredentialSource.ENV
        
        logger.info(f"Loaded {loaded} hosts from environment")
        return loaded
    
    def save_to_file(self, config_path: str) -> bool:
        """Save current host configurations to a JSON file"""
        path = Path(config_path).expanduser()
        
        try:
            # Convert to dict format (masks passwords)
            hosts = []
            for host in self._hosts.values():
                host_dict = asdict(host)
                # Don't save passwords to file
                host_dict.pop('password', None)
                hosts.append(host_dict)
            
            data = {"hosts": hosts}
            
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
            
            logger.info(f"Saved {len(hosts)} hosts to {path}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save config: {e}")
            return False


# ============================================================
# GLOBAL CREDENTIAL MANAGER INSTANCE
# ============================================================

_credential_manager: Optional[CredentialManager] = None


def get_credential_manager() -> CredentialManager:
    """Get the global credential manager instance"""
    global _credential_manager
    
    if _credential_manager is None:
        _credential_manager = CredentialManager()
        
        # Auto-load from default config file if exists
        default_config = os.path.expanduser("~/.aiops/hosts.json")
        if os.path.exists(default_config):
            _credential_manager.load_from_file(default_config)
        
        # Also load from environment
        _credential_manager.load_from_env()
    
    return _credential_manager


def setup_credentials(config_path: Optional[str] = None) -> CredentialManager:
    """Setup and return credential manager with optional config file"""
    manager = get_credential_manager()
    
    if config_path:
        manager.load_from_file(config_path)
    
    return manager
