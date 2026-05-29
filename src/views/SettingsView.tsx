import { useState, useEffect } from 'react';
import {
  Server, Copy, Check,
  Terminal, Cloud, RefreshCw, Trash2,
} from 'lucide-react';
import {
  getNodes, enrollComb, getPreferences, updatePreferences,
  createLLMProvider, describeCluster,
} from '../api';
import type { CombNode, UserPreferences, CapabilityInfo } from '../types';

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
  const [installTab, setInstallTab] = useState<'cli' | 'docker' | 'running'>('cli');

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
          {(['cli', 'docker', 'running'] as const).map((t) => (
            <button key={t} className={`tab${installTab === t ? ' active' : ''}`} onClick={() => setInstallTab(t)}>
              {t === 'cli' ? '💻 CLI' : t === 'docker' ? '🐳 Docker' : '✓ Already running?'}
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
                  <option value="docker">Docker execution</option>
                  <option value="both">Both</option>
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

        {installTab === 'docker' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p className="text-secondary" style={{ margin: 0, fontSize: 14 }}>
              Run the comb as a Docker container — no install required.
            </p>
            <div className="coming-soon-block">
              <Cloud size={18} />
              <span>Docker install coming soon</span>
            </div>
            <pre className="copy-block__code" style={{ opacity: 0.5, userSelect: 'none' }}>
{`docker run -d hivefabric/comb-node \\
  -e CONTROL_PLANE_URL=http://localhost:8080 \\
  -e CONTROL_PLANE_API_KEY=... \\
  -e HIVE_OWNER_USER_ID=...`}
            </pre>
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
  const [queenType, setQueenType] = useState<'local' | 'cloud' | null>(
    () => (localStorage.getItem('hf_queen_type') as 'local' | 'cloud') ?? null,
  );
  const [queenUrn, setQueenUrn] = useState(() => localStorage.getItem('hf_queen_urn') ?? '');
  const [queenCaps, setQueenCaps] = useState<CapabilityInfo[]>([]);

  // cloud form
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'openai_compat'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const DEFAULTS: Record<string, string> = {
    anthropic: 'claude-3-5-haiku-latest',
    openai: 'gpt-4o-mini',
    openai_compat: '',
  };

  useEffect(() => {
    describeCluster().then((res) => {
      setQueenCaps(res.capabilities.filter((c) => c.urn.includes('queen')));
    }).catch(() => {});
  }, []);

  async function saveCloudQueen() {
    if (!apiKey.trim()) { setError('API key required'); return; }
    setSaving(true); setError('');
    try {
      const prov = await createLLMProvider({
        name: `queen-${provider}`,
        provider,
        api_key: apiKey.trim(),
        base_url: baseUrl || undefined,
        model: model || DEFAULTS[provider] || undefined,
        is_default: true,
      });
      localStorage.setItem('hf_queen_type', 'cloud');
      localStorage.setItem('hf_queen_provider_id', prov.id);
      setQueenType('cloud');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }

  function saveLocalQueen() {
    localStorage.setItem('hf_queen_type', 'local');
    if (queenUrn) localStorage.setItem('hf_queen_urn', queenUrn);
    setQueenType('local');
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="settings-section">
      <div className="settings-block">
        <h3 className="settings-block__title">Queen configuration</h3>
        <p className="text-secondary" style={{ margin: '0 0 16px', fontSize: 14 }}>
          The queen decomposes your requests into tasks and schedules them on your combs.
          {queenType && (
            <span style={{ display: 'inline-block', marginLeft: 8 }}>
              Currently: <strong>{queenType === 'local' ? `Local (${shortUrn(queenUrn)})` : 'Cloud'}</strong>
            </span>
          )}
        </p>

        <div className="wizard-queen-options" style={{ marginBottom: 20 }}>
          <button
            className={`wizard-queen-option${queenType === 'local' ? ' wizard-queen-option--active' : ''}`}
            onClick={() => setQueenType('local')}
          >
            <Server size={18} />
            <div>
              <div className="wizard-queen-option__title">Local comb</div>
              <div className="wizard-queen-option__desc text-secondary">Private · runs on your device · no API cost</div>
            </div>
          </button>
          <button
            className={`wizard-queen-option${queenType === 'cloud' ? ' wizard-queen-option--active' : ''}`}
            onClick={() => setQueenType('cloud')}
          >
            <Cloud size={18} />
            <div>
              <div className="wizard-queen-option__title">Cloud model</div>
              <div className="wizard-queen-option__desc text-secondary">Anthropic, OpenAI, or any compatible endpoint</div>
            </div>
          </button>
        </div>

        {queenType === 'local' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {queenCaps.length > 0 ? (
              <div className="form-group">
                <label className="form-label">Queen capability</label>
                <select className="input" value={queenUrn} onChange={(e) => setQueenUrn(e.target.value)}>
                  {queenCaps.map((c) => (
                    <option key={c.urn} value={c.urn}>{c.description || c.urn}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="settings-empty">
                No queen capability detected on your combs. Add one via the comb config (<code>handler = "queen:openai_compat"</code>).
              </div>
            )}
            <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={saveLocalQueen}>
              {saved ? <><Check size={14} /> Saved</> : 'Save'}
            </button>
          </div>
        )}

        {queenType === 'cloud' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Provider</label>
              <select className="input" value={provider} onChange={(e) => {
                const p = e.target.value as typeof provider;
                setProvider(p);
                setModel(DEFAULTS[p] ?? '');
              }}>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="openai_compat">OpenAI-compatible</option>
              </select>
            </div>
            {provider === 'openai_compat' && (
              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.together.ai/v1" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">Model</label>
              <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULTS[provider]} />
            </div>
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
            </div>
            {error && <div className="error-banner">{error}</div>}
            <button
              className="btn btn--primary"
              style={{ alignSelf: 'flex-start' }}
              onClick={saveCloudQueen}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? <span className="spinner spinner--sm" /> : saved ? <Check size={14} /> : null}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save cloud queen'}
            </button>
          </div>
        )}

        {!queenType && (
          <div className="settings-empty">Select a queen type above to configure it.</div>
        )}
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
