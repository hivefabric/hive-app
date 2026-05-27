import { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { runSubagent, describeCluster } from '../api';
import type { ChatMessage, CapabilityInfo } from '../types';

function generateId() {
  return Math.random().toString(36).slice(2);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [capabilities, setCapabilities] = useState<CapabilityInfo[]>([]);
  const [selectedCap, setSelectedCap] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    describeCluster()
      .then((res) => setCapabilities(res.capabilities))
      .catch(() => setCapabilities([]));
  }, []);

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

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      setMessages((prev) =>
        prev.map((m) => (m.id === aiMsg.id ? { ...m, status: 'running' } : m)),
      );

      const result = await runSubagent(trimmed, selectedCap || undefined);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsg.id
            ? { ...m, content: result, status: 'succeeded' }
            : m,
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
              Submit a prompt and your distributed network of combs will handle it.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`message-row${msg.role === 'user' ? ' message-row--user' : ''}`}
            >
              <div
                className={`message-avatar${msg.role === 'user' ? ' message-avatar--user' : ' message-avatar--ai'}`}
              >
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
        <div className="chat-input-bar">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Message the hive… (Enter to send, Shift+Enter for newline)"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoResize();
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            disabled={sending}
          />
          <div className="chat-input-actions">
            {capabilities.length > 0 && (
              <select
                className="chat-capability-select"
                value={selectedCap}
                onChange={(e) => setSelectedCap(e.target.value)}
                title="Select capability"
              >
                <option value="">Auto-route</option>
                {capabilities.map((cap) => (
                  <option key={cap.urn} value={cap.urn}>
                    {cap.urn}
                  </option>
                ))}
              </select>
            )}
            <button
              className="btn btn--primary btn--icon"
              onClick={handleSend}
              disabled={!input.trim() || sending}
              title="Send (Enter)"
            >
              {sending ? (
                <span className="spinner spinner--sm" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
              ) : (
                <Send size={15} />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
