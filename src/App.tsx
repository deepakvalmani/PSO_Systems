import React, { useState, useEffect } from 'react';
import { Sidebar, NavItem } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/DashboardView';
import { LedgerEntryView } from './components/LedgerEntryView';
import { AccountsView } from './components/AccountsView';
import { Account360View } from './components/Account360View';
import { TransactionsView } from './components/TransactionsView';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { AnalyticsView } from './components/AnalyticsView';
import { ReportsView } from './components/ReportsView';
import { AuditHistoryView } from './components/AuditHistoryView';
import { SettingsView } from './components/SettingsView';
import { DateFilterModal } from './components/DateFilterModal';
import { DateRange, Transaction, BusinessSettings, PublicUser, Organization } from './types';
import { getDateRangeFromPreset } from './utils/dateRanges';

interface AppProps {
  currentUser?: PublicUser;
  organization?: Organization | null;
}

export default function App({ currentUser, organization }: AppProps) {
  const [currentTab, setCurrentTab] = useState<NavItem>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<'OPERATOR' | 'MANAGER'>('MANAGER');

  // Global Date Range Filter (Default This Month: Sep 1, 2026 to Sep 18, 2026)
  const [dateRange, setDateRange] = useState<DateRange>(() =>
    getDateRangeFromPreset('THIS_MONTH')
  );
  const [isDateModalOpen, setIsDateModalOpen] = useState(false);

  // Account 360 drilldown state
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Pre-filled Entry Account
  const [entryPreselectedAccountId, setEntryPreselectedAccountId] = useState<string | undefined>(undefined);

  // Drilldown filters for Transactions & Accounts
  const [transactionFilters, setTransactionFilters] = useState<{
    type?: string;
    dateFrom?: string;
    dateTo?: string;
    accountId?: string;
  } | undefined>(undefined);

  const [accountFilters, setAccountFilters] = useState<{
    status?: string;
    balanceType?: string;
    lastActivity?: string;
  } | undefined>(undefined);

  const [analyticsSubTab, setAnalyticsSubTab] = useState<string | undefined>(undefined);

  // Active Transaction for Inspection Modal
  const [inspectedTxn, setInspectedTxn] = useState<Transaction | null>(null);
  const [inspectedTxnEditMode, setInspectedTxnEditMode] = useState(false);

  // Business Profile Info for Brand Display
  const [businessSettings, setBusinessSettings] = useState<BusinessSettings | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => setBusinessSettings(data))
      .catch((err) => console.error('Error fetching settings in App:', err));
  }, []);

  const handleSelectTransactionById = async (txnId: string, editMode: boolean = false) => {
    try {
      const res = await fetch(`/api/transactions/${txnId}`);
      if (res.ok) {
        const txn = await res.json();
        setInspectedTxn(txn);
        setInspectedTxnEditMode(editMode);
      }
    } catch (err) {
      console.error('Error opening transaction modal:', err);
    }
  };

  const pageTitleMap: Record<NavItem, string> = {
    dashboard: 'Business Overview',
    'ledger-entry': 'Ledger Entry',
    accounts: selectedAccountId ? 'Account 360' : 'Accounts Directory',
    transactions: 'Transactions Explorer',
    analytics: 'Financial Intelligence',
    reports: 'Reports & Statements',
    'audit-history': 'Audit History & Logs',
    settings: 'System Settings',
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 select-text">
      {/* Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onNavigate={(tab) => {
          setCurrentTab(tab);
          if (tab === 'accounts') {
            setSelectedAccountId(null);
            setAccountFilters(undefined);
          }
          if (tab === 'transactions') {
            setTransactionFilters(undefined);
          }
        }}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        businessName={businessSettings?.businessName || organization?.name}
      />

      {/* Right Main Container */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <TopBar
          pageTitle={pageTitleMap[currentTab]}
          dateRange={dateRange}
          onOpenDateFilter={() => setIsDateModalOpen(true)}
          onSelectAccount={(accId) => {
            setSelectedAccountId(accId);
            setCurrentTab('accounts');
          }}
          onSelectTransaction={(txnId) => handleSelectTransactionById(txnId)}
          userRole={userRole}
          onToggleRole={(role) => {
            setUserRole(role);
            if (role === 'OPERATOR') {
              setCurrentTab('ledger-entry');
            }
          }}
          organizationName={organization?.name}
          username={currentUser?.username}
          onLogout={async () => {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            window.location.href = '/login';
          }}
        />

        {/* Dynamic Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50">
          {currentTab === 'dashboard' && (
            <DashboardView
              dateRange={dateRange}
              onOpenDateFilter={() => setIsDateModalOpen(true)}
              onNavigateToTransactions={(filters) => {
                setTransactionFilters(filters);
                setCurrentTab('transactions');
              }}
              onNavigateToAccounts={(filters) => {
                setAccountFilters(filters);
                setSelectedAccountId(null);
                setCurrentTab('accounts');
              }}
              onSelectAccount={(accId) => {
                setSelectedAccountId(accId);
                setCurrentTab('accounts');
              }}
              onSelectTransaction={(txnId) => handleSelectTransactionById(txnId)}
              onNavigateToAnalytics={(tab) => {
                setAnalyticsSubTab(tab);
                setCurrentTab('analytics');
              }}
              onNavigateToReports={(reportId) => {
                setCurrentTab('reports');
              }}
            />
          )}

          {currentTab === 'ledger-entry' && (
            <LedgerEntryView
              preselectedAccountId={entryPreselectedAccountId}
              onTransactionCreated={(newTxn) => {
                // Keep operator on entry view, ready for next voucher
              }}
              onViewAccount={(accId) => {
                setSelectedAccountId(accId);
                setCurrentTab('accounts');
              }}
              onViewTransaction={(txnId) => handleSelectTransactionById(txnId)}
              onEditTransaction={(txnId) => handleSelectTransactionById(txnId, true)}
            />
          )}

          {currentTab === 'accounts' && (
            <>
              {selectedAccountId ? (
                <Account360View
                  accountId={selectedAccountId}
                  onBack={() => setSelectedAccountId(null)}
                  onOpenLedgerEntry={(accId) => {
                    setEntryPreselectedAccountId(accId);
                    setCurrentTab('ledger-entry');
                  }}
                  onSelectTransaction={(txnId) => handleSelectTransactionById(txnId)}
                  onEditTransaction={(txnId) => handleSelectTransactionById(txnId, true)}
                />
              ) : (
                <AccountsView
                  initialFilters={accountFilters}
                  onSelectAccount={(accId) => setSelectedAccountId(accId)}
                  onOpenLedgerEntryForAccount={(accId) => {
                    setEntryPreselectedAccountId(accId);
                    setCurrentTab('ledger-entry');
                  }}
                />
              )}
            </>
          )}

          {currentTab === 'transactions' && (
            <TransactionsView
              initialFilters={transactionFilters}
              onSelectAccount={(accId) => {
                setSelectedAccountId(accId);
                setCurrentTab('accounts');
              }}
              onOpenLedgerEntry={(accId) => {
                setEntryPreselectedAccountId(accId);
                setCurrentTab('ledger-entry');
              }}
            />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsView
              dateRange={dateRange}
              initialTab={analyticsSubTab}
              onSelectAccount={(accId) => {
                setSelectedAccountId(accId);
                setCurrentTab('accounts');
              }}
              onNavigateToTransactions={(filters) => {
                setTransactionFilters(filters);
                setCurrentTab('transactions');
              }}
            />
          )}

          {currentTab === 'reports' && (
            <ReportsView
              onSelectAccount={(accId) => {
                setSelectedAccountId(accId);
                setCurrentTab('accounts');
              }}
            />
          )}

          {currentTab === 'audit-history' && <AuditHistoryView />}

          {currentTab === 'settings' && (
            <SettingsView
              onSettingsUpdated={(updated) => setBusinessSettings(updated)}
            />
          )}
        </main>
      </div>

      {/* Global Date Filter Modal */}
      <DateFilterModal
        isOpen={isDateModalOpen}
        currentRange={dateRange}
        onClose={() => setIsDateModalOpen(false)}
        onApplyRange={(newRange) => setDateRange(newRange)}
      />

      {/* Global Transaction Inspection Modal */}
      {inspectedTxn && (
        <TransactionDetailModal
          transaction={inspectedTxn}
          initialEditMode={inspectedTxnEditMode}
          onClose={() => {
            setInspectedTxn(null);
            setInspectedTxnEditMode(false);
          }}
          onTransactionUpdated={(updated) => {
            setInspectedTxn(updated);
          }}
          onViewAccount={(accId) => {
            setInspectedTxn(null);
            setSelectedAccountId(accId);
            setCurrentTab('accounts');
          }}
        />
      )}
    </div>
  );
}
