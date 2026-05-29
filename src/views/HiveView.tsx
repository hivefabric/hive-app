import { useState, useEffect } from 'react';
import { RefreshCw, PlusCircle, Server, Thermometer, Battery, Cpu, MemoryStick, Network, Clock, X, Check, Copy, Terminal } from 'lucide-react';
import { getNodes, enrollComb } from '../api';
import type { CombNode } from '../types';

// ─── Helpers (same as honeycomb-ui utils.tsx) ─────────────────────────────────

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function MetricBar({ label, value }: { label: string; value?: number | null }) {
  const pct = Math.min(100, value ?? 0);
  const color = pct >= 90 ? '#C5221F' : pct >= 70 ? '#E37400' : '#1E8E3E';
  return (
    <div className="node-metric-row">
      <span className="node-metric-name">{label}</span>
      <div className="metric-bar" style={{ flex: 1 }}>
        <div className="metric-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="metric-bar-label">{value != null ? `${Math.round(value)}%` : '—'}</span>
    </div>
  );
}

function StatusBadge({ online }: { online: boolean }) {
  return (
    <span className={`badge ${online ? 'badge-online' : 'badge-offline'}`}>
      <span className="badge-dot" style={{ background: online ? '#1E8E3E' : '#5F6368' }} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

// ─── NodeCard — mirrors ComputeView's NodeCard exactly ───────────────────────

function NodeCard({ node }: { node: CombNode }) {
  const cpuTemp = node.sensor_readings?.['cpu_temp_c'];
  const isBattery = node.node_report?.power?.source?.toLowerCase() === 'battery';

  return (
    <div className="node-card" style={{ borderTop: `3px solid ${node.online ? '#1E8E3E' : 'var(--color-border)'}` }}>
      <div className="node-card-header">
        <div>
          <div className="node-card-name">
            {node.node_metadata?.device_name ?? node.node_id.slice(0, 16)}
          </div>
          <div className="node-card-id">{node.node_id}</div>
          {node.node_metadata?.operating_system && (
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {node.node_metadata.operating_system} · {node.node_metadata.architecture}
            </div>
          )}
        </div>
        <StatusBadge online={node.online} />
      </div>

      <div className="node-metrics">
        <MetricBar label="CPU" value={node.cpu_usage_percent} />
        <MetricBar label="Memory" value={node.memory_usage_percent} />
        {node.battery_percent != null && (
          <MetricBar label="Battery" value={node.battery_percent} />
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 14, fontSize: 12, color: 'var(--color-text-secondary)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Cpu size={12} /> {node.cpu_cores ?? '?'} cores
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <MemoryStick size={12} /> {node.available_memory_mb ? Math.round(node.available_memory_mb / 1024) : '?'}GB avail
        </span>
        {(node.active_tasks ?? 0) > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-primary)', fontWeight: 600 }}>
            <Network size={12} /> {node.active_tasks} active
          </span>
        )}
        {cpuTemp != null && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: cpuTemp > 80 ? '#C5221F' : undefined }}>
            <Thermometer size={12} /> {Math.round(cpuTemp)}°C
          </span>
        )}
        {isBattery && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Battery size={12} /> On battery
          </span>
        )}
      </div>

      {(node.advertised_capability_urns ?? []).length > 0 && (
        <div className="node-tags">
          {(node.advertised_capability_urns ?? []).slice(0, 4).map(u => {
            const seg = u.replace('oasf://', '').split('/');
            const label = seg[2] ?? seg[seg.length - 1] ?? u;
            return (
              <span key={u} className="node-tag" title={u}>
                {label}
              </span>
            );
          })}
          {(node.advertised_capability_urns ?? []).length > 4 && (
            <span className="node-tag">+{(node.advertised_capability_urns ?? []).length - 4}</span>
          )}
        </div>
      )}

      {(node.cells ?? []).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          {(node.cells ?? []).map(c => (
            <div key={c.name} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 10px', borderRadius: 6, fontSize: 11,
              border: `1px solid ${c.role === 'queen' ? 'var(--color-primary)' : c.role === 'wasm' ? '#E37400' : '#1E8E3E'}`,
              background: c.role === 'queen' ? 'rgba(11,87,208,0.07)' : c.role === 'wasm' ? 'rgba(249,171,0,0.07)' : 'rgba(30,142,62,0.07)',
            }}>
              <span style={{ fontWeight: 600, minWidth: 70 }}>{c.name}</span>
              <span style={{ flex: 1, color: 'var(--color-text-secondary)' }}>{c.model ?? c.role}</span>
              <span style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>×{c.max_concurrent} · {c.reserved_gb}GB</span>
            </div>
          ))}
        </div>
      )}

      {node.roles?.includes('Admin') && (
        <div style={{ marginTop: 8 }}>
          <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#fce8e6', color: '#c5221f' }}>Admin</span>
        </div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Clock size={11} /> Last seen {formatRelative(node.last_seen)}
      </div>
    </div>
  );
}

