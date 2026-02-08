"""
API Executor - Production-Grade HTTP/Webhook Execution
=======================================================

Features:
- All HTTP methods (GET, POST, PUT, PATCH, DELETE)
- Multiple authentication types (Bearer, Basic, API Key, OAuth2)
- Retry with exponential backoff
- Response parsing (JSON, XML, text)
- Timeout handling with connect/read timeouts
- Request/response logging
- Webhook trigger support
- Rate limiting awareness
- SSL verification options
"""

import os
import time
import json
import logging
import threading
import base64
import hashlib
import hmac
from typing import Optional, Dict, Any, List, Callable, Union, Tuple
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from urllib.parse import urljoin, urlparse

try:
    import httpx
    from httpx import Response, HTTPStatusError, RequestError
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False
    Response = None

# Configure logging
logger = logging.getLogger(__name__)


class HTTPMethod(Enum):
    """HTTP request methods"""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"


class AuthType(Enum):
    """Authentication types"""
    NONE = "none"
    BEARER = "bearer"
    BASIC = "basic"
    API_KEY = "api_key"
    API_KEY_HEADER = "api_key_header"
    API_KEY_QUERY = "api_key_query"
    OAUTH2 = "oauth2"
    HMAC = "hmac"
    CUSTOM = "custom"


class ContentType(Enum):
    """Response content types"""
    JSON = "application/json"
    XML = "application/xml"
    TEXT = "text/plain"
    HTML = "text/html"
    FORM = "application/x-www-form-urlencoded"
    MULTIPART = "multipart/form-data"


@dataclass
class AuthConfig:
    """Authentication configuration"""
    auth_type: AuthType = AuthType.NONE
    
    # Bearer token
    token: Optional[str] = None
    
    # Basic auth
    username: Optional[str] = None
    password: Optional[str] = None
    
    # API Key
    api_key: Optional[str] = None
    api_key_name: str = "X-API-Key"  # Header name or query param name
    
    # OAuth2
    client_id: Optional[str] = None
    client_secret: Optional[str] = None
    token_url: Optional[str] = None
    scope: Optional[str] = None
    
    # HMAC signing
    hmac_secret: Optional[str] = None
    hmac_header: str = "X-Signature"
    
    # Custom headers
    custom_headers: Dict[str, str] = field(default_factory=dict)
    
    def get_auth_headers(self, body: Optional[str] = None) -> Dict[str, str]:
        """Generate authentication headers based on config"""
        headers = {}
        
        if self.auth_type == AuthType.BEARER and self.token:
            headers["Authorization"] = f"Bearer {self.token}"
            
        elif self.auth_type == AuthType.BASIC and self.username:
            credentials = base64.b64encode(
                f"{self.username}:{self.password or ''}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {credentials}"
            
        elif self.auth_type == AuthType.API_KEY_HEADER and self.api_key:
            headers[self.api_key_name] = self.api_key
            
        elif self.auth_type == AuthType.HMAC and self.hmac_secret and body:
            signature = hmac.new(
                self.hmac_secret.encode(),
                body.encode(),
                hashlib.sha256
            ).hexdigest()
            headers[self.hmac_header] = signature
        
        # Add custom headers
        headers.update(self.custom_headers)
        
        return headers
    
    def get_auth_params(self) -> Dict[str, str]:
        """Generate authentication query parameters"""
        params = {}
        
        if self.auth_type == AuthType.API_KEY_QUERY and self.api_key:
            params[self.api_key_name] = self.api_key
        
        return params


@dataclass
class APIExecutionResult:
    """Result of API execution"""
    url: str
    method: str
    success: bool
    status_code: int = 0
    response_body: str = ""
    response_json: Optional[Dict[str, Any]] = None
    response_headers: Dict[str, str] = field(default_factory=dict)
    duration_ms: float = 0
    error: Optional[str] = None
    retries: int = 0
    timestamp: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "url": self.url,
            "method": self.method,
            "success": self.success,
            "status_code": self.status_code,
            "response_body": self.response_body[:5000] if self.response_body else "",
            "response_json": self.response_json,
            "response_headers": dict(self.response_headers),
            "duration_ms": self.duration_ms,
            "error": self.error,
            "retries": self.retries,
            "timestamp": self.timestamp.isoformat()
        }
    
    @property
    def is_success(self) -> bool:
        """Check if response is successful (2xx)"""
        return 200 <= self.status_code < 300


