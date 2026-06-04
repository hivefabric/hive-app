import { useState } from 'react';
import { KeyRound, LogIn } from 'lucide-react';
import { signup } from '../api';

interface AuthGateProps {
  onAuth: (token: string) => void;
}

export default function AuthGate({ onAuth }: AuthGateProps) {
  const [mode, setMode] = useState<'paste' | 'signup'>('paste');
  const [apiKey, setApiKey] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handlePaste(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    localStorage.setItem('hf_token', trimmed);
    onAuth(trimmed);
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await signup(email || undefined);
      localStorage.setItem('hf_token', res.api_key);
      onAuth(res.api_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-gate">
      <div className="auth-card">
        <div className="auth-logo">🐝</div>
        <div>
          <h1 className="auth-title">Welcome to HiveFabric</h1>
          <p className="auth-subtitle" style={{ marginTop: 8 }}>
            Your distributed AI compute network
          </p>
        </div>

        <div className="tabs" style={{ borderBottom: '1px solid var(--color-border)', marginBottom: 0 }}>
          <button
            className={`tab${mode === 'paste' ? ' active' : ''}`}
            onClick={() => setMode('paste')}
          >
            Use existing key
          </button>
          <button
            className={`tab${mode === 'signup' ? ' active' : ''}`}
            onClick={() => setMode('signup')}
          >
            Create account
          </button>
        </div>

        {mode === 'paste' ? (
          <form onSubmit={handlePaste} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="api-key">
                API Key
              </label>
              <input
                id="api-key"
                className="input"
                type="password"
                placeholder="hf_..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoFocus
              />
              <span className="form-hint">
                Paste your HiveFabric API key to continue
              </span>
            </div>
            {error && <div className="error-banner">{error}</div>}
            <button
              type="submit"
              className="btn btn--primary btn--lg"
              disabled={!apiKey.trim()}
            >
              <LogIn size={16} />
              Continue
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email (optional)
              </label>
              <input
                id="email"
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
              <span className="form-hint">
                Leave blank to create an anonymous account
              </span>
            </div>
            {error && <div className="error-banner">{error}</div>}
            <button
              type="submit"
              className="btn btn--primary btn--lg"
              disabled={loading}
            >
              {loading ? (
                <span className="spinner spinner--sm" />
              ) : (
                <KeyRound size={16} />
              )}
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
