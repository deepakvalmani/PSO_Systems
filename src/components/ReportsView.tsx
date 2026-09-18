import React, { useState, useEffect } from 'react';
import {
  FileText,
  Calendar,
  Download,
  Printer,
  Table,
  CheckCircle,
  Clock,
  Filter,
  Users,
  Search,
} from 'lucide-react';
import { Account } from '../types';
import { formatCurrency } from '../utils/currency';
import { exportToCSV, exportToExcel, printDocument } from '../utils/exportUtils';
import { AccountStatementModal } from './AccountStatementModal';

interface ReportsViewProps {
  onSelectAccount: (accountId: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ onSelectAccount }) => {
  const [reportType, setReportType] = useState<
    | 'balance-summary'
    | 'as-of-balance'
    | 'executive-summary'
    | 'all-transactions'
    | 'inactive-accounts'
    | 'custom'
  >('balance-summary');

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [asOfDate, setAsOfDate] = useState('2026-06-30');
  const [dateFrom, setDateFrom] = useState('2026-01-01');
  const [dateTo, setDateTo] = useState('2026-09-18');
  const [customType, setCustomType] = useState('ALL');

  const [reportRows, setReportRows] = useState<any[]>([]);
  const [reportTotals, setReportTotals] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Statement Modal
  const [showStatementForAccount, setShowStatementForAccount] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/accounts?limit=200')
      .then((r) => r.json())
      .then((data) => {
        setAccounts(data.accounts || []);
        if (data.accounts && data.accounts.length > 0 && !selectedAccountId) {
          setSelectedAccountId(data.accounts[0]._id);
        }
      });
  }, []);

  const runReport = () => {
    setIsLoading(true);
    let url = '';

    if (reportType === 'balance-summary') {
      url = '/api/reports/balance-summary';
    } else if (reportType === 'as-of-balance') {
      url = `/api/reports/as-of-balance?asOfDate=${asOfDate}`;
    } else if (reportType === 'executive-summary') {
      url = `/api/reports/executive-summary?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    } else if (reportType === 'all-transactions') {
      url = `/api/reports/all-transactions?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    } else if (reportType === 'inactive-accounts') {
      url = '/api/reports/inactive-accounts?days=30';
    } else if (reportType === 'custom') {
      url = `/api/reports/custom?accountId=${selectedAccountId}&dateFrom=${dateFrom}&dateTo=${dateTo}&type=${customType}`;
    }

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setReportRows(data.rows || []);
        setReportTotals(data.totals || null);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error running report:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    runReport();
  }, [reportType, asOfDate, dateFrom, dateTo, selectedAccountId, customType]);

  const handleExportCSV = () => {
    exportToCSV(reportRows, `Report_${reportType}_${new Date().toISOString().slice(0, 10)}`);
  };

  return (
    <div id="reports-view" className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Financial Reports & Statements</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pre-built accounting balance summaries, historical as-of valuations, and custom builders.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleExportCSV}
            disabled={reportRows.length === 0}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => printDocument()}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs"
          >
            <Printer className="w-3.5 h-3.5 text-slate-400" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Report Selection Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs no-print">
        {[
          { id: 'balance-summary', label: 'Balance Summary' },
          { id: 'as-of-balance', label: 'As-Of Balance' },
          { id: 'executive-summary', label: 'Executive Summary' },
          { id: 'all-transactions', label: 'All Transactions' },
          { id: 'inactive-accounts', label: 'Inactive Accounts' },
          { id: 'custom', label: 'Custom Builder' },
        ].map((r) => (
          <button
            key={r.id}
            onClick={() => setReportType(r.id as any)}
            className={`p-2.5 rounded border text-left transition-colors font-medium ${
              reportType === r.id
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-semibold'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
          >
            <div className="truncate">{r.label}</div>
          </button>
        ))}
      </div>

      {/* Filter Parameters based on report type */}
      <div className="bg-white border border-slate-200 rounded-lg p-3.5 shadow-2xs flex flex-wrap items-center gap-3 text-xs no-print">
        {reportType === 'as-of-balance' && (
          <div className="flex items-center space-x-2">
            <span className="font-medium text-slate-700">Calculate As-Of Historical Date:</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded text-slate-900 font-mono"
            />
            <span className="text-[11px] text-slate-500">
              Calculates strictly using transactions up to 23:59:59 on this date.
            </span>
          </div>
        )}

        {(reportType === 'executive-summary' ||
          reportType === 'all-transactions' ||
          reportType === 'custom') && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-600 font-medium">Period:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-800"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-800"
            />
          </div>
        )}

        {reportType === 'custom' && (
          <div className="flex items-center space-x-2">
            <span className="text-slate-600 font-medium">Account:</span>
            {selectedAccountId ? (
              <div className="flex items-center space-x-1 px-2.5 py-1 text-xs bg-slate-100 border border-slate-200 rounded text-slate-800">
                <span className="font-semibold">
                  {accounts.find((a) => a._id === selectedAccountId)?.accountName || selectedAccountId}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedAccountId('')}
                  className="text-slate-400 hover:text-slate-700 ml-1 font-bold"
                  title="Clear account filter"
                >
                  ✕
                </button>
              </div>
            ) : (
              <input
                type="text"
                list="reports-account-list"
                placeholder="Type account name..."
                onChange={(e) => {
                  const val = e.target.value;
                  const match = accounts.find(
                    (a) => a.accountName.toLowerCase() === val.toLowerCase() || a.accountCode.toLowerCase() === val.toLowerCase()
                  );
                  if (match) {
                    setSelectedAccountId(match._id);
                  }
                }}
                className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:bg-white"
              />
            )}
            <datalist id="reports-account-list">
              {accounts.map((a) => (
                <option key={a._id} value={a.accountName}>
                  {a.accountCode}
                </option>
              ))}
            </datalist>

            <select
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-800 text-xs"
            >
              <option value="ALL">All Types</option>
              <option value="DEBIT">Unpaid Only</option>
              <option value="CREDIT">Paid Only</option>
            </select>
          </div>
        )}

        <button
          onClick={runReport}
          className="ml-auto px-3.5 py-1.5 bg-slate-900 text-white rounded font-medium hover:bg-slate-800 transition-colors"
        >
          Refresh Report
        </button>
      </div>

      {/* Report Table Display */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs print-container">
        {/* Print Header */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
              {reportType.replace('-', ' ').toUpperCase()} REPORT
            </h3>
            <p className="text-[11px] text-slate-500">
              Al-Rehman Enterprises & Co. • Generated {new Date().toISOString().slice(0, 10)}
            </p>
          </div>
          {reportTotals && (
            <div className="text-right text-xs">
              <span className="text-slate-500 mr-2">Total Movement:</span>
              <span className="font-mono font-bold text-slate-900">
                {formatCurrency(reportTotals.netPaisa || reportTotals.totalDebitPaisa || 0)}
              </span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-semibold">
                {reportRows.length > 0 &&
                  Object.keys(reportRows[0])
                    .filter((k) => !k.startsWith('_') && k !== 'accountId')
                    .map((header) => (
                      <th
                        key={header}
                        className={`py-2 px-3 ${
                          header.toLowerCase().includes('balance') ||
                          header.toLowerCase().includes('debit') ||
                          header.toLowerCase().includes('credit') ||
                          header.toLowerCase().includes('amount')
                            ? 'text-right'
                            : ''
                        }`}
                      >
                        {header}
                      </th>
                    ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    Computing report...
                  </td>
                </tr>
              ) : reportRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-slate-400">
                    No data rows matching report parameters.
                  </td>
                </tr>
              ) : (
                reportRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {Object.entries(row)
                      .filter(([k]) => !k.startsWith('_') && k !== 'accountId')
                      .map(([key, val]: [string, any], colIdx) => {
                        const isMoney =
                          key.toLowerCase().includes('balance') ||
                          key.toLowerCase().includes('debit') ||
                          key.toLowerCase().includes('credit') ||
                          key.toLowerCase().includes('amount');
                        return (
                          <td
                            key={colIdx}
                            className={`py-2 px-3 whitespace-nowrap ${
                              isMoney ? 'text-right font-mono font-medium' : ''
                            } ${
                              key.toLowerCase().includes('debit')
                                ? 'text-rose-600'
                                : key.toLowerCase().includes('credit')
                                ? 'text-emerald-600'
                                : ''
                            }`}
                          >
                            {typeof val === 'number'
                              ? isMoney
                                ? formatCurrency(val * 100)
                                : val
                              : String(val || '—')}
                          </td>
                        );
                      })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showStatementForAccount && (
        <AccountStatementModal
          accountId={showStatementForAccount}
          onClose={() => setShowStatementForAccount(null)}
        />
      )}
    </div>
  );
};