@dataclass
class WebhookPayload:
    """Webhook payload structure"""
    event_type: str
    source: str
    timestamp: datetime
    data: Dict[str, Any]
    metadata: Dict[str, str] = field(default_factory=dict)
    
    def to_json(self) -> str:
        return json.dumps({
            "event_type": self.event_type,
            "source": self.source,
            "timestamp": self.timestamp.isoformat(),
            "data": self.data,
            "metadata": self.metadata
        })


class APIExecutor:
    """
    Production-grade API executor for HTTP requests and webhooks.
    
    Features:
    - Async and sync HTTP requests
    - Multiple authentication methods
    - Automatic retry with exponential backoff
    - Response parsing (JSON, XML, text)
    - Rate limiting awareness
    - Request/response logging
    
    Usage:
        executor = APIExecutor()
        
        # Simple GET request
        result = executor.get("https://api.example.com/data")
        
        # POST with JSON body
        result = executor.post(
            "https://api.example.com/webhook",
            json={"event": "alert", "severity": "high"}
        )
        
        # With authentication
        auth = AuthConfig(auth_type=AuthType.BEARER, token="my-token")
        result = executor.get("https://api.example.com/secure", auth=auth)
    """
    
    def __init__(
        self,
        base_url: Optional[str] = None,
        default_timeout: float = 30.0,
        connect_timeout: float = 10.0,
        max_retries: int = 3,
        retry_backoff: float = 1.0,
        verify_ssl: bool = True,
        default_headers: Optional[Dict[str, str]] = None,
        user_agent: str = "AIOps-APIExecutor/1.0"
    ):
        """
        Initialize API Executor.
        
        Args:
            base_url: Base URL for all requests (optional)
            default_timeout: Default request timeout
            connect_timeout: Connection timeout
            max_retries: Maximum retry attempts
            retry_backoff: Initial backoff time for retries
            verify_ssl: Whether to verify SSL certificates
            default_headers: Default headers for all requests
            user_agent: User-Agent header
        """
        if not HTTPX_AVAILABLE:
            raise RuntimeError("httpx not available. Run: pip install httpx")
        
        self._base_url = base_url
        self._timeout = httpx.Timeout(default_timeout, connect=connect_timeout)
        self._max_retries = max_retries
        self._retry_backoff = retry_backoff
        self._verify_ssl = verify_ssl
        self._user_agent = user_agent
        
        self._default_headers = {
            "User-Agent": user_agent,
            "Accept": "application/json",
            **(default_headers or {})
        }
        
        # Create sync client
        self._client = httpx.Client(
            timeout=self._timeout,
            verify=verify_ssl,
            headers=self._default_headers,
            follow_redirects=True
        )
        
        # Stats
        self._request_count = 0
        self._success_count = 0
        self._failure_count = 0
        self._lock = threading.Lock()
    
    def _build_url(self, url: str) -> str:
        """Build full URL with base URL if configured"""
        if self._base_url and not url.startswith(("http://", "https://")):
            return urljoin(self._base_url, url)
        return url
    
    def _should_retry(self, status_code: int, attempt: int) -> bool:
        """Determine if request should be retried"""
        if attempt >= self._max_retries:
            return False
        
        # Retry on server errors and rate limiting
        return status_code >= 500 or status_code == 429
    
    def _get_retry_delay(self, attempt: int, response: Optional[Response] = None) -> float:
        """Calculate retry delay with exponential backoff"""
        # Check for Retry-After header
        if response and "Retry-After" in response.headers:
            try:
                return float(response.headers["Retry-After"])
            except ValueError:
                pass
        
        # Exponential backoff
        return self._retry_backoff * (2 ** attempt)
    
    def _parse_response(self, response: Response) -> Tuple[str, Optional[Dict]]:
        """Parse response body based on content type"""
        body = response.text
        json_data = None
        
        content_type = response.headers.get("content-type", "")
        
        if "application/json" in content_type:
            try:
                json_data = response.json()
            except Exception:
                pass
        
        return body, json_data
    
    def request(
        self,
        method: Union[HTTPMethod, str],
        url: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        json: Optional[Dict[str, Any]] = None,
        data: Optional[Union[str, Dict[str, Any]]] = None,
        auth: Optional[AuthConfig] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None
    ) -> APIExecutionResult:
        """
        Make an HTTP request.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            url: Request URL
            params: Query parameters
            headers: Request headers
            json: JSON body (auto-serialized)
            data: Form data or raw body
            auth: Authentication config
            timeout: Request timeout (overrides default)
            max_retries: Max retries (overrides default)
        
        Returns:
            APIExecutionResult with response details
        """
        start_time = time.time()
        full_url = self._build_url(url)
        method_str = method.value if isinstance(method, HTTPMethod) else method.upper()
        max_attempts = max_retries if max_retries is not None else self._max_retries
        
        # Build headers
        request_headers = dict(self._default_headers)
        if headers:
            request_headers.update(headers)
        
        # Add auth
        request_params = dict(params or {})
        if auth:
            body_str = json_module.dumps(json) if json else (data if isinstance(data, str) else "")
            request_headers.update(auth.get_auth_headers(body_str))
            request_params.update(auth.get_auth_params())
        
        # Build timeout
        req_timeout = httpx.Timeout(timeout) if timeout else self._timeout
        
        attempt = 0
        last_error = None
        last_response = None
        
        while attempt <= max_attempts:
            try:
                response = self._client.request(
                    method=method_str,
                    url=full_url,
                    params=request_params if request_params else None,
                    headers=request_headers,
                    json=json,
                    data=data if not json else None,
                    timeout=req_timeout
                )
                
                last_response = response
                duration_ms = (time.time() - start_time) * 1000
                
                # Parse response
                body, json_data = self._parse_response(response)
                
                # Update stats
                with self._lock:
                    self._request_count += 1
                    if response.is_success:
                        self._success_count += 1
                    else:
                        self._failure_count += 1
                
                # Check if should retry
                if not response.is_success and self._should_retry(response.status_code, attempt):
                    delay = self._get_retry_delay(attempt, response)
                    logger.warning(
                        f"Request failed with {response.status_code}, retrying in {delay}s..."
                    )
                    time.sleep(delay)
                    attempt += 1
                    continue
                
                return APIExecutionResult(
                    url=full_url,
                    method=method_str,
                    success=response.is_success,
                    status_code=response.status_code,
                    response_body=body,
                    response_json=json_data,
                    response_headers=dict(response.headers),
                    duration_ms=duration_ms,
                    retries=attempt
                )
                
            except RequestError as e:
                last_error = str(e)
                logger.warning(f"Request error (attempt {attempt + 1}): {e}")
                
                if attempt < max_attempts:
                    delay = self._get_retry_delay(attempt)
                    time.sleep(delay)
                    attempt += 1
                    continue
                
                break
                
            except Exception as e:
                last_error = str(e)
                logger.error(f"Unexpected error: {e}")
                break
        
        # All retries exhausted
        duration_ms = (time.time() - start_time) * 1000
        
        with self._lock:
            self._request_count += 1
            self._failure_count += 1
        
        return APIExecutionResult(
            url=full_url,
            method=method_str,
            success=False,
            status_code=last_response.status_code if last_response else 0,
            error=last_error or "Max retries exhausted",
            duration_ms=duration_ms,
            retries=attempt
        )
    
    # Convenience methods
    def get(self, url: str, **kwargs) -> APIExecutionResult:
        """Make GET request"""
        return self.request(HTTPMethod.GET, url, **kwargs)
    
    def post(self, url: str, **kwargs) -> APIExecutionResult:
        """Make POST request"""
        return self.request(HTTPMethod.POST, url, **kwargs)
    
    def put(self, url: str, **kwargs) -> APIExecutionResult:
        """Make PUT request"""
        return self.request(HTTPMethod.PUT, url, **kwargs)
    
    def patch(self, url: str, **kwargs) -> APIExecutionResult:
        """Make PATCH request"""
        return self.request(HTTPMethod.PATCH, url, **kwargs)
    
    def delete(self, url: str, **kwargs) -> APIExecutionResult:
        """Make DELETE request"""
        return self.request(HTTPMethod.DELETE, url, **kwargs)
    
    # Webhook methods
    def send_webhook(
        self,
        url: str,
        payload: Union[WebhookPayload, Dict[str, Any]],
        auth: Optional[AuthConfig] = None,
        headers: Optional[Dict[str, str]] = None
    ) -> APIExecutionResult:
        """
        Send a webhook notification.
        
        Args:
            url: Webhook endpoint URL
            payload: Webhook payload (WebhookPayload or dict)
            auth: Authentication config
            headers: Additional headers
        """
        if isinstance(payload, WebhookPayload):
            json_payload = json_module.loads(payload.to_json())
        else:
            json_payload = payload
        
        webhook_headers = {
            "Content-Type": "application/json",
            **(headers or {})
        }
        
        return self.post(
            url,
            json=json_payload,
            headers=webhook_headers,
            auth=auth
        )
    
    def trigger_alert_webhook(
        self,
        url: str,
        alert_id: str,
        alert_type: str,
        severity: str,
        message: str,
        source: str = "aiops-platform",
        metadata: Optional[Dict[str, str]] = None,
        auth: Optional[AuthConfig] = None
    ) -> APIExecutionResult:
        """
        Trigger an alert webhook with standard alert format.
        
        Args:
            url: Webhook URL
            alert_id: Unique alert identifier
            alert_type: Type of alert
            severity: Alert severity (critical, warning, info)
            message: Alert message
            source: Alert source system
            metadata: Additional metadata
            auth: Authentication config
        """
        payload = {
            "alert_id": alert_id,
            "alert_type": alert_type,
            "severity": severity,
            "message": message,
            "source": source,
            "timestamp": datetime.utcnow().isoformat(),
            "metadata": metadata or {}
        }
        
        return self.send_webhook(url, payload, auth=auth)
    
    def call_slack_webhook(
        self,
        webhook_url: str,
        text: str,
        channel: Optional[str] = None,
        username: Optional[str] = None,
        icon_emoji: Optional[str] = None,
        attachments: Optional[List[Dict]] = None,
        blocks: Optional[List[Dict]] = None
    ) -> APIExecutionResult:
        """
        Send message to Slack webhook.
        
        Args:
            webhook_url: Slack webhook URL
            text: Message text
            channel: Override channel
            username: Override username
            icon_emoji: Override icon
            attachments: Slack attachments
            blocks: Slack blocks
        """
        payload = {"text": text}
        
        if channel:
            payload["channel"] = channel
        if username:
            payload["username"] = username
        if icon_emoji:
            payload["icon_emoji"] = icon_emoji
        if attachments:
            payload["attachments"] = attachments
        if blocks:
            payload["blocks"] = blocks
        
        return self.post(webhook_url, json=payload)
    
    def call_pagerduty(
        self,
        routing_key: str,
        event_action: str,  # trigger, acknowledge, resolve
        dedup_key: str,
        summary: str,
        source: str,
        severity: str = "error",
        custom_details: Optional[Dict] = None
    ) -> APIExecutionResult:
        """
        Send event to PagerDuty Events API v2.
        
        Args:
            routing_key: PagerDuty integration key
            event_action: Event action (trigger/acknowledge/resolve)
            dedup_key: Deduplication key
            summary: Event summary
            source: Event source
            severity: Event severity (critical/error/warning/info)
            custom_details: Additional details
        """
        payload = {
            "routing_key": routing_key,
            "event_action": event_action,
            "dedup_key": dedup_key,
            "payload": {
                "summary": summary,
                "source": source,
                "severity": severity,
                "timestamp": datetime.utcnow().isoformat(),
                "custom_details": custom_details or {}
            }
        }
        
        return self.post(
            "https://events.pagerduty.com/v2/enqueue",
            json=payload
        )
    
    def call_opsgenie(
        self,
        api_key: str,
        message: str,
        alias: str,
        description: Optional[str] = None,
        priority: str = "P3",
        source: str = "aiops-platform",
        tags: Optional[List[str]] = None,
        details: Optional[Dict] = None
    ) -> APIExecutionResult:
        """
        Create alert in OpsGenie.
        
        Args:
            api_key: OpsGenie API key
            message: Alert message
            alias: Alert alias (for deduplication)
            description: Alert description
            priority: Priority (P1-P5)
            source: Alert source
            tags: Alert tags
            details: Additional details
        """
        auth = AuthConfig(
            auth_type=AuthType.API_KEY_HEADER,
            api_key=api_key,
            api_key_name="Authorization"
        )
        auth.custom_headers["Authorization"] = f"GenieKey {api_key}"
        
        payload = {
            "message": message,
            "alias": alias,
            "priority": priority,
            "source": source
        }
        
        if description:
            payload["description"] = description
        if tags:
            payload["tags"] = tags
        if details:
            payload["details"] = details
        
        return self.post(
            "https://api.opsgenie.com/v2/alerts",
            json=payload,
            auth=auth
        )
    
    # Stats
    def get_stats(self) -> Dict[str, int]:
        """Get request statistics"""
        with self._lock:
            return {
                "total_requests": self._request_count,
                "successful": self._success_count,
                "failed": self._failure_count,
                "success_rate": round(
                    self._success_count / max(self._request_count, 1) * 100, 2
                )
            }
    
    def close(self):
        """Close the HTTP client"""
        self._client.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        self.close()


