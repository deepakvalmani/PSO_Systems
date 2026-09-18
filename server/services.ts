import { getDb, saveDb, recalculateLedgerInMemory } from './db';
import { Account, Transaction, AuditLog, BalanceType, DashboardSummary, PeriodComparison } from '../src/types';

// NOTE ON MULTI-TENANCY: every function below takes an explicit
// `organizationId` argument and filters db.accounts / db.transactions by it
// before doing anything else. Callers (server.ts route handlers) must always
// pass `req.organizationId` — the value derived from the verified session —
// and must NEVER accept an organizationId from the request body/query.

function orgAccounts(organizationId: string): Account[] {
  return getDb().accounts.filter((a) => a.organizationId === organizationId);
}

function orgTransactions(organizationId: string): Transaction[] {
  return getDb().transactions.filter((t) => t.organizationId === organizationId);
}

export function recalculateAccountLedger(organizationId: string, accountId: string): Account | null {
  const db = getDb();
  const acc = db.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
  if (!acc) return null;

  recalculateLedgerInMemory(accountId, db);
  saveDb(db);
  return acc;
}

export function recalculateAllLedgers(organizationId: string): void {
  const db = getDb();
  for (const acc of db.accounts.filter((a) => a.organizationId === organizationId)) {
    recalculateLedgerInMemory(acc._id, db);
  }
  saveDb(db);
}

/**
 * Calculates opening balance as of strictly BEFORE a given date,
 * and closing balance through that date.
 */
export function getAccountBalanceBeforeDate(organizationId: string, accountId: string, beforeDate: string): number {
  const db = getDb();
  const acc = db.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
  if (!acc) return 0;

  const preTxns = db.transactions.filter(
    (t) => t.accountId === accountId && t.organizationId === organizationId && !t.isDeleted && t.date < beforeDate
  );

  let bal = acc.openingBalancePaisa;
  for (const t of preTxns) {
    if (t.type === 'DEBIT') bal += t.amountPaisa;
    else bal -= t.amountPaisa;
  }
  return bal;
}

export function getAccountBalanceAsOfDate(organizationId: string, accountId: string, asOfDate: string): number {
  const db = getDb();
  const acc = db.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
  if (!acc) return 0;

  const txns = db.transactions.filter(
    (t) => t.accountId === accountId && t.organizationId === organizationId && !t.isDeleted && t.date <= asOfDate
  );

  let bal = acc.openingBalancePaisa;
  for (const t of txns) {
    if (t.type === 'DEBIT') bal += t.amountPaisa;
    else bal -= t.amountPaisa;
  }
  return bal;
}

/**
 * Critical Statement Generation:
 * Opening Balance = balance immediately BEFORE dateFrom
 * Period Debit = debit transactions between dateFrom and dateTo
 * Period Credit = credit transactions between dateFrom and dateTo
 * Closing Balance = Opening Balance + Period Debit - Period Credit
 */
