import React, { useState, useEffect } from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  CreditCard,
  Users,
  Receipt,
  Download,
  Calendar,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import { DashboardSummary, DateRange, Account, Transaction } from '../types';
import { formatCurrency, formatCompactCurrency } from '../utils/currency';
import { getTransactionTypeLabel } from '../utils/labels';
import { exportToCSV, exportToExcel } from '../utils/exportUtils';

interface DashboardViewProps {
  dateRange: DateRange;
  onOpenDateFilter: () => void;
  onNavigateToTransactions: (filters?: { type?: string; dateFrom?: string; dateTo?: string; accountId?: string }) => void;
  onNavigateToAccounts: (filters?: { status?: string; balanceType?: string; lastActivity?: string; paymentStatus?: string }) => void;
  onSelectAccount: (accountId: string) => void;
  onSelectTransaction: (txnId: string) => void;
  onNavigateToAnalytics: (tab?: string) => void;
  onNavigateToReports: (reportId?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  dateRange,
  onOpenDateFilter,
  onNavigateToTransactions,
  onNavigateToAccounts,
  onSelectAccount,
  onSelectTransaction,
  onNavigateToAnalytics,
  onNavigateToReports,
}) => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [trends, setTrends] = useState<any[]>([]);
  const [trendInterval, setTrendInterval] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [tableData, setTableData] = useState<{
    recentTransactions: Transaction[];
    largestDebits: Account[];
    largestCredits: Account[];
    recentlyActive: Account[];
    dormant: (Account & { daysInactive: number })[];
  }>({
    recentTransactions: [],
    largestDebits: [],
    largestCredits: [],
    recentlyActive: [],
    dormant: [],
  });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch summary and trends whenever dateRange changes
  useEffect(() => {
    let mounted = true;
    setIsLoading(true);

    Promise.all([
      fetch(`/api/dashboard/summary?dateFrom=${dateRange.dateFrom}&dateTo=${dateRange.dateTo}`).then((r) => r.json()),
      fetch(`/api/dashboard/trends?dateFrom=${dateRange.dateFrom}&dateTo=${dateRange.dateTo}&interval=${trendInterval}`).then((r) => r.json()),
      fetch('/api/dashboard/tables').then((r) => r.json()),
    ])
      .then(([summaryData, trendsData, tablesData]) => {
        if (mounted) {
          setSummary(summaryData);
          setTrends(trendsData);
          setTableData(tablesData);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        console.error('Error fetching dashboard data:', err);
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [dateRange.dateFrom, dateRange.dateTo, trendInterval]);

  const handleExportSummary = () => {
    if (!summary) return;
    const exportRows = [
      { Metric: 'Reporting Period', Value: `${dateRange.dateFrom} to ${dateRange.dateTo}` },
      { Metric: 'Total Accounts', Value: summary.totalAccounts },
      { Metric: 'Active Accounts', Value: summary.activeAccounts },
      { Metric: 'Period Billed / Unpaid (PKR)', Value: summary.periodDebitPaisa / 100 },
      { Metric: 'Period Paid (PKR)', Value: summary.periodCreditPaisa / 100 },
      { Metric: 'Net Movement (PKR)', Value: summary.netMovementPaisa / 100 },
      { Metric: 'Total Debit Balances (PKR)', Value: summary.totalDebitBalancesPaisa / 100 },
      { Metric: 'Total Credit Balances (PKR)', Value: summary.totalCreditBalancesPaisa / 100 },
      { Metric: 'Net Outstanding Position (PKR)', Value: summary.netOutstandingPositionPaisa / 100 },
      { Metric: 'Transactions in Period', Value: summary.totalTransactions },
      { Metric: 'Transactions Today', Value: summary.transactionsToday },
      { Metric: 'Opening System Position (PKR)', Value: summary.openingSystemPositionPaisa / 100 },
      { Metric: 'Closing System Position (PKR)', Value: summary.closingSystemPositionPaisa / 100 },
    ];
    exportToCSV(exportRows, `Dashboard_Summary_${dateRange.dateFrom}_${dateRange.dateTo}`);
  };

  return (
    <div id="dashboard-view" className="space-y-5 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Top Header & Overview Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Business Overview</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium border border-slate-200">
              Live Ledger
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitor account balances, debit vs credit movements, and transaction ledgers.
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={onOpenDateFilter}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{dateRange.label}</span>
          </button>

          <button
            onClick={handleExportSummary}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* 4 PRIMARY KPI CARDS (Rule: Approximately 4 cards in first row, clean white & subtle border) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Card 1: Total Accounts */}
        <div
          onClick={() => onNavigateToAccounts()}
          className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs hover:border-slate-300 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-medium">Total Accounts</span>
            <Users className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
          </div>
          <div className="text-2xl font-semibold text-slate-900 tracking-tight">
            {isLoading ? '...' : (summary?.totalAccounts || 0).toLocaleString()}
          </div>
          <div className="mt-2 flex items-center text-[11px] text-slate-500">
            <span className="text-emerald-600 font-medium mr-1.5">
              {summary?.activeAccounts || 0} active
            </span>
            <span>• {summary?.accountsActiveToday || 0} active today</span>
          </div>
        </div>

        {/* Card 2: Period Debit */}
        <div
          onClick={() => onNavigateToTransactions({ type: 'DEBIT', dateFrom: dateRange.dateFrom, dateTo: dateRange.dateTo })}
          className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs hover:border-rose-200 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-medium">Period Unpaid (Billed)</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
              Receivable
            </span>
          </div>
          <div className="text-2xl font-semibold text-rose-600 tracking-tight font-mono">
            {isLoading ? '...' : formatCurrency(summary?.periodDebitPaisa || 0)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Inflow to accounts</span>
            <span className="text-slate-400 group-hover:text-slate-700 flex items-center">
              View drilldown <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 3: Period Credit */}
        <div
          onClick={() => onNavigateToTransactions({ type: 'CREDIT', dateFrom: dateRange.dateFrom, dateTo: dateRange.dateTo })}
          className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs hover:border-emerald-200 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-medium">Period Paid</span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
              Payment / Settled
            </span>
          </div>
          <div className="text-2xl font-semibold text-emerald-600 tracking-tight font-mono">
            {isLoading ? '...' : formatCurrency(summary?.periodCreditPaisa || 0)}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Settlement movement</span>
            <span className="text-slate-400 group-hover:text-slate-700 flex items-center">
              View drilldown <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>

        {/* Card 4: Net Movement */}
        <div
          onClick={() => onNavigateToAnalytics('balances')}
          className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs hover:border-slate-300 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-medium">Net Movement</span>
            <TrendingUp className="w-4 h-4 text-slate-400 group-hover:text-slate-600" />
          </div>
          <div className="text-2xl font-semibold text-slate-900 tracking-tight font-mono">
            {isLoading
              ? '...'
              : `${(summary?.netMovementPaisa || 0) >= 0 ? '+' : ''}${formatCurrency(
                  summary?.netMovementPaisa || 0
                )}`}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Period Unpaid − Paid</span>
            <span className="text-slate-400 group-hover:text-slate-700 flex items-center">
              Balance analysis <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </div>
      </div>

      {/* PAYMENT & SETTLEMENT TRACKING BAR (Clean enterprise format) */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div>
            <div className="text-xs font-semibold text-slate-900 tracking-tight flex items-center space-x-2">
              <span className="uppercase tracking-wider">Payment & Settlement Overview</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono font-semibold border border-slate-200">
                {summary?.overallPaidPercentage ?? 0}% Total Cleared
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Live tracking of cumulative billed amounts, payments collected, and remaining unpaid balance
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <button
              onClick={() => onNavigateToAccounts({ paymentStatus: 'HAS_REMAINING' })}
              className="text-[11px] font-semibold text-slate-800 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 px-3 py-1 rounded border border-slate-200 shadow-2xs transition-colors flex items-center space-x-1"
            >
              <span>View Unsettled Accounts</span>
              <ChevronRight className="w-3 h-3 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3.5 text-xs">
          <div>
            <div className="text-slate-500 text-[11px] font-medium">Total Billed (Charges)</div>
            <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
              {formatCurrency(summary?.totalBilledPaisa || 0)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Cumulative invoices & debit transactions</div>
          </div>

          <div>
            <div className="text-emerald-700 text-[11px] font-medium flex items-center justify-between">
              <span>Total Amount Paid</span>
              <span className="font-semibold font-mono text-[11px] text-emerald-800">
                {summary?.overallPaidPercentage ?? 0}%
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-emerald-700 mt-0.5">
              {formatCurrency(summary?.totalPaidPaisa || 0)}
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${summary?.overallPaidPercentage || 0}%` }}
              />
            </div>
          </div>

          <div>
            <div className="text-rose-700 text-[11px] font-medium flex items-center justify-between">
              <span>Remaining Amount Due</span>
              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 border border-rose-200">
                {summary?.unpaidAccountsCount || 0} unpaid • {summary?.partialAccountsCount || 0} partial
              </span>
            </div>
            <div className="text-xl font-bold font-mono text-rose-700 mt-0.5">
              {formatCurrency(summary?.totalRemainingPaisa || 0)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Total outstanding amount yet to be received</div>
          </div>
        </div>
      </div>

      {/* SECONDARY METRIC STRIP (Compact tabular metrics bar with drilldown) */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-3 shadow-2xs grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 text-xs">
        <div
          onClick={() => onNavigateToTransactions({ dateFrom: '2026-09-18', dateTo: '2026-09-18' })}
          className="cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors"
        >
          <div className="text-slate-500 text-[11px]">Transactions Today</div>
          <div className="font-semibold text-slate-900 text-sm font-mono mt-0.5">
            {summary?.transactionsToday || 0}
          </div>
          <div className="text-[10px] text-slate-400">18 Sep 2026</div>
        </div>

        <div
          onClick={() => onNavigateToTransactions({ dateFrom: '2026-09-01', dateTo: '2026-09-30' })}
          className="cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors sm:pl-3"
        >
          <div className="text-slate-500 text-[11px]">This Month Txns</div>
          <div className="font-semibold text-slate-900 text-sm font-mono mt-0.5">
            {summary?.transactionsThisMonth || 0}
          </div>
          <div className="text-[10px] text-slate-400">September 2026</div>
        </div>

        <div
          onClick={() => onNavigateToAccounts({ balanceType: 'DEBIT' })}
          className="cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors sm:pl-3"
        >
          <div className="text-slate-500 text-[11px]">Total Unpaid Balances</div>
          <div className="font-semibold text-rose-600 text-sm font-mono mt-0.5">
            {formatCompactCurrency(summary?.totalDebitBalancesPaisa || 0)}
          </div>
          <div className="text-[10px] text-slate-400">Accounts owing funds</div>
        </div>

        <div
          onClick={() => onNavigateToAccounts({ balanceType: 'CREDIT' })}
          className="cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors sm:pl-3"
        >
          <div className="text-slate-500 text-[11px]">Total Paid (Advance) Balances</div>
          <div className="font-semibold text-emerald-600 text-sm font-mono mt-0.5">
            {formatCompactCurrency(summary?.totalCreditBalancesPaisa || 0)}
          </div>
          <div className="text-[10px] text-slate-400">Payable balances</div>
        </div>

        <div
          onClick={() => onNavigateToAnalytics('balances')}
          className="cursor-pointer hover:bg-slate-50 p-1.5 rounded transition-colors sm:pl-3"
        >
          <div className="text-slate-500 text-[11px]">Net Outstanding Position</div>
          <div className="font-semibold text-slate-900 text-sm font-mono mt-0.5">
            {formatCompactCurrency(summary?.netOutstandingPositionPaisa || 0)}
          </div>
          <div className="text-[10px] text-slate-400">Unpaid − Paid total</div>
        </div>

        <div className="p-1.5 sm:pl-3">
          <div className="text-slate-500 text-[11px]">Avg Transaction Value</div>
          <div className="font-semibold text-slate-900 text-sm font-mono mt-0.5">
            {formatCurrency(summary?.avgTransactionValuePaisa || 0)}
          </div>
          <div className="text-[10px] text-slate-400">Selected period</div>
        </div>
      </div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Debit vs Credit Trend with Interval Switcher & Drilldown */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Debit vs Credit Trend</h3>
              <p className="text-[11px] text-slate-500">
                Click any bar or point to drill into underlying transactions.
              </p>
            </div>
            <div className="flex items-center bg-slate-100 p-0.5 rounded border border-slate-200 text-xs">
              {(['daily', 'weekly', 'monthly'] as const).map((intv) => (
                <button
                  key={intv}
                  onClick={() => setTrendInterval(intv)}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                    trendInterval === intv
                      ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {intv.charAt(0).toUpperCase() + intv.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="h-64 w-full">
            {trends.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No transaction data in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trends}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                  onClick={(e: any) => {
                    if (e && e.activePayload && e.activePayload[0]) {
                      const dataPoint = e.activePayload[0].payload;
                      onNavigateToTransactions({
                        dateFrom: dataPoint.date,
                        dateTo: dataPoint.date,
                      });
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `Rs.${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '6px', fontSize: '12px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}
                    formatter={(val: any) => [`Rs. ${Number(val).toLocaleString()}`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Bar dataKey="debit" name="Debit (Material/Receivable)" fill="#e11d48" radius={[2, 2, 0, 0]} cursor="pointer" />
                  <Bar dataKey="credit" name="Credit (Payment/Received)" fill="#059669" radius={[2, 2, 0, 0]} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Cumulative Balance Movement & Activity */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Cumulative Volume & Balance Movement</h3>
              <p className="text-[11px] text-slate-500">Cumulative debit and credit over period</p>
            </div>
            <button
              onClick={() => onNavigateToAnalytics('transactions')}
              className="text-xs text-slate-600 hover:text-slate-900 font-medium flex items-center"
            >
              Analytics <ChevronRight className="w-3 h-3 ml-0.5" />
            </button>
          </div>

          <div className="h-64 w-full">
            {trends.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No transaction data in this period
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trends} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={(v) => `Rs.${v >= 1000000 ? `${(v / 1000000).toFixed(1)}M` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '6px', fontSize: '12px' }}
                    formatter={(val: any) => [`Rs. ${Number(val).toLocaleString()}`, '']}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                  <Area type="monotone" dataKey="cumulativeDebit" name="Cumul. Debit" stroke="#e11d48" fill="#ffe4e6" fillOpacity={0.3} strokeWidth={2} />
                  <Area type="monotone" dataKey="cumulativeCredit" name="Cumul. Credit" stroke="#059669" fill="#d1fae5" fillOpacity={0.3} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* FOUR STRUCTURED TABLES (Compact, dense, professional) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Table 1: Recent Transactions */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recent Transactions</h3>
              <p className="text-[11px] text-slate-500">Latest activity across all accounts</p>
            </div>
            <button
              onClick={() => onNavigateToTransactions()}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center"
            >
              View all <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[11px]">
                  <th className="py-2 px-3 font-medium">Date</th>
                  <th className="py-2 px-3 font-medium">Account</th>
                  <th className="py-2 px-3 font-medium">Description</th>
                  <th className="py-2 px-3 font-medium text-right">Billed</th>
                  <th className="py-2 px-3 font-medium text-right">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {tableData.recentTransactions.slice(0, 6).map((t) => (
                  <tr
                    key={t._id}
                    onClick={() => onSelectTransaction(t._id)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap text-[11px]">{t.date}</td>
                    <td className="py-2 px-3 font-medium text-slate-900 max-w-[130px] truncate">
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
                    <td className="py-2 px-3 text-slate-600 max-w-[150px] truncate" title={t.description}>
                      {t.description}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-rose-600 whitespace-nowrap">
                      {t.type === 'DEBIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-emerald-600 whitespace-nowrap">
                      {t.type === 'CREDIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Largest Balances (Outstandings) */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Largest Balances</h3>
              <p className="text-[11px] text-slate-500">Accounts with largest ledger exposure</p>
            </div>
            <button
              onClick={() => onNavigateToAccounts()}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center"
            >
              All accounts <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[11px]">
                  <th className="py-2 px-3 font-medium">Account</th>
                  <th className="py-2 px-3 font-medium">Code</th>
                  <th className="py-2 px-3 font-medium text-right">Current Balance</th>
                  <th className="py-2 px-3 font-medium text-center">Type</th>
                  <th className="py-2 px-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {tableData.largestDebits.map((acc) => (
                  <tr
                    key={acc._id}
                    onClick={() => onSelectAccount(acc._id)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-medium text-slate-900 max-w-[160px] truncate">{acc.accountName}</td>
                    <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{acc.accountCode}</td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-rose-600 whitespace-nowrap">
                      {formatCurrency(acc.currentBalancePaisa)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-100">
                        Debit
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className="text-slate-400 hover:text-slate-700 text-[11px] font-medium">
                        Account 360 →
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* LOWER TABLES: Recently Active & Inactive/Dormant Monitoring */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Table 3: Recently Active Accounts */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Recently Active Accounts</h3>
              <p className="text-[11px] text-slate-500">Accounts with recent transaction activity</p>
            </div>
            <button
              onClick={() => onNavigateToAccounts({ lastActivity: '7_DAYS' })}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center"
            >
              View active <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[11px]">
                  <th className="py-2 px-3 font-medium">Account</th>
                  <th className="py-2 px-3 font-medium">Last Activity</th>
                  <th className="py-2 px-3 font-medium text-right">Balance</th>
                  <th className="py-2 px-3 font-medium text-center">Total Txns</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {tableData.recentlyActive.map((acc) => (
                  <tr
                    key={acc._id}
                    onClick={() => onSelectAccount(acc._id)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="py-2 px-3 font-medium text-slate-900 max-w-[150px] truncate">{acc.accountName}</td>
                    <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">{acc.lastTransactionDate || '—'}</td>
                    <td className="py-2 px-3 text-right font-mono text-[11px]">
                      <span className={acc.currentBalancePaisa > 0 ? 'text-rose-600' : acc.currentBalancePaisa < 0 ? 'text-emerald-600' : 'text-slate-600'}>
                        {formatCurrency(acc.currentBalancePaisa)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center font-mono text-slate-600 text-[11px]">{acc.totalTransactions || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 4: Inactive / Dormant Accounts (Factual, no judgmental labels) */}
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Inactivity Monitoring</h3>
              <p className="text-[11px] text-slate-500">Accounts with no recorded activity for 30+ days</p>
            </div>
            <button
              onClick={() => onNavigateToAnalytics('activity')}
              className="text-xs font-medium text-slate-600 hover:text-slate-900 flex items-center"
            >
              Inactivity breakdown <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-100 text-[11px]">
                  <th className="py-2 px-3 font-medium">Account</th>
                  <th className="py-2 px-3 font-medium text-right">Holding Balance</th>
                  <th className="py-2 px-3 font-medium text-right">Last Recorded</th>
                  <th className="py-2 px-3 font-medium text-center">Days Inactive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {tableData.dormant.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-slate-400 text-xs">
                      All accounts active within 30 days
                    </td>
                  </tr>
                ) : (
                  tableData.dormant.map((acc) => (
                    <tr
                      key={acc._id}
                      onClick={() => onSelectAccount(acc._id)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-2 px-3 font-medium text-slate-900 max-w-[150px] truncate">{acc.accountName}</td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700 text-[11px]">
                        {formatCurrency(acc.currentBalancePaisa)}
                      </td>
                      <td className="py-2 px-3 text-right text-slate-500 font-mono text-[11px]">
                        {acc.lastTransactionDate || 'None'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                          {acc.daysInactive} days
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
