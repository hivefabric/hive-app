// ─── Auth ────────────────────────────────────────────────────────────────────

export interface SignupResponse {
  api_key: string;
  user_id: string;
}

// ─── Chat ────────────────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  status?: 'sending' | 'queued' | 'running' | 'succeeded' | 'failed';
}

export interface RunSubagentRequest {
  prompt: string;
  capability_urn?: string;
}

export interface ToolCallRequest {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallResponse {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

// ─── Nodes ───────────────────────────────────────────────────────────────────

export interface CombNode {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'degraded';
  cpu_pct: number;
  memory_pct: number;
  battery_pct?: number;
  thermal_status: 'nominal' | 'warm' | 'hot' | 'critical';
  capabilities?: string[];
  last_seen?: string;
}

// ─── Models / Capabilities ───────────────────────────────────────────────────

export interface CapabilityInfo {
  urn: string;
  description?: string;
  online_combs: number;
  tags?: string[];
}

export interface DescribeClusterResponse {
  capabilities: CapabilityInfo[];
  total_combs: number;
  online_combs: number;
}

// ─── LLM Providers ───────────────────────────────────────────────────────────

export interface LLMProvider {
  id: string;
  name: string;
  provider_type: string;
  base_url?: string;
  model?: string;
  created_at?: string;
}

export interface CreateLLMProviderRequest {
  name: string;
  provider_type: string;
  api_key: string;
  base_url?: string;
  model?: string;
}

// ─── Preferences ─────────────────────────────────────────────────────────────

export type SensitivityLevel = 'Public' | 'SemiPrivate' | 'Private';

export interface UserPreferences {
  local_preference_pct: number;
  pool_enabled: boolean;
  default_sensitivity: SensitivityLevel;
  retry_count: number;
  frontier_fallback: boolean;
  max_execution_seconds: number;
}