export function generateAccountStatement(organizationId: string, accountId: string, dateFrom: string, dateTo: string) {
  const db = getDb();
  const account = db.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
  if (!account) return null;

  const openingBalancePaisa = getAccountBalanceBeforeDate(organizationId, accountId, dateFrom);

  const periodTxns = db.transactions
    .filter((t) => t.accountId === accountId && t.organizationId === organizationId && !t.isDeleted && t.date >= dateFrom && t.date <= dateTo)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.createdAt.localeCompare(b.createdAt);
    });

  let running = openingBalancePaisa;
  let totalDebitPaisa = 0;
  let totalCreditPaisa = 0;

  const ledgerRows = periodTxns.map((t) => {
    if (t.type === 'DEBIT') {
      running += t.amountPaisa;
      totalDebitPaisa += t.amountPaisa;
    } else {
      running -= t.amountPaisa;
      totalCreditPaisa += t.amountPaisa;
    }
    return {
      _id: t._id,
      transactionNumber: t.transactionNumber,
      date: t.date,
      reference: t.reference,
      description: t.description,
      type: t.type,
      debitPaisa: t.type === 'DEBIT' ? t.amountPaisa : 0,
      creditPaisa: t.type === 'CREDIT' ? t.amountPaisa : 0,
      balanceAfterPaisa: running,
      balanceAfterType: running > 0 ? 'DEBIT' : running < 0 ? 'CREDIT' : 'ZERO',
      notes: t.notes,
    };
  });

  const closingBalancePaisa = openingBalancePaisa + totalDebitPaisa - totalCreditPaisa;
  const totalBilledPaisa = openingBalancePaisa > 0 ? openingBalancePaisa + totalDebitPaisa : totalDebitPaisa;
  const totalPaidPaisa = openingBalancePaisa < 0 ? Math.abs(openingBalancePaisa) + totalCreditPaisa : totalCreditPaisa;
  const remainingAmountPaisa = Math.max(0, closingBalancePaisa);
  const paidPercentage = totalBilledPaisa > 0 ? Math.min(100, Math.max(0, Math.round((totalPaidPaisa / totalBilledPaisa) * 100))) : (totalPaidPaisa > 0 ? 100 : 0);
  const paymentStatus = closingBalancePaisa === 0 ? (totalBilledPaisa > 0 ? 'PAID_IN_FULL' : 'ZERO') : closingBalancePaisa > 0 ? (totalPaidPaisa > 0 ? 'PARTIALLY_PAID' : 'UNPAID') : 'ADVANCE';

  return {
    account,
    statementPeriod: {
      dateFrom,
      dateTo,
    },
    openingBalancePaisa,
    openingBalanceType: openingBalancePaisa > 0 ? 'DEBIT' : openingBalancePaisa < 0 ? 'CREDIT' : 'ZERO',
    closingBalancePaisa,
    closingBalanceType: closingBalancePaisa > 0 ? 'DEBIT' : closingBalancePaisa < 0 ? 'CREDIT' : 'ZERO',
    totalDebitPaisa,
    totalCreditPaisa,
    totalBilledPaisa,
    totalPaidPaisa,
    remainingAmountPaisa,
    paidPercentage,
    paymentStatus,
    netMovementPaisa: totalDebitPaisa - totalCreditPaisa,
    transactionCount: ledgerRows.length,
    rows: ledgerRows,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * High-performance executive dashboard summary
 */
export function getDashboardSummary(organizationId: string, dateFrom: string, dateTo: string): DashboardSummary {
  const accounts = orgAccounts(organizationId);
  const nonDeleted = orgTransactions(organizationId).filter((t) => !t.isDeleted);

  const periodTxns = nonDeleted.filter((t) => t.date >= dateFrom && t.date <= dateTo);

  let periodDebitPaisa = 0;
  let periodCreditPaisa = 0;
  const activeAccountsInPeriod = new Set<string>();

  for (const t of periodTxns) {
    if (t.type === 'DEBIT') periodDebitPaisa += t.amountPaisa;
    else periodCreditPaisa += t.amountPaisa;
    activeAccountsInPeriod.add(t.accountId);
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const thisMonthPrefix = todayStr.slice(0, 7);
  const todayTxns = nonDeleted.filter((t) => t.date === todayStr);
  const thisMonthTxns = nonDeleted.filter((t) => t.date.startsWith(thisMonthPrefix));

  const accountsActiveToday = new Set(todayTxns.map((t) => t.accountId)).size;
  const accountsActiveThisMonth = new Set(thisMonthTxns.map((t) => t.accountId)).size;

  let totalDebitBalancesPaisa = 0;
  let totalCreditBalancesPaisa = 0;

  for (const acc of accounts) {
    if (acc.currentBalancePaisa > 0) {
      totalDebitBalancesPaisa += acc.currentBalancePaisa;
    } else if (acc.currentBalancePaisa < 0) {
      totalCreditBalancesPaisa += Math.abs(acc.currentBalancePaisa);
    }
  }

  const netOutstandingPositionPaisa = totalDebitBalancesPaisa - totalCreditBalancesPaisa;
  const avgTransactionValuePaisa =
    periodTxns.length > 0
      ? Math.round((periodDebitPaisa + periodCreditPaisa) / periodTxns.length)
      : 0;

  let openingSystemPositionPaisa = 0;
  let closingSystemPositionPaisa = 0;
  for (const acc of accounts) {
    openingSystemPositionPaisa += getAccountBalanceBeforeDate(organizationId, acc._id, dateFrom);
    closingSystemPositionPaisa += getAccountBalanceAsOfDate(organizationId, acc._id, dateTo);
  }

  return {
    totalAccounts: accounts.length,
    activeAccounts: accounts.filter((a) => a.status === 'ACTIVE').length,
    periodDebitPaisa,
    periodCreditPaisa,
    netMovementPaisa: periodDebitPaisa - periodCreditPaisa,
    totalTransactions: nonDeleted.length,
    transactionsToday: todayTxns.length,
    transactionsThisMonth: thisMonthTxns.length,
    accountsActiveToday,
    accountsActiveThisMonth,
    totalDebitBalancesPaisa,
    totalCreditBalancesPaisa,
    netOutstandingPositionPaisa,
    totalBilledPaisa: accounts.reduce((sum, a) => sum + (a.totalBilledPaisa || 0), 0),
    totalPaidPaisa: accounts.reduce((sum, a) => sum + (a.totalPaidPaisa || 0), 0),
    totalRemainingPaisa: accounts.reduce((sum, a) => sum + (a.remainingAmountPaisa || 0), 0),
    overallPaidPercentage: (() => {
      const billed = accounts.reduce((sum, a) => sum + (a.totalBilledPaisa || 0), 0);
      const paid = accounts.reduce((sum, a) => sum + (a.totalPaidPaisa || 0), 0);
      return billed > 0 ? Math.min(100, Math.round((paid / billed) * 100)) : 100;
    })(),
    unpaidAccountsCount: accounts.filter((a) => a.paymentStatus === 'UNPAID').length,
    partialAccountsCount: accounts.filter((a) => a.paymentStatus === 'PARTIALLY_PAID').length,
    paidAccountsCount: accounts.filter((a) => a.paymentStatus === 'PAID_IN_FULL').length,
    avgTransactionValuePaisa,
    openingSystemPositionPaisa,
    closingSystemPositionPaisa,
  };
}

/**
 * Period comparison analytics
 */
export function getPeriodComparisonData(
  organizationId: string,
  currentFrom: string,
  currentTo: string,
  compareFrom: string,
  compareTo: string
): PeriodComparison {
  const txns = orgTransactions(organizationId).filter((t) => !t.isDeleted);

  const curTxns = txns.filter((t) => t.date >= currentFrom && t.date <= currentTo);
  const cmpTxns = txns.filter((t) => t.date >= compareFrom && t.date <= compareTo);

  let curDebit = 0, curCredit = 0;
  const curAccounts = new Set<string>();
  for (const t of curTxns) {
    if (t.type === 'DEBIT') curDebit += t.amountPaisa;
    else curCredit += t.amountPaisa;
    curAccounts.add(t.accountId);
  }

  let cmpDebit = 0, cmpCredit = 0;
  const cmpAccounts = new Set<string>();
  for (const t of cmpTxns) {
    if (t.type === 'DEBIT') cmpDebit += t.amountPaisa;
    else cmpCredit += t.amountPaisa;
    cmpAccounts.add(t.accountId);
  }

  const calcPct = (curr: number, prev: number) => {
    if (prev === 0) return curr === 0 ? 0 : null;
    return Number((((curr - prev) / Math.abs(prev)) * 100).toFixed(1));
  };

  return {
    currentPeriod: {
      label: `${currentFrom} - ${currentTo}`,
      debitPaisa: curDebit,
      creditPaisa: curCredit,
      netMovementPaisa: curDebit - curCredit,
      transactionCount: curTxns.length,
      activeAccounts: curAccounts.size,
      avgTransactionPaisa: curTxns.length ? Math.round((curDebit + curCredit) / curTxns.length) : 0,
    },
    comparisonPeriod: {
      label: `${compareFrom} - ${compareTo}`,
      debitPaisa: cmpDebit,
      creditPaisa: cmpCredit,
      netMovementPaisa: cmpDebit - cmpCredit,
      transactionCount: cmpTxns.length,
      activeAccounts: cmpAccounts.size,
      avgTransactionPaisa: cmpTxns.length ? Math.round((cmpDebit + cmpCredit) / cmpTxns.length) : 0,
    },
    percentageChanges: {
      debit: calcPct(curDebit, cmpDebit),
      credit: calcPct(curCredit, cmpCredit),
      netMovement: calcPct(curDebit - curCredit, cmpDebit - cmpCredit),
      transactions: calcPct(curTxns.length, cmpTxns.length),
      activeAccounts: calcPct(curAccounts.size, cmpAccounts.size),
    },
  };
}

/**
 * Trends for charts (Debit vs Credit, Activity, Cumulative, Balance)
 */
export function getChartTrends(organizationId: string, dateFrom: string, dateTo: string, interval: 'daily' | 'weekly' | 'monthly' = 'daily') {
  const txns = orgTransactions(organizationId)
    .filter((t) => !t.isDeleted && t.date >= dateFrom && t.date <= dateTo)
    .sort((a, b) => a.date.localeCompare(b.date));

  const buckets: Record<string, { label: string; debitPkr: number; creditPkr: number; netPkr: number; count: number; activeAccounts: Set<string> }> = {};

  for (const t of txns) {
    let key = t.date;
    let label = t.date.slice(5); // MM-DD
    if (interval === 'monthly') {
      key = t.date.slice(0, 7); // YYYY-MM
      label = key;
    }

    if (!buckets[key]) {
      buckets[key] = { label, debitPkr: 0, creditPkr: 0, netPkr: 0, count: 0, activeAccounts: new Set() };
    }
    const pkr = t.amountPaisa / 100;
    if (t.type === 'DEBIT') {
      buckets[key].debitPkr += pkr;
      buckets[key].netPkr += pkr;
    } else {
      buckets[key].creditPkr += pkr;
      buckets[key].netPkr -= pkr;
    }
    buckets[key].count += 1;
    buckets[key].activeAccounts.add(t.accountId);
  }

  let cumulativeDebit = 0;
  let cumulativeCredit = 0;

  const points = Object.keys(buckets).sort().map((k) => {
    const b = buckets[k];
    cumulativeDebit += b.debitPkr;
    cumulativeCredit += b.creditPkr;

    return {
      date: k,
      label: b.label,
      debit: Math.round(b.debitPkr),
      credit: Math.round(b.creditPkr),
      net: Math.round(b.netPkr),
      count: b.count,
      activeAccounts: b.activeAccounts.size,
      cumulativeDebit: Math.round(cumulativeDebit),
      cumulativeCredit: Math.round(cumulativeCredit),
    };
  });

  return points;
}

/**
 * Duplicate check helper
 */
export function findPotentialDuplicates(organizationId: string, accountId: string, date: string, amountPaisa: number, type: string, description: string) {
  const cleanDesc = description.trim().toLowerCase();
  return orgTransactions(organizationId).filter(
    (t) =>
      !t.isDeleted &&
      t.accountId === accountId &&
      t.date === date &&
      t.amountPaisa === amountPaisa &&
      t.type === type &&
      t.description.trim().toLowerCase() === cleanDesc
  );
}
