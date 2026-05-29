import { useState, useEffect } from 'react';
import {
  Server, Copy, Check,
  Terminal, Cloud, RefreshCw, Trash2,
} from 'lucide-react';
import {
  getNodes, enrollComb, getPreferences, updatePreferences,
  createLLMProvider, setQueenConfig, invalidateQueenCache,
} from '../api';
import type { CombNode, UserPreferences } from '../types';

/** Extract model from inference URN, e.g. "qwen3.6" */
function modelFromUrn(urn: string): string | null {
  const m = urn.match(/oasf:\/\/commons\/inference\/([^/]+)\/v\d+/);
  return m ? m[1].replace(/-/g, ':') : null;
}

interface SettingsProps {
  onViewHive: () => void;
}

type Tab = 'combs' | 'queen' | 'privacy' | 'apikey';

function shortUrn(urn: string) {
  return urn.replace('oasf://', '').split('/')[2] ?? urn;
}

// ─── Copyable code block ─────────────────────────────────────────────────────

function CopyBlock({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="copy-block">
      {label && <div className="form-label" style={{ marginBottom: 6 }}>{label}</div>}
      <pre className="copy-block__code">{text}</pre>
      <button className="copy-block__btn btn btn--ghost btn--sm" onClick={copy}>
        {copied ? <Check size={13} /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// ─── My Combs tab ─────────────────────────────────────────────────────────────

function MyCombsTab({ onViewHive }: { onViewHive: () => void }) {
  const [combs, setCombs] = useState<CombNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [installTab, setInstallTab] = useState<'cli' | 'running'>('cli');

  // enrol form
  const [name, setName] = useState('my-comb');
  const [port, setPort] = useState(7070);
  const [caps, setCaps] = useState('llm');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ command: string; config_toml: string } | null>(null);

  useEffect(() => {
    getNodes().then(setCombs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function generate() {
    setGenerating(true);
    try {
      const res = await enrollComb(name, caps, port);
      setResult(res);
    } catch { /* ignore */ } finally { setGenerating(false); }
  }

  return (
    <div className="settings-section">
      {/* Connected combs */}
      <div className="settings-block">
        <div className="settings-block__header">
          <h3 className="settings-block__title">Connected combs</h3>
          <button className="btn btn--ghost btn--sm" onClick={onViewHive}>View all →</button>
        </div>
        {loading ? (
          <div className="text-secondary" style={{ padding: '12px 0' }}><span className="spinner spinner--sm" /> Loading…</div>
        ) : combs.length === 0 ? (
          <div className="settings-empty">No combs online. Add one below.</div>
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

      {/* Add a comb */}
      <div className="settings-block">
        <h3 className="settings-block__title">Add a comb</h3>
        <div className="tabs" style={{ marginBottom: 16 }}>
          {(['cli', 'running'] as const).map((t) => (
            <button key={t} className={`tab${installTab === t ? ' active' : ''}`} onClick={() => setInstallTab(t)}>
              {t === 'cli' ? '💻 CLI' : '✓ Already running?'}
            </button>
          ))}
        </div>

        {installTab === 'cli' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="text-secondary" style={{ margin: 0, fontSize: 14 }}>
              Download and run the comb agent binary on any device.
            </p>
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Name</label>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Port</label>
                <input className="input" type="number" value={port} onChange={(e) => setPort(+e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Capabilities</label>
                <select className="input" value={caps} onChange={(e) => setCaps(e.target.value)}>
                  <option value="llm">LLM inference</option>
                </select>
              </div>
            </div>
            {!result ? (
              <button className="btn btn--primary" onClick={generate} disabled={generating} style={{ alignSelf: 'flex-start' }}>
                {generating ? <span className="spinner spinner--sm" /> : <Terminal size={14} />}
                Generate command
              </button>
            ) : (
              <>
                <CopyBlock text={result.command} label="Run on your device:" />
                <details>
                  <summary className="text-secondary" style={{ cursor: 'pointer', fontSize: 13, userSelect: 'none' }}>
                    Show config file
                  </summary>
                  <div style={{ marginTop: 8 }}><CopyBlock text={result.config_toml} /></div>
                </details>
                <p className="text-secondary" style={{ fontSize: 13, margin: 0 }}>
                  Save the config, then run the command. The comb will appear above once online.
                </p>
              </>
            )}
          </div>
        )}

{installTab === 'running' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="text-secondary" style={{ margin: 0, fontSize: 14 }}>
              If your comb is already running and connected to this control plane, it will appear in the connected list above automatically.
            </p>
            <button className="btn btn--outline" onClick={() => {
              setLoading(true);
              getNodes().then(setCombs).catch(() => {}).finally(() => setLoading(false));
            }}>
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        )}
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
  const [selectedCombId, setSelectedCombId] = useState('');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('http://localhost:11434');

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

  useEffect(() => {
    Promise.all([getNodes(), getPreferences()])
      .then(([nodes, p]) => {
        setCombs(nodes.filter(n => n.online));
        setPrefs(p);
        // Pre-fill from existing config
        if (p.queen_type) setQueenType(p.queen_type as 'local' | 'cloud');
        if (p.queen_comb_id) setSelectedCombId(p.queen_comb_id);
        if (p.queen_model) setModel(p.queen_model);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function handleSelectComb(combId: string) {
    setSelectedCombId(combId);
    const comb = combs.find(c => c.node_id === combId);
    if (!comb) return;
    const inferenceUrns = (comb.advertised_capability_urns ?? []).filter(u => u.includes('/inference/'));
    if (inferenceUrns.length > 0 && !model) setModel(modelFromUrn(inferenceUrns[0]) ?? '');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      if (queenType === 'local') {
        const comb = combs.find(c => c.node_id === selectedCombId);
        if (!comb) { setError('Select a comb'); setSaving(false); return; }
        const queensUrn = (comb.advertised_capability_urns ?? []).find(u => u.includes('/queen/'));
        const prov = await createLLMProvider({
          name: 'queen-ollama', provider: 'openai', api_key: 'ollama',
          base_url: endpoint.trim(), model: model.trim(), is_default: false,
        });
        await setQueenConfig({
          queen_type: 'local', queen_comb_id: comb.node_id,
          queen_urn: queensUrn ?? 'oasf://hive/queen/v1',
          queen_llm_provider_id: prov.id, queen_model: model.trim(),
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

  const queenCombs = combs.filter(c => c.queen_capable);

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
                {prefs.queen_comb_id && ` · comb ${prefs.queen_comb_id.slice(0, 8)}…`}
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

        {/* Local: comb card list */}
        {queenType === 'local' && (
          queenCombs.length === 0 ? (
            <div className="settings-empty">
              No queen-capable combs detected. A comb needs ≥8 cores and ≥8 GB RAM to host a queen.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
              {queenCombs.map(c => {
                const sel = selectedCombId === c.node_id;
                const inferenceUrns = (c.advertised_capability_urns ?? []).filter(u => u.includes('/inference/'));
                const models = inferenceUrns.map(u => modelFromUrn(u)).filter(Boolean) as string[];
                return (
                  <div key={c.node_id}
                    className={`wizard-queen-option${sel ? ' wizard-queen-option--active' : ''}`}
                    onClick={() => handleSelectComb(c.node_id)}
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Server size={16} style={{ flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div className="wizard-queen-option__title">
                          {c.node_metadata?.device_name || c.node_id.slice(0, 12)}
                        </div>
                        <div className="wizard-queen-option__desc text-secondary">
                          {c.node_metadata?.operating_system ?? ''}
                          {c.available_memory_mb ? ` · ${Math.round(c.available_memory_mb / 1024)}GB` : ''}
                        </div>
                      </div>
                      {sel
                        ? <Check size={15} color="var(--color-primary)" style={{ flexShrink: 0 }} />
                        : <div style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--color-border)', flexShrink: 0 }} />
                      }
                    </div>
                    {sel && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} onClick={e => e.stopPropagation()}>
                        <div className="form-row">
                          <div className="form-group" style={{ flex: 2 }}>
                            <label className="form-label">Model</label>
                            {models.length > 0 ? (
                              <select className="input" value={model} onChange={e => setModel(e.target.value)}>
                                {models.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                            ) : (
                              <input className="input" value={model} onChange={e => setModel(e.target.value)} placeholder="qwen3.6:latest" />
                            )}
                          </div>
                          <div className="form-group" style={{ flex: 3 }}>
                            <label className="form-label">Ollama endpoint</label>
                            <input className="input" value={endpoint} onChange={e => setEndpoint(e.target.value)} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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

        <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={save} disabled={saving}>
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
      await updatePreferences(prefs);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  if (loading) return <div className="text-secondary" style={{ padding: 16 }}><span className="spinner spinner--sm" /> Loading…</div>;
  if (!prefs) return <div className="error-banner">Failed to load preferences.</div>;

  return (
    <div className="settings-section">
      <div className="settings-block">
        <h3 className="settings-block__title">Privacy &amp; routing</h3>

        <div className="settings-pref-row">
          <div>
            <div className="settings-pref-label">Allow pool combs</div>
            <div className="text-secondary" style={{ fontSize: 13 }}>Let tasks run on shared pool combs when yours are busy</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={prefs.pool_enabled} onChange={(e) => set('pool_enabled', e.target.checked)} />
            <span className="toggle__slider" />
          </label>
        </div>

        <div className="settings-pref-row">
          <div>
            <div className="settings-pref-label">Local preference</div>
            <div className="text-secondary" style={{ fontSize: 13 }}>How often to try your own combs first ({prefs.local_preference_pct}%)</div>
          </div>
          <input
            type="range" min={0} max={100} value={prefs.local_preference_pct}
            onChange={(e) => set('local_preference_pct', +e.target.value)}
            style={{ width: 120 }}
          />
        </div>

        <div className="settings-pref-row">
          <div>
            <div className="settings-pref-label">Default privacy</div>
            <div className="text-secondary" style={{ fontSize: 13 }}>Minimum sensitivity floor for all tasks</div>
          </div>
          <select className="input" style={{ width: 140 }} value={prefs.default_sensitivity} onChange={(e) => set('default_sensitivity', e.target.value as UserPreferences['default_sensitivity'])}>
            <option value="Private">Private</option>
            <option value="SemiPrivate">Semi-Private</option>
            <option value="Public">Public</option>
          </select>
        </div>

        <div className="settings-pref-row">
          <div>
            <div className="settings-pref-label">Cloud fallback</div>
            <div className="text-secondary" style={{ fontSize: 13 }}>Fall back to frontier LLM if no comb is available</div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={prefs.frontier_fallback} onChange={(e) => set('frontier_fallback', e.target.checked)} />
            <span className="toggle__slider" />
          </label>
        </div>

        <div className="settings-pref-row">
          <div>
            <div className="settings-pref-label">Task timeout</div>
            <div className="text-secondary" style={{ fontSize: 13 }}>Max seconds per task ({prefs.max_execution_seconds}s)</div>
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
  { id: 'combs',  label: 'My Combs' },
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
