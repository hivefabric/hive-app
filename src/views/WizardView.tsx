import { useState, useEffect } from 'react';
import { CheckCircle, ChevronRight, ChevronLeft, Server, Cloud, Terminal, Copy, RefreshCw, X } from 'lucide-react';
import { getNodes, enrollComb, createLLMProvider, describeCluster } from '../api';
import type { CombNode, CapabilityInfo } from '../types';

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

function queenUrn(urns: string[]): string | undefined {
  return urns.find((u) => u.includes('/queen/') || u.includes('queen'));
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

interface StepCombProps {
  combs: CombNode[];
  setCombs: (c: CombNode[]) => void;
  onNext: () => void;
  onSkip: () => void;
}

function StepComb({ combs, setCombs, onNext, onSkip }: StepCombProps) {
  const [showInstall, setShowInstall] = useState(false);
  const [name, setName] = useState('my-comb');
  const [port, setPort] = useState(7070);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ command: string; config_toml: string } | null>(null);

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const nodes = await getNodes();
        const online = nodes.filter((n) => n.online);
        setCombs(online);
      } catch { /* ignore */ }
    }, 3000);
    getNodes().then((n) => setCombs(n.filter((x) => x.online))).catch(() => {});
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
              <CheckCircle size={16} /> {combs.length} comb{combs.length > 1 ? 's' : ''} online
            </div>
            {combs.map((c) => (
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
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Port</label>
                <input className="input" type="number" value={port} onChange={(e) => setPort(+e.target.value)} />
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

// ─── Step 2: Configure Queen ──────────────────────────────────────────────────

interface StepQueenProps {
  onBack: () => void;
  onNext: (type: QueenType, value: string) => void;
  onSkip: () => void;
}

function StepQueen({ onBack, onNext, onSkip }: StepQueenProps) {
  const [queenType, setQueenType] = useState<QueenType>('local');
  const [localUrn, setLocalUrn] = useState('');
  const [queenCaps, setQueenCaps] = useState<CapabilityInfo[]>([]);

  const [provider, setProvider] = useState<'anthropic' | 'openai' | 'openai_compat'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const DEFAULTS: Record<string, string> = {
    anthropic: 'claude-3-5-haiku-latest',
    openai: 'gpt-4o-mini',
    openai_compat: '',
  };

  useEffect(() => {
    describeCluster().then((res) => {
      const qcaps = res.capabilities.filter((c) => c.urn.includes('queen'));
      setQueenCaps(qcaps);
      const q = queenUrn(res.capabilities.map((c) => c.urn));
      if (q) setLocalUrn(q);
    }).catch(() => {});
  }, []);

  async function handleSave() {
    if (queenType === 'local') { onNext('local', localUrn); return; }
    if (!apiKey.trim()) { setError('API key is required'); return; }
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
      onNext('cloud', prov.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally { setSaving(false); }
  }

  const hasLocalQueen = queenCaps.length > 0;

  return (
    <>
      <div className="modal-body">
        <p className="text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
          The queen decomposes your requests into tasks and routes them to your combs.
        </p>

        <div className="wizard-queen-options">
          <button className={`wizard-queen-option${queenType === 'local' ? ' wizard-queen-option--active' : ''}`} onClick={() => setQueenType('local')}>
            <Server size={18} />
            <div>
              <div className="wizard-queen-option__title">Local comb</div>
              <div className="wizard-queen-option__desc text-secondary">
                {hasLocalQueen ? `Uses ${shortUrn(queenCaps[0].urn)} · private, no API cost` : 'Add a queen capability to your comb first'}
              </div>
            </div>
            {queenType === 'local' && <CheckCircle size={15} color="var(--color-primary)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
          </button>
          <button className={`wizard-queen-option${queenType === 'cloud' ? ' wizard-queen-option--active' : ''}`} onClick={() => setQueenType('cloud')}>
            <Cloud size={18} />
            <div>
              <div className="wizard-queen-option__title">Cloud model</div>
              <div className="wizard-queen-option__desc text-secondary">Anthropic, OpenAI, or any OpenAI-compatible endpoint</div>
            </div>
            {queenType === 'cloud' && <CheckCircle size={15} color="var(--color-primary)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
          </button>
        </div>

        {queenType === 'local' && hasLocalQueen && queenCaps.length > 1 && (
          <div className="form-group">
            <label className="form-label">Queen capability</label>
            <select className="input" value={localUrn} onChange={(e) => setLocalUrn(e.target.value)}>
              {queenCaps.map((c) => <option key={c.urn} value={c.urn}>{c.description || c.urn}</option>)}
            </select>
          </div>
        )}

        {queenType === 'cloud' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Provider</label>
                <select className="input" value={provider} onChange={(e) => {
                  const p = e.target.value as typeof provider;
                  setProvider(p); setModel(DEFAULTS[p] ?? '');
                }}>
                  <option value="anthropic">Anthropic</option>
                  <option value="openai">OpenAI</option>
                  <option value="openai_compat">OpenAI-compatible</option>
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Model</label>
                <input className="input" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULTS[provider]} />
              </div>
            </div>
            {provider === 'openai_compat' && (
              <div className="form-group">
                <label className="form-label">Base URL</label>
                <input className="input" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.together.ai/v1" />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input className="input" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
            </div>
            {error && <div className="error-banner">{error}</div>}
          </div>
        )}
      </div>

      <div className="modal-footer">
        <button className="btn btn--ghost btn--sm" onClick={onBack}><ChevronLeft size={15} /> Back</button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost btn--sm" onClick={onSkip}>Skip</button>
          <button className="btn btn--primary" onClick={handleSave} disabled={saving || (queenType === 'cloud' && !apiKey.trim())}>
            {saving ? <span className="spinner spinner--sm" /> : null}
            {saving ? 'Saving…' : <>Next <ChevronRight size={15} /></>}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Step 3: Ready ────────────────────────────────────────────────────────────

function StepReady({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  return (
    <>
      <div className="modal-body" style={{ textAlign: 'center', alignItems: 'center' }}>
        <div style={{ fontSize: 48, lineHeight: 1 }}>🐝</div>
        <div>
          <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>You're all set!</h2>
          <p className="text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Your hive is ready. The queen will decompose requests and route tasks to your combs automatically.
          </p>
        </div>
        <div className="wizard-ready-tips">
          <div className="wizard-tip">📡 Tasks run on your combs by default — private</div>
          <div className="wizard-tip">🧠 The queen decomposes complex requests automatically</div>
          <div className="wizard-tip">⚙️ Add combs or change the queen any time in Settings</div>
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

  function handleQueenDone(type: QueenType, value: string) {
    if (type === 'local' && value) {
      localStorage.setItem('hf_queen_type', 'local');
      localStorage.setItem('hf_queen_urn', value);
    } else if (type === 'cloud' && value) {
      localStorage.setItem('hf_queen_type', 'cloud');
      localStorage.setItem('hf_queen_provider_id', value);
    }
    setStep('ready');
  }

  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">

        {/* Header: title + progress dots + close */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="modal-title">Setup</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  title={STEP_LABELS[i]}
                  style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: i <= stepIdx ? 'var(--color-primary)' : 'var(--color-border)',
                    transition: 'background 0.2s',
                  }}
                />
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
            onBack={() => setStep('comb')}
            onNext={handleQueenDone}
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
