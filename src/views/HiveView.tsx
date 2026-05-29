import { useState, useEffect } from 'react';
import { RefreshCw, PlusCircle, Server, Thermometer, Battery, Cpu, MemoryStick, Network, Clock } from 'lucide-react';
import { getNodes } from '../api';
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
            const isQueen = u.includes('/queen/');
            return (
              <span
                key={u}
                className="node-tag"
                title={u}
                style={isQueen ? { background: 'rgba(11,87,208,0.12)', color: 'var(--color-primary)', fontWeight: 600 } : undefined}
              >
                {isQueen ? '👑 ' : ''}{label}
              </span>
            );
          })}
          {(node.advertised_capability_urns ?? []).length > 4 && (
            <span className="node-tag">+{(node.advertised_capability_urns ?? []).length - 4}</span>
          )}
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

// ─── HiveView ─────────────────────────────────────────────────────────────────

interface HiveViewProps {
  onGoToInstall: () => void;
}

export default function HiveView({ onGoToInstall }: HiveViewProps) {
  const [nodes, setNodes] = useState<CombNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button className="btn btn--primary btn--sm" onClick={onGoToInstall}>
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
          <button className="btn btn--primary" onClick={onGoToInstall}>
            <PlusCircle size={15} /> Add your first comb
          </button>
        </div>
      ) : (
        <div className="node-grid" style={{ padding: '0 24px 24px' }}>
          {nodes.map(n => <NodeCard key={n.node_id} node={n} />)}
        </div>
      )}
    </div>
  );
}
