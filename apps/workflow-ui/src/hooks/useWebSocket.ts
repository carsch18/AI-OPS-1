/**
 * useWebSocket - Production-grade WebSocket hook for real-time events
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Channel-based subscriptions
 * - Event type filtering
 * - Connection state management
 * - Heartbeat/ping-pong
 */

import { useEffect, useRef, useState, useCallback } from 'react';

// Types
export interface WebSocketEvent {
    event_id: string;
    event_type: string;
    data: Record<string, any>;
    timestamp: string;
    source: string;
    priority: number;
    channel: string;
}

export interface WebSocketMessage {
    type: string;
    [key: string]: any;
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';

export interface UseWebSocketOptions {
    url?: string;
    channels?: string[];
    autoConnect?: boolean;
    reconnectAttempts?: number;
    reconnectInterval?: number;
    heartbeatInterval?: number;
    onEvent?: (event: WebSocketEvent) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Event) => void;
}

export interface UseWebSocketReturn {
    isConnected: boolean;
    connectionState: ConnectionState;
    lastEvent: WebSocketEvent | null;
    events: WebSocketEvent[];
    connect: () => void;
    disconnect: () => void;
    subscribe: (channel: string) => void;
    unsubscribe: (channel: string) => void;
    getHistory: (options?: { eventType?: string; channel?: string; limit?: number }) => void;
    clearEvents: () => void;
}

const DEFAULT_WS_URL = 'ws://localhost:8001/ws';
const MAX_EVENTS = 100;

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
    const {
        url = DEFAULT_WS_URL,
        channels = ['global'],
        autoConnect = true,
        reconnectAttempts = 5,
        reconnectInterval = 3000,
        heartbeatInterval = 30000,
        onEvent,
        onConnect,
        onDisconnect,
        onError,
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectCountRef = useRef(0);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
    const [lastEvent, setLastEvent] = useState<WebSocketEvent | null>(null);
    const [events, setEvents] = useState<WebSocketEvent[]>([]);

    const isConnected = connectionState === 'connected';

    // Clear events
    const clearEvents = useCallback(() => {
        setEvents([]);
        setLastEvent(null);
    }, []);

    // Handle incoming message
    const handleMessage = useCallback((messageEvent: MessageEvent) => {
        try {
            const data = JSON.parse(messageEvent.data) as WebSocketMessage;

            // Handle different message types
            if (data.type === 'connected') {
                console.log('✅ WebSocket connected:', data.message);
                return;
            }

            if (data.type === 'pong') {
                return; // Heartbeat response
            }

            if (data.type === 'subscribed' || data.type === 'unsubscribed') {
                console.log(`📢 ${data.type} to channel: ${data.channel}`);
                return;
            }

            if (data.type === 'history') {
                // Handle history response
                const historyEvents = data.events as WebSocketEvent[];
                setEvents(prev => [...historyEvents, ...prev].slice(0, MAX_EVENTS));
                return;
            }

            // It's a platform event
            if (data.event_id && data.event_type) {
                const event = data as unknown as WebSocketEvent;
                setLastEvent(event);
                setEvents(prev => [event, ...prev].slice(0, MAX_EVENTS));
                onEvent?.(event);
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }, [onEvent]);

    // Start heartbeat
    const startHeartbeat = useCallback(() => {
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
        }
        heartbeatRef.current = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ action: 'ping' }));
            }
        }, heartbeatInterval);
    }, [heartbeatInterval]);

    // Stop heartbeat
    const stopHeartbeat = useCallback(() => {
        if (heartbeatRef.current) {
            clearInterval(heartbeatRef.current);
            heartbeatRef.current = null;
        }
    }, []);

    // Connect to WebSocket
    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        setConnectionState('connecting');

        // Build URL with channels
        const channelParam = channels.join(',');
        const wsUrl = `${url}?channels=${encodeURIComponent(channelParam)}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('🔌 WebSocket connected');
            setConnectionState('connected');
            reconnectCountRef.current = 0;
            startHeartbeat();
            onConnect?.();
        };

        ws.onmessage = handleMessage;

        ws.onclose = () => {
            console.log('🔌 WebSocket disconnected');
            setConnectionState('disconnected');
            stopHeartbeat();
            onDisconnect?.();

            // Attempt reconnection
            if (reconnectCountRef.current < reconnectAttempts) {
                reconnectCountRef.current += 1;
                const delay = reconnectInterval * Math.pow(2, reconnectCountRef.current - 1);
                console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectCountRef.current})`);
                setConnectionState('reconnecting');

                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, delay);
            }
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            onError?.(error);
        };

        wsRef.current = ws;
    }, [url, channels, reconnectAttempts, reconnectInterval, handleMessage, startHeartbeat, stopHeartbeat, onConnect, onDisconnect, onError]);

    // Disconnect from WebSocket
    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
        reconnectCountRef.current = reconnectAttempts; // Prevent reconnection
        stopHeartbeat();
        wsRef.current?.close();
        wsRef.current = null;
        setConnectionState('disconnected');
    }, [reconnectAttempts, stopHeartbeat]);

    // Subscribe to channel
    const subscribe = useCallback((channel: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'subscribe', channel }));
        }
    }, []);

    // Unsubscribe from channel
    const unsubscribe = useCallback((channel: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'unsubscribe', channel }));
        }
    }, []);

    // Get event history
    const getHistory = useCallback((options?: { eventType?: string; channel?: string; limit?: number }) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                action: 'get_history',
                event_type: options?.eventType,
                channel: options?.channel,
                limit: options?.limit ?? 50,
            }));
        }
    }, []);

    // Auto-connect on mount
    useEffect(() => {
        if (autoConnect) {
            connect();
        }

        return () => {
            disconnect();
        };
    }, [autoConnect]); // Only run on mount/unmount

    return {
        isConnected,
        connectionState,
        lastEvent,
        events,
        connect,
        disconnect,
        subscribe,
        unsubscribe,
        getHistory,
        clearEvents,
    };
}

export default useWebSocket;
