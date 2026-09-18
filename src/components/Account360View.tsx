import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Plus,
  FileText,
  Download,
  Printer,
  Edit,
  Phone,
  MapPin,
  Calendar,
  History,
  TrendingUp,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Search,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Pencil,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import { Account, Transaction, DateRange } from '../types';
import { formatCurrency } from '../utils/currency';
import { exportToCSV, exportToExcel, printDocument } from '../utils/exportUtils';
import { getTransactionTypeBadgeStyle, getTransactionTypeLabel } from '../utils/labels';
import { AccountStatementModal } from './AccountStatementModal';

interface Account360ViewProps {
  accountId: string;
  onBack: () => void;
  onOpenLedgerEntry: (accountId: string) => void;
  onSelectTransaction: (txnId: string) => void;
  onEditTransaction?: (txnId: string) => void;
}

type AccountTab = 'overview' | 'ledger' | 'analytics' | 'timeline' | 'audit';

export const Account360View: React.FC<Account360ViewProps> = ({
  accountId,
  onBack,
  onOpenLedgerEntry,
  onSelectTransaction,
  onEditTransaction,
}) => {
  const [activeTab, setActiveTab] = useState<AccountTab>('overview');
  const [account, setAccount] = useState<Account | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [balancePoints, setBalancePoints] = useState<any[]>([]);
  const [timelineItems, setTimelineItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Ledger Tab State
  const [ledgerTxns, setLedgerTxns] = useState<Transaction[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLimit, setLedgerLimit] = useState(25);
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerType, setLedgerType] = useState('ALL');
  const [ledgerDateFrom, setLedgerDateFrom] = useState('');
  const [ledgerDateTo, setLedgerDateTo] = useState('');
  const [loadComplete, setLoadComplete] = useState(false);

  // Statement Modal State
  const [showStatementModal, setShowStatementModal] = useState(false);

  // Edit Account Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [editNotes, setEditNotes] = useState('');

  const loadAccountData = () => {
    setIsLoading(true);
    Promise.all([
      fetch(`/api/accounts/${accountId}`).then((r) => r.json()),
      fetch(`/api/accounts/${accountId}/summary`).then((r) => r.json()),
      fetch(`/api/accounts/${accountId}/balance-history`).then((r) => r.json()),
      fetch(`/api/accounts/${accountId}/timeline`).then((r) => r.json()),
    ])
      .then(([acc, sum, bPoints, tline]) => {
        setAccount(acc);
        setSummary(sum);
        setBalancePoints(bPoints);
        setTimelineItems(tline);

        setEditName(acc.accountName);
        setEditPhone(acc.phone || '');
        setEditAddress(acc.address || '');
        setEditStatus(acc.status);
        setEditNotes(acc.notes || '');

        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error loading Account 360:', err);
        setIsLoading(false);
      });
  };

  const loadLedgerRows = () => {
    const params = new URLSearchParams();
    if (ledgerSearch) params.set('search', ledgerSearch);
    if (ledgerType && ledgerType !== 'ALL') params.set('type', ledgerType);
    if (ledgerDateFrom) params.set('dateFrom', ledgerDateFrom);
    if (ledgerDateTo) params.set('dateTo', ledgerDateTo);
    if (loadComplete) {
      params.set('all', 'true');
    } else {
      params.set('page', String(ledgerPage));
      params.set('limit', String(ledgerLimit));
    }

    fetch(`/api/accounts/${accountId}/history?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setLedgerTxns(data.transactions || []);
        setLedgerTotal(data.total || 0);
      })
      .catch((err) => console.error('Error loading ledger history:', err));
  };

  useEffect(() => {
    loadAccountData();
  }, [accountId]);

  useEffect(() => {
    loadLedgerRows();
  }, [accountId, ledgerPage, ledgerLimit, ledgerType, ledgerDateFrom, ledgerDateTo, loadComplete]);

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: editName,
          phone: editPhone,
          address: editAddress,
          status: editStatus,
          notes: editNotes,
        }),
      });
      if (res.ok) {
        setShowEditModal(false);
        loadAccountData();
      }
    } catch (err) {
      console.error('Error updating account:', err);
    }
  };

  const handleExportLedgerExcel = () => {
    if (!account) return;
    const rows = ledgerTxns.map((t) => ({
      Date: t.date,
      'Transaction #': t.transactionNumber,
      Reference: t.reference,
      Description: t.description,
      'Billed (PKR)': t.type === 'DEBIT' ? t.amountPaisa / 100 : '',
      'Paid (PKR)': t.type === 'CREDIT' ? t.amountPaisa / 100 : '',
      'Balance (PKR)': t.balanceAfterPaisa / 100,
      'Balance Type': t.balanceAfterType,
    }));
    exportToExcel(
      [{ sheetName: 'Ledger History', data: rows }],
      `${account.accountCode}_Ledger_${account.accountName.replace(/\s+/g, '_')}`
    );
  };

  if (isLoading || !account) {
    return (
      <div className="p-8 text-center text-xs text-slate-400">
        Loading Account 360 overview...
      </div>
    );
  }

  const totalPages = Math.ceil(ledgerTotal / ledgerLimit) || 1;

  return (
    <div id="account-360-view" className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* Navigation Breadcrumb & Back */}
      <div className="flex items-center justify-between no-print">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Accounts</span>
        </button>

        <div className="flex items-center space-x-2">
          <span className="text-[11px] text-slate-400 font-mono">ID: {account._id}</span>
        </div>
      </div>

      {/* ACCOUNT HEADER (Clean, uncrowded, high clarity) */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {account.accountName}
              </h2>
              <span className="font-mono text-xs font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                {account.accountCode}
              </span>
              <span
                className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded border ${
                  account.status === 'ACTIVE'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {account.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
              {account.phone && (
                <div className="flex items-center space-x-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  <span>{account.phone}</span>
                </div>
              )}
              {account.address && (
                <div className="flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  <span>{account.address}</span>
                </div>
              )}
              <div className="flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Opened {account.createdAt.slice(0, 10)}</span>
              </div>
            </div>
          </div>

          {/* Current Balance Display & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-right">
            <div className="sm:pr-4 sm:border-r border-slate-200">
              <div className="text-[11px] text-slate-500 font-medium">Current Balance</div>
              <div
                className={`text-2xl font-bold font-mono tracking-tight ${
                  account.currentBalancePaisa > 0
                    ? 'text-rose-600'
                    : account.currentBalancePaisa < 0
                    ? 'text-emerald-600'
                    : 'text-slate-700'
                }`}
              >
                {formatCurrency(account.currentBalancePaisa)}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                {account.currentBalanceType === 'DEBIT'
                  ? 'Unpaid Balance (Receivable)'
                  : account.currentBalanceType === 'CREDIT'
                  ? 'Paid Balance (Advance/Payable)'
                  : 'Zero Balance'}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 shrink-0 no-print">
              <button
                onClick={() => onOpenLedgerEntry(account._id)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 shadow-2xs transition-colors flex items-center space-x-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Entry</span>
              </button>

              <button
                onClick={() => setShowStatementModal(true)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs transition-colors flex items-center space-x-1"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Statement</span>
              </button>

              <button
                onClick={handleExportLedgerExcel}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs transition-colors"
                title="Export Excel"
              >
                Excel
              </button>

              <button
                onClick={() => printDocument()}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs transition-colors"
                title="Print View"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
              </button>

              <button
                onClick={() => setShowEditModal(true)}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs transition-colors"
                title="Edit Account Details"
              >
                <Edit className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
          </div>
        </div>

        {/* SUMMARY METRICS UNDERNEATH (Opening, Debit, Credit, Txns) */}
        <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
          <div>
            <div className="text-slate-500 text-[11px]">Opening Balance</div>
            <div className="font-semibold font-mono text-slate-900 mt-0.5">
              {formatCurrency(account.openingBalancePaisa)}
            </div>
            <div className="text-[10px] text-slate-400">{account.openingBalanceType}</div>
          </div>

          <div>
            <div className="text-slate-500 text-[11px]">Total Debit</div>
            <div className="font-semibold font-mono text-rose-600 mt-0.5">
              {formatCurrency(summary?.totalDebitPaisa || 0)}
            </div>
            <div className="text-[10px] text-slate-400">{summary?.debitCount || 0} entries</div>
          </div>

          <div>
            <div className="text-slate-500 text-[11px]">Total Credit</div>
            <div className="font-semibold font-mono text-emerald-600 mt-0.5">
              {formatCurrency(summary?.totalCreditPaisa || 0)}
            </div>
            <div className="text-[10px] text-slate-400">{summary?.creditCount || 0} payments</div>
          </div>

          <div>
            <div className="text-slate-500 text-[11px]">Transactions</div>
            <div className="font-semibold font-mono text-slate-900 mt-0.5">
              {summary?.transactionCount || 0}
            </div>
            <div className="text-[10px] text-slate-400">All recorded</div>
          </div>

          <div>
            <div className="text-slate-500 text-[11px]">Largest Debit</div>
            <div className="font-semibold font-mono text-slate-900 mt-0.5">
              {formatCurrency(summary?.largestDebitPaisa || 0)}
            </div>
            <div className="text-[10px] text-slate-400">Max receivable</div>
          </div>

          <div>
            <div className="text-slate-500 text-[11px]">Days Since Last Txn</div>
            <div className="font-semibold font-mono text-slate-900 mt-0.5">
              {summary?.daysSinceLastTransaction !== null
                ? `${summary.daysSinceLastTransaction} days`
                : 'None'}
            </div>
            <div className="text-[10px] text-slate-400">Last: {account.lastTransactionDate || '—'}</div>
          </div>
        </div>
      </div>

      {/* PAYMENT TRACKING & SETTLEMENT BREAKDOWN (Clean enterprise card) */}
      {(() => {
        const billed = summary?.totalBilledPaisa ?? account.totalBilledPaisa ?? (account.openingBalancePaisa > 0 ? account.openingBalancePaisa + (summary?.totalDebitPaisa || 0) : (summary?.totalDebitPaisa || 0));
        const paid = summary?.totalPaidPaisa ?? account.totalPaidPaisa ?? (account.openingBalancePaisa < 0 ? Math.abs(account.openingBalancePaisa) + (summary?.totalCreditPaisa || 0) : (summary?.totalCreditPaisa || 0));
        const remaining = summary?.remainingAmountPaisa ?? account.remainingAmountPaisa ?? Math.max(0, account.currentBalancePaisa);
        const pct = billed > 0 ? Math.min(100, Math.max(0, Math.round((paid / billed) * 100))) : (paid > 0 ? 100 : 0);
        const status = account.paymentStatus || (account.currentBalancePaisa === 0 ? (billed > 0 ? 'PAID_IN_FULL' : 'ZERO') : account.currentBalancePaisa > 0 ? (paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID') : 'ADVANCE');

        return (
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-900 uppercase tracking-wider">Payment & Settlement Status</span>
                {status === 'PAID_IN_FULL' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Paid in Full (100%)
                  </span>
                )}
                {status === 'PARTIALLY_PAID' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                    Partially Paid ({pct}%)
                  </span>
                )}
                {status === 'UNPAID' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-800 border border-rose-200">
                    Unpaid (0% Cleared)
                  </span>
                )}
                {status === 'ADVANCE' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200">
                    Advance Payment / Credit
                  </span>
                )}
                {status === 'ZERO' && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                    Settled
                  </span>
                )}
              </div>

              {remaining > 0 && (
                <button
                  onClick={() => onOpenLedgerEntry(account._id)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-900 text-white rounded text-xs font-semibold hover:bg-slate-800 transition-colors shrink-0 shadow-2xs self-start sm:self-auto"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Record Payment</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 text-xs">
              <div>
                <div className="text-slate-500 text-[11px] font-medium">Total Billed (Total Invoiced/Debit)</div>
                <div className="text-lg font-bold font-mono text-slate-900 mt-0.5">
                  {formatCurrency(billed)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Cumulative charges to this account</div>
              </div>

              <div>
                <div className="text-emerald-700 text-[11px] font-medium flex items-center justify-between">
                  <span>Total Amount Paid</span>
                  <span className="font-semibold font-mono text-[11px]">{pct}%</span>
                </div>
                <div className="text-lg font-bold font-mono text-emerald-700 mt-0.5">
                  {formatCurrency(paid)}
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                  <div
                    className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="text-rose-700 text-[11px] font-medium">Remaining Amount Due</div>
                <div className="text-lg font-bold font-mono text-rose-700 mt-0.5">
                  {formatCurrency(remaining)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {remaining > 0 ? 'Pending collection from party' : 'Fully settled / Nil outstanding'}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TABS NAVIGATION (Overview, Ledger, Analytics, Timeline, Audit History) */}
      <div className="border-b border-slate-200 no-print flex space-x-1">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'ledger', label: `Complete Ledger (${ledgerTotal})` },
          { id: 'analytics', label: 'Analytics' },
          { id: 'timeline', label: 'Timeline' },
          { id: 'audit', label: 'Audit History' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as AccountTab)}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB CONTENT 1: OVERVIEW (Balance history chart & recent transactions) */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Balance History Chart */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Balance History</h3>
                <p className="text-[11px] text-slate-500">Historical ledger balance over recorded dates</p>
              </div>
            </div>

            <div className="h-64 w-full">
              {balancePoints.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-400">
                  No historical balance points
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={balancePoints} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '6px', fontSize: '12px' }}
                      formatter={(val: any) => [`Rs. ${Number(val).toLocaleString()}`, 'Balance']}
                    />
                    <Line type="monotone" dataKey="balancePkr" name="Balance" stroke="#0f172a" strokeWidth={2} dot={{ r: 3, fill: '#0f172a' }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Quick Recent Activity preview */}
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">Latest Ledger Transactions</h3>
              <button
                onClick={() => setActiveTab('ledger')}
                className="text-xs font-semibold text-slate-900 hover:underline"
              >
                View full ledger →
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Ref</th>
                    <th className="py-2 px-3">Description</th>
                    <th className="py-2 px-3 text-right">Billed</th>
                    <th className="py-2 px-3 text-right">Paid</th>
                    <th className="py-2 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {ledgerTxns.slice(0, 5).map((t) => (
                    <tr
                      key={t._id}
                      onClick={() => onSelectTransaction(t._id)}
                      className="hover:bg-slate-50/80 cursor-pointer"
                    >
                      <td className="py-2 px-3 font-mono text-slate-600 text-[11px]">{t.date}</td>
                      <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{t.reference}</td>
                      <td className="py-2 px-3 text-slate-900 font-medium">{t.description}</td>
                      <td className="py-2 px-3 text-right font-mono text-rose-600">
                        {t.type === 'DEBIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-600">
                        {t.type === 'CREDIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900">
                        {formatCurrency(t.balanceAfterPaisa, false)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 2: COMPLETE LEDGER (No restriction, pagination, filters) */}
      {activeTab === 'ledger' && (
        <div className="space-y-3">
          {/* Ledger Filters */}
          <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 text-xs no-print">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search description, ref..."
                  value={ledgerSearch}
                  onChange={(e) => {
                    setLedgerSearch(e.target.value);
                    setLedgerPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded focus:outline-hidden focus:bg-white"
                />
              </div>

              <select
                value={ledgerType}
                onChange={(e) => {
                  setLedgerType(e.target.value);
                  setLedgerPage(1);
                }}
                className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700"
              >
                <option value="ALL">All Types</option>
                <option value="DEBIT">Unpaid Only</option>
                <option value="CREDIT">Paid Only</option>
              </select>

              <div className="flex items-center space-x-1">
                <span className="text-slate-500 text-[11px]">From:</span>
                <input
                  type="date"
                  value={ledgerDateFrom}
                  onChange={(e) => {
                    setLedgerDateFrom(e.target.value);
                    setLedgerPage(1);
                  }}
                  className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700"
                />
              </div>

              <div className="flex items-center space-x-1">
                <span className="text-slate-500 text-[11px]">To:</span>
                <input
                  type="date"
                  value={ledgerDateTo}
                  onChange={(e) => {
                    setLedgerDateTo(e.target.value);
                    setLedgerPage(1);
                  }}
                  className="px-2 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700"
                />
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setLoadComplete(!loadComplete)}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                  loadComplete
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {loadComplete ? 'Showing All Rows' : 'Load Complete History'}
              </button>

              <button
                onClick={handleExportLedgerExcel}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5 text-slate-400" />
                <span>Export</span>
              </button>
            </div>
          </div>

          {/* Ledger Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-semibold sticky top-0">
                    <th className="py-2.5 px-3.5">Date</th>
                    <th className="py-2.5 px-3.5">Txn #</th>
                    <th className="py-2.5 px-3.5">Reference</th>
                    <th className="py-2.5 px-3.5">Description</th>
                    <th className="py-2.5 px-3.5 text-right">Billed</th>
                    <th className="py-2.5 px-3.5 text-right">Paid</th>
                    <th className="py-2.5 px-3.5 text-right">Running Balance</th>
                    <th className="py-2.5 px-3.5 text-center">Type</th>
                    <th className="py-2.5 px-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-800">
                  {ledgerTxns.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                        No ledger transactions found for this account.
                      </td>
                    </tr>
                  ) : (
                    ledgerTxns.map((t) => (
                      <tr
                        key={t._id}
                        onClick={() => onSelectTransaction(t._id)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3.5 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                          {t.date}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                          {t.transactionNumber}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                          {t.reference || '—'}
                        </td>
                        <td className="py-2.5 px-3.5 font-medium text-slate-900 max-w-[280px] truncate">
                          {t.description}
                          {t.notes && <span className="text-[11px] text-slate-400 ml-1">({t.notes})</span>}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-rose-600 whitespace-nowrap">
                          {t.type === 'DEBIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono text-emerald-600 whitespace-nowrap">
                          {t.type === 'CREDIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                          {formatCurrency(t.balanceAfterPaisa, false)}
                        </td>
                        <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                          <span
                            className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${
                              t.balanceAfterType === 'DEBIT'
                                ? 'bg-rose-50 text-rose-700 border-rose-100'
                                : t.balanceAfterType === 'CREDIT'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                                : 'bg-slate-50 text-slate-500 border-slate-200'
                            }`}
                          >
                            {t.balanceAfterType === 'DEBIT' ? 'Unpaid' : t.balanceAfterType === 'CREDIT' ? 'Paid' : 'Nil'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectTransaction(t._id);
                              }}
                              className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                            >
                              Inspect
                            </button>
                            {onEditTransaction && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditTransaction(t._id);
                                }}
                                title="Edit transaction"
                                className="inline-flex items-center justify-center text-slate-500 hover:text-slate-900 p-0.5 rounded hover:bg-slate-100"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Ledger Pagination */}
            {!loadComplete && (
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 no-print">
                <div className="flex items-center space-x-2">
                  <span>Showing {ledgerTxns.length} of {ledgerTotal} entries</span>
                  <select
                    value={ledgerLimit}
                    onChange={(e) => {
                      setLedgerLimit(parseInt(e.target.value, 10));
                      setLedgerPage(1);
                    }}
                    className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700"
                  >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={250}>250 per page</option>
                  </select>
                </div>

                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                    disabled={ledgerPage <= 1}
                    className="p-1 rounded text-slate-500 hover:text-slate-800 disabled:opacity-40"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="px-2 font-mono text-slate-700">
                    {ledgerPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setLedgerPage((p) => Math.min(totalPages, p + 1))}
                    disabled={ledgerPage >= totalPages}
                    className="p-1 rounded text-slate-500 hover:text-slate-800 disabled:opacity-40"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 3: ANALYTICS */}
      {activeTab === 'analytics' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Debit vs Credit Distribution</h3>
            <p className="text-[11px] text-slate-500 mb-3">Overall volume breakdown for this account</p>
            <div className="h-60">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={[
                    { name: 'Debit (Materials)', amount: (summary?.totalDebitPaisa || 0) / 100 },
                    { name: 'Credit (Payments)', amount: (summary?.totalCreditPaisa || 0) / 100 },
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => [`Rs. ${Number(v).toLocaleString()}`, 'Amount']} />
                  <Bar dataKey="amount" fill="#0f172a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Account Metrics Summary</h3>
            <div className="divide-y divide-slate-100 text-xs">
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Average Debit Transaction</span>
                <span className="font-mono font-medium text-rose-600">{formatCurrency(summary?.avgDebitPaisa || 0)}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Average Credit Transaction</span>
                <span className="font-mono font-medium text-emerald-600">{formatCurrency(summary?.avgCreditPaisa || 0)}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Activity This Month (Sep 2026)</span>
                <span className="font-mono font-medium text-slate-900">{summary?.activityThisMonth || 0} entries</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Activity This Year (2026)</span>
                <span className="font-mono font-medium text-slate-900">{summary?.activityThisYear || 0} entries</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">First Recorded Transaction</span>
                <span className="font-mono text-slate-700">{summary?.firstTransactionDate || 'None'}</span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Last Recorded Transaction</span>
                <span className="font-mono text-slate-700">{summary?.lastTransactionDate || 'None'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT 4: TIMELINE */}
      {activeTab === 'timeline' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-2xs">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Account Activity Timeline</h3>
          <p className="text-[11px] text-slate-500 mb-4">Complete chronological events and modifications</p>

          <div className="space-y-3 max-w-2xl">
            {timelineItems.length === 0 ? (
              <div className="text-xs text-slate-400 py-4">No activity events found</div>
            ) : (
              timelineItems.map((item, idx) => (
                <div key={item.id || idx} className="flex items-start space-x-3 text-xs">
                  <div className="w-20 shrink-0 text-slate-400 font-mono text-[11px] pt-0.5">
                    {item.date}
                  </div>
                  <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                  <div className="flex-1 bg-slate-50 p-2.5 rounded border border-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900">{item.title}</span>
                      {item.amountPaisa && (
                        <span
                          className={`font-mono font-semibold ${
                            item.txnType === 'DEBIT' ? 'text-rose-600' : 'text-emerald-600'
                          }`}
                        >
                          {formatCurrency(item.amountPaisa)}
                        </span>
                      )}
                    </div>
                    <div className="text-slate-600 text-[11px] mt-0.5">{item.description}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB CONTENT 5: AUDIT HISTORY */}
      {activeTab === 'audit' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-semibold text-slate-900">Audit Trail for {account.accountName}</h3>
          </div>
          <p className="text-[11px] text-slate-500">
            Immutable log of account creation, profile modifications, and linked transaction lifecycle actions.
          </p>

          <div className="divide-y divide-slate-100 text-xs">
            {timelineItems
              .filter((i) => i.type === 'AUDIT' || i.type === 'EDIT')
              .map((a, idx) => (
                <div key={idx} className="py-2.5 flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">{a.title}</div>
                    <div className="text-slate-600 text-[11px] mt-0.5">{a.description}</div>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">{a.date}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Statement Modal */}
      {showStatementModal && (
        <AccountStatementModal
          accountId={account._id}
          onClose={() => setShowStatementModal(false)}
        />
      )}

      {/* Edit Account Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Edit Account Information</h3>
            <form onSubmit={handleUpdateAccount} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Account Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Address</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-slate-900"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Account Status</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-slate-700"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE (Dormant)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded text-slate-900"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-3 py-1.5 text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-slate-900 text-white rounded font-medium"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
