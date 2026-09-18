import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Building2, Loader2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Invalid username or password');
        setLoading(false);
        return;
      }
      if (data.user?.role === 'SUPER_ADMIN') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch {
      setError('Could not reach the server. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-11 h-11 rounded bg-slate-900 flex items-center justify-center text-white shadow-xs mb-3">
            <Building2 className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Sign in to LedgerOne</h1>
          <p className="text-sm text-slate-500 mt-1">Enter your pump account credentials</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-slate-200 rounded-lg shadow-xs p-6 space-y-4"
        >
          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Username</label>
            <input
              type="text"
              autoFocus
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-hidden focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
              placeholder="e.g. ahmedpetroleum"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-hidden focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center px-4 py-2.5 text-sm font-semibold rounded-md bg-slate-900 text-white hover:bg-slate-800 transition-colors disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 mt-6">
          <Link to="/" className="hover:text-slate-600">
            &larr; Back to homepage
          </Link>
        </p>
      </div>
    </div>
  );
};
