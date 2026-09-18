import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Building2, Plus, LogOut, ShieldCheck, KeyRound, Loader2, Copy, X } from 'lucide-react';
import { Organization, PlanId } from '../types';

interface OrgRow extends Organization {
  accountCount: number;
  transactionCount: number;
  admins: string[];
}

function randomPassword(len = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export const AdminPortal: React.FC = () => {
  const [authState, setAuthState] = useState<'loading' | 'ok' | 'denied'>('loading');
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createdCreds, setCreatedCreds] = useState<{ username: string; password: string; orgName: string } | null>(null);
  const [resetCreds, setResetCreds] = useState<{ username: string; password: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<OrgRow | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return setAuthState('denied');
        const data = await r.json();
        setAuthState(data.user?.role === 'SUPER_ADMIN' ? 'ok' : 'denied');
      })
      .catch(() => setAuthState('denied'));
  }, []);

  const loadOrgs = () => {
    setLoading(true);
    fetch('/api/admin/organizations', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setOrgs(data.organizations || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (authState === 'ok') loadOrgs();
  }, [authState]);

  if (authState === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (authState === 'denied') {
    return <Navigate to="/login" replace />;
  }

  const toggleActive = async (org: OrgRow) => {
    await fetch(`/api/admin/organizations/${org._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isActive: !org.isActive }),
    });
    loadOrgs();
  };

  const changePlan = async (org: OrgRow, planId: PlanId) => {
    await fetch(`/api/admin/organizations/${org._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ planId }),
    });
    loadOrgs();
  };

  const submitPasswordReset = async (org: OrgRow, password: string) => {
    const res = await fetch(`/api/admin/organizations/${org._id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to change password');
    setResetTarget(null);
    setResetCreds({ username: data.username, password: data.password });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="font-semibold text-slate-900">LedgerOne — Super Admin</span>
        </div>
        <button
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            window.location.href = '/login';
          }}
          className="flex items-center space-x-1.5 text-sm text-slate-500 hover:text-rose-600"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Pump Accounts</h1>
            <p className="text-sm text-slate-500 mt-1">Manage every petrol pump provisioned on LedgerOne.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-slate-900 text-white hover:bg-slate-800"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            New Pump
          </button>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-2.5">Pump</th>
                <th className="text-left px-4 py-2.5">Admin Login</th>
                <th className="text-left px-4 py-2.5">Plan</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th className="text-left px-4 py-2.5">Accounts</th>
                <th className="text-left px-4 py-2.5">Txns</th>
                <th className="text-right px-4 py-2.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    <Loader2 className="w-4 h-4 animate-spin inline mr-2" /> Loading...
                  </td>
                </tr>
              )}
              {!loading && orgs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    No pumps yet. Click "New Pump" to create one.
                  </td>
                </tr>
              )}
              {orgs.map((org) => (
                <tr key={org._id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{org.name}</div>
                    <div className="text-xs text-slate-400">{org.city}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{org.admins.join(', ') || '—'}</td>
                  <td className="px-4 py-3">
                    <select
                      value={org.planId}
                      onChange={(e) => changePlan(org, e.target.value as PlanId)}
                      className="text-xs border border-slate-200 rounded px-1.5 py-1"
                    >
                      <option value="BASIC">Basic</option>
                      <option value="PRO">Pro</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        org.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                      }`}
                    >
                      {org.isActive ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{org.accountCount}</td>
                  <td className="px-4 py-3 text-slate-600">{org.transactionCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => setResetTarget(org)}
                        title="Change password"
                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(org)}
                        className={`text-xs font-medium px-2.5 py-1 rounded-md border ${
                          org.isActive
                            ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
                            : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        {org.isActive ? 'Suspend' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {showCreate && (
        <CreatePumpModal
          onClose={() => setShowCreate(false)}
          onCreated={(creds) => {
            setShowCreate(false);
            setCreatedCreds(creds);
            loadOrgs();
          }}
        />
      )}

      {createdCreds && (
        <CredentialsModal
          title={`Pump "${createdCreds.orgName}" created`}
          username={createdCreds.username}
          password={createdCreds.password}
          onClose={() => setCreatedCreds(null)}
        />
      )}

      {resetTarget && (
        <ChangePasswordModal
          org={resetTarget}
          onClose={() => setResetTarget(null)}
          onSubmit={(password) => submitPasswordReset(resetTarget, password)}
        />
      )}

      {resetCreds && (
        <CredentialsModal
          title="Password changed"
          username={resetCreds.username}
          password={resetCreds.password}
          onClose={() => setResetCreds(null)}
        />
      )}
    </div>
  );
};

const CreatePumpModal: React.FC<{
  onClose: () => void;
  onCreated: (creds: { username: string; password: string; orgName: string }) => void;
}> = ({ onClose, onCreated }) => {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    address: '',
    city: '',
    username: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    if (!form.name.trim() || !form.username.trim() || !form.password.trim()) {
      setError('Pump name, username and password are required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create pump');
        setSubmitting(false);
        return;
      }
      onCreated({ username: data.username, password: form.password, orgName: data.organization.name });
    } catch {
      setError('Could not reach the server');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Create New Pump</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {(
            [
              ['name', 'Pump Name'],
              ['phone', 'Phone'],
              ['address', 'Address'],
              ['city', 'City'],
              ['username', 'Login Username'],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <input
                value={(form as any)[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-hidden focus:border-slate-400"
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Password</label>
            <div className="flex space-x-2">
              <input
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Type a password or click Generate"
                className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md font-mono focus:outline-hidden focus:border-slate-400"
              />
              <button
                type="button"
                onClick={() => setForm({ ...form, password: randomPassword() })}
                className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
              >
                Generate
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-md">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? 'Creating...' : 'Create Pump'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ChangePasswordModal: React.FC<{
  org: OrgRow;
  onClose: () => void;
  onSubmit: (password: string) => Promise<void>;
}> = ({ org, onClose, onSubmit }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setError(null);
    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit(password);
    } catch (err: any) {
      setError(err.message || 'Failed to change password');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          For <span className="font-medium text-slate-700">{org.name}</span>. Type the new password in
          plain text below — it's hashed on the server before being stored, never saved as-is.
        </p>

        {error && (
          <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2 mb-3">
            {error}
          </div>
        )}

        <label className="block text-xs font-medium text-slate-600 mb-1">New Password</label>
        <div className="flex space-x-2">
          <input
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="e.g. ahmedNewPass2026"
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md font-mono focus:outline-hidden focus:border-slate-400"
          />
          <button
            type="button"
            onClick={() => setPassword(randomPassword())}
            className="px-3 py-2 text-xs font-medium border border-slate-200 rounded-md hover:bg-slate-50"
          >
            Generate
          </button>
        </div>

        <div className="flex justify-end space-x-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-md">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? 'Saving...' : 'Change Password'}
          </button>
        </div>
      </div>
    </div>
  );
};

const CredentialsModal: React.FC<{
  title: string;
  username: string;
  password: string;
  onClose: () => void;
}> = ({ title, username, password, onClose }) => {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard?.writeText(`Username: ${username}\nPassword: ${password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-1">{title}</h2>
        <p className="text-xs text-rose-600 font-medium mb-4">
          This password is shown only once. Copy it now — it cannot be retrieved again.
        </p>
        <div className="bg-slate-50 border border-slate-200 rounded-md p-3 font-mono text-sm space-y-1">
          <div>
            <span className="text-slate-400">Username:</span> {username}
          </div>
          <div>
            <span className="text-slate-400">Password:</span> {password}
          </div>
        </div>
        <div className="flex justify-end space-x-2 mt-5">
          <button
            onClick={copy}
            className="flex items-center px-3 py-2 text-sm font-medium border border-slate-200 rounded-md hover:bg-slate-50"
          >
            <Copy className="w-3.5 h-3.5 mr-1.5" />
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-md hover:bg-slate-800">
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
