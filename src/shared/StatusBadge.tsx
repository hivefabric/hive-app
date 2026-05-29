export function StatusBadge({ online }: { online: boolean }) {
  return (
    <span className={`badge ${online ? 'badge-online' : 'badge-offline'}`}>
      <span className="badge-dot" style={{ background: online ? '#1E8E3E' : '#5F6368' }} />
      {online ? 'Online' : 'Offline'}
    </span>
  );
}
