"""
Event Bus - Real-Time Event Distribution System
================================================

Production-grade event bus for real-time updates across the AIOps platform.

Features:
- WebSocket connection management
- Event publishing and subscription
- Channel-based event routing
- Automatic reconnection handling
- Event history/replay capability
- Metrics and monitoring
"""

import asyncio
import json
import logging
import time
from datetime import datetime
from typing import Optional, Dict, Any, List, Callable, Set
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import deque
import threading
from weakref import WeakSet

from fastapi import WebSocket, WebSocketDisconnect

# Configure logging
logger = logging.getLogger(__name__)


class EventType(Enum):
    """Event types for the platform"""
    # Execution Events
    EXECUTION_STARTED = "execution.started"
    EXECUTION_PROGRESS = "execution.progress"
    EXECUTION_COMPLETED = "execution.completed"
    EXECUTION_FAILED = "execution.failed"
    NODE_STARTED = "node.started"
    NODE_COMPLETED = "node.completed"
    NODE_FAILED = "node.failed"
    
    # Issue Events
    ISSUE_DETECTED = "issue.detected"
    ISSUE_ACKNOWLEDGED = "issue.acknowledged"
    ISSUE_RESOLVED = "issue.resolved"
    ISSUE_ESCALATED = "issue.escalated"
    
    # Remediation Events
    REMEDIATION_STARTED = "remediation.started"
    REMEDIATION_COMPLETED = "remediation.completed"
    REMEDIATION_FAILED = "remediation.failed"
    AUTONOMOUS_TRIGGERED = "autonomous.triggered"
    
    # Approval Events
    APPROVAL_REQUESTED = "approval.requested"
    APPROVAL_GRANTED = "approval.granted"
    APPROVAL_REJECTED = "approval.rejected"
    APPROVAL_TIMEOUT = "approval.timeout"
    
    # System Events
    SYSTEM_HEALTH = "system.health"
    EXECUTOR_STATUS = "executor.status"
    ALERT_FIRED = "alert.fired"
    
    # Infrastructure Events
    CONTAINER_STARTED = "container.started"
    CONTAINER_STOPPED = "container.stopped"
    SSH_CONNECTED = "ssh.connected"
    SSH_DISCONNECTED = "ssh.disconnected"


class EventPriority(Enum):
    """Event priority levels"""
    LOW = 1
    NORMAL = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class PlatformEvent:
    """
    Standard event structure for the platform.
    """
    event_type: str
    data: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.utcnow)
    event_id: str = field(default_factory=lambda: f"evt_{int(time.time() * 1000)}")
    source: str = "workflow-engine"
    priority: EventPriority = EventPriority.NORMAL
    channel: str = "global"  # Channel for routing
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_id": self.event_id,
            "event_type": self.event_type,
            "data": self.data,
            "timestamp": self.timestamp.isoformat(),
            "source": self.source,
            "priority": self.priority.value,
            "channel": self.channel
        }
    
    def to_json(self) -> str:
        return json.dumps(self.to_dict())


