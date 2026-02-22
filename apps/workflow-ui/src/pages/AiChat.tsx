/**
 * AI Chat Page — FULLY REAL, ZERO MOCKS
 * 
 * Full-featured chat interface wired to the Brain's Cerebras LLM backend:
 * - POST /chat → real Cerebras Llama 3.1 8B responses 
 * - GET /pending-actions → real pending HITL actions
 * - POST /actions/{id}/approve → real approve/reject
 * - Tool call visualization (what monitoring tools the AI used)
 * - Pending action approval cards inline
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
    Bot,
    User,
    Send,
    Trash2,
    AlertTriangle,
    CheckCircle,
    XCircle,
    Loader2,
    Zap,
    RefreshCw,
    Clock,
} from '../components/Icons';
import './AiChat.css';

const BRAIN_API = 'http://localhost:8000';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    tools_used?: string[];
    pending_action?: PendingAction | null;
}

interface PendingAction {
    id: string;
    action_type: string;
    target: string;
    description: string;
    impact?: string;
    rollback_plan?: string;
    severity?: string;
    status: string;
}

interface ChatApiResponse {
    response: string;
    tools_used: string[];
    pending_action: PendingAction | null;
    investigation_complete: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUGGESTIONS
// ═══════════════════════════════════════════════════════════════════════════

const SUGGESTIONS = [
    { title: 'System Health Check', desc: 'What is the current CPU, memory, and load status?', prompt: 'What is the current system health? Check CPU, memory, and load average.' },
    { title: 'Active Alerts', desc: 'Check for any active monitoring alerts', prompt: 'Are there any active alerts right now?' },
    { title: 'Diagnose High CPU', desc: 'Investigate what is consuming CPU resources', prompt: 'Diagnose high CPU usage — show me the top processes and what might be causing it.' },
    { title: 'Fix Memory Issue', desc: 'Propose remediation for memory problems', prompt: 'Fix high memory usage — clear caches and kill non-essential processes if needed.' },
];

// ═══════════════════════════════════════════════════════════════════════════
// PENDING ACTION CARD COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

interface ActionCardProps {
    action: PendingAction;
    onApprove: (id: string) => void;
    onReject: (id: string) => void;
    processing: boolean;
}

function PendingActionCard({ action, onApprove, onReject, processing }: ActionCardProps) {
    return (
        <div className="pending-action-card">
            <div className="action-header">
                <AlertTriangle size={16} className="action-header-icon" />
                <span className="action-label">Pending Human Approval</span>
            </div>

            <div className="action-detail-grid">
                <span className="action-detail-key">Action:</span>
                <span className="action-detail-value">{action.action_type}</span>
                <span className="action-detail-key">Target:</span>
                <span className="action-detail-value">{action.target}</span>
                <span className="action-detail-key">Description:</span>
                <span className="action-detail-value">{action.description}</span>
                {action.impact && (
                    <>
                        <span className="action-detail-key">Impact:</span>
                        <span className="action-detail-value">{action.impact}</span>
                    </>
                )}
                {action.rollback_plan && (
                    <>
                        <span className="action-detail-key">Rollback:</span>
                        <span className="action-detail-value">{action.rollback_plan}</span>
                    </>
                )}
                {action.severity && (
                    <>
                        <span className="action-detail-key">Severity:</span>
                        <span className="action-detail-value">{action.severity}</span>
                    </>
                )}
            </div>

            {action.status === 'PENDING' && (
                <div className="action-buttons">
                    <button
                        className="action-btn approve"
                        onClick={() => onApprove(action.id)}
                        disabled={processing}
                    >
                        {processing ? <Loader2 size={14} /> : <CheckCircle size={14} />}
                        Approve & Execute
                    </button>
                    <button
                        className="action-btn reject"
                        onClick={() => onReject(action.id)}
                        disabled={processing}
                    >
                        <XCircle size={14} />
                        Reject
                    </button>
                </div>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export default function AiChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pendingCount, setPendingCount] = useState(0);
    const [processingAction, setProcessingAction] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isLoading]);

    // Fetch pending actions count
    useEffect(() => {
        const fetchPending = async () => {
            try {
                const res = await fetch(`${BRAIN_API}/pending-actions`);
                if (res.ok) {
                    const data = await res.json();
                    setPendingCount(data.actions?.length || 0);
                }
            } catch { /* silent */ }
        };
        fetchPending();
        const interval = setInterval(fetchPending, 15000);
        return () => clearInterval(interval);
    }, []);

    // Send message to real Brain /chat endpoint
    const sendMessage = useCallback(async (text: string) => {
        if (!text.trim() || isLoading) return;

        const userMsg: ChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: text.trim(),
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`${BRAIN_API}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text.trim() }),
            });

            if (!res.ok) throw new Error(`Brain API error: ${res.status} ${res.statusText}`);

            const data: ChatApiResponse = await res.json();

            const assistantMsg: ChatMessage = {
                id: `ai-${Date.now()}`,
                role: 'assistant',
                content: data.response,
                timestamp: new Date().toISOString(),
                tools_used: data.tools_used,
                pending_action: data.pending_action,
            };

            setMessages(prev => [...prev, assistantMsg]);

            // Refresh pending count if action was proposed
            if (data.pending_action) {
                setPendingCount(prev => prev + 1);
            }
        } catch (err) {
            const errMsg = err instanceof Error ? err.message : 'Unknown error';
            if (errMsg.includes('Failed to fetch')) {
                setError('Brain API unreachable — is the brain service running on port 8000?');
            } else {
                setError(errMsg);
            }
        } finally {
            setIsLoading(false);
        }
    }, [isLoading]);

    // Handle approve/reject
    const handleActionDecision = useCallback(async (actionId: string, decision: 'approve' | 'reject') => {
        setProcessingAction(true);
        try {
            const res = await fetch(`${BRAIN_API}/actions/${actionId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action_id: actionId, decision, approved_by: 'ui_user' }),
            });

            if (!res.ok) throw new Error(`Approval failed: ${res.status}`);
            const data = await res.json();

            // Update the message's pending action status
            setMessages(prev => prev.map(msg => {
                if (msg.pending_action?.id === actionId) {
                    return {
                        ...msg,
                        pending_action: {
                            ...msg.pending_action,
                            status: decision === 'approve' ? 'EXECUTING' : 'REJECTED',
                        },
                    };
                }
                return msg;
            }));

            // Add system response
            const resultMsg: ChatMessage = {
                id: `system-${Date.now()}`,
                role: 'assistant',
                content: decision === 'approve'
                    ? `✅ **Action Approved!** ${data.message || 'Executing remediation...'}`
                    : `❌ **Action Rejected.** ${data.message || 'No action taken.'}`,
                timestamp: new Date().toISOString(),
            };
            setMessages(prev => [...prev, resultMsg]);
            setPendingCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to process action');
        } finally {
            setProcessingAction(false);
        }
    }, []);

    // Clear chat
    const clearChat = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    // Handle keyboard
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage(input);
        }
    };

    // Format time
    const formatTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
        <div className="ai-chat-page">
            {/* ─── Header ─── */}
            <div className="ai-chat-header">
                <div className="ai-chat-header-left">
                    <div className="ai-status-indicator" />
                    <div>
                        <div className="ai-chat-title">CEREBRO AI Agent</div>
                        <div className="ai-chat-subtitle">Cerebras Llama 3.1 8B · Real-time monitoring tools</div>
                    </div>
                </div>
                <div className="ai-chat-header-right">
                    {pendingCount > 0 && (
                        <button className="ai-header-btn">
                            <AlertTriangle size={14} />
                            Pending
                            <span className="pending-badge">{pendingCount}</span>
                        </button>
                    )}
                    <button className="ai-header-btn danger" onClick={clearChat}>
                        <Trash2 size={14} />
                        Clear
                    </button>
                </div>
            </div>

            {/* ─── Messages ─── */}
            <div className="ai-chat-messages">
                <div className="messages-container">
                    {messages.length === 0 && !isLoading && (
                        <div className="ai-welcome">
                            <div className="ai-welcome-icon">
                                <Bot size={32} />
                            </div>
                            <h2>CEREBRO AI Operations Agent</h2>
                            <p>
                                I'm connected to your live infrastructure via Netdata monitoring.
                                Ask me about system health, investigate alerts, or request remediations —
                                I'll use real tools and propose actions that require your approval.
                            </p>
                            <div className="ai-suggestions">
                                {SUGGESTIONS.map((s, i) => (
                                    <button
                                        key={i}
                                        className="ai-suggestion-card"
                                        onClick={() => sendMessage(s.prompt)}
                                    >
                                        <div className="suggestion-title">{s.title}</div>
                                        <div className="suggestion-desc">{s.desc}</div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {messages.map(msg => (
                        <div key={msg.id} className={`chat-message ${msg.role === 'user' ? 'user' : 'ai'}`}>
                            <div className={`message-avatar ${msg.role === 'user' ? 'user' : 'ai'}`}>
                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                            </div>
                            <div className="message-content">
                                <div className="message-bubble">
                                    {msg.content}
                                </div>

                                {/* Tool tags */}
                                {msg.tools_used && msg.tools_used.length > 0 && (
                                    <div className="tools-used-tags">
                                        {msg.tools_used.map((tool, i) => (
                                            <span key={i} className="tool-tag">
                                                <Zap size={10} /> {tool}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Pending action card */}
                                {msg.pending_action && (
                                    <PendingActionCard
                                        action={msg.pending_action}
                                        onApprove={(id) => handleActionDecision(id, 'approve')}
                                        onReject={(id) => handleActionDecision(id, 'reject')}
                                        processing={processingAction}
                                    />
                                )}

                                <div className="message-meta">
                                    <Clock size={10} />
                                    <span className="message-time">{formatTime(msg.timestamp)}</span>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Typing indicator */}
                    {isLoading && (
                        <div className="typing-indicator">
                            <div className="message-avatar ai">
                                <Bot size={16} />
                            </div>
                            <div className="typing-dots">
                                <span /><span /><span />
                            </div>
                        </div>
                    )}

                    {/* Error banner */}
                    {error && (
                        <div className="ai-error-banner">
                            <AlertTriangle size={16} className="error-icon" />
                            <span className="error-text">{error}</span>
                            <button className="error-dismiss" onClick={() => setError(null)}>Dismiss</button>
                        </div>
                    )}

                    <div ref={messagesEndRef} />
                </div>
            </div>

            {/* ─── Input Area ─── */}
            <div className="ai-chat-input-area">
                <div className="ai-chat-input-wrapper">
                    <div className="ai-chat-input-container">
                        <textarea
                            ref={inputRef}
                            className="ai-chat-input"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask about system health, investigate alerts, or request fixes..."
                            rows={1}
                            disabled={isLoading}
                        />
                        <button
                            className="ai-send-btn"
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isLoading}
                        >
                            {isLoading ? <Loader2 size={16} /> : <Send size={16} />}
                        </button>
                    </div>
                    <div className="ai-input-hint">
                        Press Enter to send · Shift+Enter for new line · All responses from real Cerebras LLM
                    </div>
                </div>
            </div>
        </div>
    );
}
