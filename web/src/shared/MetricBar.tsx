export function MetricBar({ label, value }: { label: string; value?: number | null }) {
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
