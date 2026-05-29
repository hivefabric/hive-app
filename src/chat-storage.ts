import type { ChatSession } from './types';

const KEY = 'hf_chat_sessions';

export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ChatSession[];
  } catch {
    return [];
  }
}

export function saveSession(s: ChatSession): void {
  const sessions = loadSessions();
  const idx = sessions.findIndex((x) => x.id === s.id);
  if (idx >= 0) {
    sessions[idx] = s;
  } else {
    sessions.unshift(s);
  }
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

export function deleteSession(id: string): void {
  const sessions = loadSessions().filter((s) => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(sessions));
}

export function createSession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [],
    created_at: Date.now(),
    updated_at: Date.now(),
  };
}
