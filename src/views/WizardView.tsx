import { useState, useEffect } from 'react';
import { CheckCircle, ChevronRight, Server, Cpu, Cloud, Terminal, Copy, RefreshCw } from 'lucide-react';
import { getNodes, enrollComb, createLLMProvider, describeCluster } from '../api';
import type { CombNode, CapabilityInfo } from '../types';

interface WizardProps {
  onDone: () => void;
}

type Step = 'comb' | 'queen' | 'ready';
type QueenType = 'local' | 'cloud';

// ─── helpers ──────────────────────────────────────────────────────────────────

function shortUrn(urn: string): string {
  const parts = urn.replace('oasf://', '').split('/');
  return parts[2] ?? urn;
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
    <div className="copy-block" style={{ position: 'relative' }}>
      <pre className="copy-block__code">{text}</pre>
      <button className="copy-block__btn btn btn--ghost btn--sm" onClick={copy} title="Copy">
        {copied ? <CheckCircle size={13} /> : <Copy size={13} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// ─── Step 1: Add Comb ─────────────────────────────────────────────────────────

function StepAddComb({ onNext }: { onNext: (combs: CombNode[]) => void }) {
  const [combs, setCombs] = useState<CombNode[]>([]);
  const [polling, setPolling] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  // enrol form state
  const [name, setName] = useState('my-comb');
  const [port, setPort] = useState(7070);
  const [caps, setCaps] = useState('llm');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ command: string; config_toml: string } | null>(null);

  // Poll for online combs
  useEffect(() => {
    setPolling(true);
    const id = setInterval(async () => {
      try {
        const nodes = await getNodes();
        const online = nodes.filter((n) => n.online);
        setCombs(online);
        if (online.length > 0) clearInterval(id);
      } catch { /* ignore */ }
    }, 3000);
    getNodes().then((n) => setCombs(n.filter((x) => x.online))).catch(() => {});
    return () => clearInterval(id);
  }, []);

  async function generate() {
    setGenerating(true);
    try {
      const res = await enrollComb(name, caps, port);
      setResult(res);
    } catch { /* ignore */ } finally {
      setGenerating(false);
    }
  }

  if (combs.length > 0) {
    return (
      <div className="wizard-step">
        <div className="wizard-check"><CheckCircle size={40} color="var(--color-success, #34A853)" /></div>
        <h2 className="wizard-step__title">Comb connected!</h2>
        <p className="wizard-step__desc text-secondary">
          {combs.length === 1
            ? `1 comb is online and ready to run tasks.`
            : `${combs.length} combs are online and ready.`}
        </p>
        <div className="wizard-comb-list">
          {combs.slice(0, 3).map((c) => (
            <div key={c.node_id} className="wizard-comb-card">
              <Server size={16} />
              <div>
                <div className="wizard-comb-name">
                  {c.node_metadata?.device_name || c.node_metadata?.hostname || c.node_id.slice(0, 8)}
                </div>
                <div className="wizard-comb-urns text-secondary">
                  {(c.advertised_capability_urns ?? []).map(shortUrn).join(' · ')}
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn btn--primary btn--lg wizard-next" onClick={() => onNext(combs)}>
          Next <ChevronRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="wizard-step">
      <div className="wizard-step__icon"><Server size={32} /></div>
      <h2 className="wizard-step__title">Connect a comb</h2>
      <p className="wizard-step__desc text-secondary">
        A comb is a device that runs AI tasks locally — your laptop, a server, or a VM.
        Once connected it will appear here automatically.
      </p>

      {polling && (
        <div className="wizard-waiting">
          <span className="spinner spinner--sm" />
          <span className="text-secondary">Waiting for a comb to come online…</span>
        </div>
      )}

      {!showInstall ? (
        <button className="btn btn--outline wizard-install-toggle" onClick={() => setShowInstall(true)}>
          <Terminal size={15} /> Generate install command
        </button>
      ) : (
        <div className="wizard-install">
          <div className="form-row">
            <div className="form-group" style={{ flex: 2 }}>
              <label className="form-label">Name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="my-comb" />
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
            <button className="btn btn--primary" onClick={generate} disabled={generating}>
              {generating ? <span className="spinner spinner--sm" /> : <RefreshCw size={14} />}
              Generate command
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label className="form-label">Run this on your device:</label>
              <CopyBlock text={result.command} />
              <details style={{ marginTop: 4 }}>
                <summary className="text-secondary" style={{ cursor: 'pointer', fontSize: 13 }}>Show config file</summary>
                <CopyBlock text={result.config_toml} />
              </details>
            </div>
          )}
        </div>
      )}

      <button className="btn btn--ghost wizard-skip" onClick={() => onNext([])}>
        Skip for now
      </button>
    </div>
  );
}

// ─── Step 2: Configure Queen ──────────────────────────────────────────────────

function StepConfigureQueen({
  combs,
  onNext,
}: {
  combs: CombNode[];
  onNext: (type: QueenType, urnOrProviderId: string) => void;
}) {
  const [queenType, setQueenType] = useState<QueenType>('local');
  const [localUrn, setLocalUrn] = useState<string>('');
  const [localCaps, setLocalCaps] = useState<CapabilityInfo[]>([]);

  // cloud form
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
      setLocalCaps(res.capabilities);
      const q = queenUrn(res.capabilities.map((c) => c.urn));
      if (q) setLocalUrn(q);
    }).catch(() => {});
  }, []);

  async function handleNext() {
    if (queenType === 'local') {
      onNext('local', localUrn);
      return;
    }
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
      setError(e instanceof Error ? e.message : 'Failed to save provider');
    } finally { setSaving(false); }
  }

  const queenCaps = localCaps.filter((c) => c.urn.includes('queen'));
  const hasLocalQueen = queenCaps.length > 0;

  return (
    <div className="wizard-step">
      <div className="wizard-step__icon"><Cpu size={32} /></div>
      <h2 className="wizard-step__title">Configure your queen</h2>
      <p className="wizard-step__desc text-secondary">
        The queen is the AI that breaks your requests into tasks and schedules them across your combs.
        Choose what brain it uses.
      </p>

      <div className="wizard-queen-options">
        <button
          className={`wizard-queen-option${queenType === 'local' ? ' wizard-queen-option--active' : ''}`}
          onClick={() => setQueenType('local')}
        >
          <Server size={20} />
          <div>
            <div className="wizard-queen-option__title">Local comb</div>
            <div className="wizard-queen-option__desc text-secondary">
              {hasLocalQueen
                ? `Uses ${shortUrn(queenCaps[0].urn)} on your comb · private, no API cost`
                : combs.length === 0
                ? 'Connect a comb with queen capability first'
                : 'No queen capability found on your combs'}
            </div>
          </div>
          {queenType === 'local' && <CheckCircle size={16} color="var(--color-primary)" style={{ marginLeft: 'auto' }} />}
        </button>

        <button
          className={`wizard-queen-option${queenType === 'cloud' ? ' wizard-queen-option--active' : ''}`}
          onClick={() => setQueenType('cloud')}
        >
          <Cloud size={20} />
          <div>
            <div className="wizard-queen-option__title">Cloud model</div>
            <div className="wizard-queen-option__desc text-secondary">
              Use Anthropic, OpenAI, or any OpenAI-compatible endpoint as your queen
            </div>
          </div>
          {queenType === 'cloud' && <CheckCircle size={16} color="var(--color-primary)" style={{ marginLeft: 'auto' }} />}
        </button>
      </div>

      {queenType === 'local' && !hasLocalQueen && (
        <div className="wizard-warning">
          Your comb doesn't have a queen capability yet. You can still proceed and configure it later in Settings → Queen.
        </div>
      )}

      {queenType === 'local' && hasLocalQueen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <label className="form-label">Queen capability</label>
          <select className="input" value={localUrn} onChange={(e) => setLocalUrn(e.target.value)}>
            {queenCaps.map((c) => (
              <option key={c.urn} value={c.urn}>{c.description || c.urn}</option>
            ))}
          </select>
        </div>
      )}

      {queenType === 'cloud' && (
        <div className="wizard-cloud-form">
          <div className="form-group">
            <label className="form-label">Provider</label>
            <select className="input" value={provider} onChange={(e) => {
              const p = e.target.value as typeof provider;
              setProvider(p);
              setModel(DEFAULTS[p] ?? '');
            }}>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="openai_compat">OpenAI-compatible (Groq, Together…)</option>
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
        </div>
      )}

      <button
        className="btn btn--primary btn--lg wizard-next"
        onClick={handleNext}
        disabled={saving || (queenType === 'cloud' && !apiKey.trim())}
      >
        {saving ? <span className="spinner spinner--sm" /> : null}
        {saving ? 'Saving…' : <><span>Finish setup</span><ChevronRight size={16} /></>}
      </button>
      <button className="btn btn--ghost wizard-skip" onClick={() => onNext(queenType, '')}>
        Skip for now
      </button>
    </div>
  );
}