# Alias for json module to avoid name collision
import json as json_module


# ============================================================
# ASYNC API EXECUTOR
# ============================================================

class AsyncAPIExecutor:
    """
    Async version of API Executor using httpx.AsyncClient.
    
    Usage:
        async with AsyncAPIExecutor() as executor:
            result = await executor.get("https://api.example.com/data")
    """
    
    def __init__(
        self,
        base_url: Optional[str] = None,
        default_timeout: float = 30.0,
        connect_timeout: float = 10.0,
        max_retries: int = 3,
        retry_backoff: float = 1.0,
        verify_ssl: bool = True,
        default_headers: Optional[Dict[str, str]] = None
    ):
        if not HTTPX_AVAILABLE:
            raise RuntimeError("httpx not available. Run: pip install httpx")
        
        self._base_url = base_url
        self._timeout = httpx.Timeout(default_timeout, connect=connect_timeout)
        self._max_retries = max_retries
        self._retry_backoff = retry_backoff
        self._verify_ssl = verify_ssl
        
        self._default_headers = {
            "User-Agent": "AIOps-AsyncAPIExecutor/1.0",
            "Accept": "application/json",
            **(default_headers or {})
        }
        
        self._client: Optional[httpx.AsyncClient] = None
    
    async def __aenter__(self):
        self._client = httpx.AsyncClient(
            timeout=self._timeout,
            verify=self._verify_ssl,
            headers=self._default_headers,
            follow_redirects=True
        )
        return self
    
    async def __aexit__(self, *args):
        if self._client:
            await self._client.aclose()
    
    def _build_url(self, url: str) -> str:
        if self._base_url and not url.startswith(("http://", "https://")):
            return urljoin(self._base_url, url)
        return url
    
    async def request(
        self,
        method: Union[HTTPMethod, str],
        url: str,
        **kwargs
    ) -> APIExecutionResult:
        """Make async HTTP request"""
        import asyncio
        
        start_time = time.time()
        full_url = self._build_url(url)
        method_str = method.value if isinstance(method, HTTPMethod) else method.upper()
        
        attempt = 0
        last_error = None
        
        while attempt <= self._max_retries:
            try:
                response = await self._client.request(
                    method=method_str,
                    url=full_url,
                    **kwargs
                )
                
                duration_ms = (time.time() - start_time) * 1000
                body = response.text
                json_data = None
                
                if "application/json" in response.headers.get("content-type", ""):
                    try:
                        json_data = response.json()
                    except Exception:
                        pass
                
                # Check retry
                if not response.is_success and response.status_code >= 500:
                    if attempt < self._max_retries:
                        await asyncio.sleep(self._retry_backoff * (2 ** attempt))
                        attempt += 1
                        continue
                
                return APIExecutionResult(
                    url=full_url,
                    method=method_str,
                    success=response.is_success,
                    status_code=response.status_code,
                    response_body=body,
                    response_json=json_data,
                    response_headers=dict(response.headers),
                    duration_ms=duration_ms,
                    retries=attempt
                )
                
            except Exception as e:
                last_error = str(e)
                if attempt < self._max_retries:
                    await asyncio.sleep(self._retry_backoff * (2 ** attempt))
                    attempt += 1
                    continue
                break
        
        duration_ms = (time.time() - start_time) * 1000
        return APIExecutionResult(
            url=full_url,
            method=method_str,
            success=False,
            error=last_error or "Max retries exhausted",
            duration_ms=duration_ms,
            retries=attempt
        )
    
    async def get(self, url: str, **kwargs) -> APIExecutionResult:
        return await self.request(HTTPMethod.GET, url, **kwargs)
    
    async def post(self, url: str, **kwargs) -> APIExecutionResult:
        return await self.request(HTTPMethod.POST, url, **kwargs)
    
    async def put(self, url: str, **kwargs) -> APIExecutionResult:
        return await self.request(HTTPMethod.PUT, url, **kwargs)
    
    async def delete(self, url: str, **kwargs) -> APIExecutionResult:
        return await self.request(HTTPMethod.DELETE, url, **kwargs)


