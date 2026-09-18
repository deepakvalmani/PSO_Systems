import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Calendar,
  Bell,
  User,
  Check,
  ChevronDown,
  ArrowRight,
  Receipt,
  UserCircle2,
  LogOut,
} from 'lucide-react';
import { DateFilterPreset, DateRange, Account, Transaction } from '../types';
import { formatDisplayDate } from '../utils/dateRanges';
import { formatCurrency } from '../utils/currency';

interface TopBarProps {
  pageTitle: string;
  dateRange: DateRange;
  onOpenDateFilter: () => void;
  onSelectAccount: (accountId: string) => void;
  onSelectTransaction: (txnId: string) => void;
  userRole: 'OPERATOR' | 'MANAGER';
  onToggleRole: (role: 'OPERATOR' | 'MANAGER') => void;
  organizationName?: string;
  username?: string;
  onLogout?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  pageTitle,
  dateRange,
  onOpenDateFilter,
  onSelectAccount,
  onSelectTransaction,
  userRole,
  onToggleRole,
  organizationName,
  username,
  onLogout,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ accounts: Account[]; transactions: Transaction[] }>({
    accounts: [],
    transactions: [],
  });
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults({ accounts: [], transactions: [] });
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Click outside to close search dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header
      id="main-topbar"
      className="no-print h-14 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shrink-0 z-20"
    >
      {/* Page Title */}
      <div className="flex items-center space-x-3 min-w-0">
        <h1 className="text-lg font-semibold text-slate-900 truncate tracking-tight">{pageTitle}</h1>
      </div>

      {/* Center: Global Search */}
      <div ref={searchRef} className="relative w-72 md:w-96 mx-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search accounts, codes, invoices, refs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => {
              if (searchResults.accounts.length > 0 || searchResults.transactions.length > 0) {
                setShowDropdown(true);
              }
            }}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md placeholder-slate-400 text-slate-900 focus:outline-hidden focus:bg-white focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-colors"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {showDropdown && (
          <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-md shadow-lg max-h-96 overflow-y-auto z-50 divide-y divide-slate-100">
            {searchResults.accounts.length === 0 && searchResults.transactions.length === 0 ? (
              <div className="p-4 text-xs text-slate-500 text-center">No matching records found.</div>
            ) : (
              <>
                {searchResults.accounts.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase px-2 py-1">
                      Accounts
                    </div>
                    {searchResults.accounts.map((acc) => (
                      <button
                        key={acc._id}
                        onClick={() => {
                          setShowDropdown(false);
                          setSearchQuery('');
                          onSelectAccount(acc._id);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-50 flex items-center justify-between text-xs group"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <UserCircle2 className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
                          <div className="truncate">
                            <span className="font-medium text-slate-900">{acc.accountName}</span>
                            <span className="ml-2 text-slate-400 font-mono text-[11px]">{acc.accountCode}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <span
                            className={`font-mono text-[11px] ${
                              acc.currentBalancePaisa > 0
                                ? 'text-rose-600'
                                : acc.currentBalancePaisa < 0
                                ? 'text-emerald-600'
                                : 'text-slate-500'
                            }`}
                          >
                            {formatCurrency(acc.currentBalancePaisa)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {searchResults.transactions.length > 0 && (
                  <div className="p-2">
                    <div className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase px-2 py-1">
                      Transactions
                    </div>
                    {searchResults.transactions.map((t) => (
                      <button
                        key={t._id}
                        onClick={() => {
                          setShowDropdown(false);
                          setSearchQuery('');
                          onSelectTransaction(t._id);
                        }}
                        className="w-full text-left px-2.5 py-1.5 rounded hover:bg-slate-50 flex items-center justify-between text-xs group"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <Receipt className="w-4 h-4 text-slate-400 group-hover:text-slate-700" />
                          <div className="truncate">
                            <span className="font-mono text-[11px] text-slate-600 font-medium">{t.transactionNumber}</span>
                            <span className="ml-1.5 text-slate-700">{t.description}</span>
                            <span className="ml-1.5 text-slate-400 text-[11px]">({t.accountName})</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-2 font-mono text-[11px]">
                          <span className={t.type === 'DEBIT' ? 'text-rose-600' : 'text-emerald-600'}>
                            {t.type === 'DEBIT' ? '+' : '-'}
                            {formatCurrency(t.amountPaisa)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="flex items-center space-x-2 md:space-x-3 shrink-0">
        {/* Global Date Filter Trigger */}
        <button
          onClick={onOpenDateFilter}
          className="flex items-center space-x-2 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-2xs"
          title="Change reporting period"
        >
          <Calendar className="w-3.5 h-3.5 text-slate-500" />
          <span className="hidden sm:inline text-slate-800">{dateRange.label}</span>
          <span className="sm:hidden text-slate-800">Date</span>
          <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
        </button>

        {/* Mode / Role Selector Toggle */}
        <div className="hidden lg:flex items-center bg-slate-100 p-0.5 rounded-md border border-slate-200 text-xs">
          <button
            onClick={() => onToggleRole('MANAGER')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
              userRole === 'MANAGER'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Manager / Owner
          </button>
          <button
            onClick={() => onToggleRole('OPERATOR')}
            className={`px-2.5 py-1 rounded text-[11px] font-medium transition-all ${
              userRole === 'OPERATOR'
                ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Data Entry
          </button>
        </div>

        {/* Organization & Profile / Logout */}
        <div className="flex items-center space-x-2 border-l border-slate-200 pl-2">
          {organizationName && (
            <span className="hidden md:inline text-[11px] font-medium text-slate-500 truncate max-w-[140px]" title={organizationName}>
              {organizationName}
            </span>
          )}
          <div
            className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 text-xs font-semibold"
            title={username}
          >
            {(username || 'U').slice(0, 2).toUpperCase()}
          </div>
          {onLogout && (
            <button
              onClick={onLogout}
              title="Logout"
              className="p-1.5 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
