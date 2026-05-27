import { useState, useEffect } from 'react';
import { RefreshCw, PlusCircle, X, Thermometer, Cpu, MemoryStick, Battery } from 'lucide-react';
import { getNodes } from '../api';
import type { CombNode } from '../types';

function statusBadgeClass(status: CombNode['status']) {
  if (status === 'online') return 'badge badge--success';
  if (status === 'degraded') return 'badge badge--warning';
  return 'badge badge--error';
}

function thermalBadgeClass(thermal: CombNode['thermal_status']) {
  if (thermal === 'nominal') return 'badge badge--success';
  if (thermal === 'warm') return 'badge badge--warning';
  if (thermal === 'hot') return 'badge badge--warning';
  return 'badge badge--error';
}

function barClass(pct: number) {
  if (pct >= 90) return 'stat-bar-fill stat-bar-fill--danger';
  if (pct >= 70) return 'stat-bar-fill stat-bar-fill--warn';
  return 'stat-bar-fill';
}

function NodeCard({ node }: { node: CombNode }) {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">{node.name}</div>
          <div className="card-subtitle" style={{ marginTop: 4 }}>
            {node.id}
          </div>
        </div>
        <span className={statusBadgeClass(node.status)}>
          {node.status}
        </span>
      </div>

      <div className="stat-row">
        <div className="stat-item">
          <Cpu size={13} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
          <span className="stat-label">CPU</span>
          <div className="stat-bar-track">
            <div className={barClass(node.cpu_pct)} style={{ width: `${node.cpu_pct}%` }} />
          </div>
          <span className="stat-val">{node.cpu_pct}%</span>
        </div>

        <div className="stat-item">
          <MemoryStick size={13} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
          <span className="stat-label">Memory</span>
          <div className="stat-bar-track">
            <div className={barClass(node.memory_pct)} style={{ width: `${node.memory_pct}%` }} />
          </div>
          <span className="stat-val">{node.memory_pct}%</span>
        </div>

        {node.battery_pct !== undefined && (
          <div className="stat-item">
            <Battery size={13} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
            <span className="stat-label">Battery</span>
            <div className="stat-bar-track">
              <div
                className={barClass(100 - node.battery_pct)}
                style={{ width: `${node.battery_pct}%`, background: node.battery_pct < 20 ? 'var(--color-error)' : 'var(--color-success)' }}
              />
            </div>
            <span className="stat-val">{node.battery_pct}%</span>
          </div>
        )}

        <div className="stat-item">
          <Thermometer size={13} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
          <span className="stat-label">Thermal</span>
          <span className={thermalBadgeClass(node.thermal_status)} style={{ marginLeft: 'auto' }}>
            {node.thermal_status}
          </span>
        </div>
      </div>

      {node.capabilities && node.capabilities.length > 0 && (
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {node.capabilities.map((cap) => (
            <span key={cap} className="urn-code">{cap}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function RegisterSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-header">
          <span className="sheet-title">Register a new Comb</span>
          <button className="btn btn--ghost btn--icon btn--sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="text-secondary">
          Install the comb agent on any machine you want to add to your hive.
          It will register automatically and appear here.
        </p>

        <div className="form-group">
          <label className="form-label">Quick install (macOS / Linux)</label>
          <div className="key-display">
            <code className="key-display-value">
              curl -sSL https://hivefabric.io/install | sh
            </code>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Docker</label>
          <div className="key-display">
            <code className="key-display-value" style={{ fontSize: 11 }}>
              docker run -d --name comb hivefabric/comb:latest
            </code>
          </div>
        </div>

        <p className="form-hint">
          The agent will prompt for your API key on first launch. It connects to your
          honeycomb on port 8080 and registers itself.
        </p>

        <button className="btn btn--primary" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

export default function HiveView() {
  const [nodes, setNodes] = useState<CombNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showRegister, setShowRegister] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getNodes();
      setNodes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load nodes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, []);

  const online = nodes.filter((n) => n.status === 'online').length;

  return (
    <div className="view-container">
      <div className="section-header">
        <h1 className="section-title">My Hive</h1>
        <div className="flex gap-2">
          <button className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button className="btn btn--primary btn--sm" onClick={() => setShowRegister(true)}>
            <PlusCircle size={13} />
            Register comb
          </button>
        </div>
      </div>

      <div className="stats-summary">
        <div className="stat-chip">
          <span className="stat-chip-value">{nodes.length}</span>
          <span className="stat-chip-label">Total combs</span>
        </div>
        <div className="stat-chip">
          <span className="stat-chip-value" style={{ color: 'var(--color-success)' }}>{online}</span>
          <span className="stat-chip-label">Online</span>
        </div>
        <div className="stat-chip">
          <span className="stat-chip-value" style={{ color: 'var(--color-error)' }}>{nodes.length - online}</span>
          <span className="stat-chip-label">Offline</span>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {loading && nodes.length === 0 ? (
        <div className="empty-state">
          <span className="spinner spinner--lg" />
          <p>Loading comb nodes…</p>
        </div>
      ) : nodes.length === 0 ? (
        <div className="empty-state">
          <span style={{ fontSize: 40 }}>🕸️</span>
          <p className="text-title">No combs registered</p>
          <p className="text-secondary">Register your first comb to get started.</p>
          <button className="btn btn--primary" onClick={() => setShowRegister(true)}>
            <PlusCircle size={14} />
            Register a comb
          </button>
        </div>
      ) : (
        <div className="card-grid">
          {nodes.map((node) => (
            <NodeCard key={node.id} node={node} />
          ))}
        </div>
      )}

      {showRegister && <RegisterSheet onClose={() => setShowRegister(false)} />}
    </div>
  );
}
