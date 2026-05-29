import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Lock, Plus, X } from 'lucide-react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { chat, getQueenPrefs, invalidateQueenCache, listChats, getChat, createChat } from '../api';
import { loadSessions, saveSession, deleteSession, createSession, syncAppendMessage, syncRenameSession } from '../chat-storage';
import type { ChatMessage, ChatSession, UserPreferences } from '../types';

// Configure marked for safe rendering
marked.setOptions({ breaks: true, gfm: true });

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

  function reload() {
    invalidateQueenCache();
    getQueenPrefs().then(setPrefs).catch(() => {});
  }

  useEffect(() => {
    reload();
    // Re-fetch when settings saves a new queen model
    function onStorage(e: StorageEvent) {
      if (e.key === 'hf_cells_refresh' || e.key === 'hf_queen_model') reload();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also reflect immediate localStorage changes (same tab)
  const storedModel = localStorage.getItem('hf_queen_model');
  const queenType = prefs?.queen_type ?? localStorage.getItem('hf_queen_type') ?? null;
  const queenModel = prefs?.queen_model ?? storedModel ?? null;
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

function SessionTitle({ session, onRename }: { session: ChatSession; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="chat-session-title-input"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); if (draft.trim()) onRename(draft.trim()); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.currentTarget.blur(); }
          if (e.key === 'Escape') { setDraft(session.title); setEditing(false); }
        }}
        onClick={e => e.stopPropagation()}
      />
    );
  }
  return (
    <div
      className="chat-session-title"
      onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
      title="Double-click to rename"
    >{session.title}</div>
  );
}

interface SessionsPanelProps {
  sessions: ChatSession[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function SessionsPanel({ sessions, activeId, onSelect, onNew, onDelete, onRename }: SessionsPanelProps) {
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
                <SessionTitle session={s} onRename={(title) => onRename(s.id, title)} />
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

  // On mount: fetch server sessions and merge with local
  useEffect(() => {
    listChats()
      .then(async (serverSessions) => {
        const local = loadSessions();
        const localIds = new Set(local.map((s) => s.id));
        const serverIds = new Set(serverSessions.map((s) => s.id));

        // Sessions on server but not local: fetch messages and add locally
        const toFetch = serverSessions.filter((s) => !localIds.has(s.id));
        const fetched = await Promise.all(
          toFetch.map((s) =>
            getChat(s.id).catch(() => s), // fall back to session without messages
          ),
        );

        // Mark local-only sessions as 'local', server sessions as 'synced'
        const updatedLocal = local.map((s) =>
          serverIds.has(s.id) ? { ...s, sync_status: 'synced' as const } : s,
        );

        const merged = [...updatedLocal];
        for (const s of fetched) {
          if (!localIds.has(s.id)) {
            saveSession(s);
            merged.push(s);
          }
        }

        setSessions(merged);
      })
      .catch(() => {
        // Network error or 401 — silently fall back to localStorage only
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const queenConfigured = !!(localStorage.getItem('hf_queen_type'));

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
    // Fire-and-forget: create on server
    createChat(fresh.title).catch(() => {});
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

  function handleRename(id: string, title: string) {
    setSessions((prev) => {
      const session = prev.find((s) => s.id === id);
      if (!session) return prev;
      const updated: ChatSession = { ...session, title };
      saveSession(updated);
      return prev.map((s) => (s.id === id ? updated : s));
    });
    // Fire-and-forget sync to server
    syncRenameSession(id, title);
  }

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending || !queenConfigured) return;

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
    // Fire-and-forget: sync user message to server
    syncAppendMessage(sessionWithUser.id, { role: 'user', content: trimmed });
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
      // Fire-and-forget: sync assistant message to server
      syncAppendMessage(sessionDone.id, { role: 'assistant', content: result, status: 'succeeded' });
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
      // Fire-and-forget: sync failed assistant message to server
      syncAppendMessage(activeId, { role: 'assistant', content: `Error: ${errMsg}`, status: 'failed' });
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
        onRename={handleRename}
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
              {!queenConfigured && (
                <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(249,171,0,0.1)', border: '1px solid #E37400', borderRadius: 8, fontSize: 13 }}>
                  Queen not configured. Go to <a href="#/settings">Settings → Queen</a> to set it up.
                </div>
              )}
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
                  ) : msg.role === 'assistant' ? (
                    <div
                      className="message-bubble message-bubble--ai"
                      style={msg.status === 'failed' ? { borderColor: 'var(--color-error)', color: 'var(--color-error)' } : undefined}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.content) as string) }}
                    />
                  ) : (
                    <div
                      className="message-bubble message-bubble--user"
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
              disabled={!input.trim() || sending || !queenConfigured}
              title={!queenConfigured ? 'Configure a queen in Settings first' : 'Send (Enter)'}
              aria-label={!queenConfigured ? 'Configure a queen in Settings first' : 'Send'}
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
