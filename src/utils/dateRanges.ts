import { DateFilterPreset, DateRange } from '../types';

export function getSystemDate(): Date {
  // Use 2026-09-18 or current date if 2026 or later
  const now = new Date();
  if (now.getFullYear() < 2026) {
    return new Date('2026-09-18T12:00:00Z');
  }
  return now;
}

export function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDateRangeFromPreset(preset: DateFilterPreset, customFrom?: string, customTo?: string): DateRange {
  const ref = getSystemDate();
  const y = ref.getFullYear();
  const m = ref.getMonth(); // 0-indexed
  const d = ref.getDate();

  let dateFrom = '';
  let dateTo = '';
  let label = '';

  switch (preset) {
    case 'TODAY': {
      const start = new Date(y, m, d);
      dateFrom = formatDateISO(start);
      dateTo = dateFrom;
      label = 'Today';
      break;
    }
    case 'YESTERDAY': {
      const start = new Date(y, m, d - 1);
      dateFrom = formatDateISO(start);
      dateTo = dateFrom;
      label = 'Yesterday';
      break;
    }
    case 'LAST_7_DAYS': {
      const start = new Date(y, m, d - 6);
      const end = new Date(y, m, d);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'Last 7 Days';
      break;
    }
    case 'THIS_WEEK': {
      // Assuming week starts on Monday
      const dayOfWeek = ref.getDay(); // 0 is Sunday
      const diff = ref.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
      const start = new Date(y, m, diff);
      const end = new Date(y, m, d);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'This Week';
      break;
    }
    case 'LAST_WEEK': {
      const dayOfWeek = ref.getDay();
      const diff = ref.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1) - 7;
      const start = new Date(y, m, diff);
      const end = new Date(y, m, diff + 6);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'Last Week';
      break;
    }
    case 'LAST_30_DAYS': {
      const start = new Date(y, m, d - 29);
      const end = new Date(y, m, d);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'Last 30 Days';
      break;
    }
    case 'THIS_MONTH': {
      const start = new Date(y, m, 1);
      const end = new Date(y, m, d);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'This Month (Sep 2026)';
      break;
    }
    case 'PREVIOUS_MONTH': {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0); // last day of prev month
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'Previous Month (Aug 2026)';
      break;
    }
    case 'LAST_3_MONTHS': {
      const start = new Date(y, m - 2, 1);
      const end = new Date(y, m, d);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'Last 3 Months';
      break;
    }
    case 'LAST_6_MONTHS': {
      const start = new Date(y, m - 5, 1);
      const end = new Date(y, m, d);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'Last 6 Months';
      break;
    }
    case 'THIS_YEAR': {
      const start = new Date(y, 0, 1);
      const end = new Date(y, m, d);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'This Year (2026)';
      break;
    }
    case 'PREVIOUS_YEAR': {
      const start = new Date(y - 1, 0, 1);
      const end = new Date(y - 1, 11, 31);
      dateFrom = formatDateISO(start);
      dateTo = formatDateISO(end);
      label = 'Previous Year (2025)';
      break;
    }
    case 'ALL_TIME': {
      dateFrom = '2020-01-01';
      dateTo = formatDateISO(new Date(y, m, d));
      label = 'All Time';
      break;
    }
    case 'CUSTOM':
    default: {
      dateFrom = customFrom || formatDateISO(new Date(y, m, 1));
      dateTo = customTo || formatDateISO(new Date(y, m, d));
      label = `${dateFrom} to ${dateTo}`;
      break;
    }
  }

  return { preset, dateFrom, dateTo, label };
}

export function formatDisplayDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const [year, month, day] = parts;
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(month, 10) - 1;
      return `${parseInt(day, 10)} ${monthNames[mIdx] || month} ${year}`;
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}
