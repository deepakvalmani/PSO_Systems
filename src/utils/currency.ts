import { BalanceType } from '../types';

/**
 * Convert PKR decimal amount (e.g. 367858.75) to integer paisa (36785875).
 * Uses Math.round to avoid standard IEEE-754 precision issues.
 */
export function pkrToPaisa(amount: number | string): number {
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/,/g, '')) : amount;
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Convert integer paisa back to decimal PKR
 */
export function paisaToPkr(paisa: number): number {
  if (isNaN(paisa)) return 0;
  return paisa / 100;
}

/**
 * Format paisa integer as clean formatted string.
 * Example: 36785875 -> "367,858.75" or "Rs. 367,858.75"
 */
export function formatCurrency(
  paisa: number | null | undefined,
  includeCurrency: boolean = true,
  currencyPrefix: string = 'Rs. '
): string {
  if (paisa === null || paisa === undefined || isNaN(paisa)) {
    return includeCurrency ? `${currencyPrefix}0.00` : '0.00';
  }
  const absolutePkr = Math.abs(paisa) / 100;
  const formatted = absolutePkr.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return includeCurrency ? `${currencyPrefix}${formatted}` : formatted;
}

/**
 * Format compact currency e.g. "Rs. 8.42M" or "Rs. 300K"
 */
export function formatCompactCurrency(
  paisa: number,
  currencyPrefix: string = 'Rs. '
): string {
  const pkr = Math.abs(paisa) / 100;
  if (pkr >= 1_000_000_000) {
    return `${currencyPrefix}${(pkr / 1_000_000_000).toFixed(2)}B`;
  }
  if (pkr >= 1_000_000) {
    return `${currencyPrefix}${(pkr / 1_000_000).toFixed(2)}M`;
  }
  if (pkr >= 1_000) {
    return `${currencyPrefix}${(pkr / 1_000).toFixed(1)}K`;
  }
  return `${currencyPrefix}${pkr.toFixed(2)}`;
}

/**
 * Determine balance type from signed paisa
 * Positive = DEBIT, Negative = CREDIT, Zero = ZERO
 */
export function getBalanceType(signedPaisa: number): BalanceType {
  if (signedPaisa > 0) return 'DEBIT';
  if (signedPaisa < 0) return 'CREDIT';
  return 'ZERO';
}

/**
 * Safe percentage change calculation without misleading percentages for zero divisors
 */
export function calculatePercentageChange(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null; // null represents "N/A" (new activity from 0)
  }
  return Number((((current - previous) / Math.abs(previous)) * 100).toFixed(1));
}
