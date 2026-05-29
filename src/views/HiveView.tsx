import { useState, useEffect } from 'react';
import { RefreshCw, PlusCircle, Server, Clock, X, Check, Copy, Terminal } from 'lucide-react';
import { getNodes, enrollComb } from '../api';
import type { CombNode, CellView } from '../types';
import { formatRelative } from '../shared/formatRelative';
import { NodeCard } from '../shared/NodeCard';

// ─── CombDetailModal ──────────────────────────────────────────────────────────

const CELL_COLORS: Record<string, { border: string; bg: string; label: string }> = {
  queen:         { border: 'var(--color-primary)',  bg: 'rgba(11,87,208,0.07)',   label: '👑 Queen' },
  worker:        { border: '#1E8E3E',               bg: 'rgba(30,142,62,0.07)',   label: '⚙️ Worker' },
  shared_worker: { border: '#E37400',               bg: 'rgba(227,116,0,0.07)',   label: '🌐 Shared' },
  wasm:          { border: '#9334E9',               bg: 'rgba(147,52,233,0.07)',  label: '⚡ WASM' },
};

function CombDetailModal({ node, onClose }: { node: CombNode; onClose: () => void }) {
  const cells = node.cells ?? [];
  const visibleCells = cells.filter(c => c.role !== 'wasm');
  const totalReservedGb = visibleCells.reduce((s, c) => s + (c.reserved_gb ?? 0) * (c.max_concurrent ?? 1), 0);
  const availableGb = node.available_memory_mb ? Math.round(node.available_memory_mb / 1024) : null;

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-dialog" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className={`online-dot${node.online ? ' online-dot--on' : ''}`} />
            <span className="modal-title">
              {node.node_metadata?.device_name ?? node.node_id.slice(0, 16)}
            </span>
            {node.queen_capable && (
              <span className="node-tag" style={{ background: 'rgba(11,87,208,0.1)', color: 'var(--color-primary)' }}>queen-eligible</span>
            )}
          </div>
          <button className="btn btn--ghost btn--icon" style={{ padding: 4 }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ gap: 20 }}>
          {/* Machine info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
            {node.node_metadata?.operating_system && (
              <div><span className="text-secondary">OS · arch</span><br /><strong>{node.node_metadata.operating_system} {node.node_metadata.architecture}</strong></div>
            )}
            {node.node_metadata?.hostname && (
              <div><span className="text-secondary">Hostname</span><br /><strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{node.node_metadata.hostname}</strong></div>
            )}
            {node.cpu_cores && (
              <div><span className="text-secondary">CPU</span><br /><strong>{node.cpu_cores} cores</strong></div>
            )}
            {availableGb && (
              <div><span className="text-secondary">RAM available</span><br /><strong>{availableGb} GB</strong></div>
            )}
            {node.private_ip && (
              <div><span className="text-secondary">Private IP</span><br /><strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{node.private_ip}</strong></div>
            )}
            {node.public_ip && (
              <div><span className="text-secondary">Public IP</span><br /><strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{node.public_ip}</strong></div>
            )}
            {node.node_api_base_url && (
              <div><span className="text-secondary">Node API</span><br /><strong style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{node.node_api_base_url}</strong></div>
            )}
            {node.node_metadata?.virtualization_type && (
              <div><span className="text-secondary">Runtime</span><br /><strong>{node.node_metadata.virtualization_type}</strong></div>
            )}
            {node.active_tasks > 0 && (
              <div><span className="text-secondary">Active tasks</span><br /><strong style={{ color: 'var(--color-primary)' }}>{node.active_tasks}</strong></div>
            )}
          </div>

          {/* Cells */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>
                Cells
                <span className="text-secondary" style={{ fontWeight: 400, marginLeft: 8, fontSize: 12 }}>
                  {visibleCells.length > 0 ? `${visibleCells.length} configured · ${totalReservedGb.toFixed(0)} GB reserved` : 'auto-generating…'}
                </span>
              </div>
            </div>

            {cells.filter(c => c.role !== 'wasm').length === 0 ? (
              <div className="settings-empty" style={{ padding: '14px 0' }}>
                Cells are auto-generated from your hardware when the comb connects.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cells.filter((c: CellView) => c.role !== 'wasm').flatMap((c: CellView) => {
                  const colors = CELL_COLORS[c.role] ?? CELL_COLORS.worker;
                  const slots = c.max_concurrent ?? 1;
                  // Expand each cell into individual slot rows
                  return Array.from({ length: slots }, (_, i) => (
                    <div key={`${c.name}-${i}`} style={{
                      padding: '8px 12px', borderRadius: 'var(--radius-md)',
                      border: `1px solid ${colors.border}`, background: colors.bg,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}>
                      <span style={{ fontSize: 11, padding: '1px 8px', borderRadius: 100, border: `1px solid ${colors.border}`, color: colors.border, flexShrink: 0 }}>{colors.label}</span>
                      {c.model && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, background: 'var(--color-surface-variant)', padding: '1px 6px', borderRadius: 4 }}>{c.model}</span>
                      )}
                      <span className="text-secondary" style={{ fontSize: 12 }}>{c.reserved_gb ?? 0} GB</span>
                      {slots > 1 && (
                        <span className="text-secondary" style={{ marginLeft: 'auto', fontSize: 11 }}>slot {i + 1}/{slots}</span>
                      )}
                    </div>
                  ));
                })}
              </div>
            )}
          </div>

          {/* Capability URNs (non-cell) */}
          {(node.advertised_capability_urns ?? []).length > 0 && cells.length === 0 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>Capabilities</div>
              <div className="node-tags">
                {(node.advertised_capability_urns ?? []).map(u => (
                  <span key={u} className="node-tag" title={u}>
                    {u.replace('oasf://', '').split('/')[2] ?? u}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Clock size={11} /> Last seen {formatRelative(node.last_seen)}
            <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)' }}>{node.node_id}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Comb modal ───────────────────────────────────────────────────────────

type InstallMethod = 'cli' | 'docker';

function AddCombModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('my-comb');
  const [port, setPort] = useState(7070);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ command: string; config_toml: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [method, setMethod] = useState<InstallMethod>('cli');

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

  const dockerCommand = `docker run -d \\\n  -e COMB_NODE_CONFIG=/config/comb.toml \\\n  -e HIVE_VIRTUALIZATION_TYPE=docker \\\n  -v /tmp/hive-combs/${name || 'my-comb'}.toml:/config/comb.toml \\\n  -p ${port}:${port} \\\n  ghcr.io/hivefabric/hive-comb-node:latest`;

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

          {/* Form fields always visible */}
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

          {/* Install method tab bar */}
          <div className="tabs" style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 0 }}>
            <button
              className={`tab${method === 'cli' ? ' active' : ''}`}
              onClick={() => { setMethod('cli'); setResult(null); }}
            >
              💻 CLI
            </button>
            <button
              className={`tab${method === 'docker' ? ' active' : ''}`}
              onClick={() => setMethod('docker')}
            >
              🐳 Docker
            </button>
          </div>

          {/* CLI tab content */}
          {method === 'cli' && result && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
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

          {/* Docker tab content */}
          {method === 'docker' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 100,
                  background: 'rgba(227,116,0,0.1)', color: '#E37400',
                  border: '1px solid rgba(227,116,0,0.3)', fontWeight: 600,
                }}>
                  Available once GitHub CI billing is active
                </span>
              </div>
              <p className="text-secondary" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
                Run the comb as a Docker container — no build required once images are available.
              </p>
              <div>
                <label className="form-label">docker run command</label>
                <div className="copy-block">
                  <pre className="copy-block__code" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{dockerCommand}</pre>
                  <button className="copy-block__btn btn btn--ghost btn--sm" onClick={() => copy(dockerCommand)}>
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '8px 12px', borderRadius: 'var(--radius-md)',
                background: 'rgba(11,87,208,0.06)', border: '1px solid rgba(11,87,208,0.2)',
                fontSize: 13, color: 'var(--color-text-secondary)',
              }}>
                <span style={{ marginTop: 1 }}>ℹ️</span>
                <span>
                  Get the config first: switch to the{' '}
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ display: 'inline', padding: '0 4px', fontSize: 13, height: 'auto', verticalAlign: 'baseline' }}
                    onClick={() => { setMethod('cli'); setResult(null); }}
                  >
                    💻 CLI tab
                  </button>
                  {' '}to generate it, then mount it at{' '}
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>/tmp/hive-combs/{name || 'my-comb'}.toml</code>.
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          {method === 'cli' && result ? (
            <>
              <button className="btn btn--ghost btn--sm" onClick={() => setResult(null)}>← Back</button>
              <button className="btn btn--primary" onClick={() => { onAdded(); onClose(); }}>Done</button>
            </>
          ) : method === 'docker' ? (
            <button className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
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
  const [selectedNode, setSelectedNode] = useState<CombNode | null>(null);

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

  // Re-fetch when settings trigger a cell refresh (cross-tab StorageEvent)
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === 'hf_cells_refresh') load();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Fallback poll every 10s to catch same-tab storage writes (some browsers skip StorageEvent for same page)
  useEffect(() => {
    let lastRefreshTs = localStorage.getItem('hf_cells_refresh') ?? '';
    const id = setInterval(() => {
      const current = localStorage.getItem('hf_cells_refresh') ?? '';
      if (current !== lastRefreshTs) {
        lastRefreshTs = current;
        load();
      }
    }, 10000);
    return () => clearInterval(id);
  }, []);

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
            {nodes.map(n => <NodeCard key={n.node_id} node={n} onClick={() => setSelectedNode(n)} />)}
          </div>
        </div>
      )}

      {showAddModal && (
        <AddCombModal onClose={() => setShowAddModal(false)} onAdded={load} />
      )}
      {selectedNode && (
        <CombDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
