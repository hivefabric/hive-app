import { useState, useEffect } from 'react';
import {
  Server, Copy, Check,
  Cloud, Trash2,
} from 'lucide-react';
import {
  getNodes, getPreferences, updatePreferences,
  createLLMProvider, setQueenConfig, invalidateQueenCache, getModels,
} from '../api';
import type { CombNode, UserPreferences, ModelEntry } from '../types';

interface SettingsProps {
  onViewHive: () => void;
}

type Tab = 'combs' | 'queen' | 'privacy' | 'apikey';

function shortUrn(urn: string) {
  return urn.replace('oasf://', '').split('/')[2] ?? urn;
}

// ─── Combs tab ────────────────────────────────────────────────────────────────

function MyCombsTab({ onViewHive }: { onViewHive: () => void }) {
  const [combs, setCombs] = useState<CombNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getNodes().then(setCombs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="settings-section">
      {/* Connected combs */}
      <div className="settings-block">
        <div className="settings-block__header">
          <h3 className="settings-block__title">Connected combs</h3>
        </div>
        {loading ? (
          <div className="text-secondary" style={{ padding: '12px 0' }}><span className="spinner spinner--sm" /> Loading…</div>
        ) : combs.length === 0 ? (
          <div className="settings-empty">No combs online. Go to My Hive to add one.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {combs.map((c) => (
              <div key={c.node_id} className="settings-comb-row">
                <div className={`online-dot${c.online ? ' online-dot--on' : ''}`} />
                <div style={{ flex: 1 }}>
                  <div className="settings-comb-name">
                    {c.node_metadata?.device_name || c.node_metadata?.hostname || c.node_id.slice(0, 12)}
                  </div>
                  <div className="text-secondary" style={{ fontSize: 12 }}>
                    {(c.advertised_capability_urns ?? []).map(shortUrn).join(' · ')}
                  </div>
                  {c.cells && c.cells.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                      {c.cells.map(cell => (
                        <span key={cell.name} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--color-surface-variant)', color: 'var(--color-text-secondary)' }}>
                          {cell.name} ({cell.model ?? cell.role})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className={`badge badge--${c.online ? 'success' : 'muted'}`}>
                  {c.online ? 'Online' : 'Offline'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Navigate to My Hive */}
      <div className="settings-block">
        <button className="btn btn--outline" onClick={onViewHive} style={{ alignSelf: 'flex-start' }}>
          Go to My Hive →
        </button>
        <p className="text-secondary" style={{ margin: '8px 0 0', fontSize: 13 }}>
          Add combs, view metrics, and manage connections from My Hive.
        </p>
      </div>
    </div>
  );
}

// ─── Queen tab ────────────────────────────────────────────────────────────────

function QueenTab() {
  const [combs, setCombs] = useState<CombNode[]>([]);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  // local queen form
  const [queenType, setQueenType] = useState<'local' | 'cloud'>('local');
  const [catalogModels, setCatalogModels] = useState<ModelEntry[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelEntry | null>(null);

  // cloud form
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'openai_compat'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [cloudModel, setCloudModel] = useState('claude-3-5-haiku-latest');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const CLOUD_DEFAULTS: Record<string, string> = {
    anthropic: 'claude-3-5-haiku-latest', openai: 'gpt-4o-mini', openai_compat: '',
  };

  // Derive available GB from the first queen-capable comb
  const queenComb = combs.find(c => c.queen_capable) ?? combs[0] ?? null;
  const availableGb = queenComb?.available_memory_mb ? queenComb.available_memory_mb / 1024 : null;

  useEffect(() => {
    Promise.all([getNodes(), getPreferences()])
      .then(([nodes, p]) => {
        setCombs(nodes.filter(n => n.online));
        setPrefs(p);
        if (p.queen_type) setQueenType(p.queen_type as 'local' | 'cloud');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load model catalog when local tab is active
  useEffect(() => {
    if (queenType !== 'local') return;
    setCatalogLoading(true);
    getModels()
      .then(all => {
        const eligible = all.filter(m => m.queen_eligible);
        setCatalogModels(eligible);
        if (eligible.length > 0 && !selectedModel) {
          const avail = availableGb;
          const fits = avail != null
            ? eligible.find(m => m.min_ram_gb <= avail) ?? eligible[0]
            : eligible[0];
          setSelectedModel(fits);
        }
      })
      .catch(() => {})
      .finally(() => setCatalogLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queenType]);

  // Worker slot preview
  const workerSlots = selectedModel && availableGb != null
    ? Math.max(0, Math.floor((availableGb - selectedModel.min_ram_gb) / 2))
    : null;

  async function save() {
    setSaving(true); setError('');
    try {
      if (queenType === 'local') {
        if (!selectedModel) { setError('Select a model'); setSaving(false); return; }
        await setQueenConfig({
          queen_type: 'local',
          queen_urn: 'oasf://hive/queen/v1',
          queen_model: selectedModel.ollama_name,
        });
      } else {
        if (!apiKey.trim()) { setError('API key required'); setSaving(false); return; }
        const prov = await createLLMProvider({
          name: `queen-${provider}`, provider, api_key: apiKey.trim(),
          base_url: baseUrl || undefined,
          model: cloudModel || CLOUD_DEFAULTS[provider] || undefined, is_default: false,
        });
        await setQueenConfig({
          queen_type: 'cloud', queen_llm_provider_id: prov.id,
          queen_model: cloudModel || CLOUD_DEFAULTS[provider],
        });
      }
      invalidateQueenCache();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="settings-section">
      <div className="text-secondary" style={{ padding: 16 }}><span className="spinner spinner--sm" /> Loading…</div>
    </div>
  );

  return (
    <div className="settings-section">
      {/* Current status */}
      {prefs?.queen_type && (
        <div className="settings-block">
          <h3 className="settings-block__title">Current queen</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--color-surface-variant)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: 20 }}>{prefs.queen_type === 'local' ? '🖥️' : '☁️'}</span>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                {prefs.queen_type === 'local' ? 'Local comb' : 'Cloud model'}
              </div>
              <div className="text-secondary" style={{ fontSize: 12 }}>
                {prefs.queen_model ?? 'model not set'}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="settings-block">
        <h3 className="settings-block__title">{prefs?.queen_type ? 'Change queen' : 'Configure queen'}</h3>
        <p className="text-secondary" style={{ margin: '0 0 14px', fontSize: 14 }}>
          The queen decomposes your requests and routes tasks to your combs.
        </p>

        {/* Type toggle */}
        <div className="wizard-queen-options" style={{ marginBottom: 16 }}>
          {(['local', 'cloud'] as const).map(t => (
            <button key={t}
              className={`wizard-queen-option${queenType === t ? ' wizard-queen-option--active' : ''}`}
              onClick={() => setQueenType(t)}
              style={{ gap: 10, padding: '10px 14px' }}
            >
              {t === 'local' ? <Server size={16} /> : <Cloud size={16} />}
              <div style={{ flex: 1 }}>
                <div className="wizard-queen-option__title">{t === 'local' ? 'Local comb' : 'Cloud model'}</div>
                <div className="wizard-queen-option__desc text-secondary">
                  {t === 'local' ? 'Private · no API cost' : 'Anthropic, OpenAI, or compatible'}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Local: model catalog picker */}
        {queenType === 'local' && (
          catalogLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginBottom: 12 }}>
              <span className="spinner spinner--sm" />
              <span className="text-secondary">Loading model catalog…</span>
            </div>
          ) : catalogModels.length === 0 ? (
            <div className="settings-empty">
              No queen-eligible models found. Check that honeycomb is running.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {catalogModels.map(m => {
                const sel = selectedModel?.id === m.id;
                const fits = availableGb != null ? m.min_ram_gb <= availableGb : true;
                return (
                  <button
                    key={m.id}
                    className={`wizard-queen-option${sel ? ' wizard-queen-option--active' : ''}`}
                    onClick={() => setSelectedModel(m)}
                    style={{ gap: 10, padding: '10px 14px', opacity: fits ? 1 : 0.55 }}
                  >
                    <div style={{ flex: 1, textAlign: 'left' }}>
                      <div className="wizard-queen-option__title">{m.display_name}</div>
                      <div className="wizard-queen-option__desc text-secondary">
                        {m.size_gb}GB · {m.tier} · min {m.min_ram_gb}GB RAM
                        {m.notes ? ` · ${m.notes}` : ''}
                      </div>
                    </div>
                    {sel && <Check size={15} color="var(--color-primary)" style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}

              {/* Capacity preview */}
              {selectedModel && (
                <div style={{
                  padding: '8px 12px',
                  background: 'var(--color-surface-variant)',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--color-text-secondary)',
                  lineHeight: 1.5,
                }}>
                  {workerSlots != null
                    ? `Leaves ~${workerSlots} worker slot${workerSlots !== 1 ? 's' : ''} for other tasks`
                    : `Selected: ${selectedModel.display_name}`}
                </div>
              )}
            </div>
          )
        )}

        {/* Cloud form */}
        {queenType === 'cloud' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Provider</label>
                <select className="input" value={provider} onChange={e => {
                  const p = e.target.value as typeof provider;
                  setProvider(p); setCloudModel(CLOUD_DEFAULTS[p] ?? '');
                }}>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="openai_compat">OpenAI-compatible</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Model</label>
                <input className="input" value={cloudModel} onChange={e => setCloudModel(e.target.value)} placeholder={CLOUD_DEFAULTS[provider]} />
              </div>
            </div>
            {provider === 'openai_compat' && (
              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input className="input" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.together.ai/v1" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input className="input" type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." />
            </div>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={save}
          disabled={saving || (queenType === 'local' && !selectedModel)}>
          {saving ? <span className="spinner spinner--sm" /> : saved ? <Check size={14} /> : null}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save queen'}
        </button>
      </div>
    </div>
  );
}

// ─── Privacy tab ──────────────────────────────────────────────────────────────

function PrivacyTab() {
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getPreferences().then(setPrefs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function set<K extends keyof UserPreferences>(k: K, v: UserPreferences[K]) {
    setPrefs((p) => (p ? { ...p, [k]: v } : p));
  }

  async function save() {
    if (!prefs) return;
    setSaving(true);
    try {
      await updatePreferences({
        pool_enabled: prefs.pool_enabled,
        frontier_fallback: prefs.frontier_fallback,
        max_execution_seconds: prefs.max_execution_seconds,
        // Always prefer local combs
        local_preference_pct: 100,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  if (loading) return <div className="text-secondary" style={{ padding: 16 }}><span className="spinner spinner--sm" /> Loading…</div>;
  if (!prefs) return <div className="error-banner">Failed to load preferences.</div>;

  return (
    <div className="settings-section">
      {/* Pool compute */}
      <div className="settings-block">
        <h3 className="settings-block__title">Pool compute</h3>

        <div className="settings-pref-row">
          <div>
            <div className="settings-pref-label">Share compute with the pool</div>
            <div className="text-secondary" style={{ fontSize: 13 }}>Let tasks run on shared pool combs when yours are busy</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={prefs.pool_enabled} onChange={(e) => set('pool_enabled', e.target.checked)} />
            <span className="toggle__slider" />
          </label>
        </div>

        {prefs.pool_enabled && (
          <div className="settings-pref-row">
            <div>
              <div className="settings-pref-label">Pool share</div>
              <div className="text-secondary" style={{ fontSize: 13 }}>How much of your capacity to share ({prefs.local_preference_pct ?? 50}%)</div>
            </div>
            <input
              type="range" min={10} max={100} step={10} value={prefs.local_preference_pct ?? 50}
              onChange={(e) => set('local_preference_pct', +e.target.value)}
              style={{ width: 120 }}
            />
          </div>
        )}
      </div>

      {/* Fallback */}
      <div className="settings-block">
        <h3 className="settings-block__title">Fallback</h3>

        <div className="settings-pref-row">
          <div>
            <div className="settings-pref-label">Cloud fallback</div>
            <div className="text-secondary" style={{ fontSize: 13 }}>Use a cloud model if no comb is available</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={prefs.frontier_fallback} onChange={(e) => set('frontier_fallback', e.target.checked)} />
            <span className="toggle__slider" />
          </label>
        </div>
      </div>

      {/* Timeout */}
      <div className="settings-block">
        <h3 className="settings-block__title">Timeout</h3>

        <div className="settings-pref-row">
          <div>
            <div className="settings-pref-label">Max task time</div>
            <div className="text-secondary" style={{ fontSize: 13 }}>Maximum seconds per task ({prefs.max_execution_seconds}s)</div>
          </div>
          <input
            type="range" min={30} max={600} step={30} value={prefs.max_execution_seconds}
            onChange={(e) => set('max_execution_seconds', +e.target.value)}
            style={{ width: 120 }}
          />
        </div>

        <button className="btn btn--primary" style={{ marginTop: 8, alignSelf: 'flex-start' }} onClick={save} disabled={saving}>
          {saving ? <span className="spinner spinner--sm" /> : saved ? <Check size={14} /> : null}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// ─── API Key tab ──────────────────────────────────────────────────────────────

function ApiKeyTab() {
  const token = localStorage.getItem('hf_token') ?? '';
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(token).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function signOut() {
    localStorage.removeItem('hf_token');
    localStorage.removeItem('hf_wizard_done');
    localStorage.removeItem('hf_queen_type');
    localStorage.removeItem('hf_queen_urn');
    localStorage.removeItem('hf_queen_provider_id');
    window.location.reload();
  }

  return (
    <div className="settings-section">
      <div className="settings-block">
        <h3 className="settings-block__title">API Key</h3>
        <p className="text-secondary" style={{ margin: '0 0 16px', fontSize: 14 }}>
          Use this key to access HiveFabric programmatically. Keep it secret.
        </p>
        <div className="copy-block">
          <pre className="copy-block__code" style={{ filter: 'blur(4px)', userSelect: 'none', transition: 'filter 0.2s' }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'none')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'blur(4px)')}
          >
            {token}
          </pre>
          <button className="copy-block__btn btn btn--ghost btn--sm" onClick={copy}>
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      <div className="settings-block">
        <h3 className="settings-block__title">Sign out</h3>
        <p className="text-secondary" style={{ margin: '0 0 12px', fontSize: 14 }}>
          Removes the API key and wizard state from this device.
        </p>
        <button className="btn btn--danger" onClick={signOut}>
          <Trash2 size={14} /> Sign out
        </button>
      </div>
    </div>
  );
}

// ─── SettingsView ─────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'combs',  label: 'Combs' },
  { id: 'queen',  label: 'Queen' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'apikey', label: 'API Key' },
];

export default function SettingsView({ onViewHive }: SettingsProps) {
  const [tab, setTab] = useState<Tab>('combs');

  return (
    <div className="settings-layout">
      <div className="settings-header">
        <h1 className="settings-title">Settings</h1>
      </div>
      <div className="tabs" style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 0 }}>
        {TABS.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="settings-body">
        {tab === 'combs'  && <MyCombsTab onViewHive={onViewHive} />}
        {tab === 'queen'  && <QueenTab />}
        {tab === 'privacy' && <PrivacyTab />}
        {tab === 'apikey' && <ApiKeyTab />}
      </div>
    </div>
  );
}
