import { useState, useEffect } from 'react';
import {
  Server, Copy, Check,
  Cloud, Trash2, Plus, X,
} from 'lucide-react';
import {
  getNodes, getPreferences, updatePreferences,
  getLLMProviders, createLLMProvider, setQueenConfig, invalidateQueenCache, getModels,
  getUsage, listSchedules, createSchedule, deleteSchedule, toggleSchedule,
} from '../api';
import type { CombNode, UserPreferences, ModelEntry, UsageSummary, Schedule } from '../types';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface SettingsProps {}

type Tab = 'queen' | 'privacy' | 'apikey' | 'schedules';

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
  const [cellsUpdating, setCellsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [oldModelHint, setOldModelHint] = useState<string | null>(null);

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
          queen_urn: 'oasf://hive/queen/default/v1',
          queen_model: selectedModel.ollama_name,
        });
      } else {
        if (!apiKey.trim()) { setError('API key required'); setSaving(false); return; }
        const existing = await getLLMProviders();
        const existingQueen = existing.find(p => p.name.startsWith(`queen-${provider}`));
        const prov = existingQueen ?? await createLLMProvider({
          name: `queen-${provider}`, provider, api_key: apiKey.trim(),
          base_url: baseUrl || undefined,
          model: cloudModel || CLOUD_DEFAULTS[provider] || undefined, is_default: false,
        });
        await setQueenConfig({
          queen_type: 'cloud', queen_llm_provider_id: prov.id,
          queen_model: cloudModel || CLOUD_DEFAULTS[provider],
        });
      }
      // Update local prefs state immediately so the card reflects the new model
      const newModel = queenType === 'local' ? selectedModel?.ollama_name : (cloudModel || CLOUD_DEFAULTS[provider]);
      const oldModel = prefs?.queen_model;
      setPrefs(p => p ? { ...p, queen_type: queenType, queen_model: newModel } : p);
      invalidateQueenCache();
      setSaved(true);
      setCellsUpdating(true);
      // Signal HiveView + PrivacyIndicator to refresh
      localStorage.setItem('hf_cells_refresh', Date.now().toString());
      localStorage.setItem('hf_queen_model', newModel ?? '');
      setTimeout(() => setCellsUpdating(false), 2000);
      setTimeout(() => setSaved(false), 5000);
      // Show model cleanup hint if model changed
      if (oldModel && oldModel !== newModel) {
        setOldModelHint(oldModel);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="settings-section">
      <div className="text-secondary" style={{ padding: 16 }}><span className="spinner spinner--sm" /> Loading…</div>
    </div>
  );

  const hasQueenHardware = combs.some(c => c.queen_capable);

  return (
    <div className="settings-section">

      {/* ── Page-level explanation ── */}
      <div className="settings-block">
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--color-text)' }}>Configure Your Queen</h2>
        <p className="text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          The queen is your AI orchestrator. When you send a message, the queen thinks about it,
          breaks it into steps, and assigns each step to the right worker on your combs.
        </p>
        <p className="text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>
          The queen model handles <strong>reasoning and planning</strong> — it needs to support tool
          calling. Your inference workers run separately and are configured automatically from your
          hardware.
        </p>
      </div>

      {/* ── Current queen status card ── */}
      {prefs?.queen_type && (
        <div className="settings-block">
          <div style={{
            padding: '12px 16px',
            background: 'var(--color-surface-variant)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
          }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>
              👑 Queen: {prefs.queen_model ?? 'model not set'}
            </div>
            <div className="text-secondary" style={{ fontSize: 12 }}>
              {prefs.queen_type === 'local' ? 'Running on your comb' : 'Cloud provider'}
              {' · '}Handles reasoning and task planning
            </div>
            <div className="text-secondary" style={{ fontSize: 12 }}>
              Workers: configured automatically · check My Hive for details
            </div>
          </div>
        </div>
      )}

      <div className="settings-block">
        <h3 className="settings-block__title">{prefs?.queen_type ? 'Change queen' : 'Set up your queen'}</h3>

        {/* Type toggle */}
        <div className="wizard-queen-options" style={{ marginBottom: 4 }}>
          <button
            className={`wizard-queen-option${queenType === 'local' ? ' wizard-queen-option--active' : ''}`}
            onClick={() => hasQueenHardware && setQueenType('local')}
            style={{ gap: 10, padding: '10px 14px', opacity: hasQueenHardware ? 1 : 0.4, cursor: hasQueenHardware ? 'pointer' : 'default' }}
            title={hasQueenHardware ? undefined : 'Requires a comb with ≥8 cores and ≥8 GB RAM'}
          >
            <Server size={16} />
            <div style={{ flex: 1 }}>
              <div className="wizard-queen-option__title">
                Local queen
                {!hasQueenHardware && <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>Hardware required</span>}
              </div>
              <div className="wizard-queen-option__desc text-secondary">
                {hasQueenHardware ? 'Private · no API cost' : 'Needs ≥8 cores and ≥8 GB RAM'}
              </div>
            </div>
          </button>
          <button
            className={`wizard-queen-option${queenType === 'cloud' ? ' wizard-queen-option--active' : ''}`}
            onClick={() => setQueenType('cloud')}
            style={{ gap: 10, padding: '10px 14px' }}
          >
            <Cloud size={16} />
            <div style={{ flex: 1 }}>
              <div className="wizard-queen-option__title">Cloud queen</div>
              <div className="wizard-queen-option__desc text-secondary">Anthropic, OpenAI, or compatible</div>
            </div>
          </button>
        </div>

        {/* ── Local queen: model picker ── */}
        {queenType === 'local' && (
          <>
            <div style={{ marginTop: 12, marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginBottom: 2 }}>
                Queen model (for reasoning + planning)
              </div>
              <div className="text-secondary" style={{ fontSize: 12 }}>
                Choose a model that supports tool calling. Larger models orchestrate better.
              </div>
            </div>

            {catalogLoading ? (
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
                  // Build tier label
                  const tierLabel = m.tier
                    ? (m.tier.toLowerCase().includes('large') ? 'Large · queen-grade'
                      : m.tier.toLowerCase().includes('medium') ? 'Medium · queen-capable'
                      : m.tier)
                    : '';
                  return (
                    <button
                      key={m.id}
                      className={`wizard-queen-option${sel ? ' wizard-queen-option--active' : ''}`}
                      onClick={() => setSelectedModel(m)}
                      style={{ gap: 10, padding: '10px 14px', opacity: fits ? 1 : 0.55 }}
                    >
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span className="wizard-queen-option__title">{m.display_name}</span>
                          {m.supports_tools && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'rgba(11,87,208,0.1)', color: 'var(--color-primary)', border: '1px solid rgba(11,87,208,0.2)' }}>
                              ✓ Tool calling
                            </span>
                          )}
                          {m.supports_thinking && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: 'rgba(52,168,83,0.1)', color: '#1E8E3E', border: '1px solid rgba(52,168,83,0.25)' }}>
                              ✓ Reasoning
                            </span>
                          )}
                        </div>
                        <div className="wizard-queen-option__desc text-secondary">
                          {m.size_gb}GB · {tierLabel || m.tier} · min {m.min_ram_gb}GB RAM
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
                      ? `Leaves ~${workerSlots} worker slot${workerSlots !== 1 ? 's' : ''} for inference tasks`
                      : `Selected: ${selectedModel.display_name}`}
                  </div>
                )}

                {/* Callout: clarifies this only sets the queen's model, not workers */}
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(11,87,208,0.06)',
                  borderRadius: 8,
                  border: '1px solid rgba(11,87,208,0.2)',
                  fontSize: 13,
                }}>
                  <strong>This only configures the queen's thinking model.</strong><br />
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    Your inference workers (the models that execute tasks) are configured automatically
                    based on your hardware. Check <b>My Hive &rarr; click a comb &rarr; cells</b> to see them.
                  </span>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Cloud queen form ── */}
        {queenType === 'cloud' && (
          <>
            <p className="text-secondary" style={{ margin: '4px 0 10px', fontSize: 13, lineHeight: 1.5 }}>
              Using a cloud model as your queen gives better orchestration quality but sends your
              queries to an external provider.
            </p>
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
          </>
        )}

        {error && <div className="error-banner">{error}</div>}

        <button className="btn btn--primary" style={{ alignSelf: 'flex-start' }} onClick={save}
          disabled={saving || (queenType === 'local' && !selectedModel)}>
          {saving ? <span className="spinner spinner--sm" /> : null}
          {saving ? 'Saving…' : 'Save queen'}
        </button>

        {saved && queenType === 'local' && (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, padding: '8px 12px', background: 'var(--color-surface-variant)', borderRadius: 'var(--radius-md)' }}>
            ✓ Queen saved. Restart your comb agent to apply the new model and regenerate cells.
          </div>
        )}
        {saved && queenType === 'cloud' && (
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 8, padding: '8px 12px', background: 'var(--color-surface-variant)', borderRadius: 'var(--radius-md)' }}>
            ✓ Cloud queen saved.
          </div>
        )}
        {saved && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            {cellsUpdating ? (
              <>
                <span className="spinner spinner--sm" style={{ width: 10, height: 10 }} />
                Cells updating… check My Hive in a moment
              </>
            ) : (
              <>✓ Changes applied</>
            )}
          </div>
        )}
        {oldModelHint && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(249,171,0,0.08)', border: '1px solid #E37400', borderRadius: 'var(--radius-md)', fontSize: 13 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Free up disk space</div>
            <div className="text-secondary" style={{ marginBottom: 8 }}>
              The old model <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{oldModelHint}</code> is still downloaded on your comb. Remove it to free space:
            </div>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--color-surface-variant)', padding: '4px 8px', borderRadius: 4, display: 'block' }}>
              ollama rm {oldModelHint}
            </code>
            <button className="btn btn--ghost btn--sm" style={{ marginTop: 8, fontSize: 11 }} onClick={() => setOldModelHint(null)}>Dismiss</button>
          </div>
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
  const [cellsUpdating, setCellsUpdating] = useState(false);

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
        pool_share_pct: prefs.pool_share_pct,
      });
      setSaved(true);
      setCellsUpdating(true);
      // Signal HiveView to refresh cells
      localStorage.setItem('hf_cells_refresh', Date.now().toString());
      setTimeout(() => setCellsUpdating(false), 2000);
      setTimeout(() => setSaved(false), 5000);
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
              <div className="settings-pref-label">
                Pool share
                {prefs.tier !== 'premium' && (
                  <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(249,171,0,0.15)', color: '#E37400', border: '1px solid #E37400' }}>Free · min 50%</span>
                )}
                {prefs.tier === 'premium' && (
                  <span style={{ marginLeft: 8, fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(11,87,208,0.1)', color: 'var(--color-primary)', border: '1px solid var(--color-primary)' }}>Premium · full control</span>
                )}
              </div>
              <div className="text-secondary" style={{ fontSize: 13 }}>
                {prefs.tier === 'premium'
                  ? `${prefs.pool_share_pct ?? 0}% of worker slots offered to pool`
                  : `${prefs.pool_share_pct ?? 50}% of worker slots offered to pool (Free tier minimum: 50%)`}
              </div>
            </div>
            {prefs.tier === 'premium' ? (
              // Premium: full range 0–100%
              <input
                type="range" min={0} max={100} value={prefs.pool_share_pct ?? 0}
                onChange={(e) => set('pool_share_pct', +e.target.value)}
                style={{ width: 120 }}
              />
            ) : (
              // Free tier: locked at 50–100% minimum
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                <input
                  type="range" min={50} max={100} value={Math.max(50, prefs.pool_share_pct ?? 50)}
                  onChange={(e) => set('pool_share_pct', +e.target.value)}
                  style={{ width: 120 }}
                />
                {(prefs.pool_share_pct ?? 50) <= 50 && (
                  <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    Upgrade to Premium for full control
                  </span>
                )}
              </div>
            )}
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

        {saved && (
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
            {cellsUpdating ? (
              <>
                <span className="spinner spinner--sm" style={{ width: 10, height: 10 }} />
                Cells updating… check My Hive in a moment
              </>
            ) : (
              <>✓ Changes applied</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Credits card ─────────────────────────────────────────────────────────────

function CreditsCard() {
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  useEffect(() => { getUsage().then(setUsage).catch(() => {}); }, []);

  if (!usage) return null;
  return (
    <div className="settings-block">
      <h3 className="settings-block__title">Credits</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 14px', background: 'var(--color-surface-variant)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, color: usage.credits_remaining > 100 ? '#1E8E3E' : '#E37400' }}>
            {usage.credits_remaining.toLocaleString()}
          </div>
          <div className="text-secondary" style={{ fontSize: 12 }}>credits remaining</div>
        </div>
        {usage.credits_used_today != null && (
          <div>
            <div style={{ fontSize: 18, fontWeight: 600 }}>{usage.credits_used_today}</div>
            <div className="text-secondary" style={{ fontSize: 12 }}>used today</div>
          </div>
        )}
      </div>
      {usage.recent_events && usage.recent_events.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="form-label" style={{ marginBottom: 6 }}>Recent activity</div>
          {usage.recent_events.slice(0, 5).map((e, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--color-border)' }}>
              <span className="text-secondary">{e.description ?? e.kind}</span>
              <span style={{ color: e.kind === 'credit' ? '#1E8E3E' : e.kind === 'refund' ? '#E37400' : 'var(--color-text)', fontWeight: 500 }}>
                {e.kind === 'debit' ? '-' : '+'}{e.amount}
              </span>
            </div>
          ))}
        </div>
      )}
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
      <CreditsCard />
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

// ─── Schedules tab ────────────────────────────────────────────────────────────

function humanCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, dom, , dow] = parts;
  const days: Record<string, string> = {
    '0': 'Sun', '1': 'Mon', '2': 'Tue', '3': 'Wed', '4': 'Thu', '5': 'Fri', '6': 'Sat',
  };
  if (dom === '*' && dow === '1-5' && min !== '*' && hour !== '*')
    return `Weekdays at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  if (dom === '*' && dow === '*' && min !== '*' && hour !== '*')
    return `Daily at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  if (dom === '*' && dow !== '*' && min !== '*' && hour !== '*') {
    const dayLabel = days[dow] ?? dow;
    return `${dayLabel} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
  }
  if (min.startsWith('*/') && hour === '*' && dom === '*' && dow === '*')
    return `Every ${min.slice(2)} minutes`;
  if (min === '*' && hour.startsWith('*/'))
    return `Every ${hour.slice(2)} hours`;
  return cron;
}

function formatRunTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function SchedulesTab() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // New schedule form state
  const [newTitle, setNewTitle] = useState('');
  const [newCron, setNewCron] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState('');

  function load() {
    setLoading(true);
    listSchedules()
      .then(setSchedules)
      .catch(() => setSchedules([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!newTitle.trim() || !newCron.trim() || !newPrompt.trim()) {
      setFormError('Title, cron expression, and prompt are required.');
      return;
    }
    setCreating(true);
    setFormError('');
    try {
      await createSchedule({ title: newTitle.trim(), cron: newCron.trim(), prompt: newPrompt.trim() });
      setNewTitle(''); setNewCron(''); setNewPrompt('');
      setShowForm(false);
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create schedule');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteSchedule(id).catch(() => {});
    setSchedules((prev) => prev.filter((s) => s.id !== id));
  }

  async function handleToggle(id: string, enabled: boolean) {
    try {
      const updated = await toggleSchedule(id, enabled);
      setSchedules((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch { /* ignore */ }
  }

  return (
    <div className="settings-section">
      <div className="settings-block">
        <div className="settings-block__header">
          <h3 className="settings-block__title">Scheduled Tasks</h3>
          <button className="btn btn--secondary btn--sm" onClick={() => { setShowForm((v) => !v); setFormError(''); }}>
            <Plus size={13} />
            New schedule
          </button>
        </div>

        {showForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '14px 16px', background: 'var(--color-surface-variant)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div className="form-group">
              <label className="form-label">Title</label>
              <input className="input" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Morning briefing" />
            </div>
            <div className="form-group">
              <label className="form-label">Cron expression</label>
              <input className="input" value={newCron} onChange={(e) => setNewCron(e.target.value)} placeholder="0 9 * * 1-5" />
              <span className="form-hint">e.g. <code>0 9 * * 1-5</code> = weekdays at 9am · <code>0 8 * * *</code> = daily at 8am</span>
            </div>
            <div className="form-group">
              <label className="form-label">Prompt</label>
              <textarea
                className="input input--textarea"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Summarise the latest news and send me a briefing…"
                rows={3}
              />
            </div>
            {formError && <div className="error-banner">{formError}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn--primary btn--sm" onClick={handleCreate} disabled={creating}>
                {creating ? <span className="spinner spinner--sm" /> : <Check size={13} />}
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => { setShowForm(false); setFormError(''); }}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-secondary" style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="spinner spinner--sm" /> Loading…
          </div>
        ) : schedules.length === 0 ? (
          <div className="settings-empty">
            No scheduled tasks. Create one to run prompts automatically.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {schedules.map((s) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{s.title}</div>
                  <div className="text-secondary" style={{ fontSize: 12 }}>
                    {humanCron(s.cron)}
                    {s.next_run_at && <> · Next: {formatRunTime(s.next_run_at)}</>}
                    {s.last_run_at && <> · Last: {formatRunTime(s.last_run_at)}</>}
                  </div>
                  <div className="text-secondary" style={{ fontSize: 12, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 380 }}>
                    {s.task_payload.prompt}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <label className="toggle" title={s.enabled ? 'Disable' : 'Enable'}>
                    <input type="checkbox" checked={s.enabled} onChange={(e) => handleToggle(s.id, e.target.checked)} />
                    <span className="toggle__slider" />
                  </label>
                  <button className="btn btn--ghost btn--sm btn--icon" onClick={() => handleDelete(s.id)} title="Delete schedule">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SettingsView ─────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string }[] = [
  { id: 'queen',     label: 'Queen' },
  { id: 'privacy',   label: 'Privacy' },
  { id: 'apikey',    label: 'API Key' },
  { id: 'schedules', label: '⏰ Schedules' },
];

export default function SettingsView({ }: SettingsProps) {
  const [tab, setTab] = useState<Tab>('queen');

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

        {tab === 'queen'     && <QueenTab />}
        {tab === 'privacy'   && <PrivacyTab />}
        {tab === 'apikey'    && <ApiKeyTab />}
        {tab === 'schedules' && <SchedulesTab />}
      </div>
    </div>
  );
}
