import React, { useState, useEffect } from 'react';
import { Building2, ShieldCheck, RefreshCw, Save, CheckCircle } from 'lucide-react';
import { BusinessSettings } from '../types';

interface SettingsViewProps {
  onSettingsUpdated?: (settings: BusinessSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onSettingsUpdated }) => {
  const [settings, setSettings] = useState<BusinessSettings>({
    businessName: 'Al-Rehman Enterprises & Co.',
    address: 'Plot 42, Port Qasim Industrial Zone, Karachi',
    phone: '+92 21 3456 7890',
    email: 'accounts@alrehman-ent.com',
    currencySymbol: 'Rs.',
    dateFormat: 'YYYY-MM-DD',
    reportFooter:
      'Please examine this statement promptly. If any discrepancy is discovered, notify our accounts department immediately.',
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcResult, setRecalcResult] = useState<any>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => setSettings(data))
      .catch((err) => console.error('Error fetching settings:', err));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const saved = await res.json();
        setSettings(saved);
        setSaveSuccess(true);
        if (onSettingsUpdated) onSettingsUpdated(saved);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Error saving settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    setRecalcResult(null);
    try {
      const res = await fetch('/api/settings/recalculate-all', { method: 'POST' });
      const data = await res.json();
      setRecalcResult(data);
    } catch (err) {
      console.error('Error recalculating ledgers:', err);
    } finally {
      setIsRecalculating(false);
    }
  };

  return (
    <div id="settings-view" className="max-w-4xl mx-auto p-4 md:p-6 space-y-5">
      {/* Top Header */}
      <div className="pb-3 border-b border-slate-200">
        <h2 className="text-xl font-semibold text-slate-900 tracking-tight">System & Business Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Configure business metadata, statement headers, currency formats, and ledger verification utilities.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle className="w-4 h-4 text-emerald-600" />
          <span>Business settings saved successfully.</span>
        </div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2 flex items-center space-x-2">
          <Building2 className="w-4 h-4 text-slate-600" />
          <span>Company Profile (Appears on Statements & Reports)</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">Company / Trading Name</label>
            <input
              type="text"
              value={settings.businessName}
              onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
              required
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 font-medium"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Currency Symbol</label>
            <input
              type="text"
              value={settings.currencySymbol}
              onChange={(e) => setSettings({ ...settings, currencySymbol: e.target.value })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Official Address</label>
            <input
              type="text"
              value={settings.address}
              onChange={(e) => setSettings({ ...settings, address: e.target.value })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={settings.phone}
              onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 font-mono"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={settings.email}
              onChange={(e) => setSettings({ ...settings, email: e.target.value })}
              className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">Default Date Format</label>
            <select
              value={settings.dateFormat}
              onChange={(e) => setSettings({ ...settings, dateFormat: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-700 font-mono"
            >
              <option value="YYYY-MM-DD">YYYY-MM-DD (ISO standard)</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block font-medium text-slate-700 mb-1 text-xs">
            Statement Footer / Statutory Notice
          </label>
          <textarea
            rows={2}
            value={settings.reportFooter}
            onChange={(e) => setSettings({ ...settings, reportFooter: e.target.value })}
            className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-900"
          />
        </div>

        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition-colors shadow-2xs flex items-center space-x-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Ledger Recalculation & Mathematical Verification */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs space-y-3">
        <div className="flex items-center space-x-2 border-b border-slate-100 pb-2">
          <ShieldCheck className="w-4 h-4 text-slate-900" />
          <h3 className="text-sm font-semibold text-slate-900">
            Ledger Mathematical Integrity & Recalculation Engine
          </h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          LedgerOne stores all financial calculations as exact 64-bit integer paisa (1/100 PKR).
          This tool runs a complete recalculated verification across every account in the database:
          it starts from opening balances and recalculates every transaction in strict chronological sequence,
          verifying running balances and total ledger positions.
        </p>

        <div className="pt-2">
          <button
            onClick={handleRecalculateAll}
            disabled={isRecalculating}
            className="px-4 py-2 bg-slate-100 text-slate-900 border border-slate-300 rounded text-xs font-semibold hover:bg-slate-200 transition-colors flex items-center space-x-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>
              {isRecalculating
                ? 'Verifying & Recomputing All Balances...'
                : 'Recalculate All Account Ledgers'}
            </span>
          </button>
        </div>

        {recalcResult && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-900 space-y-1 mt-2">
            <div className="font-semibold flex items-center space-x-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>{recalcResult.message}</span>
            </div>
            <div className="text-[11px] text-emerald-700 font-mono">
              Accounts Recomputed: {recalcResult.accountsUpdated} • Recalculated At:{' '}
              {recalcResult.timestamp.slice(0, 19).replace('T', ' ')}
            </div>
          </div>
        )}
      </div>

    </div>
  );
};
