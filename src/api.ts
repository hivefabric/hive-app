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
} from './types';

const GATEWAY = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8090';

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
  const result = await callTool({ name: 'run_subagent', arguments: args });
  const textContent = result.content.find((c) => c.type === 'text');
  return textContent?.text ?? '';
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
 * Local queen → run_subagent with the queen URN (gateway injects queen_llm).
 * Cloud queen → /v1/orchestrate with the stored provider.
 * No queen configured → auto-route (no urn, gateway picks default).
 */
export async function chat(prompt: string): Promise<string> {
  const prefs = await getQueenPrefs();
  if (prefs.queen_type === 'cloud' && prefs.queen_llm_provider_id) {
    return orchestrate(prompt, prefs.queen_llm_provider_id);
  }
  // Local queen or fallback
  const urn = prefs.queen_urn || localStorage.getItem('hf_queen_urn') || undefined;
  return runSubagent(prompt, urn);
}

export async function describeCluster(): Promise<DescribeClusterResponse> {
  const result = await callTool({
    name: 'describe_cluster',
    arguments: {},
  });
  const textContent = result.content.find((c) => c.type === 'text');
  if (!textContent?.text) return { capabilities: [], total_combs: 0, online_combs: 0 };
  try {
    return JSON.parse(textContent.text) as DescribeClusterResponse;
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
  const res = await fetch(`${GATEWAY}/v1/me/llm-providers`, {
    headers: authHeaders(),
  });
  return handleResponse<LLMProvider[]>(res);
}

export async function createLLMProvider(req: CreateLLMProviderRequest): Promise<LLMProvider> {
  const res = await fetch(`${GATEWAY}/v1/me/llm-providers`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(req),
  });
  return handleResponse<LLMProvider>(res);
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
  const res = await fetch(`${GATEWAY}/v1/me/preferences`, {
    headers: authHeaders(),
  });
  return handleResponse<UserPreferences>(res);
}

export async function updatePreferences(prefs: Partial<UserPreferences>): Promise<UserPreferences> {
  const res = await fetch(`${GATEWAY}/v1/me/preferences`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(prefs),
  });
  return handleResponse<UserPreferences>(res);
}
