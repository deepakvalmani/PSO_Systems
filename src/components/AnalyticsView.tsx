import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart,
  Calendar,
  Users,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  Clock,
  Download,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import { DateRange, Account } from '../types';
import { formatCurrency, formatCompactCurrency } from '../utils/currency';
import { exportToCSV } from '../utils/exportUtils';

interface AnalyticsViewProps {
  dateRange: DateRange;
  initialTab?: string;
  onSelectAccount: (accountId: string) => void;
  onNavigateToTransactions: (filters?: any) => void;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  dateRange,
  initialTab = 'overview',
  onSelectAccount,
  onNavigateToTransactions,
}) => {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'transactions' | 'accounts' | 'balances' | 'activity' | 'comparisons'
  >(
    (initialTab as any) || 'overview'
  );

  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const [comparisonData, setComparisonData] = useState<any>(null);
  const [compPeriodA, setCompPeriodA] = useState('THIS_MONTH');
  const [compPeriodB, setCompPeriodB] = useState('PREVIOUS_MONTH');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    fetch(`/api/analytics/full?dateFrom=${dateRange.dateFrom}&dateTo=${dateRange.dateTo}`)
      .then((r) => r.json())
      .then((data) => {
        setAnalyticsData(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching analytics:', err);
        setIsLoading(false);
      });
  }, [dateRange.dateFrom, dateRange.dateTo]);

  useEffect(() => {
    if (activeTab === 'comparisons') {
      fetch(`/api/analytics/compare?periodA=${compPeriodA}&periodB=${compPeriodB}`)
        .then((r) => r.json())
        .then((data) => setComparisonData(data))
        .catch((err) => console.error('Error fetching comparison:', err));
    }
  }, [activeTab, compPeriodA, compPeriodB]);

  const tabs = [
    { id: 'overview', label: 'System Overview' },
    { id: 'transactions', label: 'Transactions & Trends' },
    { id: 'accounts', label: 'Account Distribution' },
    { id: 'balances', label: 'Outstanding Balances' },
    { id: 'activity', label: 'Inactivity & Dormancy' },
    { id: 'comparisons', label: 'Period Comparisons' },
  ];

  const COLORS = ['#0f172a', '#e11d48', '#059669', '#d97706', '#64748b', '#2563eb'];

  return (
    <div id="analytics-view" className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Financial Intelligence</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Statistical distribution, balance concentration, dormancy monitoring, and period analysis.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs font-mono text-slate-500 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
            {dateRange.dateFrom} → {dateRange.dateTo}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 flex space-x-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-2 text-xs font-semibold border-b-2 transition-colors -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: SYSTEM OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
              <span className="text-xs text-slate-500">Gross Period Movement</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {formatCurrency(
                  (analyticsData?.totalDebitPaisa || 0) + (analyticsData?.totalCreditPaisa || 0)
                )}
              </div>
              <span className="text-[11px] text-slate-400">Total debit + credit turnover</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
              <span className="text-xs text-slate-500">Average Daily Turnover</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-1">
                {formatCurrency(analyticsData?.avgDailyTurnoverPaisa || 0)}
              </div>
              <span className="text-[11px] text-slate-400">Selected date range</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
              <span className="text-xs text-slate-500">Active Accounts Ratio</span>
              <div className="text-xl font-bold font-mono text-emerald-600 mt-1">
                {analyticsData?.activeRatio || '85%'}
              </div>
              <span className="text-[11px] text-slate-400">Active accounts / Total</span>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
              <span className="text-xs text-slate-500">System Net Exposure</span>
              <div className="text-xl font-bold font-mono text-rose-600 mt-1">
                {formatCurrency(analyticsData?.netExposurePaisa || 0)}
              </div>
              <span className="text-[11px] text-slate-400">Net outstanding ledger</span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Debit vs Credit Monthly Distribution</h3>
              <p className="text-[11px] text-slate-500 mb-3">Overall volume breakdown</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analyticsData?.monthlyVolume || []}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `Rs.${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => [`Rs. ${Number(v).toLocaleString()}`, '']} />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="debit" name="Debit" fill="#e11d48" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="credit" name="Credit" fill="#059669" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
              <h3 className="text-sm font-semibold text-slate-900 mb-1">Account Balance Composition</h3>
              <p className="text-[11px] text-slate-500 mb-3">Proportion of accounts with Debit, Credit, or Zero balances</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie
                      data={analyticsData?.balanceComposition || [
                        { name: 'Debit Balances', value: 14 },
                        { name: 'Credit Balances', value: 4 },
                        { name: 'Zero Balances', value: 2 },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, percent }: any) =>
                        percent !== undefined ? `${name}: ${(percent * 100).toFixed(0)}%` : name
                      }
                    >
                      <Cell fill="#e11d48" />
                      <Cell fill="#059669" />
                      <Cell fill="#94a3b8" />
                    </Pie>
                    <Tooltip />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Transaction Size Brackets</h3>
            <p className="text-[11px] text-slate-500 mb-3">Distribution of transaction values</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analyticsData?.sizeBrackets || [
                  { bracket: 'Under 10k', count: 12 },
                  { bracket: '10k - 50k', count: 35 },
                  { bracket: '50k - 200k', count: 48 },
                  { bracket: '200k - 500k', count: 22 },
                  { bracket: '500k+', count: 9 },
                ]}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="bracket" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Transactions Count" fill="#0f172a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACCOUNTS DISTRIBUTION */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Balance Concentration</h3>
            <p className="text-[11px] text-slate-500 mb-3">Accounts holding the highest share of total ledger balances</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px]">
                    <th className="py-2 px-3">Account</th>
                    <th className="py-2 px-3">Code</th>
                    <th className="py-2 px-3 text-right">Balance</th>
                    <th className="py-2 px-3 text-right">% of Total Debit Exposure</th>
                    <th className="py-2 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(analyticsData?.concentration || []).map((c: any) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium text-slate-900">{c.name}</td>
                      <td className="py-2 px-3 font-mono text-slate-500">{c.code}</td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-rose-600">
                        {formatCurrency(c.balancePaisa)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700">{c.percentage}%</td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => onSelectAccount(c.id)}
                          className="text-[11px] text-slate-600 hover:text-slate-900 underline"
                        >
                          View 360 →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: OUTSTANDING BALANCES */}
      {activeTab === 'balances' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Top 5 Debit Balances (Receivables)</h3>
            <div className="divide-y divide-slate-100 text-xs mt-3">
              {(analyticsData?.topDebits || []).map((acc: any) => (
                <div key={acc._id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900 block">{acc.accountName}</span>
                    <span className="font-mono text-[11px] text-slate-400">{acc.accountCode}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-rose-600">
                      {formatCurrency(acc.currentBalancePaisa)}
                    </div>
                    <button
                      onClick={() => onSelectAccount(acc._id)}
                      className="text-[10px] text-slate-400 hover:text-slate-800 underline"
                    >
                      Account 360 →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">Top 5 Credit Balances (Payables)</h3>
            <div className="divide-y divide-slate-100 text-xs mt-3">
              {(analyticsData?.topCredits || []).map((acc: any) => (
                <div key={acc._id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-900 block">{acc.accountName}</span>
                    <span className="font-mono text-[11px] text-slate-400">{acc.accountCode}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-emerald-600">
                      {formatCurrency(acc.currentBalancePaisa)}
                    </div>
                    <button
                      onClick={() => onSelectAccount(acc._id)}
                      className="text-[10px] text-slate-400 hover:text-slate-800 underline"
                    >
                      Account 360 →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: INACTIVITY & DORMANCY */}
      {activeTab === 'activity' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Inactivity & Dormancy Audit</h3>
            <p className="text-[11px] text-slate-500">
              Categorized by calendar days elapsed since last recorded entry.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500">30–60 Days Inactive</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                {analyticsData?.dormancyCounts?.d30 || 2} accounts
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500">60–90 Days Inactive</span>
              <div className="text-xl font-bold font-mono text-slate-900 mt-0.5">
                {analyticsData?.dormancyCounts?.d60 || 1} accounts
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500">90–180 Days Inactive</span>
              <div className="text-xl font-bold font-mono text-amber-700 mt-0.5">
                {analyticsData?.dormancyCounts?.d90 || 1} accounts
              </div>
            </div>
            <div className="p-3 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500">180+ Days Inactive</span>
              <div className="text-xl font-bold font-mono text-rose-700 mt-0.5">
                {analyticsData?.dormancyCounts?.d180 || 0} accounts
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: PERIOD COMPARISONS */}
      {activeTab === 'comparisons' && (
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-2xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Period Comparison Analysis</h3>
              <p className="text-[11px] text-slate-500">Compare turnover and metrics between two timeframes</p>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <span>Period A:</span>
              <select
                value={compPeriodA}
                onChange={(e) => setCompPeriodA(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-800"
              >
                <option value="THIS_MONTH">This Month (Sep 2026)</option>
                <option value="LAST_30_DAYS">Last 30 Days</option>
                <option value="THIS_YEAR">This Year (2026)</option>
              </select>

              <span>vs Period B:</span>
              <select
                value={compPeriodB}
                onChange={(e) => setCompPeriodB(e.target.value)}
                className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-800"
              >
                <option value="PREVIOUS_MONTH">Previous Month (Aug 2026)</option>
                <option value="LAST_YEAR">Previous Year (2025)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div className="p-4 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500">Debit Turnover Difference</span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                {comparisonData?.debitDiff ? formatCurrency(comparisonData.debitDiff) : 'Rs. +450,000.00'}
              </div>
              <span className="text-emerald-600 font-semibold">+18.4% increase</span>
            </div>

            <div className="p-4 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500">Credit Collections Difference</span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                {comparisonData?.creditDiff ? formatCurrency(comparisonData.creditDiff) : 'Rs. +320,000.00'}
              </div>
              <span className="text-emerald-600 font-semibold">+14.2% increase</span>
            </div>

            <div className="p-4 bg-slate-50 rounded border border-slate-200">
              <span className="text-slate-500">Transaction Count Change</span>
              <div className="text-lg font-bold font-mono text-slate-900 mt-1">
                +14 transactions
              </div>
              <span className="text-slate-500">Higher operational throughput</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
