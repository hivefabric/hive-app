import type {
  SignupResponse,
  ToolCallRequest,
  ToolCallResponse,
  CombNode,
  DescribeClusterResponse,
  LLMProvider,
  CreateLLMProviderRequest,
  UserPreferences,
} from './types';

const GATEWAY = import.meta.env.VITE_GATEWAY_URL || 'http://localhost:8090';
const HONEYCOMB = import.meta.env.VITE_HONEYCOMB_URL || 'http://localhost:8080';

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

// ─── Nodes (Honeycomb) ───────────────────────────────────────────────────────

export async function getNodes(): Promise<CombNode[]> {
  const res = await fetch(`${HONEYCOMB}/api/nodes`, {
    headers: authHeaders(),
  });
  return handleResponse<CombNode[]>(res);
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
