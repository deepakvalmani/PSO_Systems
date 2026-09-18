import React, { useState, useEffect } from 'react';
import {
  Plus,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  ArrowRight,
  RefreshCw,
  Eye,
  Calendar,
  FileText,
  Clock,
  History,
  Pencil,
} from 'lucide-react';
import { Account, Transaction } from '../types';
import { formatCurrency, pkrToPaisa } from '../utils/currency';
import { AccountTextInput } from './AccountTextInput';
import { getTransactionTypeLabel, getTransactionTypeBadgeStyle } from '../utils/labels';

interface LedgerEntryViewProps {
  preselectedAccountId?: string;
  onTransactionCreated: (newTxn: Transaction) => void;
  onViewAccount: (accountId: string) => void;
  onViewTransaction: (txnId: string) => void;
  onEditTransaction?: (txnId: string) => void;
}

export const LedgerEntryView: React.FC<LedgerEntryViewProps> = ({
  preselectedAccountId,
  onTransactionCreated,
  onViewAccount,
  onViewTransaction,
  onEditTransaction,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(preselectedAccountId || '');
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [date, setDate] = useState<string>('2026-09-18');
  const [reference, setReference] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [type, setType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [amountPkr, setAmountPkr] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successTxn, setSuccessTxn] = useState<Transaction | null>(null);
  const [recentEntries, setRecentEntries] = useState<Transaction[]>([]);

  // Duplicate Warning State
  const [duplicateWarning, setDuplicateWarning] = useState<{
    show: boolean;
    existing: Transaction | null;
  }>({ show: false, existing: null });

  // Load recent entries for quick reference
  const loadRecentEntries = () => {
    fetch('/api/transactions?limit=5&sort=date&order=desc')
      .then((r) => r.json())
      .then((data) => setRecentEntries(data.transactions || []))
      .catch((err) => console.error('Error fetching recent transactions:', err));
  };

  useEffect(() => {
    loadRecentEntries();
  }, []);

  const handleSubmit = async (e?: React.FormEvent, forceSave: boolean = false) => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    if (!selectedAccountId) {
      setErrorMsg('Please enter or select an account.');
      return;
    }
    if (!amountPkr || parseFloat(amountPkr) <= 0) {
      setErrorMsg('Please enter a valid positive amount.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please enter a transaction description.');
      return;
    }

    const amountPaisa = pkrToPaisa(amountPkr);

    // Duplicate check first if not forcing save
    if (!forceSave) {
      try {
        const dupRes = await fetch('/api/transactions/check-duplicate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: selectedAccountId,
            date,
            amountPaisa,
            type,
            description: description.trim(),
          }),
        });
        const dupData = await dupRes.json();
        if (dupData.isDuplicate && dupData.duplicates.length > 0) {
          setDuplicateWarning({
            show: true,
            existing: dupData.duplicates[0],
          });
          return;
        }
      } catch (err) {
        console.warn('Duplicate check skipped:', err);
      }
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          date,
          reference: reference.trim(),
          description: description.trim(),
          type,
          amountPaisa,
          notes: notes.trim(),
          enteredBy: 'operator',
          allowDuplicate: forceSave,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || errData.warning || 'Failed to record transaction');
      }

      const created: Transaction = await res.json();
      setSuccessTxn(created);
      onTransactionCreated(created);

      // Refresh recent list
      loadRecentEntries();

      // Reset transaction fields for rapid subsequent entry, keeping the account ready
      setAmountPkr('');
      setDescription('');
      setReference('');
      setNotes('');
      setDuplicateWarning({ show: false, existing: null });
    } catch (err: any) {
      setErrorMsg(err.message || 'Error recording transaction.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div id="ledger-entry-view" className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">New Ledger Entry</h2>
            <p className="text-xs text-slate-500 mt-1">
              Direct voucher entry with live ledger recalculation and duplicate protection.
            </p>
          </div>
          <span className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-mono font-medium text-slate-600 bg-slate-100 border border-slate-200">
            <span>Date: {date}</span>
          </span>
        </div>
      </div>

      {/* Duplicate Warning Modal / Banner */}
      {duplicateWarning.show && duplicateWarning.existing && (
        <div className="bg-amber-50/80 border border-amber-300 rounded-lg p-4 text-xs">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1 text-slate-800 space-y-2">
              <div className="font-semibold text-sm text-amber-900">
                Potential Duplicate Entry Detected
              </div>
              <p className="text-slate-700 leading-relaxed">
                An entry matching this amount ({formatCurrency(duplicateWarning.existing.amountPaisa)} {getTransactionTypeLabel(duplicateWarning.existing.type)}) on {duplicateWarning.existing.date} with description &quot;{duplicateWarning.existing.description}&quot; is already recorded as{' '}
                <span className="font-mono font-semibold">{duplicateWarning.existing.transactionNumber}</span>.
              </p>
              <div className="flex items-center space-x-3 pt-1">
                <button
                  type="button"
                  onClick={() => onViewTransaction(duplicateWarning.existing!._id)}
                  className="px-3 py-1.5 bg-white border border-slate-300 rounded-md font-medium text-slate-800 hover:bg-slate-50 transition-colors shadow-2xs"
                >
                  Inspect Existing
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(undefined, true)}
                  disabled={isSubmitting}
                  className="px-3 py-1.5 bg-amber-800 text-white rounded-md font-medium hover:bg-amber-900 transition-colors shadow-2xs"
                >
                  Save Anyway
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateWarning({ show: false, existing: null })}
                  className="px-2 py-1.5 text-slate-600 hover:text-slate-900 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {successTxn && (
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-4 text-xs text-emerald-950 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
            <div>
              <span className="font-mono font-semibold">{successTxn.transactionNumber}</span> recorded for{' '}
              <span className="font-semibold">{successTxn.accountName}</span> ({formatCurrency(successTxn.amountPaisa)} {getTransactionTypeLabel(successTxn.type)}).
              Updated Balance: <span className="font-mono font-semibold">{formatCurrency(successTxn.balanceAfterPaisa)}</span> ({successTxn.balanceAfterType === 'DEBIT' ? 'Dr' : 'Cr'}).
            </div>
          </div>
          <button
            onClick={() => onViewAccount(successTxn.accountId)}
            className="text-emerald-800 hover:text-emerald-950 font-medium underline shrink-0 ml-3"
          >
            View Account Ledger →
          </button>
        </div>
      )}

      {/* Error Notification */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-3.5 text-xs text-rose-800 flex items-center space-x-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <form onSubmit={(e) => handleSubmit(e, false)} className="p-5 md:p-7 space-y-5">
          {/* 1. Account Input (Enter Text System - No Dropdown) */}
          <AccountTextInput
            selectedAccountId={selectedAccountId}
            onSelectAccount={(acc) => {
              setSelectedAccount(acc);
              setSelectedAccountId(acc ? acc._id : '');
            }}
            onViewAccount={onViewAccount}
            label="Account Name"
            placeholder="Type account name or code to search or enter..."
            required
            allowCreateNew={true}
          />

          {/* 2. Date and Reference in 2-col clean grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5 tracking-tight">
                Transaction Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors shadow-2xs font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5 tracking-tight">
                Reference / Invoice / Voucher #
              </label>
              <input
                type="text"
                placeholder="e.g. INV-4029, CHQ-882, VR-12"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors shadow-2xs font-mono"
              />
            </div>
          </div>

          {/* 3. Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-800 mb-1.5 tracking-tight">
              Description / Particulars <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Commercial goods supply, cash received, site delivery challan..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors shadow-2xs font-medium"
            />
          </div>

          {/* 4. Type (Segmented Switch) & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5 tracking-tight">
                Transaction Type <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setType('DEBIT')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all text-center ${
                    type === 'DEBIT'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span>Unpaid</span>
                  <span className="block text-[10px] font-normal opacity-80 mt-0.5">Receivable / Charge</span>
                </button>
                <button
                  type="button"
                  onClick={() => setType('CREDIT')}
                  className={`py-2.5 px-3 rounded-lg text-xs font-semibold border transition-all text-center ${
                    type === 'CREDIT'
                      ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span>Paid</span>
                  <span className="block text-[10px] font-normal opacity-80 mt-0.5">Payment / Credit</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-800 mb-1.5 tracking-tight">
                Amount (PKR) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-medium text-slate-500">
                  Rs.
                </span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amountPkr}
                  onChange={(e) => setAmountPkr(e.target.value)}
                  required
                  className="w-full pl-11 pr-3 py-2.5 text-base bg-white border border-slate-300 rounded-lg text-slate-900 focus:outline-hidden focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors shadow-2xs font-mono font-semibold"
                />
              </div>

              {/* Quick Fill Remaining Due for CREDIT/Payment */}
              {type === 'CREDIT' && selectedAccount && ((selectedAccount.remainingAmountPaisa || 0) > 0 || selectedAccount.currentBalancePaisa > 0) && (
                <div className="mt-1.5 flex items-center justify-between text-xs bg-emerald-50/50 border border-emerald-200/80 px-2 py-1 rounded-md">
                  <span className="text-[11px] text-slate-600">
                    Remaining Due:{' '}
                    <span className="font-mono font-bold text-rose-700">
                      {formatCurrency(selectedAccount.remainingAmountPaisa || selectedAccount.currentBalancePaisa)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const duePaisa = selectedAccount.remainingAmountPaisa || selectedAccount.currentBalancePaisa;
                      setAmountPkr((duePaisa / 100).toFixed(2));
                      if (!description) {
                        setDescription('Payment settlement against outstanding balance');
                      }
                    }}
                    className="text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 px-2 py-0.5 rounded shadow-2xs transition-colors"
                  >
                    Pay Full Remaining
                  </button>
                </div>
              )}

              {amountPkr && !isNaN(parseFloat(amountPkr)) && parseFloat(amountPkr) > 0 && (
                <div className="mt-1 text-[11px] text-slate-500 font-mono text-right">
                  {parseFloat(amountPkr).toLocaleString('en-US', { minimumFractionDigits: 2 })} PKR
                </div>
              )}
            </div>
          </div>

          {/* 5. Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1 tracking-tight">
              Internal Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Delivered by driver Rashid, challan signed by site manager..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors shadow-2xs"
            />
          </div>

          {/* Action Row */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setAmountPkr('');
                setDescription('');
                setReference('');
                setNotes('');
                setErrorMsg(null);
              }}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Clear Form
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-all shadow-xs flex items-center space-x-2 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Recording...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Record Transaction</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Recent Entries Section (Immediate Feedback, Clean Tabular View) */}
      {recentEntries.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-2xs p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <History className="w-4 h-4 text-slate-500" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Recently Recorded Entries
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Last 5 vouchers</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs divide-y divide-slate-100">
              <thead>
                <tr className="text-[11px] text-slate-500 uppercase tracking-wider">
                  <th className="py-2 pr-3 font-semibold">Txn #</th>
                  <th className="py-2 px-3 font-semibold">Date</th>
                  <th className="py-2 px-3 font-semibold">Account</th>
                  <th className="py-2 px-3 font-semibold">Description</th>
                  <th className="py-2 px-3 font-semibold text-center">Type</th>
                  <th className="py-2 pl-3 font-semibold text-right">Amount</th>
                  <th className="py-2 pl-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentEntries.map((txn) => (
                  <tr key={txn._id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 pr-3 font-mono font-medium text-slate-700">
                      {txn.transactionNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">{txn.date}</td>
                    <td className="py-2.5 px-3">
                      <button
                        onClick={() => onViewAccount(txn.accountId)}
                        className="font-medium text-slate-900 hover:underline text-left truncate max-w-[150px] block"
                      >
                        {txn.accountName}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 truncate max-w-[200px]">
                      {txn.description}
                      {txn.reference && (
                        <span className="ml-1.5 font-mono text-[11px] text-slate-400">
                          [{txn.reference}]
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${getTransactionTypeBadgeStyle(txn.type)}`}
                      >
                        {getTransactionTypeLabel(txn.type)}
                      </span>
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono font-medium text-slate-900">
                      {formatCurrency(txn.amountPaisa)}
                    </td>
                    <td className="py-2.5 pl-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onViewTransaction(txn._id)}
                          className="text-slate-500 hover:text-slate-900 font-medium inline-flex items-center space-x-1"
                        >
                          <span>View</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                        {onEditTransaction && (
                          <button
                            onClick={() => onEditTransaction(txn._id)}
                            title="Edit transaction"
                            className="text-slate-500 hover:text-slate-900 inline-flex items-center p-0.5 rounded hover:bg-slate-100"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
