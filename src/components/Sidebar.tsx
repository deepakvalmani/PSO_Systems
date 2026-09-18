import React from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Users,
  ReceiptText,
  BarChart3,
  FileText,
  History,
  Settings,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Building2,
} from 'lucide-react';

export type NavItem =
  | 'dashboard'
  | 'ledger-entry'
  | 'accounts'
  | 'transactions'
  | 'analytics'
  | 'reports'
  | 'audit-history'
  | 'settings';

interface SidebarProps {
  currentTab: NavItem;
  onNavigate: (tab: NavItem) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  businessName?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onNavigate,
  collapsed,
  onToggleCollapse,
  businessName = 'Al-Rehman Enterprises',
}) => {
  const menuItems: { id: NavItem; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'ledger-entry', label: 'Ledger Entry', icon: PlusCircle },
    { id: 'accounts', label: 'Accounts', icon: Users },
    { id: 'transactions', label: 'Transactions', icon: ReceiptText },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'audit-history', label: 'Audit History', icon: History },
  ];

  return (
    <aside
      id="main-sidebar"
      className={`no-print bg-white border-r border-slate-200 flex flex-col transition-all duration-200 select-none z-30 shrink-0 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      {/* Brand Header */}
      <div className="h-14 px-3.5 border-b border-slate-200 flex items-center justify-between">
        {!collapsed ? (
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white shrink-0 shadow-xs">
              <Building2 className="w-4 h-4 text-slate-100" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate leading-tight">LedgerOne</div>
              <div className="text-[11px] text-slate-600 truncate">{businessName}</div>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded bg-slate-900 flex items-center justify-center text-white mx-auto shadow-xs">
            <Building2 className="w-4 h-4 text-slate-100" />
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          className="p-1 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Main Nav Items */}
      <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center text-left text-sm font-medium rounded-md transition-colors ${
                collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
              } ${
                isActive
                  ? 'bg-slate-100 text-slate-900 font-semibold shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon
                className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4 mr-3'} ${
                  isActive ? 'text-slate-900' : 'text-slate-500'
                }`}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Bottom Section: Settings */}
      <div className="p-2 border-t border-slate-200">
        <button
          onClick={() => onNavigate('settings')}
          title={collapsed ? 'Settings' : undefined}
          className={`w-full flex items-center text-left text-sm font-medium rounded-md transition-colors ${
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2'
          } ${
            currentTab === 'settings'
              ? 'bg-slate-100 text-slate-900 font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Settings
            className={`shrink-0 ${collapsed ? 'w-5 h-5' : 'w-4 h-4 mr-3'} ${
              currentTab === 'settings' ? 'text-slate-900' : 'text-slate-500'
            }`}
          />
          {!collapsed && <span className="truncate">Settings</span>}
        </button>

        {!collapsed && (
          <div className="mt-2 px-3 py-2 rounded bg-slate-50 border border-slate-100 flex items-center space-x-2">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-[11px] text-slate-500 font-mono truncate">Ledger Verified • Paisa Int</span>
          </div>
        )}
      </div>
    </aside>
  );
};
