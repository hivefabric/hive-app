import { Cpu, MemoryStick, Network, Thermometer, Battery, Clock, ChevronRight } from 'lucide-react';
import type { CombNode } from '../types';
import { MetricBar } from './MetricBar';
import { StatusBadge } from './StatusBadge';
import { formatRelative } from './formatRelative';

export function NodeCard({ node, onClick }: { node: CombNode; onClick?: () => void }) {
  const cpuTemp = node.sensor_readings?.['cpu_temp_c'];
  const isBattery = node.node_report?.power?.source?.toLowerCase() === 'battery';

  return (
    <div
      className="node-card"
      style={{ borderTop: `3px solid ${node.online ? '#1E8E3E' : 'var(--color-border)'}`, cursor: onClick ? 'pointer' : undefined }}
      onClick={onClick}
    >
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

      {(node.cells ?? []).filter(c => c.role !== 'wasm').length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 10 }}>
          {(node.cells ?? []).filter(c => c.role !== 'wasm').map(c => (
            <div key={c.name} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 10px', borderRadius: 6, fontSize: 11,
              border: `1px solid ${c.role === 'queen' ? 'var(--color-primary)' : c.role === 'shared_worker' ? '#E37400' : '#1E8E3E'}`,
              background: c.role === 'queen' ? 'rgba(11,87,208,0.07)' : c.role === 'shared_worker' ? 'rgba(227,116,0,0.07)' : 'rgba(30,142,62,0.07)',
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

      <div style={{ marginTop: 12, fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Clock size={11} /> Last seen {formatRelative(node.last_seen)}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--color-primary)', opacity: 0.7 }}>
          {(node.cells ?? []).length > 0 ? `${(node.cells ?? []).length} cell${(node.cells ?? []).length !== 1 ? 's' : ''}` : 'Details'}
          <ChevronRight size={10} />
        </span>
      </div>
    </div>
  );
}
