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

/** Shape returned by GET /v1/me/combs (mirrors honeycomb NodeView) */
export interface CombNode {
  node_id: string;
  cpu_cores?: number;
  memory_mb?: number;
  available_memory_mb?: number;
  cpu_usage_percent?: number | null;
  memory_usage_percent?: number | null;
  battery_percent?: number | null;
  node_metadata?: {
    device_name?: string | null;
    hostname?: string | null;
    platform_family?: string;
    architecture?: string;
    operating_system?: string;
    device_type?: string | null;
    agent_version?: string | null;
  } | null;
  sensor_readings?: Record<string, number>;
  node_report?: {
    power?: { source?: string; battery_percent?: number; thermal_state?: string };
  } | null;
  online: boolean;
  active_tasks: number;
  last_seen: string;
  docker: boolean;
  wasm: boolean;
  runtime_capabilities?: string[];
  advertised_capability_urns?: string[];
  queen_capable?: boolean;
  roles?: string[];
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
  provider: string;
  api_key: string;
  base_url?: string;
  model?: string;
  is_default?: boolean;
}

// alias kept for WizardView which uses provider_type
export type { CreateLLMProviderRequest as LLMProviderRequest };

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

// ─── Comb Enrolment ──────────────────────────────────────────────────────────

export type CombCapabilities = 'llm';

export interface EnrolCombRequest {
  name: string;
  capabilities: string;
  port: number;
}

export interface EnrolCombResponse {
  command: string;
  config_toml: string;
  note: string;
}
