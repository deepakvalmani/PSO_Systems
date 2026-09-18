import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import App from '../App';
import { PublicUser, Organization } from '../types';

/**
 * Guards the main ERP app: checks /api/auth/me on mount.
 *  - Not authenticated -> redirect to /login
 *  - SUPER_ADMIN -> redirect to /admin (super-admins don't use the pump UI)
 *  - ORG_ADMIN -> render the ERP app, scoped server-side to their org
 */
export const ProtectedErpApp: React.FC = () => {
  const [status, setStatus] = useState<'loading' | 'unauthenticated' | 'super-admin' | 'org-admin'>('loading');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) {
          setStatus('unauthenticated');
          return;
        }
        const data = await r.json();
        setUser(data.user);
        setOrganization(data.organization || null);
        setStatus(data.user.role === 'SUPER_ADMIN' ? 'super-admin' : 'org-admin');
      })
      .catch(() => setStatus('unauthenticated'));
  }, []);

  if (status === 'loading') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace />;
  }

  if (status === 'super-admin') {
    return <Navigate to="/admin" replace />;
  }

  return <App currentUser={user!} organization={organization} />;
};
