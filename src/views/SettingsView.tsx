import { useState, useEffect } from 'react';
import { Trash2, PlusCircle, Copy, Check, ExternalLink } from 'lucide-react';
import {
  getLLMProviders,
  createLLMProvider,
  deleteLLMProvider,
  getPreferences,
  updatePreferences,
} from '../api';
import type { LLMProvider, UserPreferences, SensitivityLevel } from '../types';

// ─── LLM Providers tab ───────────────────────────────────────────────────────

function ProvidersTab() {
  const [providers, setProviders] = useState<LLMProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    provider_type: 'openai',
    api_key: '',
    base_url: '',
    model: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setProviders(await getLLMProviders());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createLLMProvider({
        name: form.name,
        provider_type: form.provider_type,
        api_key: form.api_key,
        base_url: form.base_url || undefined,
        model: form.model || undefined,
      });
      setShowForm(false);
      setForm({ name: '', provider_type: 'openai', api_key: '', base_url: '', model: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add provider');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this provider?')) return;
    try {
      await deleteLLMProvider(id);
      setProviders((p) => p.filter((x) => x.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete provider');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div className="flex items-center justify-between">
        <p className="text-secondary" style={{ fontSize: 13 }}>
          Connect frontier LLM APIs. The hive uses these as fallbacks or for routing to external models.
        </p>
        <button className="btn btn--primary btn--sm" onClick={() => setShowForm(true)}>
          <PlusCircle size={13} />
          Add provider
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : providers.length === 0 && !showForm ? (
        <div className="empty-state">
          <span style={{ fontSize: 32 }}>🔌</span>
          <p className="text-title">No providers configured</p>
          <p className="text-secondary">Add an OpenAI, Anthropic, or compatible API key.</p>
        </div>
      ) : (
        <div className="provider-list">
          {providers.map((p) => (
            <div key={p.id} className="provider-item">
              <div className="provider-info">
                <span className="provider-name">{p.name}</span>
                <span className="provider-type">{p.provider_type}{p.model ? ` · ${p.model}` : ''}</span>
              </div>
              <button
                className="btn btn--danger btn--sm btn--icon"
                onClick={() => handleDelete(p.id)}
                title="Remove"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ border: '1px solid var(--color-primary-light)' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <p className="text-title">New LLM Provider</p>

            <div className="flex gap-3">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Name</label>
                <input
                  className="input"
                  placeholder="My OpenAI"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Provider type</label>
                <select
                  className="select"
                  value={form.provider_type}
                  onChange={(e) => setForm((f) => ({ ...f, provider_type: e.target.value }))}
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="groq">Groq</option>
                  <option value="ollama">Ollama (local)</option>
                  <option value="compatible">OpenAI-compatible</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">API Key</label>
              <input
                className="input"
                type="password"
                placeholder="sk-..."
                value={form.api_key}
                onChange={(e) => setForm((f) => ({ ...f, api_key: e.target.value }))}
                required
              />
            </div>

            <div className="flex gap-3">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Base URL <span className="text-secondary">(optional)</span></label>
                <input
                  className="input"
                  placeholder="https://api.openai.com/v1"
                  value={form.base_url}
                  onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Model <span className="text-secondary">(optional)</span></label>
                <input
                  className="input"
                  placeholder="gpt-4o"
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                />
              </div>
            </div>

            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>
              <button type="submit" className="btn btn--primary btn--sm" disabled={saving}>
                {saving ? <span className="spinner spinner--sm" /> : <PlusCircle size={13} />}
                {saving ? 'Saving…' : 'Add provider'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Preferences tab ─────────────────────────────────────────────────────────

const DEFAULT_PREFS: UserPreferences = {
  local_preference_pct: 80,
  pool_enabled: true,
  default_sensitivity: 'Private',
  retry_count: 2,
  frontier_fallback: true,
  max_execution_seconds: 300,
};

function PreferencesTab() {
  const [prefs, setPrefs] = useState<UserPreferences>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getPreferences()
      .then(setPrefs)
      .catch(() => setPrefs(DEFAULT_PREFS))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    setPrefs((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    try {
      const updated = await updatePreferences(prefs);
      setPrefs(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="empty-state"><span className="spinner" /></div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 560 }}>
      {error && <div className="error-banner">{error}</div>}

      {/* local_preference_pct */}
      <div className="slider-group">
        <div className="slider-header">
          <div>
            <div className="form-label">Local preference</div>
            <div className="form-hint">How strongly to prefer local combs over frontier APIs</div>
          </div>
          <span className="slider-value">{prefs.local_preference_pct}%</span>
        </div>
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          value={prefs.local_preference_pct}
          onChange={(e) => set('local_preference_pct', Number(e.target.value))}
        />
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />

      {/* pool_enabled */}
      <div className="toggle-row">
        <div className="toggle-label">
          <span className="toggle-label-text">Pool enabled</span>
          <span className="toggle-label-hint">Allow your combs to participate in the shared pool</span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.pool_enabled}
            onChange={(e) => set('pool_enabled', e.target.checked)}
          />
          <span className="toggle-track" />
        </label>
      </div>

      {/* frontier_fallback */}
      <div className="toggle-row">
        <div className="toggle-label">
          <span className="toggle-label-text">Frontier fallback</span>
          <span className="toggle-label-hint">Fall back to frontier LLM if no local comb is available</span>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={prefs.frontier_fallback}
            onChange={(e) => set('frontier_fallback', e.target.checked)}
          />
          <span className="toggle-track" />
        </label>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)' }} />

      {/* default_sensitivity */}
      <div className="form-group">
        <label className="form-label">Default sensitivity</label>
        <span className="form-hint">Controls data residency — Private never leaves your combs</span>
        <select
          className="select"
          style={{ marginTop: 6 }}
          value={prefs.default_sensitivity}
          onChange={(e) => set('default_sensitivity', e.target.value as SensitivityLevel)}
        >
          <option value="Public">Public — any route allowed</option>
          <option value="SemiPrivate">SemiPrivate — pool allowed, no frontier</option>
          <option value="Private">Private — local combs only</option>
        </select>
      </div>

      {/* retry_count */}
      <div className="form-group">
        <label className="form-label">Retry count</label>
        <span className="form-hint">How many times to retry a failed comb dispatch (0–5)</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginTop: 6 }}>
          <button
            className="btn btn--secondary btn--sm btn--icon"
            onClick={() => set('retry_count', Math.max(0, prefs.retry_count - 1))}
            disabled={prefs.retry_count <= 0}
          >−</button>
          <span style={{ minWidth: 24, textAlign: 'center', fontWeight: 600 }}>{prefs.retry_count}</span>
          <button
            className="btn btn--secondary btn--sm btn--icon"
            onClick={() => set('retry_count', Math.min(5, prefs.retry_count + 1))}
            disabled={prefs.retry_count >= 5}
          >+</button>
        </div>
      </div>

      {/* max_execution_seconds */}
      <div className="slider-group">
        <div className="slider-header">
          <div>
            <div className="form-label">Max execution time</div>
            <div className="form-hint">Maximum seconds a comb job may run before timeout</div>
          </div>
          <span className="slider-value">
            {prefs.max_execution_seconds >= 60
              ? `${Math.round(prefs.max_execution_seconds / 60)}m`
              : `${prefs.max_execution_seconds}s`}
          </span>
        </div>
        <input
          type="range"
          className="slider"
          min={30}
          max={3600}
          step={30}
          value={prefs.max_execution_seconds}
          onChange={(e) => set('max_execution_seconds', Number(e.target.value))}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-text-disabled)' }}>
          <span>30s</span>
          <span>1h</span>
        </div>
      </div>

      <div>
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? (
            <span className="spinner spinner--sm" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: 'white' }} />
          ) : saved ? (
            <Check size={14} />
          ) : null}
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}

// ─── API Key tab ──────────────────────────────────────────────────────────────

function ApiKeyTab() {
  const [copied, setCopied] = useState(false);
  const token = localStorage.getItem('hf_token') ?? '';

  function maskKey(k: string) {
    if (!k) return '—';
    if (k.length <= 8) return '••••••••';
    return k.slice(0, 6) + '••••••••' + k.slice(-4);
  }

  async function handleCopy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLogout() {
    if (!confirm('Sign out? You will need to re-enter your API key.')) return;
    localStorage.removeItem('hf_token');
    window.location.reload();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 480 }}>
      <div className="form-group">
        <label className="form-label">Your API key</label>
        <span className="form-hint">Stored in localStorage — never sent to third parties</span>
        <div className="key-display" style={{ marginTop: 6 }}>
          <span className="key-display-value">{maskKey(token)}</span>
          <button
            className="btn btn--ghost btn--sm btn--icon"
            onClick={handleCopy}
            title="Copy API key"
            disabled={!token}
          >
            {copied ? <Check size={13} style={{ color: 'var(--color-success)' }} /> : <Copy size={13} />}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
        <a
          href="https://hivefabric.io/signup"
          target="_blank"
          rel="noreferrer"
          className="btn btn--secondary btn--sm"
        >
          <ExternalLink size={13} />
          Get a new key
        </a>
        <button className="btn btn--danger btn--sm" onClick={handleLogout}>
          Sign out
        </button>
      </div>

      <div className="card" style={{ background: 'var(--color-primary-container)', border: '1px solid var(--color-primary-light)' }}>
        <p style={{ fontSize: 13, color: 'var(--color-primary)', lineHeight: 1.6 }}>
          <strong>Keep your key safe.</strong> Anyone with your API key can use your hive quota.
          If you suspect it's been exposed, generate a new one from the HiveFabric dashboard.
        </p>
      </div>
    </div>
  );
}

// ─── SettingsView ─────────────────────────────────────────────────────────────

type SettingsTab = 'providers' | 'preferences' | 'apikey';

export default function SettingsView() {
  const [tab, setTab] = useState<SettingsTab>('providers');

  return (
    <div className="view-container">
      <div className="section-header">
        <h1 className="section-title">Settings</h1>
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'providers' ? ' active' : ''}`} onClick={() => setTab('providers')}>
          LLM Providers
        </button>
        <button className={`tab${tab === 'preferences' ? ' active' : ''}`} onClick={() => setTab('preferences')}>
          Preferences
        </button>
        <button className={`tab${tab === 'apikey' ? ' active' : ''}`} onClick={() => setTab('apikey')}>
          API Key
        </button>
      </div>

      {tab === 'providers' && <ProvidersTab />}
      {tab === 'preferences' && <PreferencesTab />}
      {tab === 'apikey' && <ApiKeyTab />}
    </div>
  );
}
