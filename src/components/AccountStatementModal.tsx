import React, { useState, useEffect } from 'react';
import {
  X,
  Printer,
  Download,
  Calendar,
  Building2,
  Phone,
  MapPin,
  FileSpreadsheet,
} from 'lucide-react';
import { AccountStatement, BusinessSettings, Transaction } from '../types';
import { formatCurrency } from '../utils/currency';
import { exportToExcel, exportToCSV, printDocument } from '../utils/exportUtils';

interface AccountStatementModalProps {
  accountId: string;
  onClose: () => void;
  defaultDateFrom?: string;
  defaultDateTo?: string;
}

export const AccountStatementModal: React.FC<AccountStatementModalProps> = ({
  accountId,
  onClose,
  defaultDateFrom = '2026-01-01',
  defaultDateTo = '2026-09-18',
}) => {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [settings, setSettings] = useState<BusinessSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStatement = () => {
    setIsLoading(true);
    Promise.all([
      fetch(`/api/accounts/${accountId}/statement?dateFrom=${dateFrom}&dateTo=${dateTo}`).then((r) => r.json()),
      fetch('/api/settings').then((r) => r.json()),
    ])
      .then(([stmtData, settData]) => {
        setStatement(stmtData);
        setSettings(settData);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching statement:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchStatement();
  }, [accountId, dateFrom, dateTo]);

  const handleExportExcel = () => {
    if (!statement) return;
    const rows = [
      { Col1: 'Business Name', Col2: settings?.businessName || 'Al-Rehman Enterprises & Co.' },
      { Col1: 'Account Name', Col2: statement.account.accountName },
      { Col1: 'Account Code', Col2: statement.account.accountCode },
      { Col1: 'Period', Col2: `${statement.period.dateFrom} to ${statement.period.dateTo}` },
      { Col1: 'Opening Balance', Col2: statement.openingBalancePaisa / 100 },
      { Col1: '', Col2: '' },
      ...statement.transactions.map((t: Transaction) => ({
        Col1: t.date,
        Col2: t.transactionNumber,
        Col3: t.reference,
        Col4: t.description,
        Col5: t.type === 'DEBIT' ? t.amountPaisa / 100 : '',
        Col6: t.type === 'CREDIT' ? t.amountPaisa / 100 : '',
        Col7: t.balanceAfterPaisa / 100,
      })),
      { Col1: '', Col2: '' },
      { Col1: 'Total Billed (Unpaid)', Col2: statement.periodDebitPaisa / 100 },
      { Col1: 'Total Paid', Col2: statement.periodCreditPaisa / 100 },
      { Col1: 'Closing Balance', Col2: statement.closingBalancePaisa / 100 },
    ];
    exportToCSV(rows, `Statement_${statement.account.accountCode}_${dateFrom}_${dateTo}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-4xl w-full my-auto flex flex-col max-h-[95vh] overflow-hidden">
        {/* Modal Controls Header (Hidden on Print) */}
        <div className="no-print px-5 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-800">Statement Period:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded text-slate-800"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-2 py-1 text-xs bg-white border border-slate-200 rounded text-slate-800"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-50 shadow-2xs flex items-center space-x-1"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => printDocument()}
              className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 shadow-2xs flex items-center space-x-1"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PRINTABLE STATEMENT CONTAINER */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-white print-container">
          {isLoading || !statement ? (
            <div className="py-12 text-center text-xs text-slate-400">
              Generating verified accounting statement...
            </div>
          ) : (
            <div className="space-y-6">
              {/* Business Header */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    {settings?.businessName || 'Al-Rehman Enterprises & Co.'}
                  </h1>
                  <p className="text-xs text-slate-600 mt-0.5">
                    {settings?.address || 'Plot 42, Port Qasim Industrial Zone, Karachi'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Phone: {settings?.phone || '+92 21 3456 7890'} • Email: {settings?.email || 'accounts@alrehman-ent.com'}
                  </p>
                </div>

                <div className="text-right">
                  <div className="text-base font-bold text-slate-900 uppercase tracking-wide">
                    Account Statement
                  </div>
                  <div className="text-xs text-slate-600 font-mono mt-0.5">
                    Period: {statement.period.dateFrom} to {statement.period.dateTo}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Generated: {statement.generatedAt.slice(0, 16).replace('T', ' ')}
                  </div>
                </div>
              </div>

              {/* Account Information Box */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded border border-slate-200 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">
                    Account Details
                  </div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">
                    {statement.account.accountName}
                  </div>
                  <div className="text-slate-600 font-mono text-[11px] mt-0.5">
                    Account Code: {statement.account.accountCode}
                  </div>
                  {statement.account.address && (
                    <div className="text-slate-500 text-[11px] mt-0.5">{statement.account.address}</div>
                  )}
                  {statement.account.phone && (
                    <div className="text-slate-500 text-[11px]">Phone: {statement.account.phone}</div>
                  )}
                </div>

                <div className="text-right flex flex-col justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-semibold tracking-wider text-slate-500">
                      Statement Summary
                    </div>
                    <div className="text-xs text-slate-700 mt-1">
                      Opening Balance:{' '}
                      <span className="font-mono font-semibold">
                        {formatCurrency(statement.openingBalancePaisa)} ({statement.openingBalanceType === 'DEBIT' ? 'Dr' : statement.openingBalanceType === 'CREDIT' ? 'Cr' : 'Nil'})
                      </span>
                    </div>
                    <div className="text-xs text-slate-700">
                      Closing Balance:{' '}
                      <span
                        className={`font-mono font-semibold ${
                          statement.closingBalancePaisa > 0
                            ? 'text-rose-600'
                            : statement.closingBalancePaisa < 0
                            ? 'text-emerald-600'
                            : 'text-slate-700'
                        }`}
                      >
                        {formatCurrency(statement.closingBalancePaisa)} ({statement.closingBalanceType === 'DEBIT' ? 'Dr' : statement.closingBalanceType === 'CREDIT' ? 'Cr' : 'Nil'})
                      </span>
                    </div>

                    {/* Payment breakdown strip */}
                    <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200 text-left">
                      <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
                        <div className="text-[9px] text-slate-500 font-semibold uppercase">Total Billed</div>
                        <div className="font-mono font-bold text-[11px] text-slate-900 mt-0.5">
                          {formatCurrency(statement.totalBilledPaisa ?? (statement.openingBalancePaisa > 0 ? statement.openingBalancePaisa + statement.periodDebitPaisa : statement.periodDebitPaisa))}
                        </div>
                      </div>
                      <div className="bg-emerald-50/70 p-1.5 rounded border border-emerald-200">
                        <div className="text-[9px] text-emerald-700 font-semibold uppercase">Total Paid</div>
                        <div className="font-mono font-bold text-[11px] text-emerald-700 mt-0.5">
                          {formatCurrency(statement.totalPaidPaisa ?? (statement.openingBalancePaisa < 0 ? Math.abs(statement.openingBalancePaisa) + statement.periodCreditPaisa : statement.periodCreditPaisa))}
                        </div>
                      </div>
                      <div className="bg-rose-50/70 p-1.5 rounded border border-rose-200">
                        <div className="text-[9px] text-rose-700 font-semibold uppercase">Remaining Due</div>
                        <div className="font-mono font-bold text-[11px] text-rose-700 mt-0.5">
                          {formatCurrency(statement.remainingAmountPaisa ?? Math.max(0, statement.closingBalancePaisa))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Detailed Ledger Transactions Table */}
              <div>
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 border-b border-slate-300 text-[11px] font-semibold">
                      <th className="py-2 px-2.5">Date</th>
                      <th className="py-2 px-2.5">Txn #</th>
                      <th className="py-2 px-2.5">Reference</th>
                      <th className="py-2 px-2.5">Description</th>
                      <th className="py-2 px-2.5 text-right">Billed (PKR)</th>
                      <th className="py-2 px-2.5 text-right">Paid (PKR)</th>
                      <th className="py-2 px-2.5 text-right">Balance (PKR)</th>
                      <th className="py-2 px-2.5 text-center">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800 font-normal">
                    {/* Opening Balance Row */}
                    <tr className="bg-slate-50/70 font-semibold text-slate-900">
                      <td className="py-2 px-2.5 font-mono text-[11px]">{statement.period.dateFrom}</td>
                      <td className="py-2 px-2.5 font-mono text-[11px] text-slate-500">—</td>
                      <td className="py-2 px-2.5 font-mono text-[11px] text-slate-500">—</td>
                      <td className="py-2 px-2.5">OPENING BALANCE B/F</td>
                      <td className="py-2 px-2.5 text-right font-mono text-slate-400">—</td>
                      <td className="py-2 px-2.5 text-right font-mono text-slate-400">—</td>
                      <td className="py-2 px-2.5 text-right font-mono">
                        {formatCurrency(statement.openingBalancePaisa, false)}
                      </td>
                      <td className="py-2 px-2.5 text-center text-[10px] uppercase font-bold text-slate-600">
                        {statement.openingBalanceType === 'DEBIT' ? 'Dr' : statement.openingBalanceType === 'CREDIT' ? 'Cr' : 'Nil'}
                      </td>
                    </tr>

                    {/* Period Transaction Rows */}
                    {statement.transactions.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                          No transactions recorded during this statement period.
                        </td>
                      </tr>
                    ) : (
                      statement.transactions.map((t: Transaction) => (
                        <tr key={t._id}>
                          <td className="py-2 px-2.5 font-mono whitespace-nowrap text-[11px] text-slate-600">
                            {t.date}
                          </td>
                          <td className="py-2 px-2.5 font-mono whitespace-nowrap text-[11px] text-slate-500">
                            {t.transactionNumber}
                          </td>
                          <td className="py-2 px-2.5 font-mono whitespace-nowrap text-[11px] text-slate-600">
                            {t.reference || '—'}
                          </td>
                          <td className="py-2 px-2.5 max-w-[240px]">
                            <div className="font-medium text-slate-900">{t.description}</div>
                            {t.notes && <div className="text-[10px] text-slate-400">{t.notes}</div>}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono text-rose-600 whitespace-nowrap font-medium">
                            {t.type === 'DEBIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono text-emerald-600 whitespace-nowrap font-medium">
                            {t.type === 'CREDIT' ? formatCurrency(t.amountPaisa, false) : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold text-slate-900 whitespace-nowrap">
                            {formatCurrency(t.balanceAfterPaisa, false)}
                          </td>
                          <td className="py-2 px-2.5 text-center text-[10px] font-semibold text-slate-500">
                            {t.balanceAfterType === 'DEBIT' ? 'Dr' : t.balanceAfterType === 'CREDIT' ? 'Cr' : 'Nil'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Statement Summary Box */}
              <div className="border-t-2 border-slate-900 pt-4 flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="text-xs text-slate-500 max-w-sm">
                  <p className="font-semibold text-slate-700">Notice to Account Holder:</p>
                  <p className="text-[11px] mt-0.5 leading-relaxed">
                    {settings?.reportFooter ||
                      'Please examine this statement promptly. If any discrepancy is discovered, notify our accounts department immediately.'}
                  </p>
                </div>

                <div className="w-full sm:w-72 bg-slate-50 border border-slate-200 rounded p-3 text-xs space-y-1.5">
                  <div className="flex justify-between text-slate-600">
                    <span>Total Period Billed:</span>
                    <span className="font-mono font-semibold text-rose-600">
                      {formatCurrency(statement.periodDebitPaisa)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Total Period Paid:</span>
                    <span className="font-mono font-semibold text-emerald-600">
                      {formatCurrency(statement.periodCreditPaisa)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Net Movement:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatCurrency(statement.netMovementPaisa)}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
                    <span>Closing Balance:</span>
                    <span className="font-mono text-slate-900">
                      {formatCurrency(statement.closingBalancePaisa)}
                    </span>
                  </div>
                  <div className="text-right text-[10px] font-semibold uppercase text-slate-500">
                    {statement.closingBalanceType}
                  </div>
                </div>
              </div>

              {/* Signatures */}
              <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs text-slate-500">
                <div>
                  <div className="w-48 mx-auto border-b border-slate-300 mb-1" />
                  <span>Prepared By (Accounts)</span>
                </div>
                <div>
                  <div className="w-48 mx-auto border-b border-slate-300 mb-1" />
                  <span>Verified / Authorized Signature</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
