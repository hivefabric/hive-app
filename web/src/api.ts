import type {
  SignupResponse,
  ToolCallRequest,
  ToolCallResponse,
  CombNode,
  DescribeClusterResponse,
  LLMProvider,
  CreateLLMProviderRequest,
  UserPreferences,
  EnrolCombRequest,
  EnrolCombResponse,
  ModelEntry,
  ChatSession,
  UsageSummary,
  Schedule,
} from './types';

const GATEWAY = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8090';

function gatewayUnavailableMessage(): string {
  return `Could not reach the tenant gateway at ${GATEWAY}. Start hive-tenant-gateway on port 8090, or set VITE_GATEWAY_URL to the correct address.`;
}

function getToken(): string {
  return localStorage.getItem('hf_token') ?? '';
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      message = body.message || body.error || message;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export async function signup(email?: string): Promise<SignupResponse> {
  const res = await fetch(`${GATEWAY}/v1/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handleResponse<SignupResponse>(res);
}

// ─── MCP Tool Calls ──────────────────────────────────────────────────────────

export async function callTool(req: ToolCallRequest): Promise<ToolCallResponse> {
  const res = await fetch(`${GATEWAY}/v1/mcp/tools/call`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(req),
  });
  return handleResponse<ToolCallResponse>(res);
}

export async function runSubagent(
  prompt: string,
  capability_urn?: string,
): Promise<string> {
  const args: Record<string, unknown> = { prompt };
  if (capability_urn) args.capability_urn = capability_urn;

  // The gateway returns RunSubagentResponse directly (not MCP content envelope).
  // Shape: { task_id, status, output: { output: { ... }, status, ... }, ... }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = await handleResponse(
    await fetch(`${GATEWAY}/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'run_subagent', arguments: args }),
    }),
  );

  if (raw?.error) throw new Error(raw.message ?? raw.error);

  // Navigate the nested output to find the text response.
  const inner = raw?.output?.output ?? raw?.output ?? raw;

  // Queen response: { final_message: "..." }
  if (typeof inner?.final_message === 'string') return inner.final_message;

  // Direct LLM response: { choices: [{ message: { content: "..." } }] }
  const content = inner?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;

  // Fallback: stringify whatever we got
  return typeof inner === 'string' ? inner : JSON.stringify(inner ?? raw);
}

/** Route via the gateway's LLM tool-loop (cloud queen path). */
export async function orchestrate(
  prompt: string,
  provider_id: string,
): Promise<string> {
  const res = await fetch(`${GATEWAY}/v1/orchestrate`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      provider_id,
      max_iterations: 10,
    }),
  });
  const data = await handleResponse<{ final_message?: string; error?: string }>(res);
  return data.final_message ?? '';
}

// ─── Queen config (server-side, cached) ──────────────────────────────────────

let _queenPrefsCache: UserPreferences | null = null;

export async function getQueenPrefs(): Promise<UserPreferences> {
  if (_queenPrefsCache) return _queenPrefsCache;
  try {
    _queenPrefsCache = await getPreferences();
    return _queenPrefsCache;
  } catch {
    return {} as UserPreferences;
  }
}

export function invalidateQueenCache() {
  _queenPrefsCache = null;
}

/**
 * Save queen configuration to server preferences.
 * Clears the local cache so the next chat() call re-reads.
 */
export async function setQueenConfig(config: {
  queen_type: 'local' | 'cloud';
  queen_comb_id?: string;
  queen_urn?: string;
  queen_llm_provider_id?: string;
  queen_model?: string;
}): Promise<UserPreferences> {
  const updated = await updatePreferences(config);
  _queenPrefsCache = updated;
  // Mirror to localStorage for the privacy indicator (no extra fetch needed)
  localStorage.setItem('hf_queen_type', config.queen_type);
  if (config.queen_urn) localStorage.setItem('hf_queen_urn', config.queen_urn);
  if (config.queen_model) localStorage.setItem('hf_queen_model', config.queen_model);
  if (config.queen_comb_id) localStorage.setItem('hf_queen_comb_id', config.queen_comb_id);
  return updated;
}