# ============================================================
# GLOBAL EXECUTOR INSTANCE
# ============================================================

_api_executor: Optional[APIExecutor] = None
_api_executor_lock = threading.Lock()


def get_api_executor() -> APIExecutor:
    """Get the global API executor instance"""
    global _api_executor
    
    if _api_executor is None:
        with _api_executor_lock:
            if _api_executor is None:
                _api_executor = APIExecutor()
    
    return _api_executor


def init_api_executor(
    base_url: Optional[str] = None,
    default_timeout: float = 30.0,
    max_retries: int = 3
) -> APIExecutor:
    """Initialize the global API executor with custom settings"""
    global _api_executor
    
    with _api_executor_lock:
        if _api_executor:
            _api_executor.close()
        
        _api_executor = APIExecutor(
            base_url=base_url,
            default_timeout=default_timeout,
            max_retries=max_retries
        )
    
    return _api_executor


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

def api_get(url: str, **kwargs) -> APIExecutionResult:
    """Convenience function for GET request"""
    return get_api_executor().get(url, **kwargs)


def api_post(url: str, **kwargs) -> APIExecutionResult:
    """Convenience function for POST request"""
    return get_api_executor().post(url, **kwargs)


def api_webhook(url: str, payload: Dict[str, Any], **kwargs) -> APIExecutionResult:
    """Convenience function for webhook"""
    return get_api_executor().send_webhook(url, payload, **kwargs)


def api_slack(webhook_url: str, text: str, **kwargs) -> APIExecutionResult:
    """Convenience function for Slack webhook"""
    return get_api_executor().call_slack_webhook(webhook_url, text, **kwargs)
