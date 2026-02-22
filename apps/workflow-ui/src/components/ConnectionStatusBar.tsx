/**
 * ConnectionStatusBar - Global real-time connection indicator
 * 
 * Shows WebSocket + API connection state persistently at the top of the app.
 * Three states: Connected (collapses), Reconnecting (amber), Offline (red).
 */

import { useState, useEffect, useRef } from 'react';
import './ConnectionStatusBar.css';

type ConnectionStatus = 'connected' | 'reconnecting' | 'offline';

interface ServiceState {
    ws: ConnectionStatus;
    api: ConnectionStatus;
}

export function ConnectionStatusBar() {
    const [state, setState] = useState<ServiceState>({ ws: 'reconnecting', api: 'reconnecting' });
    const [dismissed, setDismissed] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const apiPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── WebSocket probe ──────────────────────────────────────────────
    useEffect(() => {
        let reconnectTimer: ReturnType<typeof setTimeout>;

        function connect() {
            try {
                const ws = new WebSocket('ws://localhost:8001/ws');
                wsRef.current = ws;

                ws.onopen = () => {
                    setState(s => ({ ...s, ws: 'connected' }));
                    setDismissed(false);
                };

                ws.onclose = () => {
                    setState(s => ({ ...s, ws: 'reconnecting' }));
                    reconnectTimer = setTimeout(connect, 3000);
                };

                ws.onerror = () => {
                    setState(s => ({ ...s, ws: 'offline' }));
                    ws.close();
                };
            } catch {
                setState(s => ({ ...s, ws: 'offline' }));
                reconnectTimer = setTimeout(connect, 5000);
            }
        }

        connect();

        return () => {
            clearTimeout(reconnectTimer);
            wsRef.current?.close();
        };
    }, []);

    // ── API health poll ──────────────────────────────────────────────
    useEffect(() => {
        async function checkApi() {
            try {
                const r = await fetch('http://localhost:8001/health', { signal: AbortSignal.timeout(3000) });
                setState(s => ({ ...s, api: r.ok ? 'connected' : 'offline' }));
            } catch {
                setState(s => ({ ...s, api: 'offline' }));
            }
        }

        checkApi();
        apiPollRef.current = setInterval(checkApi, 10000);

        return () => {
            if (apiPollRef.current) clearInterval(apiPollRef.current);
        };
    }, []);

    // Compute overall status
    const overall: ConnectionStatus =
        state.ws === 'connected' && state.api === 'connected'
            ? 'connected'
            : state.ws === 'offline' || state.api === 'offline'
                ? 'offline'
                : 'reconnecting';

    // Hide bar when connected and dismissed (or after auto-collapse delay)
    const [collapsed, setCollapsed] = useState(false);
    useEffect(() => {
        if (overall === 'connected') {
            const t = setTimeout(() => setCollapsed(true), 2000);
            return () => clearTimeout(t);
        }
        setCollapsed(false);
        setDismissed(false);
    }, [overall]);

    if (collapsed || dismissed) return null;

    const labels: Record<ConnectionStatus, string> = {
        connected: 'All systems operational',
        reconnecting: 'Reconnecting to backend…',
        offline: 'Connection lost — some features may be unavailable',
    };

    return (
        <div className={`csb csb-${overall}`} role="status" aria-live="polite">
            <div className="csb-inner">
                <span className={`csb-dot csb-dot-${overall}`} />
                <span className="csb-label">{labels[overall]}</span>
                <div className="csb-details">
                    <span className={`csb-svc csb-svc-${state.api}`}>API</span>
                    <span className={`csb-svc csb-svc-${state.ws}`}>WS</span>
                </div>
                {overall !== 'connected' && (
                    <button className="csb-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}

export default ConnectionStatusBar;