/**
 * Route a chat message via the configured queen.
 * Always fetches fresh preferences so queen model changes take effect immediately
 * — the cache is intentionally bypassed here to avoid routing through a stale
 * provider after the queen model is changed in Settings.
 */
export async function chat(prompt: string): Promise<string> {
  // Always invalidate before chat to pick up any queen model changes.
  // The cache serves display purposes (privacy indicator); routing must be fresh.
  invalidateQueenCache();
  const prefs = await getQueenPrefs();
  if (prefs.queen_type === 'cloud' && prefs.queen_llm_provider_id) {
    return orchestrate(prompt, prefs.queen_llm_provider_id);
  }
  // Local queen — use the server-side queen_urn (guaranteed current)
  const urn = prefs.queen_urn || undefined;
  return runSubagent(prompt, urn);
}

export async function describeCluster(): Promise<DescribeClusterResponse> {
  // The gateway returns DescribeClusterResponse directly (not MCP content envelope).
  try {
    const res = await fetch(`${GATEWAY}/v1/mcp/tools/call`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: 'describe_cluster', arguments: {} }),
    });
    const raw = await handleResponse<DescribeClusterResponse>(res);
    return raw ?? { capabilities: [], total_combs: 0, online_combs: 0 };
  } catch {
    return { capabilities: [], total_combs: 0, online_combs: 0 };
  }
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

// Routed through the gateway (GET /v1/me/combs) so auth is applied and the
// response is scoped to combs owned by the authenticated tenant.
// TODO: the gateway currently returns all online nodes unfiltered until the
//       enrolment flow stamps owner_user_id on comb registration.
export async function getNodes(): Promise<CombNode[]> {
  const res = await fetch(`${GATEWAY}/v1/me/combs`, {
    headers: authHeaders(),
  });
  return handleResponse<CombNode[]>(res);
}

// ─── Comb Enrolment ──────────────────────────────────────────────────────────

export async function enrollComb(
  name: string,
  capabilities: string,
  port: number,
): Promise<EnrolCombResponse> {
  const req: EnrolCombRequest = { name, capabilities, port };
  const res = await fetch(`${GATEWAY}/v1/me/combs/enrol`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(req),
  });
  return handleResponse<EnrolCombResponse>(res);
}

// ─── LLM Providers ───────────────────────────────────────────────────────────

export async function getLLMProviders(): Promise<LLMProvider[]> {
  try {
    const res = await fetch(`${GATEWAY}/v1/me/llm-providers`, {
      headers: authHeaders(),
    });
    return handleResponse<LLMProvider[]>(res);
  } catch (err) {
    if (err instanceof TypeError) throw new Error(gatewayUnavailableMessage());
    throw err;
  }
}

export async function createLLMProvider(req: CreateLLMProviderRequest): Promise<LLMProvider> {
  try {
    const res = await fetch(`${GATEWAY}/v1/me/llm-providers`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(req),
    });
    return handleResponse<LLMProvider>(res);
  } catch (err) {
    if (err instanceof TypeError) throw new Error(gatewayUnavailableMessage());
    throw err;
  }
}

