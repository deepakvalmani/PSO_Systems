import React, { useState } from 'react';
import {
  X,
  Edit2,
  Trash2,
  RotateCcw,
  Clock,
  History,
  AlertTriangle,
  Receipt,
  User,
  CheckCircle,
} from 'lucide-react';
import { Transaction } from '../types';
import { formatCurrency, pkrToPaisa } from '../utils/currency';
import { getTransactionTypeLabel, getTransactionTypeOptionLabel, getTransactionTypeStyle } from '../utils/labels';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  onClose: () => void;
  onTransactionUpdated: (updated: Transaction) => void;
  onViewAccount: (accountId: string) => void;
  initialEditMode?: boolean;
}

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  onClose,
  onTransactionUpdated,
  onViewAccount,
  initialEditMode,
}) => {
  if (!transaction) return null;

  const [isEditing, setIsEditing] = useState(initialEditMode ?? false);
  const [editDate, setEditDate] = useState(transaction.date);
  const [editReference, setEditReference] = useState(transaction.reference);
  const [editDescription, setEditDescription] = useState(transaction.description);
  const [editType, setEditType] = useState<'DEBIT' | 'CREDIT'>(transaction.type);
  const [editAmountPkr, setEditAmountPkr] = useState((transaction.amountPaisa / 100).toFixed(2));
  const [editNotes, setEditNotes] = useState(transaction.notes || '');
  const [isSaving, setIsSaving] = useState(false);

  // Soft Delete Modal
  const [showDeletePrompt, setShowDeletePrompt] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const amountPaisa = pkrToPaisa(editAmountPkr);
      const res = await fetch(`/api/transactions/${transaction._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editDate,
          reference: editReference,
          description: editDescription,
          type: editType,
          amountPaisa,
          notes: editNotes,
          modifiedBy: 'management_operator',
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        onTransactionUpdated(updated);
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Error saving transaction edit:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteReason.trim()) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/transactions/${transaction._id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: deleteReason,
          deletedBy: 'management_operator',
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        onTransactionUpdated(updated);
        setShowDeletePrompt(false);
        onClose();
      }
    } catch (err) {
      console.error('Error deleting transaction:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestore = async () => {
    try {
      const res = await fetch(`/api/transactions/${transaction._id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restoredBy: 'management_operator',
        }),
      });

      if (res.ok) {
        const updated = await res.json();
        onTransactionUpdated(updated);
        onClose();
      }
    } catch (err) {
      console.error('Error restoring transaction:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-2xs p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Receipt className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">
              Transaction {transaction.transactionNumber}
            </h3>
            {transaction.isDeleted && (
              <span className="text-[10px] uppercase font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                DELETED
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4 text-xs max-h-[75vh] overflow-y-auto">
          {isEditing ? (
            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Reference</label>
                  <input
                    type="text"
                    value={editReference}
                    onChange={(e) => setEditReference(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  required
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-slate-900 font-medium"
                  >
                    <option value="DEBIT">{getTransactionTypeOptionLabel('DEBIT')}</option>
                    <option value="CREDIT">{getTransactionTypeOptionLabel('CREDIT')}</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Amount (PKR)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editAmountPkr}
                    onChange={(e) => setEditAmountPkr(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-slate-900 font-mono font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-slate-900"
                />
              </div>

              <div className="p-2 bg-amber-50 rounded border border-amber-200 text-[11px] text-amber-800">
                Saving will automatically recalculate running balances for this account and log an immutable audit trail.
              </div>

              <div className="pt-2 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-slate-900 text-white rounded font-medium disabled:opacity-50"
                >
                  {isSaving ? 'Recalculating...' : 'Save & Recalculate'}
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Account Card */}
              <div className="bg-slate-50 p-3 rounded border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">Account</div>
                  <div className="font-semibold text-slate-900 text-sm mt-0.5">
                    {transaction.accountName}
                  </div>
                </div>
                <button
                  onClick={() => {
                    onClose();
                    onViewAccount(transaction.accountId);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100"
                >
                  View Account 360 →
                </button>
              </div>

              {/* Transaction Fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 text-[11px]">Date</span>
                  <div className="font-mono font-medium text-slate-900">{transaction.date}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Reference</span>
                  <div className="font-mono font-medium text-slate-900">
                    {transaction.reference || 'None'}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Type</span>
                  <div className={`font-semibold ${getTransactionTypeStyle(transaction.type)}`}>
                    {getTransactionTypeLabel(transaction.type)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px]">Amount</span>
                  <div className="font-mono font-bold text-sm text-slate-900">
                    {formatCurrency(transaction.amountPaisa)}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-slate-400 text-[11px]">Description</span>
                <div className="text-slate-800 font-medium">{transaction.description}</div>
              </div>

              {transaction.notes && (
                <div>
                  <span className="text-slate-400 text-[11px]">Notes</span>
                  <div className="text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                    {transaction.notes}
                  </div>
                </div>
              )}

              {/* Ledger Balances */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded border border-slate-200 font-mono">
                <div>
                  <span className="text-slate-400 text-[10px] uppercase">Balance Before</span>
                  <div className="font-medium text-slate-700">
                    {formatCurrency(transaction.previousBalancePaisa || 0)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] uppercase">Balance After</span>
                  <div className="font-bold text-slate-900">
                    {formatCurrency(transaction.balanceAfterPaisa)} ({transaction.balanceAfterType === 'DEBIT' ? 'Dr' : transaction.balanceAfterType === 'CREDIT' ? 'Cr' : 'Nil'})
                  </div>
                </div>
              </div>

              {/* Edit History Timeline if any */}
              {transaction.editHistory && transaction.editHistory.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
                    <History className="w-3.5 h-3.5 text-slate-500" />
                    <span>Edit History Audit ({transaction.editHistory.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {transaction.editHistory.map((hist, idx) => {
                      const modTime = hist.modifiedAt || hist.changedAt || '';
                      const modUser = hist.modifiedBy || hist.changedBy || 'system';
                      const modField = hist.field || hist.changedField || 'data';
                      return (
                        <div key={idx} className="bg-slate-50 p-2 rounded text-[11px] text-slate-600 border border-slate-100">
                          <div className="flex justify-between font-mono text-slate-400 text-[10px]">
                            <span>{modTime.slice(0, 16).replace('T', ' ')}</span>
                            <span>by {modUser}</span>
                          </div>
                          <div className="mt-1">
                            Field <span className="font-semibold text-slate-800">{modField}</span> changed:
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">
                            Was: <span className="line-through">{String(hist.oldValue)}</span> → Now:{' '}
                            <span className="text-slate-900 font-medium">{String(hist.newValue)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                {transaction.isDeleted ? (
                  <button
                    onClick={handleRestore}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded hover:bg-emerald-700 font-medium flex items-center space-x-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore Transaction</span>
                  </button>
                ) : (
                  <button
                    onClick={() => setShowDeletePrompt(true)}
                    className="px-3 py-1.5 text-rose-700 hover:bg-rose-50 rounded font-medium flex items-center space-x-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Soft Delete</span>
                  </button>
                )}

                {!transaction.isDeleted && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-1.5 bg-slate-900 text-white rounded hover:bg-slate-800 font-medium flex items-center space-x-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Transaction</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Soft Delete Modal Prompt */}
          {showDeletePrompt && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded text-rose-900 space-y-2">
              <div className="font-semibold text-xs flex items-center space-x-1">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Soft Delete Reason Required</span>
              </div>
              <p className="text-[11px] text-rose-700">
                Accounting integrity mandates transactions cannot be permanently erased. Please provide an audit reason for voiding this transaction:
              </p>
              <input
                type="text"
                placeholder="e.g. Duplicate voucher entered by mistake"
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                className="w-full px-2 py-1 text-xs bg-white border border-rose-300 rounded text-slate-900"
              />
              <div className="flex justify-end space-x-2 pt-1">
                <button
                  onClick={() => setShowDeletePrompt(false)}
                  className="px-2.5 py-1 text-rose-700 hover:underline"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSoftDelete}
                  disabled={!deleteReason.trim() || isDeleting}
                  className="px-3 py-1 bg-rose-700 text-white rounded font-medium disabled:opacity-50"
                >
                  {isDeleting ? 'Voiding...' : 'Confirm Soft Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