class ConnectionManager:
    """
    Manages WebSocket connections with channel-based subscriptions.
    """
    
    def __init__(self):
        # Active connections: websocket -> set of subscribed channels
        self._connections: Dict[WebSocket, Set[str]] = {}
        # Channel -> set of websockets subscribed to it
        self._channels: Dict[str, Set[WebSocket]] = {"global": set()}
        self._lock = asyncio.Lock()
        
        # Connection stats
        self._total_connections = 0
        self._total_messages_sent = 0
        self._connection_errors = 0
    
    async def connect(self, websocket: WebSocket, channels: List[str] = None):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        
        async with self._lock:
            # Default to global channel
            subscribed_channels = set(channels or ["global"])
            subscribed_channels.add("global")  # Always include global
            
            self._connections[websocket] = subscribed_channels
            
            # Add to channel maps
            for channel in subscribed_channels:
                if channel not in self._channels:
                    self._channels[channel] = set()
                self._channels[channel].add(websocket)
            
            self._total_connections += 1
            
        logger.info(f"WebSocket connected. Channels: {subscribed_channels}. Total: {len(self._connections)}")
        
        # Send welcome message
        await self._send_json(websocket, {
            "type": "connected",
            "message": "Connected to AIOps Event Bus",
            "channels": list(subscribed_channels),
            "timestamp": datetime.utcnow().isoformat()
        })
    
    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        async with self._lock:
            if websocket in self._connections:
                # Remove from all channels
                for channel in self._connections[websocket]:
                    if channel in self._channels:
                        self._channels[channel].discard(websocket)
                
                del self._connections[websocket]
                
        logger.info(f"WebSocket disconnected. Remaining: {len(self._connections)}")
    
    async def subscribe(self, websocket: WebSocket, channel: str):
        """Subscribe a connection to a channel."""
        async with self._lock:
            if websocket in self._connections:
                self._connections[websocket].add(channel)
                if channel not in self._channels:
                    self._channels[channel] = set()
                self._channels[channel].add(websocket)
    
    async def unsubscribe(self, websocket: WebSocket, channel: str):
        """Unsubscribe a connection from a channel."""
        async with self._lock:
            if websocket in self._connections:
                self._connections[websocket].discard(channel)
                if channel in self._channels:
                    self._channels[channel].discard(websocket)
    
    async def broadcast(self, event: PlatformEvent):
        """Broadcast an event to all relevant subscribers."""
        targets = set()
        
        async with self._lock:
            # Get connections subscribed to this channel
            if event.channel in self._channels:
                targets.update(self._channels[event.channel])
            
            # Global always gets everything
            if "global" in self._channels:
                targets.update(self._channels["global"])
        
        if not targets:
            return
        
        # Send to all targets
        message = event.to_dict()
        disconnected = []
        
        for websocket in targets:
            try:
                await self._send_json(websocket, message)
                self._total_messages_sent += 1
            except Exception as e:
                logger.warning(f"Failed to send to WebSocket: {e}")
                disconnected.append(websocket)
                self._connection_errors += 1
        
        # Clean up disconnected
        for ws in disconnected:
            await self.disconnect(ws)
    
    async def send_to_channel(self, channel: str, data: Dict[str, Any]):
        """Send data to a specific channel."""
        async with self._lock:
            if channel not in self._channels:
                return
            targets = list(self._channels[channel])
        
        for websocket in targets:
            try:
                await self._send_json(websocket, data)
            except Exception:
                pass
    
    async def _send_json(self, websocket: WebSocket, data: Dict[str, Any]):
        """Send JSON data to a websocket."""
        await websocket.send_json(data)
    
    @property
    def connection_count(self) -> int:
        return len(self._connections)
    
    def get_stats(self) -> Dict[str, Any]:
        return {
            "active_connections": len(self._connections),
            "total_connections": self._total_connections,
            "total_messages_sent": self._total_messages_sent,
            "connection_errors": self._connection_errors,
            "channels": list(self._channels.keys())
        }


