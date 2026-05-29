import type { ChatSession } from './types';
import {
  createChat,
  appendChatMessage,
  updateChatTitle,
  deleteChat,
} from './api';

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
  // Fire-and-forget: sync delete to server
  deleteChat(id).catch(() => {});
}

export function createSession(): ChatSession {
  return {
    id: crypto.randomUUID(),
    title: 'New chat',
    messages: [],
    created_at: Date.now(),
    updated_at: Date.now(),
    sync_status: 'local',
  };
}

/**
 * Create a new session and sync it to the server.
 * Saves locally first, then fires a server create in the background.
 */
export function createAndSyncSession(): ChatSession {
  const s = createSession();
  saveSession(s);
  // Fire-and-forget: create on server
  createChat(s.title)
    .then((serverSession) => {
      // Update the local session ID to match server ID if different
      // (we keep the local UUID since server may return a different ID)
      const local = loadSessions().find((x) => x.id === s.id);
      if (local) {
        const synced: ChatSession = { ...local, sync_status: 'synced' };
        saveSession(synced);
      }
      // Suppress unused variable warning
      void serverSession;
    })
    .catch(() => {
      const local = loadSessions().find((x) => x.id === s.id);
      if (local) {
        saveSession({ ...local, sync_status: 'error' });
      }
    });
  return s;
}

/**
 * Append a message to a session and sync it to the server.
 * Fire-and-forget — does not block the UI.
 */
export function syncAppendMessage(
  sessionId: string,
  msg: { role: string; content: string; status?: string },
): void {
  appendChatMessage(sessionId, msg).catch(() => {});
}

/**
 * Sync a title rename to the server. Fire-and-forget.
 */
export function syncRenameSession(id: string, title: string): void {
  updateChatTitle(id, title).catch(() => {});
}
