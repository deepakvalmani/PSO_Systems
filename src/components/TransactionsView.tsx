import React, { useState, useEffect } from 'react';
import {
  ReceiptText,
  Search,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  Eye,
  Calendar,
  DollarSign,
  Plus,
  RefreshCw,
  Pencil,
} from 'lucide-react';
import { Transaction, Account } from '../types';
import { formatCurrency } from '../utils/currency';
import { exportToCSV, exportToExcel } from '../utils/exportUtils';
import { TransactionDetailModal } from './TransactionDetailModal';
import { getTransactionTypeLabel, getTransactionTypeOptionLabel, getTransactionTypeBadgeStyle } from '../utils/labels';

interface TransactionsViewProps {
  initialFilters?: { type?: string; dateFrom?: string; dateTo?: string; accountId?: string };
  onSelectAccount: (accountId: string) => void;
  onOpenLedgerEntry: (accountId?: string) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  initialFilters,
  onSelectAccount,
  onOpenLedgerEntry,
}) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(initialFilters?.accountId || '');
  const [type, setType] = useState(initialFilters?.type || 'ALL');
  const [dateFrom, setDateFrom] = useState(initialFilters?.dateFrom || '');
  const [dateTo, setDateTo] = useState(initialFilters?.dateTo || '');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');

  // Selected for Modal
  const [selectedTxn, setSelectedTxn] = useState<Transaction | null>(null);
  const [modalInitialEditMode, setModalInitialEditMode] = useState(false);

  // Load Accounts for filter dropdown
  useEffect(() => {
    fetch('/api/accounts?limit=200')
      .then((r) => r.json())
      .then((data) => setAccounts(data.accounts || []))
      .catch((err) => console.error('Error fetching accounts for filter:', err));
  }, []);

  const fetchTransactions = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (selectedAccountId) params.set('accountId', selectedAccountId);
    if (type && type !== 'ALL') params.set('type', type);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    if (minAmount) params.set('minAmount', String(Math.round(parseFloat(minAmount) * 100)));
    if (maxAmount) params.set('maxAmount', String(Math.round(parseFloat(maxAmount) * 100)));
    params.set('page', String(page));
    params.set('limit', String(limit));

    fetch(`/api/transactions?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setTransactions(data.transactions || []);
        setTotal(data.total || 0);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching transactions:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchTransactions();
  }, [page, limit, selectedAccountId, type, dateFrom, dateTo]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchTransactions();
  };

  const handleExportCSV = () => {
    const rows = transactions.map((t) => ({
      'Txn #': t.transactionNumber,
      Date: t.date,
      Account: t.accountName,
      Reference: t.reference,
      Description: t.description,
      Type: t.type,
      'Amount (PKR)': t.amountPaisa / 100,
      'Balance After (PKR)': t.balanceAfterPaisa / 100,
      'Balance Type': t.balanceAfterType,
      'Entered By': t.enteredBy,
    }));
    exportToCSV(rows, `Transactions_${dateFrom || 'all'}_to_${dateTo || 'all'}`);
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div id="transactions-view" className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Transactions Explorer</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-medium">
              {total} Total Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Query, filter, and inspect financial transactions with complete edit trails.
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
            onClick={() => onOpenLedgerEntry()}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded hover:bg-slate-800 shadow-2xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Transaction</span>
          </button>
        </div>
      </div>

      {/* Advanced Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs space-y-2.5">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
          {/* Search text */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search reference, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:bg-white"
            />
          </div>

          {/* Account Filter Pill or Input */}
          {selectedAccountId ? (
            <div className="flex items-center space-x-1 px-2.5 py-1.5 text-xs bg-slate-100 border border-slate-200 rounded text-slate-800">
              <span className="text-slate-500">Account:</span>
              <span className="font-semibold">
                {accounts.find((a) => a._id === selectedAccountId)?.accountName || selectedAccountId}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedAccountId('');
                  setPage(1);
                }}
                className="text-slate-400 hover:text-slate-700 ml-1"
                title="Remove account filter"
              >
                ✕
              </button>
            </div>
          ) : (
            <div className="relative min-w-[170px]">
              <input
                type="text"
                placeholder="Filter by account..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:bg-white"
              />
            </div>
          )}

          {/* Type Filter */}
          <select
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700"
          >
            <option value="ALL">All Types</option>
            <option value="DEBIT">{getTransactionTypeOptionLabel('DEBIT')}</option>
            <option value="CREDIT">{getTransactionTypeOptionLabel('CREDIT')}</option>
          </select>

          {/* Date Range */}
          <div className="flex items-center space-x-1">
            <span className="text-[11px] text-slate-500">From:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700"
            />
          </div>

          <div className="flex items-center space-x-1">
            <span className="text-[11px] text-slate-500">To:</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded text-slate-700"
            />
          </div>

          <button
            type="submit"
            className="px-3 py-1.5 text-xs font-medium bg-slate-800 text-white rounded hover:bg-slate-900"
          >
            Filter
          </button>

          {(search || selectedAccountId || type !== 'ALL' || dateFrom || dateTo) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedAccountId('');
                setType('ALL');
                setDateFrom('');
                setDateTo('');
                setPage(1);
              }}
              className="text-xs text-slate-500 hover:text-slate-900 underline px-1"
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-semibold">
                <th className="py-2.5 px-3.5">Date</th>
                <th className="py-2.5 px-3.5">Txn #</th>
                <th className="py-2.5 px-3.5">Account</th>
                <th className="py-2.5 px-3.5">Reference</th>
                <th className="py-2.5 px-3.5">Description</th>
                <th className="py-2.5 px-3.5 text-center">Type</th>
                <th className="py-2.5 px-3.5 text-right">Billed (PKR)</th>
                <th className="py-2.5 px-3.5 text-right">Paid (PKR)</th>
                <th className="py-2.5 px-3.5 text-right">Balance After</th>
                <th className="py-2.5 px-3.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                    Loading transactions...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400 text-xs">
                    No transactions found for the specified filters.
                  </td>
                </tr>
              ) : (
                transactions.map((t) => (
                  <tr
                    key={t._id}
                    onClick={() => setSelectedTxn(t)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 px-3.5 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                      {t.date}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                      {t.transactionNumber}
                    </td>
                    <td className="py-2.5 px-3.5 font-semibold text-slate-900 whitespace-nowrap max-w-[170px] truncate">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAccount(t.accountId);
                        }}
                        className="hover:underline hover:text-slate-900"
                        title={t.accountName}
                      >
                        {t.accountName}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                      {t.reference || '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-slate-700 max-w-[220px] truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                      <span
                        className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border ${getTransactionTypeBadgeStyle(t.type)}`}
                      >
                        {getTransactionTypeLabel(t.type)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-rose-600 whitespace-nowrap font-medium">
                      {t.type === 'DEBIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono text-emerald-600 whitespace-nowrap font-medium">
                      {t.type === 'CREDIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                    </td>
                    <td className="py-2.5 px-3.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {formatCurrency(t.balanceAfterPaisa, false)}
                    </td>
                    <td className="py-2.5 px-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalInitialEditMode(false);
                            setSelectedTxn(t);
                          }}
                          className="text-[11px] font-medium text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded hover:bg-slate-100 border border-slate-200"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalInitialEditMode(true);
                            setSelectedTxn(t);
                          }}
                          title="Edit transaction"
                          className="inline-flex items-center justify-center text-slate-600 hover:text-slate-900 p-1 rounded hover:bg-slate-100 border border-slate-200"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center space-x-2">
            <span>Showing {transactions.length} of {total} transactions</span>
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

      {/* Transaction Detail Modal */}
      {selectedTxn && (
        <TransactionDetailModal
          transaction={selectedTxn}
          initialEditMode={modalInitialEditMode}
          onClose={() => {
            setSelectedTxn(null);
            setModalInitialEditMode(false);
          }}
          onTransactionUpdated={(updated) => {
            fetchTransactions();
            setSelectedTxn(updated);
          }}
          onViewAccount={onSelectAccount}
        />
      )}
    </div>
  );
};