class EventBus:
    """
    Central event bus for the AIOps platform.
    
    Features:
    - Publish/subscribe pattern
    - WebSocket broadcasting
    - Event history with replay
    - Async event processing
    """
    
    def __init__(self, history_size: int = 100):
        self._connection_manager = ConnectionManager()
        self._history: deque = deque(maxlen=history_size)
        self._subscribers: Dict[str, List[Callable]] = {}
        self._lock = threading.Lock()
        self._event_count = 0
    
    @property
    def connections(self) -> ConnectionManager:
        return self._connection_manager
    
    async def publish(
        self,
        event_type: str,
        data: Dict[str, Any],
        channel: str = "global",
        priority: EventPriority = EventPriority.NORMAL,
        source: str = "workflow-engine"
    ) -> PlatformEvent:
        """
        Publish an event to all subscribers.
        
        Args:
            event_type: Type of event (use EventType enum values)
            data: Event payload
            channel: Channel to publish to
            priority: Event priority
            source: Source of the event
        
        Returns:
            The published PlatformEvent
        """
        event = PlatformEvent(
            event_type=event_type,
            data=data,
            channel=channel,
            priority=priority,
            source=source
        )
        
        # Store in history
        with self._lock:
            self._history.append(event)
            self._event_count += 1
        
        # Broadcast to WebSocket clients
        await self._connection_manager.broadcast(event)
        
        # Call local subscribers
        await self._notify_subscribers(event)
        
        logger.debug(f"Published event: {event_type} on channel: {channel}")
        
        return event
    
    async def _notify_subscribers(self, event: PlatformEvent):
        """Notify local subscribers of an event."""
        with self._lock:
            handlers = list(self._subscribers.get(event.event_type, []))
            handlers.extend(self._subscribers.get("*", []))  # Wildcard subscribers
        
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                logger.error(f"Event handler error: {e}")
    
    def subscribe(self, event_type: str, handler: Callable):
        """
        Subscribe to events of a specific type.
        
        Args:
            event_type: Type to subscribe to (or "*" for all)
            handler: Callback function
        """
        with self._lock:
            if event_type not in self._subscribers:
                self._subscribers[event_type] = []
            self._subscribers[event_type].append(handler)
    
    def unsubscribe(self, event_type: str, handler: Callable):
        """Unsubscribe from events."""
        with self._lock:
            if event_type in self._subscribers:
                try:
                    self._subscribers[event_type].remove(handler)
                except ValueError:
                    pass
    
    def get_history(
        self,
        event_type: Optional[str] = None,
        channel: Optional[str] = None,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get recent event history.
        
        Args:
            event_type: Filter by event type
            channel: Filter by channel
            limit: Max events to return
        """
        with self._lock:
            events = list(self._history)
        
        # Apply filters
        if event_type:
            events = [e for e in events if e.event_type == event_type]
        if channel:
            events = [e for e in events if e.channel == channel]
        
        # Return most recent
        return [e.to_dict() for e in events[-limit:]]
    
    def get_stats(self) -> Dict[str, Any]:
        """Get event bus statistics."""
        return {
            "total_events_published": self._event_count,
            "history_size": len(self._history),
            "subscriber_count": sum(len(h) for h in self._subscribers.values()),
            "websocket_stats": self._connection_manager.get_stats()
        }


# ============================================================
# GLOBAL EVENT BUS INSTANCE
# ============================================================

_event_bus: Optional[EventBus] = None
_event_bus_lock = threading.Lock()


def get_event_bus() -> EventBus:
    """Get the global event bus instance."""
    global _event_bus
    
    if _event_bus is None:
        with _event_bus_lock:
            if _event_bus is None:
                _event_bus = EventBus()
    
    return _event_bus


def init_event_bus(history_size: int = 100) -> EventBus:
    """Initialize the global event bus with custom settings."""
    global _event_bus
    
    with _event_bus_lock:
        _event_bus = EventBus(history_size=history_size)
    
    return _event_bus


# ============================================================
# CONVENIENCE FUNCTIONS
# ============================================================

async def emit(
    event_type: str,
    data: Dict[str, Any],
    channel: str = "global"
) -> PlatformEvent:
    """Quick emit an event."""
    return await get_event_bus().publish(event_type, data, channel=channel)


async def emit_execution_started(
    execution_id: str,
    workflow_id: str,
    workflow_name: str
):
    """Emit execution started event."""
    await emit(
        EventType.EXECUTION_STARTED.value,
        {
            "execution_id": execution_id,
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "status": "running"
        },
        channel=f"workflow:{workflow_id}"
    )


async def emit_execution_progress(
    execution_id: str,
    workflow_id: str,
    node_id: str,
    node_label: str,
    status: str,
    progress_percent: int = 0
):
    """Emit execution progress event."""
    await emit(
        EventType.EXECUTION_PROGRESS.value,
        {
            "execution_id": execution_id,
            "workflow_id": workflow_id,
            "node_id": node_id,
            "node_label": node_label,
            "status": status,
            "progress_percent": progress_percent
        },
        channel=f"execution:{execution_id}"
    )


async def emit_execution_completed(
    execution_id: str,
    workflow_id: str,
    success: bool,
    duration_ms: int
):
    """Emit execution completed event."""
    await emit(
        EventType.EXECUTION_COMPLETED.value if success else EventType.EXECUTION_FAILED.value,
        {
            "execution_id": execution_id,
            "workflow_id": workflow_id,
            "success": success,
            "duration_ms": duration_ms
        },
        channel=f"workflow:{workflow_id}"
    )


async def emit_issue_detected(
    issue_id: str,
    issue_type: str,
    severity: str,
    message: str,
    source: str = "detector"
):
    """Emit issue detected event."""
    await emit(
        EventType.ISSUE_DETECTED.value,
        {
            "issue_id": issue_id,
            "issue_type": issue_type,
            "severity": severity,
            "message": message,
            "source": source
        },
        channel="issues"
    )


async def emit_alert(
    alert_id: str,
    alert_type: str,
    severity: str,
    title: str,
    message: str
):
    """Emit alert event."""
    await emit(
        EventType.ALERT_FIRED.value,
        {
            "alert_id": alert_id,
            "alert_type": alert_type,
            "severity": severity,
            "title": title,
            "message": message
        },
        channel="alerts"
    )


async def emit_system_health(health_data: Dict[str, Any]):
    """Emit system health update."""
    await emit(
        EventType.SYSTEM_HEALTH.value,
        health_data,
        channel="system"
    )
