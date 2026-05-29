import { useState, useEffect } from 'react';
import { CheckCircle, ChevronRight, ChevronLeft, Server, Cloud, Terminal, Copy, RefreshCw, X } from 'lucide-react';
import { getNodes, enrollComb, createLLMProvider, setQueenConfig, invalidateQueenCache } from '../api';
import type { CombNode } from '../types';

interface WizardProps {
  onDone: () => void;
}

type Step = 'comb' | 'queen' | 'ready';
type QueenType = 'local' | 'cloud';

const STEPS: Step[] = ['comb', 'queen', 'ready'];
const STEP_LABELS = ['Add a comb', 'Configure queen', 'Ready'];

function shortUrn(urn: string): string {
  return urn.replace('oasf://', '').split('/')[2] ?? urn;
}

/** Extract model name from inference URN, e.g. "qwen3.6" from oasf://commons/inference/qwen3.6/v1 */
function modelFromUrn(urn: string): string | null {
  const m = urn.match(/oasf:\/\/commons\/inference\/([^/]+)\/v\d+/);
  return m ? m[1].replace(/-/g, ':') : null;
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="copy-block">
      <pre className="copy-block__code">{text}</pre>
      <button className="copy-block__btn btn btn--ghost btn--sm" onClick={copy}>
        {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// ─── Step 1: Add Comb ─────────────────────────────────────────────────────────

function StepComb({
  combs, setCombs, onNext, onSkip,
}: {
  combs: CombNode[];
  setCombs: (c: CombNode[]) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [showInstall, setShowInstall] = useState(false);
  const [name, setName] = useState('my-comb');
  const [port, setPort] = useState(7070);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ command: string; config_toml: string } | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const nodes = await getNodes();
        setCombs(nodes.filter(n => n.online));
      } catch { /* ignore */ }
    }, 3000);
    getNodes().then(n => setCombs(n.filter(x => x.online))).catch(() => {});
    return () => clearInterval(id);
  }, [setCombs]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await enrollComb(name, 'llm', port);
      setResult(res);
    } catch { /* ignore */ } finally { setGenerating(false); }
  }

  return (
    <>
      <div className="modal-body">
        <p className="text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          A comb is a device that runs AI tasks locally — your laptop, a server, or a VM.
          Once connected it will appear here automatically.
        </p>

        {combs.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#34A853', fontSize: 14, fontWeight: 600 }}>
              <CheckCircle size={16} />
              {combs.length} comb{combs.length > 1 ? 's' : ''} online
            </div>
            {combs.slice(0, 3).map(c => (
              <div key={c.node_id} className="wizard-comb-card">
                <Server size={14} />
                <div>
                  <div className="wizard-comb-name">
                    {c.node_metadata?.device_name || c.node_metadata?.hostname || c.node_id.slice(0, 12)}
                  </div>
                  <div className="text-secondary" style={{ fontSize: 12 }}>
                    {(c.advertised_capability_urns ?? []).map(shortUrn).join(' · ')}
                  </div>
                </div>
                {c.queen_capable && (
                  <span className="node-tag" style={{ marginLeft: 'auto', flexShrink: 0 }}>queen</span>
                )}
              </div>
            ))}
            <button className="btn btn--ghost btn--sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowInstall(!showInstall)}>
              <Terminal size={13} /> Add another comb
            </button>
          </div>
        ) : (
          <div className="wizard-waiting">
            <span className="spinner spinner--sm" />
            <span className="text-secondary" style={{ fontSize: 14 }}>Waiting for a comb to come online…</span>
          </div>
        )}

        {(showInstall || combs.length === 0) && (
          <div className="wizard-install">
            <div className="form-row">
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Port</label>
                <input className="input" type="number" value={port} onChange={e => setPort(+e.target.value)} />
              </div>
            </div>
            {!result ? (
              <button className="btn btn--outline btn--sm" onClick={generate} disabled={generating} style={{ alignSelf: 'flex-start' }}>
                {generating ? <span className="spinner spinner--sm" /> : <RefreshCw size={13} />}
                Generate command
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <CopyBlock text={result.command} />
                <details>
                  <summary className="text-secondary" style={{ cursor: 'pointer', fontSize: 12 }}>Show config</summary>
                  <div style={{ marginTop: 6 }}><CopyBlock text={result.config_toml} /></div>
                </details>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn--ghost btn--sm" onClick={onSkip}>Skip</button>
        <button className="btn btn--primary" onClick={onNext} disabled={combs.length === 0 && !result}>
          Next <ChevronRight size={15} />
        </button>
      </div>
    </>
  );
}

// ─── Queen comb card ──────────────────────────────────────────────────────────

function QueenCombCard({
  comb,
  selected,
  model,
  endpoint,
  onSelect,
  onModelChange,
  onEndpointChange,
}: {
  comb: CombNode;
  selected: boolean;
  model: string;
  endpoint: string;
  onSelect: () => void;
  onModelChange: (m: string) => void;
  onEndpointChange: (e: string) => void;
}) {
  const inferenceUrns = (comb.advertised_capability_urns ?? []).filter(u => u.includes('/inference/'));
  const models = inferenceUrns.map(u => modelFromUrn(u)).filter(Boolean) as string[];

  return (
    <div
      className={`wizard-queen-option${selected ? ' wizard-queen-option--active' : ''}`}
      onClick={onSelect}
      style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}
    >
      {/* Comb header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Server size={18} style={{ flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="wizard-queen-option__title">
            {comb.node_metadata?.device_name || comb.node_metadata?.hostname || comb.node_id.slice(0, 12)}
          </div>
          <div className="wizard-queen-option__desc text-secondary">
            {comb.node_metadata?.operating_system ?? 'Unknown OS'}
            {comb.available_memory_mb ? ` · ${Math.round(comb.available_memory_mb / 1024)}GB avail` : ''}
            {comb.cpu_cores ? ` · ${comb.cpu_cores} cores` : ''}
          </div>
        </div>
        {selected
          ? <CheckCircle size={16} color="var(--color-primary)" style={{ flexShrink: 0 }} />
          : <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--color-border)', flexShrink: 0 }} />
        }
      </div>

      {/* Model + endpoint selectors — only when selected */}
      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} onClick={e => e.stopPropagation()}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Model (for queen thinking)</label>
              {models.length > 0 ? (
                <select className="input" value={model} onChange={e => onModelChange(e.target.value)}>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                  <option value="_custom">Custom…</option>
                </select>
              ) : (
                <input className="input" value={model} onChange={e => onModelChange(e.target.value)} placeholder="e.g. qwen3.6:latest" />
              )}
              {model === '_custom' && (
                <input className="input" style={{ marginTop: 6 }} placeholder="model name" onChange={e => onModelChange(e.target.value)} />
              )}
            </div>
            <div className="form-group" style={{ flex: 3 }}>
              <label className="form-label">Ollama endpoint</label>
              <input className="input" value={endpoint} onChange={e => onEndpointChange(e.target.value)} placeholder="http://localhost:11434" />
            </div>
          </div>
          <p className="text-secondary" style={{ margin: 0, fontSize: 12, lineHeight: 1.4 }}>
            The queen uses this model for reasoning and task planning. It must support tool calling.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Configure Queen ──────────────────────────────────────────────────

function StepQueen({
  combs,
  onBack,
  onNext,
  onSkip,
}: {
  combs: CombNode[];
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [queenType, setQueenType] = useState<QueenType>('local');

  // Local queen state
  const queenCombs = combs.filter(c => c.queen_capable);
  const [selectedCombId, setSelectedCombId] = useState<string>(() => queenCombs[0]?.node_id ?? '');
  const [model, setModel] = useState<string>(() => {
    const first = queenCombs[0];
    if (!first) return '';
    const inferenceUrns = (first.advertised_capability_urns ?? []).filter(u => u.includes('/inference/'));
    return inferenceUrns.length > 0 ? (modelFromUrn(inferenceUrns[0]) ?? '') : '';
  });
  const [endpoint, setEndpoint] = useState('http://localhost:11434');

  // Cloud state
  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'openai_compat'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [cloudModel, setCloudModel] = useState('claude-3-5-haiku-latest');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const CLOUD_DEFAULTS: Record<string, string> = {
    anthropic: 'claude-3-5-haiku-latest',
    openai: 'gpt-4o-mini',
    openai_compat: '',
  };

  // Update model when selected comb changes
  function handleSelectComb(combId: string) {
    setSelectedCombId(combId);
    const comb = combs.find(c => c.node_id === combId);
    if (!comb) return;
    const inferenceUrns = (comb.advertised_capability_urns ?? []).filter(u => u.includes('/inference/'));
    if (inferenceUrns.length > 0) setModel(modelFromUrn(inferenceUrns[0]) ?? '');
  }

  async function handleSave() {
    setSaving(true); setError('');
    try {
      if (queenType === 'local') {
        const comb = combs.find(c => c.node_id === selectedCombId);
        if (!comb) { setError('Select a comb first'); setSaving(false); return; }
        const queensUrn = (comb.advertised_capability_urns ?? []).find(u => u.includes('/queen/'));
        if (!model.trim()) { setError('Enter a model name'); setSaving(false); return; }

        // Create (or update) a dedicated LLM provider for the queen
        const prov = await createLLMProvider({
          name: 'queen-ollama',
          provider: 'openai',
          api_key: 'ollama',
          base_url: endpoint.trim() || 'http://localhost:11434',
          model: model.trim(),
          is_default: false,
        });

        await setQueenConfig({
          queen_type: 'local',
          queen_comb_id: comb.node_id,
          queen_urn: queensUrn ?? 'oasf://hive/queen/v1',
          queen_llm_provider_id: prov.id,
          queen_model: model.trim(),
        });
      } else {
        if (!apiKey.trim()) { setError('API key is required'); setSaving(false); return; }
        const prov = await createLLMProvider({
          name: `queen-${provider}`,
          provider,
          api_key: apiKey.trim(),
          base_url: baseUrl || undefined,
          model: cloudModel || CLOUD_DEFAULTS[provider] || undefined,
          is_default: false,
        });
        await setQueenConfig({
          queen_type: 'cloud',
          queen_llm_provider_id: prov.id,
          queen_model: cloudModel || CLOUD_DEFAULTS[provider],
        });
      }
      invalidateQueenCache();
      onNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="modal-body">
        <p className="text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          The queen decomposes your requests and routes tasks to your combs. Choose what it uses for thinking.
        </p>

        {/* Type selector */}
        <div className="wizard-queen-options">
          <button
            className={`wizard-queen-option${queenType === 'local' ? ' wizard-queen-option--active' : ''}`}
            onClick={() => setQueenType('local')}
            style={{ gap: 10, padding: '10px 14px' }}
          >
            <Server size={16} />
            <div style={{ flex: 1 }}>
              <div className="wizard-queen-option__title">Local comb</div>
              <div className="wizard-queen-option__desc text-secondary">Private · runs on your device · no API cost</div>
            </div>
            {queenType === 'local' && <CheckCircle size={15} color="var(--color-primary)" style={{ flexShrink: 0 }} />}
          </button>
          <button
            className={`wizard-queen-option${queenType === 'cloud' ? ' wizard-queen-option--active' : ''}`}
            onClick={() => setQueenType('cloud')}
            style={{ gap: 10, padding: '10px 14px' }}
          >
            <Cloud size={16} />
            <div style={{ flex: 1 }}>
              <div className="wizard-queen-option__title">Cloud model</div>
              <div className="wizard-queen-option__desc text-secondary">Anthropic, OpenAI, or compatible endpoint</div>
            </div>
            {queenType === 'cloud' && <CheckCircle size={15} color="var(--color-primary)" style={{ flexShrink: 0 }} />}
          </button>
        </div>

        {/* Local: comb card list */}
        {queenType === 'local' && (
          queenCombs.length === 0 ? (
            <div className="wizard-warning">
              None of your combs are queen-capable yet. A comb needs at least 8 cores and 8 GB RAM to run as queen.
              You can skip this step and configure later, or add a more powerful comb first.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {queenCombs.map(c => (
                <QueenCombCard
                  key={c.node_id}
                  comb={c}
                  selected={selectedCombId === c.node_id}
                  model={selectedCombId === c.node_id ? model : ''}
                  endpoint={endpoint}
                  onSelect={() => handleSelectComb(c.node_id)}
                  onModelChange={setModel}
                  onEndpointChange={setEndpoint}
                />
              ))}
            </div>
          )
        )}

        {/* Cloud: provider form */}
        {queenType === 'cloud' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
      </div>

      <div className="modal-footer">
        <button className="btn btn--ghost btn--sm" onClick={onBack}>
          <ChevronLeft size={15} /> Back
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost btn--sm" onClick={onSkip}>Skip</button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={saving || (queenType === 'cloud' && !apiKey.trim())}
          >
            {saving ? <span className="spinner spinner--sm" /> : null}
            {saving ? 'Saving…' : <>Set queen <ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Step 3: Ready ────────────────────────────────────────────────────────────

function StepReady({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const queenModel = localStorage.getItem('hf_queen_model');
  const queenType = localStorage.getItem('hf_queen_type');
  const queenCombId = localStorage.getItem('hf_queen_comb_id');

  return (
    <>
      <div className="modal-body" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontSize: 48, lineHeight: 1 }}>🐝</div>
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>You're all set!</h2>
          <p className="text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Your hive is ready. The queen will decompose requests and route tasks to your combs.
          </p>
        </div>
        {(queenModel || queenCombId) && (
          <div style={{ background: 'var(--color-surface-variant)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '10px 14px', width: '100%', textAlign: 'left' }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>QUEEN CONFIGURED</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {queenType === 'local' ? '🖥️ Local' : '☁️ Cloud'} · {queenModel || 'model not set'}
            </div>
            {queenCombId && (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Comb: {queenCombId.slice(0, 8)}…
              </div>
            )}
          </div>
        )}
        <div className="wizard-ready-tips">
          <div className="wizard-tip">📡 Tasks run on your combs by default — private</div>
          <div className="wizard-tip">🧠 The queen breaks complex requests into steps automatically</div>
          <div className="wizard-tip">⚙️ Change the queen any time in Settings → Queen</div>
        </div>
      </div>
      <div className="modal-footer">
        <button className="btn btn--ghost btn--sm" onClick={onBack}><ChevronLeft size={15} /> Back</button>
        <button className="btn btn--primary" onClick={onDone}>Start chatting</button>
      </div>
    </>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

export default function WizardView({ onDone }: WizardProps) {
  const [step, setStep] = useState<Step>('comb');
  const [combs, setCombs] = useState<CombNode[]>([]);
  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="modal-title">Setup</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {STEPS.map((s, i) => (
                <div key={s} title={STEP_LABELS[i]} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: i <= stepIdx ? 'var(--color-primary)' : 'var(--color-border)',
                  transition: 'background 0.2s',
                }} />
              ))}
            </div>
            <span className="text-secondary" style={{ fontSize: 12 }}>{STEP_LABELS[stepIdx]}</span>
          </div>
          <button className="btn btn--ghost btn--icon" style={{ padding: 4 }} onClick={onDone} title="Skip setup">
            <X size={16} />
          </button>
        </div>

        {step === 'comb' && (
          <StepComb
            combs={combs}
            setCombs={setCombs}
            onNext={() => setStep('queen')}
            onSkip={onDone}
          />
        )}
        {step === 'queen' && (
          <StepQueen
            combs={combs}
            onBack={() => setStep('comb')}
            onNext={() => setStep('ready')}
            onSkip={onDone}
          />
        )}
        {step === 'ready' && (
          <StepReady
            onBack={() => setStep('queen')}
            onDone={onDone}
          />
        )}
      </div>
    </div>
  );
}
