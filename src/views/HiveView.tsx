import { useState, useEffect } from 'react';
import { RefreshCw, PlusCircle, Cpu, MemoryStick, Battery, Clock, Network } from 'lucide-react';
import { getNodes } from '../api';
import type { CombNode } from '../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function barColorClass(pct: number) {
  if (pct >= 90) return 'stat-bar-fill stat-bar-fill--danger';
  if (pct >= 70) return 'stat-bar-fill stat-bar-fill--warn';
  return 'stat-bar-fill';
}

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

/** Extract a short human-readable label from a capability URN.
 *  e.g. "urn:hivefabric:llm:qwen3.6:v1" → "qwen3.6"
 *  Falls back to last path segment or the raw URN truncated. */
function shortUrn(urn: string): string {
  const parts = urn.split(':');
  // Try the segment just before the last one (version) — usually the model name
  if (parts.length >= 4) return parts[parts.length - 2];
  const slashParts = urn.split('/');
  const seg = slashParts[slashParts.length - 1] ?? urn;
  return seg.length > 20 ? seg.slice(-20) : seg;
}

// ─── NodeCard ─────────────────────────────────────────────────────────────────

function NodeCard({ node }: { node: CombNode }) {
  const cpuPct = node.cpu_usage_percent ?? 0;
  const memPct = node.memory_usage_percent ?? 0;
  const battPct = node.battery_percent;
  const hostname = node.node_metadata?.hostname ?? node.node_metadata?.device_name ?? null;
  const shortId = node.node_id.slice(0, 8);
  const cpuTemp = node.sensor_readings?.['cpu_temp_c'];
  const thermalState = node.node_report?.power?.thermal_state;
  const urns = node.advertised_capability_urns ?? [];
  const runtimeCaps = node.runtime_capabilities ?? [];

  return (
    <div
      className="card"
      style={{
        borderTop: `3px solid ${node.online ? 'var(--color-success)' : 'var(--color-border)'}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
      }}
    >
      {/* Header */}
      <div className="card-header" style={{ marginBottom: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {/* Online pulse dot */}
            {node.online ? (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--color-success)',
                boxShadow: '0 0 0 2px rgba(30,142,62,0.25)',
                flexShrink: 0,
                animation: 'hive-pulse 2s ease-in-out infinite',
              }} />
            ) : (
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--color-text-disabled)',
                flexShrink: 0,
              }} />
            )}
            <span className="card-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.node_metadata?.device_name ?? shortId}
            </span>
          </div>
          {hostname && (
            <div className="card-subtitle" style={{ fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {shortId} · {hostname}
            </div>
          )}
          {!hostname && (
            <div className="card-subtitle" style={{ fontFamily: 'var(--font-mono)', marginTop: 2 }}>
              {node.node_id}
            </div>
          )}
        </div>

        {/* Active tasks badge */}
        {node.active_tasks > 0 && (
          <span
            className="badge badge--info"
            style={{ flexShrink: 0, marginLeft: 'var(--space-2)' }}
            title="Active tasks"
          >
            <Network size={10} style={{ marginRight: 2 }} />
            {node.active_tasks}
          </span>
        )}
      </div>

      {/* Metric bars */}
      <div className="stat-row">
        <div className="stat-item">
          <Cpu size={13} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
          <span className="stat-label">CPU</span>
          <div className="stat-bar-track">
            <div className={barColorClass(cpuPct)} style={{ width: `${cpuPct}%` }} />
          </div>
          <span className="stat-val">{Math.round(cpuPct)}%</span>
        </div>

        <div className="stat-item">
          <MemoryStick size={13} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
          <span className="stat-label">Memory</span>
          <div className="stat-bar-track">
            <div className={barColorClass(memPct)} style={{ width: `${memPct}%` }} />
          </div>
          <span className="stat-val">{Math.round(memPct)}%</span>
        </div>

        {battPct != null && (
          <div className="stat-item">
            <Battery size={13} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
            <span className="stat-label">Battery</span>
            <div className="stat-bar-track">
              <div
                className="stat-bar-fill"
                style={{
                  width: `${battPct}%`,
                  background: battPct < 20 ? 'var(--color-error)' : 'var(--color-success)',
                }}
              />
            </div>
            <span className="stat-val">{Math.round(battPct)}%</span>
          </div>
        )}
      </div>

      {/* Thermal / temp info row */}
      {(cpuTemp != null || thermalState) && (
        <div style={{ display: 'flex', gap: 'var(--space-3)', fontSize: 11, color: 'var(--color-text-secondary)', alignItems: 'center' }}>
          {cpuTemp != null && (
            <span style={{ color: cpuTemp > 80 ? 'var(--color-warning)' : undefined }}>
              {Math.round(cpuTemp)}°C
            </span>
          )}
          {thermalState && thermalState !== 'nominal' && (
            <span
              className={
                thermalState === 'critical' ? 'badge badge--error' :
                thermalState === 'hot' ? 'badge badge--warning' :
                'badge badge--warning'
              }
            >
              {thermalState}
            </span>
          )}
        </div>
      )}

      {/* Capability URN tags */}
      {urns.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)' }}>
          {urns.slice(0, 4).map((u) => (
            <span key={u} className="urn-code" title={u} style={{ fontSize: 11 }}>
              {shortUrn(u)}
            </span>
          ))}
          {urns.length > 4 && (
            <span className="urn-code" style={{ fontSize: 11 }}>+{urns.length - 4}</span>
          )}
        </div>
      )}

      {/* Runtime capability pills */}
      {(node.docker || node.wasm || runtimeCaps.includes('llm')) && (
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          {(runtimeCaps.includes('llm') || urns.length > 0) && (
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 'var(--radius-full)',
              background: '#D3E3FD', color: '#0B57D0', fontWeight: 600,
            }}>LLM</span>
          )}
          {node.docker && (
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 'var(--radius-full)',
              background: '#FEF0D9', color: '#B85C00', fontWeight: 600,
            }}>Docker</span>
          )}
          {node.wasm && (
            <span style={{
              fontSize: 10, padding: '2px 7px', borderRadius: 'var(--radius-full)',
              background: '#E6F4EA', color: '#1E8E3E', fontWeight: 600,
            }}>WASM</span>
          )}
        </div>
      )}

      {/* Footer: last seen */}
      <div style={{ marginTop: 'auto', fontSize: 11, color: 'var(--color-text-disabled)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Clock size={11} />
        Last seen {formatRelative(node.last_seen)}
      </div>
    </div>
  );
}

// ─── HiveView ─────────────────────────────────────────────────────────────────

export default function HiveView({ onGoToInstall }: { onGoToInstall?: () => void }) {
  const [nodes, setNodes] = useState<CombNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  const online = nodes.filter((n) => n.online).length;

  return (
    <div className="view-container">
      <style>{`
        @keyframes hive-pulse {
          0%, 100% { box-shadow: 0 0 0 2px rgba(30,142,62,0.25); }
          50% { box-shadow: 0 0 0 5px rgba(30,142,62,0.1); }
        }
      `}</style>

      <div className="section-header">
        <h1 className="section-title">My Hive</h1>
        <div className="flex gap-2">
          <button className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
            Refresh
          </button>
          <button
            className="btn btn--primary btn--sm"
            onClick={onGoToInstall ?? (() => {
              window.location.hash = '#/settings';
            })}
          >
            <PlusCircle size={13} />
            Add comb
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
          <button
            className="btn btn--primary"
            onClick={onGoToInstall ?? (() => { window.location.hash = '#/settings'; })}
          >
            <PlusCircle size={14} />
            Add a comb
          </button>
        </div>
      ) : (
        <div className="card-grid">
          {nodes.map((node) => (
            <NodeCard
              key={node.node_id}
              node={node}
            />
          ))}
        </div>
      )}
    </div>
  );
}