// ─── Add Comb modal ───────────────────────────────────────────────────────────

function AddCombModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('my-comb');
  const [port, setPort] = useState(7070);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ command: string; config_toml: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setGenerating(true);
    try {
      const res = await enrollComb(name, 'llm', port);
      setResult(res);
    } catch { /* ignore */ } finally { setGenerating(false); }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-dialog">
        <div className="modal-header">
          <span className="modal-title">Add a Comb</span>
          <button className="btn btn--ghost btn--icon" style={{ padding: 4 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <p className="text-secondary" style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            Run the comb agent on any device — your laptop, a server, or a VM. It will appear here once connected.
          </p>

          {!result ? (
            <>
              <div className="form-row">
                <div className="form-group" style={{ flex: 2 }}>
                  <label className="form-label">Name</label>
                  <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="my-comb" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="form-label">Port</label>
                  <input className="input" type="number" value={port} onChange={e => setPort(+e.target.value)} />
                </div>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label className="form-label">Run on your device:</label>
              <div className="copy-block">
                <pre className="copy-block__code">{result.command}</pre>
                <button className="copy-block__btn btn btn--ghost btn--sm" onClick={() => copy(result.command)}>
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <details>
                <summary className="text-secondary" style={{ cursor: 'pointer', fontSize: 12, userSelect: 'none' }}>Show config file</summary>
                <div style={{ marginTop: 6 }}>
                  <div className="copy-block">
                    <pre className="copy-block__code">{result.config_toml}</pre>
                    <button className="copy-block__btn btn btn--ghost btn--sm" onClick={() => copy(result.config_toml)}>
                      <Copy size={13} /> Copy
                    </button>
                  </div>
                </div>
              </details>
              <p className="text-secondary" style={{ fontSize: 12, margin: 0 }}>
                Save the config, then run the command. The comb will appear in My Hive automatically.
              </p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {result ? (
            <>
              <button className="btn btn--ghost btn--sm" onClick={() => setResult(null)}>← Back</button>
              <button className="btn btn--primary" onClick={() => { onAdded(); onClose(); }}>Done</button>
            </>
          ) : (
            <>
              <button className="btn btn--ghost btn--sm" onClick={onClose}>Cancel</button>
              <button className="btn btn--primary" onClick={generate} disabled={generating || !name.trim()}>
                {generating ? <span className="spinner spinner--sm" /> : <Terminal size={14} />}
                Generate command
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── HiveView ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface HiveViewProps {
  onGoToInstall?: () => void; // kept for compat but no longer used
}

export default function HiveView({ }: HiveViewProps) {
  const [nodes, setNodes] = useState<CombNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      setNodes(await getNodes());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load combs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="hive-view">
      <div className="hive-view-header">
        <div>
          <h1 className="hive-view-title">My Hive</h1>
          <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: 14 }}>
            {nodes.filter(n => n.online).length} of {nodes.length} comb{nodes.length !== 1 ? 's' : ''} online
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setShowAddModal(true)}>
            <PlusCircle size={14} /> Add Comb
          </button>
        </div>
      </div>

      {error && <div className="error-banner" style={{ margin: '0 24px' }}>{error}</div>}

      {loading && nodes.length === 0 ? (
        <div className="hive-view-empty">
          <span className="spinner" /> Loading combs…
        </div>
      ) : nodes.length === 0 ? (
        <div className="hive-view-empty">
          <Server size={32} style={{ color: 'var(--color-text-secondary)', marginBottom: 12 }} />
          <p>No combs connected yet.</p>
          <button className="btn btn--primary" onClick={() => setShowAddModal(true)}>
            <PlusCircle size={15} /> Add your first comb
          </button>
        </div>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          <div className="node-grid">
            {nodes.map(n => <NodeCard key={n.node_id} node={n} />)}
          </div>
        </div>
      )}

      {showAddModal && (
        <AddCombModal onClose={() => setShowAddModal(false)} onAdded={load} />
      )}
    </div>
  );
}
