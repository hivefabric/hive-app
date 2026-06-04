import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { describeCluster } from '../api';
import type { CapabilityInfo } from '../types';

export default function ModelsView() {
  const [capabilities, setCapabilities] = useState<CapabilityInfo[]>([]);
  const [totalCombs, setTotalCombs] = useState(0);
  const [onlineCombs, setOnlineCombs] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await describeCluster();
      setCapabilities(res.capabilities);
      setTotalCombs(res.total_combs);
      setOnlineCombs(res.online_combs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load cluster info');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="view-container">
      <div className="section-header">
        <h1 className="section-title">Models &amp; Capabilities</h1>
        <button className="btn btn--secondary btn--sm" onClick={load} disabled={loading}>
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>

      <div className="stats-summary">
        <div className="stat-chip">
          <span className="stat-chip-value">{capabilities.length}</span>
          <span className="stat-chip-label">Capabilities</span>
        </div>
        <div className="stat-chip">
          <span className="stat-chip-value">{onlineCombs}</span>
          <span className="stat-chip-label">Online combs</span>
        </div>
        <div className="stat-chip">
          <span className="stat-chip-value">{totalCombs}</span>
          <span className="stat-chip-label">Total combs</span>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 'var(--space-4)' }}>{error}</div>}

      {loading && capabilities.length === 0 ? (
        <div className="empty-state">
          <span className="spinner spinner--lg" />
          <p>Loading cluster capabilities…</p>
        </div>
      ) : capabilities.length === 0 ? (
        <div className="empty-state">
          <span style={{ fontSize: 40 }}>🔬</span>
          <p className="text-title">No capabilities discovered</p>
          <p className="text-secondary">
            Make sure your combs are online and the gateway is reachable.
          </p>
        </div>
      ) : (
        <table className="models-table">
          <thead>
            <tr>
              <th>Capability URN</th>
              <th>Description</th>
              <th>Online combs</th>
            </tr>
          </thead>
          <tbody>
            {capabilities.map((cap) => (
              <tr key={cap.urn}>
                <td>
                  <span className="urn-code">{cap.urn}</span>
                </td>
                <td style={{ color: 'var(--color-text-secondary)', maxWidth: 360 }}>
                  {cap.description ?? (
                    <span style={{ color: 'var(--color-text-disabled)', fontStyle: 'italic' }}>
                      No description
                    </span>
                  )}
                  {cap.tags && cap.tags.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {cap.tags.map((tag) => (
                        <span key={tag} className="badge badge--neutral">{tag}</span>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  <span className={`badge ${cap.online_combs > 0 ? 'badge--success' : 'badge--error'}`}>
                    {cap.online_combs}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