export async function deleteLLMProvider(id: string): Promise<void> {
  const res = await fetch(`${GATEWAY}/v1/me/llm-providers/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export async function getPreferences(): Promise<UserPreferences> {
  try {
    const res = await fetch(`${GATEWAY}/v1/me/preferences`, {
      headers: authHeaders(),
    });
    return handleResponse<UserPreferences>(res);
  } catch (err) {
    if (err instanceof TypeError) throw new Error(gatewayUnavailableMessage());
    throw err;
  }
}

export async function updatePreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  try {
    const res = await fetch(`${GATEWAY}/v1/me/preferences`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(prefs),
    });
    return handleResponse<UserPreferences>(res);
  } catch (err) {
    if (err instanceof TypeError) throw new Error(gatewayUnavailableMessage());
    throw err;
  }
}

// ─── Model Catalog ────────────────────────────────────────────────────────────

export async function getModels(): Promise<ModelEntry[]> {
  try {
    const res = await fetch(`${GATEWAY}/v1/me/models`, { headers: authHeaders() });
    const d = await handleResponse<{ models: ModelEntry[] }>(res);
    return d.models ?? [];
  } catch { return []; }
}

// ─── Chat sessions (server-side) ─────────────────────────────────────────────

interface ServerChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages?: Array<{
    id: string;
    role: string;
    content: string;
    status?: string;
    created_at: string;
  }>;
}

function mapServerSession(s: ServerChatSession): ChatSession {
  return {
    id: s.id,
    title: s.title,
    created_at: new Date(s.created_at).getTime(),
    updated_at: new Date(s.updated_at).getTime(),
    messages: (s.messages ?? []).map((m) => ({
      id: m.id,
      role: m.role as 'user' | 'assistant' | 'system',
      content: m.content,
      timestamp: new Date(m.created_at).getTime(),
      status: m.status as ChatSession['messages'][number]['status'],
    })),
    sync_status: 'synced',
  };
}

export async function listChats(): Promise<ChatSession[]> {
  const res = await fetch(`${GATEWAY}/v1/me/chats`, { headers: authHeaders() });
  const data = await handleResponse<ServerChatSession[]>(res);
  return data.map(mapServerSession);
}

export async function createChat(title?: string): Promise<ChatSession> {
  const res = await fetch(`${GATEWAY}/v1/me/chats`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ title: title ?? 'New chat' }),
  });
  const data = await handleResponse<ServerChatSession>(res);
  return mapServerSession(data);
}

export async function getChat(id: string): Promise<ChatSession> {
  const res = await fetch(`${GATEWAY}/v1/me/chats/${id}`, { headers: authHeaders() });
  const data = await handleResponse<ServerChatSession>(res);
  return mapServerSession(data);
}

export async function updateChatTitle(id: string, title: string): Promise<void> {
  const res = await fetch(`${GATEWAY}/v1/me/chats/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function deleteChat(id: string): Promise<void> {
  const res = await fetch(`${GATEWAY}/v1/me/chats/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function appendChatMessage(
  sessionId: string,
  msg: { role: string; content: string; status?: string },
): Promise<void> {
  const res = await fetch(`${GATEWAY}/v1/me/chats/${sessionId}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(msg),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

// ─── Usage / Ledger ───────────────────────────────────────────────────────────

export async function getUsage(): Promise<UsageSummary> {
  const res = await fetch(`${GATEWAY}/v1/me/usage`, { headers: authHeaders() });
  return handleResponse<UsageSummary>(res);
}

// ─── Schedules ────────────────────────────────────────────────────────────────

export async function listSchedules(): Promise<Schedule[]> {
  const res = await fetch(`${GATEWAY}/v1/me/schedules`, { headers: authHeaders() });
  return handleResponse<Schedule[]>(res);
}

export async function createSchedule(data: {
  title: string;
  cron: string;
  prompt: string;
  capability_urn?: string;
}): Promise<Schedule> {
  const res = await fetch(`${GATEWAY}/v1/me/schedules`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      ...data,
      task_payload: { prompt: data.prompt, capability_urn: data.capability_urn },
    }),
  });
  return handleResponse<Schedule>(res);
}

export async function deleteSchedule(id: string): Promise<void> {
  await fetch(`${GATEWAY}/v1/me/schedules/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function toggleSchedule(id: string, enabled: boolean): Promise<Schedule> {
  const res = await fetch(`${GATEWAY}/v1/me/schedules/${id}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify({ enabled }),
  });
  return handleResponse<Schedule>(res);
}
