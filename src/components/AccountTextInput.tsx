import React, { useState, useEffect, useRef } from 'react';
import { Search, User, X, Plus, ChevronDown, Check, ArrowRight, Building2 } from 'lucide-react';
import { Account } from '../types';
import { formatCurrency } from '../utils/currency';

interface AccountTextInputProps {
  selectedAccountId?: string;
  onSelectAccount: (account: Account | null) => void;
  onViewAccount?: (accountId: string) => void;
  required?: boolean;
  label?: string;
  placeholder?: string;
  allowCreateNew?: boolean;
  className?: string;
}

export const AccountTextInput: React.FC<AccountTextInputProps> = ({
  selectedAccountId,
  onSelectAccount,
  onViewAccount,
  required = false,
  label = 'Account',
  placeholder = 'Type account name or code (e.g. Akbar, ACC-000001)...',
  allowCreateNew = true,
  className = '',
}) => {
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isCreating, setIsCreating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load all accounts
  useEffect(() => {
    fetch('/api/accounts?limit=300')
      .then((r) => r.json())
      .then((data) => {
        setAllAccounts(data.accounts || []);
      })
      .catch((err) => console.error('Failed to load accounts:', err));
  }, []);

  // Sync input value when selectedAccountId prop changes
  useEffect(() => {
    if (selectedAccountId && allAccounts.length > 0) {
      const match = allAccounts.find((a) => a._id === selectedAccountId);
      if (match) {
        setInputValue(match.accountName);
      }
    } else if (!selectedAccountId) {
      setInputValue('');
    }
  }, [selectedAccountId, allAccounts]);

  const selectedAccount = allAccounts.find((a) => a._id === selectedAccountId);

  // Filter accounts based on input
  const query = inputValue.trim().toLowerCase();
  const filteredAccounts = query
    ? allAccounts.filter(
        (a) =>
          a.accountName.toLowerCase().includes(query) ||
          a.accountCode.toLowerCase().includes(query) ||
          (a.phone && a.phone.toLowerCase().includes(query))
      )
    : allAccounts;

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        // If user typed something but didn't select an existing account, reset or keep selected
        if (selectedAccount) {
          setInputValue(selectedAccount.accountName);
        }
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [selectedAccount]);

  const handleSelect = (account: Account) => {
    setInputValue(account.accountName);
    onSelectAccount(account);
    setIsOpen(false);
  };

  const handleClear = () => {
    setInputValue('');
    onSelectAccount(null);
    setIsOpen(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleQuickCreate = async (nameToCreate: string) => {
    if (!nameToCreate.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountName: nameToCreate.trim(),
          openingBalancePaisa: 0,
          status: 'ACTIVE',
        }),
      });
      if (res.ok) {
        const newAcc: Account = await res.json();
        setAllAccounts((prev) => [newAcc, ...prev]);
        handleSelect(newAcc);
      }
    } catch (err) {
      console.error('Quick account creation failed:', err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const max = filteredAccounts.length + (allowCreateNew && query ? 1 : 0);
      setActiveIndex((prev) => (prev + 1 < max ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const max = filteredAccounts.length + (allowCreateNew && query ? 1 : 0);
      setActiveIndex((prev) => (prev - 1 >= 0 ? prev - 1 : max - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredAccounts.length > 0 && activeIndex < filteredAccounts.length) {
        handleSelect(filteredAccounts[activeIndex]);
      } else if (allowCreateNew && query) {
        handleQuickCreate(inputValue);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const exactMatchExists = allAccounts.some(
    (a) => a.accountName.toLowerCase() === query
  );

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-slate-800 tracking-tight">
            {label} {required && <span className="text-rose-500">*</span>}
          </label>
          <span className="text-[11px] text-slate-500 font-normal">
            Type name or code
          </span>
        </div>
      )}

      {/* Input box */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <Search className="w-4 h-4" />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
            setActiveIndex(0);
            if (!e.target.value && selectedAccount) {
              onSelectAccount(null);
            }
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required && !selectedAccount}
          autoComplete="off"
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-white border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-500 focus:outline-hidden focus:border-slate-800 focus:ring-1 focus:ring-slate-800 transition-colors shadow-2xs font-medium"
        />

        {inputValue && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-800 transition-colors"
            title="Clear account selection"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Floating Autocomplete Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-lg shadow-xl max-h-72 overflow-y-auto z-50 divide-y divide-slate-100">
          {filteredAccounts.length > 0 ? (
            <div className="p-1.5 space-y-0.5">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Matching Accounts ({filteredAccounts.length})
              </div>
              {filteredAccounts.slice(0, 10).map((acc, idx) => {
                const isSelected = selectedAccountId === acc._id;
                const isHighlighted = activeIndex === idx;

                const isDebit = acc.currentBalancePaisa > 0;
                const isCredit = acc.currentBalancePaisa < 0;

                return (
                  <div
                    key={acc._id}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => handleSelect(acc)}
                    className={`px-3 py-2 rounded-md cursor-pointer flex items-center justify-between text-xs transition-colors ${
                      isHighlighted
                        ? 'bg-slate-100 text-slate-900'
                        : isSelected
                        ? 'bg-slate-50 text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-900 text-sm">
                          {acc.accountName}
                        </span>
                        <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                          {acc.accountCode}
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-slate-800" />}
                      </div>
                      {(acc.phone || acc.address) && (
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {[acc.phone, acc.address].filter(Boolean).join(' • ')}
                        </div>
                      )}
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <div
                        className={`font-mono font-medium text-xs ${
                          isDebit
                            ? 'text-rose-700'
                            : isCredit
                            ? 'text-emerald-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {formatCurrency(acc.currentBalancePaisa)}
                        <span className="ml-1 text-[10px] font-semibold px-1 py-0.2 rounded bg-slate-100 text-slate-600">
                          {acc.currentBalanceType === 'DEBIT' ? 'Dr' : acc.currentBalanceType === 'CREDIT' ? 'Cr' : 'Nil'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500">
              No existing account matches &quot;{inputValue}&quot;
            </div>
          )}

          {/* Quick Create option when typed text doesn't exactly match an existing account */}
          {allowCreateNew && query && !exactMatchExists && (
            <div className="p-1.5 bg-slate-50 border-t border-slate-200">
              <button
                type="button"
                onClick={() => handleQuickCreate(inputValue)}
                disabled={isCreating}
                className={`w-full text-left px-3 py-2 rounded-md flex items-center justify-between text-xs font-medium transition-colors ${
                  activeIndex === filteredAccounts.length
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-700 hover:bg-slate-200/70'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Plus className="w-4 h-4 text-slate-600" />
                  <span>
                    Create new account &quot;<span className="font-semibold text-slate-900">{inputValue}</span>&quot;
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">Press Enter</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Clean, Non-Messy Account Metadata Strip when an account is selected */}
      {selectedAccount && (
        <div className="mt-2.5 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-3 min-w-0">
              <div className="w-8 h-8 rounded-md bg-white border border-slate-200 flex items-center justify-center text-slate-700 shrink-0 font-mono font-semibold text-xs shadow-2xs">
                {selectedAccount.accountCode.slice(-3)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-slate-900">{selectedAccount.accountName}</span>
                  <span className="font-mono text-[11px] text-slate-500">{selectedAccount.accountCode}</span>
                  <span className="px-1.5 py-0.2 text-[10px] font-medium rounded bg-emerald-100/80 text-emerald-800">
                    {selectedAccount.status}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 truncate mt-0.5">
                  {[selectedAccount.phone, selectedAccount.address].filter(Boolean).join(' • ') || 'No contact details'}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3 shrink-0 self-end sm:self-center pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200">
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                  Current Balance
                </div>
                <div
                  className={`font-mono font-semibold text-sm ${
                    selectedAccount.currentBalancePaisa > 0
                      ? 'text-rose-700'
                      : selectedAccount.currentBalancePaisa < 0
                      ? 'text-emerald-700'
                      : 'text-slate-700'
                  }`}
                >
                  {formatCurrency(selectedAccount.currentBalancePaisa)}
                  <span className="ml-1 text-[11px] font-normal text-slate-500">
                    ({selectedAccount.currentBalanceType === 'DEBIT' ? 'Dr' : selectedAccount.currentBalanceType === 'CREDIT' ? 'Cr' : 'Nil'})
                  </span>
                </div>
              </div>

              {onViewAccount && (
                <button
                  type="button"
                  onClick={() => onViewAccount(selectedAccount._id)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-md text-slate-700 hover:text-slate-900 hover:bg-slate-100 text-xs font-medium transition-colors flex items-center space-x-1 shadow-2xs"
                  title="View full account ledger & history"
                >
                  <span>History</span>
                  <ArrowRight className="w-3 h-3 text-slate-400" />
                </button>
              )}
            </div>
          </div>

          {/* Payment Status Bar for Account */}
          {(() => {
            const billed = selectedAccount.totalBilledPaisa ?? (selectedAccount.openingBalancePaisa > 0 ? selectedAccount.openingBalancePaisa : 0);
            const paid = selectedAccount.totalPaidPaisa ?? (selectedAccount.openingBalancePaisa < 0 ? Math.abs(selectedAccount.openingBalancePaisa) : 0);
            const remaining = selectedAccount.remainingAmountPaisa ?? Math.max(0, selectedAccount.currentBalancePaisa);
            const pct = selectedAccount.paidPercentage ?? (billed > 0 ? Math.min(100, Math.round((paid / billed) * 100)) : (paid > 0 ? 100 : 0));
            const status = selectedAccount.paymentStatus || (remaining === 0 ? (billed > 0 ? 'PAID_IN_FULL' : 'ZERO') : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID');

            return (
              <div className="pt-2 border-t border-slate-200/80 grid grid-cols-3 gap-2 text-left bg-white/70 p-2 rounded-md border border-slate-200/60">
                <div>
                  <div className="text-[10px] text-slate-500 font-medium uppercase">Total Billed</div>
                  <div className="font-mono font-semibold text-xs text-slate-900 mt-0.5">
                    {formatCurrency(billed)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-700 font-medium uppercase flex items-center justify-between">
                    <span>Total Paid</span>
                    <span className="text-[9px] font-bold">{pct}%</span>
                  </div>
                  <div className="font-mono font-semibold text-xs text-emerald-700 mt-0.5">
                    {formatCurrency(paid)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-rose-700 font-medium uppercase flex items-center justify-between">
                    <span>Remaining Due</span>
                    <span className="text-[9px] font-bold uppercase">{status === 'PAID_IN_FULL' ? 'Cleared' : status === 'PARTIALLY_PAID' ? 'Partial' : status === 'UNPAID' ? 'Due' : 'Advance'}</span>
                  </div>
                  <div className="font-mono font-bold text-xs text-rose-700 mt-0.5">
                    {formatCurrency(remaining)}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};
