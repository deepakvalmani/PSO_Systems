import React, { useState, useEffect } from 'react';
import {
  History,
  ShieldCheck,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Clock,
  User,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { AuditLog } from '../types';

export const AuditHistoryView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [entityType, setEntityType] = useState('ALL');
  const [actionType, setActionType] = useState('ALL');
  const [search, setSearch] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = () => {
    setIsLoading(true);
    const params = new URLSearchParams();
    if (entityType && entityType !== 'ALL') params.set('entityType', entityType);
    if (actionType && actionType !== 'ALL') params.set('action', actionType);
    if (search) params.set('search', search);
    params.set('page', String(page));
    params.set('limit', String(limit));

    fetch(`/api/audit-logs?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Error loading audit logs:', err);
        setIsLoading(false);
      });
  };

  useEffect(() => {
    fetchLogs();
  }, [page, limit, entityType, actionType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchLogs();
  };

  return (
    <div id="audit-history-view" className="max-w-7xl mx-auto p-4 md:p-6 space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-slate-900" />
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Audit Trail & System Logs</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono">
              Immutable Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Full tamper-evident history of account changes, voucher updates, deletions, and ledger reconciliations.
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-2xs">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative min-w-[200px] flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search user, entity ID, description..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:bg-white"
            />
          </div>

          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-700"
          >
            <option value="ALL">All Entities</option>
            <option value="ACCOUNT">Accounts</option>
            <option value="TRANSACTION">Transactions</option>
            <option value="SYSTEM">System Reconciliations</option>
          </select>

          <select
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value);
              setPage(1);
            }}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded text-slate-700"
          >
            <option value="ALL">All Actions</option>
            <option value="CREATE">CREATE</option>
            <option value="UPDATE">UPDATE</option>
            <option value="SOFT_DELETE">SOFT_DELETE</option>
            <option value="RESTORE">RESTORE</option>
            <option value="RECALCULATE">RECALCULATE</option>
          </select>

          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-900 text-white rounded font-medium hover:bg-slate-800"
          >
            Filter
          </button>
        </form>
      </div>

      {/* Logs Table */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[11px] font-semibold">
                <th className="py-2.5 px-3.5">Timestamp</th>
                <th className="py-2.5 px-3.5">Action</th>
                <th className="py-2.5 px-3.5">Entity</th>
                <th className="py-2.5 px-3.5">Entity ID</th>
                <th className="py-2.5 px-3.5">User</th>
                <th className="py-2.5 px-3.5">Description</th>
                <th className="py-2.5 px-3.5 text-center">Diff Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-800">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No audit records match the selected filters.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isExpanded = expandedLogId === log._id;
                  return (
                    <React.Fragment key={log._id}>
                      <tr
                        onClick={() => setExpandedLogId(isExpanded ? null : log._id)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3.5 font-mono text-slate-600 whitespace-nowrap text-[11px]">
                          {(log.timestamp || log.createdAt || '').slice(0, 19).replace('T', ' ')}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span
                            className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                              String(log.action).includes('CREATE')
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : String(log.action).includes('UPDATE')
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : String(log.action).includes('DELETE')
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : 'bg-slate-50 text-slate-700 border-slate-200'
                            }`}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 font-semibold text-slate-700">{log.entityType}</td>
                        <td className="py-2.5 px-3.5 font-mono text-slate-500 text-[11px]">
                          {log.entityId}
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-700 font-medium">{log.user || log.userId || 'system'}</td>
                        <td className="py-2.5 px-3.5 text-slate-600 max-w-sm truncate">{log.description || log.notes || '—'}</td>
                        <td className="py-2.5 px-3.5 text-center">
                          <span className="text-[11px] text-slate-400 hover:text-slate-700 font-medium">
                            {isExpanded ? 'Hide' : 'Inspect'}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Payload & Diff Inspection Row */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={7} className="p-4 border-b border-slate-200">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                              <div>
                                <span className="font-sans font-semibold text-slate-700 block mb-1 text-[11px]">
                                  Previous State Before Action
                                </span>
                                <pre className="bg-white p-3 rounded border border-slate-200 text-slate-600 text-[11px] overflow-x-auto max-h-48">
                                  {log.previousState || log.before
                                    ? JSON.stringify(log.previousState || log.before, null, 2)
                                    : 'null (Initial record)'}
                                </pre>
                              </div>
                              <div>
                                <span className="font-sans font-semibold text-slate-700 block mb-1 text-[11px]">
                                  New State After Action
                                </span>
                                <pre className="bg-white p-3 rounded border border-slate-200 text-slate-800 text-[11px] overflow-x-auto max-h-48">
                                  {log.newState || log.after
                                    ? JSON.stringify(log.newState || log.after, null, 2)
                                    : 'null (Entity removed)'}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