// ─── Step 3: Ready ────────────────────────────────────────────────────────────

function StepReady({ onDone }: { onDone: () => void }) {
  return (
    <div className="wizard-step wizard-step--ready">
      <div className="wizard-ready-icon">🐝</div>
      <h2 className="wizard-step__title">You're all set!</h2>
      <p className="wizard-step__desc text-secondary">
        Your hive is ready. Send a message and the queen will break it down and route tasks to your combs.
      </p>
      <div className="wizard-ready-tips">
        <div className="wizard-tip">📡 Your combs run tasks privately by default</div>
        <div className="wizard-tip">🧠 The queen decomposes complex requests automatically</div>
        <div className="wizard-tip">⚙️ Add more combs or change the queen any time in Settings</div>
      </div>
      <button className="btn btn--primary btn--lg wizard-next" onClick={onDone}>
        Start chatting
      </button>
    </div>
  );
}

// ─── Wizard ───────────────────────────────────────────────────────────────────

const STEPS: Step[] = ['comb', 'queen', 'ready'];
const STEP_LABELS = ['Add a comb', 'Configure queen', 'Ready'];

export default function WizardView({ onDone }: WizardProps) {
  const [step, setStep] = useState<Step>('comb');
  const [combsFound, setCombsFound] = useState<CombNode[]>([]);

  function handleCombDone(combs: CombNode[]) {
    setCombsFound(combs);
    setStep('queen');
  }

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
    <div className="wizard-layout">
      <div className="wizard-card">
        {/* Progress */}
        <div className="wizard-progress">
          {STEPS.map((s, i) => (
            <div key={s} className={`wizard-progress-step${i <= stepIdx ? ' wizard-progress-step--done' : ''}`}>
              <div className="wizard-progress-dot">
                {i < stepIdx ? <CheckCircle size={14} /> : <span>{i + 1}</span>}
              </div>
              <span className="wizard-progress-label">{STEP_LABELS[i]}</span>
              {i < STEPS.length - 1 && <div className="wizard-progress-line" />}
            </div>
          ))}
        </div>

        {step === 'comb' && <StepAddComb onNext={handleCombDone} />}
        {step === 'queen' && <StepConfigureQueen combs={combsFound} onNext={handleQueenDone} />}
        {step === 'ready' && <StepReady onDone={onDone} />}
      </div>
    </div>
  );
}
