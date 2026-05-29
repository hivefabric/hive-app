import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Lock } from 'lucide-react';
import { chat } from '../api';
import type { ChatMessage } from '../types';

function generateId() {
  return Math.random().toString(36).slice(2);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function PrivacyIndicator() {
  const queenType = localStorage.getItem('hf_queen_type') ?? 'local';
  const isLocal = queenType === 'local' || !queenType;
  return (
    <div className="chat-privacy-badge" title={isLocal ? 'Tasks run on your combs' : 'Tasks routed via cloud queen'}>
      <Lock size={11} />
      {isLocal ? 'Private · My Combs' : 'Cloud Queen'}
    </div>
  );
}

export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

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

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput('');
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    try {
      setMessages((prev) =>
        prev.map((m) => (m.id === aiMsg.id ? { ...m, status: 'running' } : m)),
      );
      const result = await chat(trimmed);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id ? { ...m, content: result, status: 'succeeded' } : m,
        ),
      );
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Request failed';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id
            ? { ...m, content: `Error: ${errMsg}`, status: 'failed' }
            : m,
        ),
      );
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
  );
}
