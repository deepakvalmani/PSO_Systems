import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Filter,
  Plus,
  Download,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Phone,
  MapPin,
  Clock,
  X,
  RefreshCw,
} from 'lucide-react';
import { Account, BalanceType } from '../types';
import { formatCurrency } from '../utils/currency';
import { exportToCSV, exportToExcel } from '../utils/exportUtils';

interface AccountsViewProps {
  initialFilters?: { status?: string; balanceType?: string; lastActivity?: string; paymentStatus?: string };
  onSelectAccount: (accountId: string) => void;
  onOpenLedgerEntryForAccount: (accountId: string) => void;
}

export const AccountsView: React.FC<AccountsViewProps> = ({
  initialFilters,
  onSelectAccount,
  onOpenLedgerEntryForAccount,
}) => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentSummary, setPaymentSummary] = useState<{
    totalBilledPaisa: number;
    totalPaidPaisa: number;
    totalRemainingPaisa: number;
    unpaidCount: number;
    partialCount: number;
    paidCount: number;
    advanceCount: number;
  } | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialFilters?.status || 'ALL');
  const [balanceType, setBalanceType] = useState(initialFilters?.balanceType || 'ALL');
  const [paymentStatus, setPaymentStatus] = useState(initialFilters?.paymentStatus || 'ALL');
  const [lastActivity, setLastActivity] = useState(initialFilters?.lastActivity || '');
  const [minBal, setMinBal] = useState('');
  const [maxBal, setMaxBal] = useState('');

  // New Account Modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newOpeningPkr, setNewOpeningPkr] = useState('');
  const [newOpeningType, setNewOpeningType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [newNotes, setNewNotes] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchAccounts = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status && status !== 'ALL') params.set('status', status);
    if (balanceType && balanceType !== 'ALL') params.set('balanceType', balanceType);
    if (paymentStatus && paymentStatus !== 'ALL') params.set('paymentStatus', paymentStatus);
    if (lastActivity) params.set('lastActivity', lastActivity);
    if (minBal) params.set('minBal', String(Math.round(parseFloat(minBal) * 100)));
    if (maxBal) params.set('maxBal', String(Math.round(parseFloat(maxBal) * 100)));
    params.set('page', String(page));
    params.set('limit', String(limit));

    fetch(`/api/accounts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts || []);
        setTotal(data.total || 0);
        if (data.summary) {
          setPaymentSummary(data.summary);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching accounts:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchAccounts();
  }, [page, limit, status, balanceType, paymentStatus, lastActivity]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAccounts();
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsCreating(true);
    try {
      const openAmount = newOpeningPkr ? parseFloat(newOpeningPkr) : 0;
      const signedPaisa = Math.round(openAmount * 100) * (newOpeningType === 'CREDIT' ? -1 : 1);

      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: newName.trim(),
          phone: newPhone.trim(),
          address: newAddress.trim(),
          openingBalancePaisa: signedPaisa,
          notes: newNotes.trim(),
        }),
      });

      if (res.ok) {
        setShowNewModal(false);
        setNewName('');
        setNewPhone('');
        setNewAddress('');
        setNewOpeningPkr('');
        setNewNotes('');
        fetchAccounts();
      }
    } catch (err) {
      console.error('Error creating account:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleExportCSV = () => {
    const rows = accounts.map((a) => ({
      Code: a.accountCode,
      Name: a.accountName,
      Phone: a.phone,
      Address: a.address,
      Status: a.status,
      'Current Balance (PKR)': a.currentBalancePaisa / 100,
      'Balance Type': a.currentBalanceType,
      'Last Activity': a.lastTransactionDate || 'None',
      'Transactions Count': a.totalTransactions || 0,
    }));
    exportToCSV(rows, 'Accounts_List');
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div id="accounts-view" className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Accounts Directory</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium font-mono">
              {total} Total
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Complete account directory, balance positions, and audit ledger links.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 shadow-2xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Account</span>
          </button>
        </div>
      </div>

      {/* PAYMENT TRACKING METRIC STRIP (Clean enterprise format) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Billed</div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1 tracking-tight">
            {formatCurrency(paymentSummary?.totalBilledPaisa || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Total charges & debits</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-emerald-700 uppercase tracking-wider flex items-center justify-between">
            <span>Total Paid</span>
            {paymentSummary && paymentSummary.totalBilledPaisa > 0 && (
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded border border-emerald-200">
                {Math.round((paymentSummary.totalPaidPaisa / paymentSummary.totalBilledPaisa) * 100)}% Cleared
              </span>
            )}
          </div>
          <div className="text-xl font-bold font-mono text-emerald-700 mt-1 tracking-tight">
            {formatCurrency(paymentSummary?.totalPaidPaisa || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Total payments received</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-rose-700 uppercase tracking-wider flex items-center justify-between">
            <span>Remaining Amount Due</span>
            <span className="text-[10px] font-semibold bg-rose-50 text-rose-700 px-1.5 py-0.2 rounded border border-rose-200">
              Outstanding
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-rose-700 mt-1 tracking-tight">
            {formatCurrency(paymentSummary?.totalRemainingPaisa || 0)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Unsettled receivable balance</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Account Settlement</div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px]">
            <span
              onClick={() => setPaymentStatus('PAID_IN_FULL')}
              className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold cursor-pointer hover:bg-emerald-100"
              title="Filter Paid in Full"
            >
              {paymentSummary?.paidCount || 0} Paid
            </span>
            <span
              onClick={() => setPaymentStatus('PARTIALLY_PAID')}
              className="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold cursor-pointer hover:bg-amber-100"
              title="Filter Partially Paid"
            >
              {paymentSummary?.partialCount || 0} Partial
            </span>
            <span
              onClick={() => setPaymentStatus('UNPAID')}
              className="px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200 font-semibold cursor-pointer hover:bg-rose-100"
              title="Filter Unpaid"
            >
              {paymentSummary?.unpaidCount || 0} Unpaid
            </span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1.5">Click badge to filter directory</div>
        </div>
      </div>

      {/* Filter Bar (Medium density, crisp) */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, code, phone, address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:bg-white focus:border-slate-400"
            />
          </div>

          {/* Payment Status Filter */}
          <select
            value={paymentStatus}
            onChange={(e) => {
              setPaymentStatus(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700 focus:outline-hidden font-medium"
          >
            <option value="ALL">All Payment Statuses</option>
            <option value="HAS_REMAINING">Has Remaining Due (Owing)</option>
            <option value="PARTIALLY_PAID">Partially Paid</option>
            <option value="UNPAID">Unpaid (0% Cleared)</option>
            <option value="PAID_IN_FULL">Paid in Full (100%)</option>
            <option value="ADVANCE">Advance (Credit)</option>
          </select>

          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">All Statuses</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Inactive (Dormant)</option>
          </select>

          {/* Balance Type Filter */}
          <select
            value={balanceType}
            onChange={(e) => {
              setBalanceType(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700 focus:outline-hidden"
          >
            <option value="ALL">All Balances</option>
            <option value="DEBIT">Unpaid Balances (Owing)</option>
            <option value="CREDIT">Paid/Advance Balances</option>
            <option value="ZERO">Zero Balance</option>
          </select>

          {/* Last Activity Filter */}
          <select
            value={lastActivity}
            onChange={(e) => {
              setLastActivity(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700 focus:outline-hidden"
          >
            <option value="">Any Activity</option>
            <option value="TODAY">Active Today</option>
            <option value="7_DAYS">Active in 7 Days</option>
            <option value="30_DAYS">Active in 30 Days</option>
            <option value="DORMANT_30">No Activity 30+ Days</option>
            <option value="DORMANT_90">No Activity 90+ Days</option>
            <option value="NEVER">Never Used</option>
          </select>

          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded hover:bg-slate-900 transition-colors"
          >
            Filter
          </button>

          {(search || status !== 'ALL' || balanceType !== 'ALL' || lastActivity) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setStatus('ALL');
                setBalanceType('ALL');
                setLastActivity('');
                setMinBal('');
                setMaxBal('');
                setPage(1);
              }}
              className="text-xs text-slate-500 hover:text-slate-900 underline px-1"
            >
              Reset
            </button>
          )}
        </form>
      </div>

      {/* Accounts Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-semibold">
                <th className="py-2.5 px-3.5">Account</th>
                <th className="py-2.5 px-3.5 text-right">Total Billed</th>
                <th className="py-2.5 px-3.5 text-right">Total Paid</th>
                <th className="py-2.5 px-3.5 text-right">Remaining Due</th>
                <th className="py-2.5 px-3.5 text-center">Payment Status</th>
                <th className="py-2.5 px-3.5 text-right">Current Balance</th>
                <th className="py-2.5 px-3.5 text-center">Status</th>
                <th className="py-2.5 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    Loading accounts...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400 text-xs">
                    No accounts found matching the selected filters.
                  </td>
                </tr>
              ) : (
                accounts.map((acc) => {
                  const billed = acc.totalBilledPaisa || (acc.openingBalancePaisa > 0 ? acc.openingBalancePaisa : 0);
                  const paid = acc.totalPaidPaisa || (acc.openingBalancePaisa < 0 ? Math.abs(acc.openingBalancePaisa) : 0);
                  const remaining = acc.remainingAmountPaisa !== undefined ? acc.remainingAmountPaisa : Math.max(0, acc.currentBalancePaisa);
                  const pct = acc.paidPercentage !== undefined ? acc.paidPercentage : (billed > 0 ? Math.min(100, Math.round((paid / billed) * 100)) : (paid > 0 ? 100 : 0));
                  const payStatus = acc.paymentStatus || (acc.currentBalancePaisa === 0 ? (billed > 0 ? 'PAID_IN_FULL' : 'ZERO') : acc.currentBalancePaisa > 0 ? (paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID') : 'ADVANCE');

                  return (
                    <tr
                      key={acc._id}
                      onClick={() => onSelectAccount(acc._id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <div className="font-semibold text-slate-900 text-xs flex items-center space-x-1.5">
                          <span>{acc.accountName}</span>
                        </div>
                        <div className="flex items-center space-x-2 mt-0.5 text-[11px] text-slate-500 font-mono">
                          <span>{acc.accountCode}</span>
                          {(acc.phone || acc.address) && (
                            <span className="font-sans truncate max-w-[180px]">
                              • {[acc.phone, acc.address].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Total Billed */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-medium text-slate-800 whitespace-nowrap">
                        {formatCurrency(billed)}
                      </td>

                      {/* Total Paid */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-medium text-emerald-700 whitespace-nowrap">
                        {formatCurrency(paid)}
                      </td>

                      {/* Remaining Amount */}
                      <td className="py-2.5 px-3.5 text-right font-mono font-bold whitespace-nowrap">
                        <span className={remaining > 0 ? 'text-rose-700' : 'text-slate-500'}>
                          {formatCurrency(remaining)}
                        </span>
                      </td>

                      {/* Payment Status */}
                      <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                        {payStatus === 'PAID_IN_FULL' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Paid (100%)
                          </span>
                        )}
                        {payStatus === 'PARTIALLY_PAID' && (
                          <div className="inline-flex flex-col items-center">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                              Partial ({pct}%)
                            </span>
                          </div>
                        )}
                        {payStatus === 'UNPAID' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-200">
                            Unpaid (0%)
                          </span>
                        )}
                        {payStatus === 'ADVANCE' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-50 text-indigo-800 border border-indigo-200">
                            Advance (Cr)
                          </span>
                        )}
                        {payStatus === 'ZERO' && (
                          <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
                            Settled
                          </span>
                        )}
                      </td>

                      {/* Current Balance */}
                      <td
                        className={`py-2.5 px-3.5 text-right font-mono font-semibold whitespace-nowrap ${
                          acc.currentBalancePaisa > 0
                            ? 'text-rose-600'
                            : acc.currentBalancePaisa < 0
                            ? 'text-emerald-600'
                            : 'text-slate-600'
                        }`}
                      >
                        {formatCurrency(acc.currentBalancePaisa)}
                        <span className="text-[10px] font-normal text-slate-500 ml-1">
                          {acc.currentBalanceType === 'DEBIT' ? 'Dr' : acc.currentBalanceType === 'CREDIT' ? 'Cr' : ''}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                        <span
                          className={`inline-block text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${
                            acc.status === 'ACTIVE'
                              ? 'bg-slate-100 text-slate-700 border-slate-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {acc.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                        <div
                          className="inline-flex items-center space-x-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={() => onOpenLedgerEntryForAccount(acc._id)}
                            className="text-[11px] font-medium text-slate-700 hover:text-slate-900 px-2 py-0.5 rounded hover:bg-slate-100 border border-slate-200"
                            title="Record transaction or payment"
                          >
                            + Entry
                          </button>
                          <button
                            onClick={() => onSelectAccount(acc._id)}
                            className="text-[11px] font-semibold text-slate-900 hover:text-blue-700 px-2 py-0.5 rounded hover:bg-slate-100"
                          >
                            360 →
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span>Showing {accounts.length} of {total} accounts</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-700"
            >
              <option value={25}>25 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
          </div>

          <div className="flex items-center space-x-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-1 rounded text-slate-500 hover:text-slate-800 disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 font-mono text-slate-700">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-1 rounded text-slate-500 hover:text-slate-800 disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* New Account Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-2xs p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Create New Account</h3>
              <button
                onClick={() => setShowNewModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="p-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Account Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Tariq Goods Transport Co."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:bg-white focus:border-slate-400"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="+92 300 0000000"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:bg-white focus:border-slate-400 font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">Address / Location</label>
                <input
                  type="text"
                  placeholder="Plot 10, Industrial Estate, Karachi"
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:bg-white focus:border-slate-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Opening Balance (PKR)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newOpeningPkr}
                    onChange={(e) => setNewOpeningPkr(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-600 mb-1">Opening Balance Type</label>
                  <select
                    value={newOpeningType}
                    onChange={(e) => setNewOpeningType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-700"
                  >
                    <option value="DEBIT">Unpaid (Receivable)</option>
                    <option value="CREDIT">Paid (Payable/Advance)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-600 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Additional commercial notes..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 disabled:opacity-50"
                >
                  {isCreating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
