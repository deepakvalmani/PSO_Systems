export type TransactionType = 'DEBIT' | 'CREDIT';

/**
 * Presentation-layer labels for the internal DEBIT/CREDIT transaction type.
 * The underlying data model (Transaction.type, API payloads, storage) keeps
 * using 'DEBIT' | 'CREDIT' — only the text shown to the user changes here.
 *
 * DEBIT = amount billed / receivable  -> shown as "Unpaid"
 * CREDIT = payment received           -> shown as "Paid"
 */
export function getTransactionTypeLabel(type: TransactionType): 'Unpaid' | 'Paid' {
  return type === 'DEBIT' ? 'Unpaid' : 'Paid';
}

/**
 * Longer label used in dropdown/select options, e.g. "Unpaid (Billed)".
 */
export function getTransactionTypeOptionLabel(type: TransactionType): string {
  return type === 'DEBIT' ? 'Unpaid (Billed)' : 'Paid (Payment received)';
}

/**
 * Tailwind text color classes matching the existing rose/emerald convention.
 */
export function getTransactionTypeStyle(type: TransactionType): string {
  return type === 'DEBIT' ? 'text-rose-600' : 'text-emerald-600';
}

/**
 * Tailwind badge (background + text) classes matching the existing convention.
 */
export function getTransactionTypeBadgeStyle(type: TransactionType): string {
  return type === 'DEBIT'
    ? 'bg-rose-50 text-rose-700 border-rose-200'
    : 'bg-emerald-50 text-emerald-700 border-emerald-200';
}

/**
 * Column header label for amount columns split by type.
 * DEBIT column -> "Billed (PKR)", CREDIT column -> "Paid (PKR)"
 */
export function getAmountColumnLabel(type: TransactionType): string {
  return type === 'DEBIT' ? 'Billed (PKR)' : 'Paid (PKR)';
}
