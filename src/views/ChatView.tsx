import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Lock, Plus, X } from 'lucide-react';
import { chat, getQueenPrefs } from '../api';
import { loadSessions, saveSession, deleteSession, createSession } from '../chat-storage';
import type { ChatMessage, ChatSession, UserPreferences } from '../types';

function generateId() {
  return Math.random().toString(36).slice(2);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDate(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function PrivacyIndicator() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);

  useEffect(() => {
    getQueenPrefs().then(setPrefs).catch(() => {});
  }, []);

  const queenType = prefs?.queen_type ?? localStorage.getItem('hf_queen_type') ?? null;
  const queenModel = prefs?.queen_model ?? localStorage.getItem('hf_queen_model') ?? null;
  const isLocal = !queenType || queenType === 'local';

  const label = queenModel
    ? `${isLocal ? '🖥️' : '☁️'} ${queenModel}`
    : isLocal
    ? 'Private · My Combs'
    : 'Cloud Queen';

  return (
    <div className="chat-privacy-badge" title={isLocal ? 'Tasks run on your combs privately' : 'Tasks routed via cloud queen'}>
      <Lock size={11} />
      {label}
    </div>
  );
}

interface SessionsPanelProps {
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}

function SessionsPanel({ sessions, activeId, onSelect, onNew, onDelete }: SessionsPanelProps) {
  const sorted = [...sessions].sort((a, b) => b.updated_at - a.updated_at);

  return (
    <div className="chat-sessions-panel">
      <div className="chat-sessions-header">
        <button className="btn btn--secondary btn--sm w-full" onClick={onNew} style={{ justifyContent: 'flex-start', gap: '6px' }}>
          <Plus size={14} />
          New chat
        </button>
      </div>
      <div className="chat-sessions-list">
        {sorted.length === 0 ? (
          <div style={{ padding: '16px 10px', fontSize: '12px', color: 'var(--color-text-disabled)', textAlign: 'center' }}>
            No previous chats
          </div>
        ) : (
          sorted.map((s) => (
            <div
              key={s.id}
              className={`chat-session-row${s.id === activeId ? ' chat-session-row--active' : ''}`}
              onClick={() => onSelect(s.id)}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="chat-session-title">{s.title}</div>
                <div className="chat-session-date">{formatDate(s.updated_at)}</div>
              </div>
              <button
                className="chat-session-delete btn btn--ghost"
                style={{ width: '22px', height: '22px', padding: 0, flexShrink: 0, borderRadius: '50%', fontSize: '14px', lineHeight: 1 }}
                onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                title="Delete chat"
              >
                <X size={12} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ChatView() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => loadSessions());
  const [activeId, setActiveId] = useState<string>(() => {
    const s = loadSessions();
    if (s.length > 0) return s[0].id;
    const fresh = createSession();
    saveSession(fresh);
    return fresh.id;
  });

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ensure the active session always exists in state
  useEffect(() => {
    setSessions((prev) => {
      const exists = prev.find((s) => s.id === activeId);
      if (exists) return prev;
      const fresh = createSession();
      saveSession(fresh);
      setActiveId(fresh.id);
      return [fresh, ...prev];
    });
  }, [activeId]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const messages = activeSession?.messages ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  function updateSession(updated: ChatSession) {
    saveSession(updated);
    setSessions((prev) => {
      const idx = prev.findIndex((s) => s.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });
  }

  function handleNew() {
    const fresh = createSession();
    saveSession(fresh);
    setSessions((prev) => [fresh, ...prev]);
    setActiveId(fresh.id);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleSelect(id: string) {
    setActiveId(id);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleDelete(id: string) {
    deleteSession(id);
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (id === activeId) {
        if (next.length > 0) {
          setActiveId(next[0].id);
        } else {
          const fresh = createSession();
          saveSession(fresh);
          setActiveId(fresh.id);
          return [fresh];
        }
      }
      return next;
    });
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    // Get or create the active session object
    let session = sessions.find((s) => s.id === activeId);
    if (!session) {
      session = createSession();
      session.id = activeId;
    }

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };
    const aiMsg: ChatMessage = {
      id: generateId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      status: 'queued',
    };

    // Set title from first user message
    const isFirstMessage = session.messages.length === 0;
    const newTitle = isFirstMessage ? trimmed.slice(0, 40) : session.title;

    const sessionWithUser: ChatSession = {
      ...session,
      title: newTitle,
      messages: [...session.messages, userMsg, aiMsg],
      updated_at: Date.now(),
    };

    updateSession(sessionWithUser);
    setInput('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      // Update status to running
      const sessionRunning: ChatSession = {
        ...sessionWithUser,
        messages: sessionWithUser.messages.map((m) =>
          m.id === aiMsg.id ? { ...m, status: 'running' as const } : m,
        ),
      };
      updateSession(sessionRunning);

      const result = await chat(trimmed);

      const sessionDone: ChatSession = {
        ...sessionRunning,
        messages: sessionRunning.messages.map((m) =>
          m.id === aiMsg.id ? { ...m, content: result, status: 'succeeded' as const } : m,
        ),
        updated_at: Date.now(),
      };
      updateSession(sessionDone);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Request failed';
      setSessions((prev) => {
        const s = prev.find((x) => x.id === activeId);
        if (!s) return prev;
        const updated: ChatSession = {
          ...s,
          messages: s.messages.map((m) =>
            m.id === aiMsg.id
              ? { ...m, content: `Error: ${errMsg}`, status: 'failed' as const }
              : m,
          ),
          updated_at: Date.now(),
        };
        saveSession(updated);
        return prev.map((x) => (x.id === activeId ? updated : x));
      });
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-layout">
      <SessionsPanel
        sessions={sessions}
        activeId={activeId}
        onSelect={handleSelect}
        onNew={handleNew}
        onDelete={handleDelete}
      />

      <div className="chat-main">
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <div className="chat-welcome-icon">🐝</div>
              <h2>Chat with your Hive</h2>
              <p className="text-secondary">
                Your queen will break down requests and route tasks to your combs automatically.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`message-row${msg.role === 'user' ? ' message-row--user' : ''}`}
              >
                <div className={`message-avatar${msg.role === 'user' ? ' message-avatar--user' : ' message-avatar--ai'}`}>
                  {msg.role === 'user' ? 'U' : '🐝'}
                </div>
                <div>
                  {msg.status === 'queued' || msg.status === 'running' ? (
                    <div className="message-bubble message-bubble--thinking">
                      <span className="spinner spinner--sm" />
                      {msg.status === 'queued' ? 'Queued…' : 'Running on hive…'}
                    </div>
                  ) : (
                    <div
                      className={`message-bubble${msg.role === 'user' ? ' message-bubble--user' : ' message-bubble--ai'}`}
                      style={msg.status === 'failed' ? { borderColor: 'var(--color-error)', color: 'var(--color-error)' } : undefined}
                    >
                      {msg.content}
                    </div>
                  )}
                  <div className="message-meta">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          <PrivacyIndicator />
          <div className="chat-input-bar">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Message the hive… (Enter to send, Shift+Enter for newline)"
              value={input}
              onChange={(e) => { setInput(e.target.value); autoResize(); }}
              onKeyDown={handleKeyDown}
              rows={1}
              disabled={sending}
            />
            <button
              className="btn btn--primary btn--icon"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              title="Send (Enter)"
            >
              {sending
                ? <span className="spinner spinner--sm" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
                : <Send size={15} />
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
