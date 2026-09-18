import React, { useState } from 'react';
import { X, Calendar, Check } from 'lucide-react';
import { DateFilterPreset, DateRange } from '../types';
import { getDateRangeFromPreset } from '../utils/dateRanges';

interface DateFilterModalProps {
  isOpen: boolean;
  currentRange: DateRange;
  onClose: () => void;
  onApplyRange: (range: DateRange) => void;
}

export const DateFilterModal: React.FC<DateFilterModalProps> = ({
  isOpen,
  currentRange,
  onClose,
  onApplyRange,
}) => {
  if (!isOpen) return null;

  const [selectedPreset, setSelectedPreset] = useState<DateFilterPreset>(currentRange.preset);
  const [customFrom, setCustomFrom] = useState(currentRange.dateFrom);
  const [customTo, setCustomTo] = useState(currentRange.dateTo);

  const presets: { id: DateFilterPreset; label: string }[] = [
    { id: 'TODAY', label: 'Today (18 Sep)' },
    { id: 'YESTERDAY', label: 'Yesterday (17 Sep)' },
    { id: 'THIS_WEEK', label: 'This Week' },
    { id: 'LAST_WEEK', label: 'Last Week' },
    { id: 'LAST_7_DAYS', label: 'Last 7 Days' },
    { id: 'LAST_30_DAYS', label: 'Last 30 Days' },
    { id: 'THIS_MONTH', label: 'This Month (Sep 2026)' },
    { id: 'PREVIOUS_MONTH', label: 'Previous Month (Aug 2026)' },
    { id: 'LAST_3_MONTHS', label: 'Last 3 Months' },
    { id: 'LAST_6_MONTHS', label: 'Last 6 Months' },
    { id: 'THIS_YEAR', label: 'This Year (2026)' },
    { id: 'PREVIOUS_YEAR', label: 'Previous Year (2025)' },
    { id: 'ALL_TIME', label: 'All Time' },
    { id: 'CUSTOM', label: 'Custom Date Range' },
  ];

  const handleApply = () => {
    const range = getDateRangeFromPreset(
      selectedPreset,
      selectedPreset === 'CUSTOM' ? customFrom : undefined,
      selectedPreset === 'CUSTOM' ? customTo : undefined
    );
    onApplyRange(range);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-2xs p-4">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Calendar className="w-4 h-4 text-slate-700" />
            <h3 className="text-sm font-semibold text-slate-900">Select Reporting Period</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-1.5 max-h-64 overflow-y-auto pr-1">
            {presets.map((p) => {
              const active = selectedPreset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPreset(p.id)}
                  className={`text-left px-3 py-2 rounded text-xs transition-colors flex items-center justify-between border ${
                    active
                      ? 'bg-slate-900 text-white font-medium border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{p.label}</span>
                  {active && <Check className="w-3 h-3 ml-1 shrink-0 text-white" />}
                </button>
              );
            })}
          </div>

          {/* Custom Date Inputs if Custom selected */}
          {selectedPreset === 'CUSTOM' && (
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Date From</label>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:border-slate-400"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Date To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded text-slate-900 focus:outline-hidden focus:border-slate-400"
                />
              </div>
            </div>
          )}

          <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-100">
            <span className="font-semibold text-slate-700">Accounting Rule Note:</span> Changing period
            re-calculates historical opening balances strictly before the start date, and summarizes period movement accurately.
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 transition-colors shadow-2xs"
          >
            Apply Period
          </button>
        </div>
      </div>
    </div>
  );
};
