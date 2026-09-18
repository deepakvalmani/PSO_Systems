export type BalanceType = 'DEBIT' | 'CREDIT' | 'ZERO';
export type PaymentStatus = 'PAID_IN_FULL' | 'PARTIALLY_PAID' | 'UNPAID' | 'ADVANCE' | 'ZERO';

// --- Multi-tenancy: Organizations (pumps) & Users -----------------------------

export type PlanId = 'BASIC' | 'PRO' | 'ENTERPRISE';

export interface Organization {
  _id: string;
  name: string;
  slug: string;
  phone: string;
  address: string;
  city: string;
  isActive: boolean;
  planId: PlanId;
  features: Record<string, boolean>;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'SUPER_ADMIN' | 'ORG_ADMIN';

export interface AppUser {
  _id: string;
  organizationId: string | null; // null for SUPER_ADMIN
  username: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt?: string;
}

// Safe, client-facing projection of AppUser (never includes passwordHash)
export interface PublicUser {
  username: string;
  role: UserRole;
  organizationId: string | null;
}

export interface Account {
  _id: string;
  organizationId: string;
  accountCode: string;
  accountName: string;
  phone: string;
  address: string;
  status: 'ACTIVE' | 'INACTIVE';
  openingBalancePaisa: number; // Signed: >0 Debit, <0 Credit, 0 Zero
  openingBalanceType: BalanceType;
  currentBalancePaisa: number; // Signed: >0 Debit, <0 Credit, 0 Zero
  currentBalanceType: BalanceType;
  totalBilledPaisa?: number; // Total charges / Debits
  totalPaidPaisa?: number; // Total payments received / Credits
  remainingAmountPaisa?: number; // Remaining amount due / to be collected
  paymentStatus?: PaymentStatus;
  paidPercentage?: number; // Percentage of billed amount that is paid (0-100)
  createdAt: string;
  updatedAt: string;
  notes?: string;
  firstTransactionDate?: string;
  lastTransactionDate?: string;
  totalTransactions?: number;
}

export interface EditHistoryItem {
  oldValue: any;
  newValue: any;
  changedField?: string;
  field?: string;
  changedAt?: string;
  modifiedAt?: string;
  changedBy?: string;
  modifiedBy?: string;
}

export interface Transaction {
  _id: string;
  organizationId: string;
  transactionNumber: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  date: string; // YYYY-MM-DD
  type: 'DEBIT' | 'CREDIT';
  amountPaisa: number; // strictly positive integer
  description: string;
  reference: string;
  notes?: string;
  previousBalancePaisa?: number;
  balanceAfterPaisa: number; // Signed
  balanceAfterType: BalanceType;
  enteredBy: string;
  createdAt: string;
  updatedAt: string;
  isDeleted: boolean;
  deletedAt?: string;
  deletedBy?: string;
  deleteReason?: string;
  editHistory?: EditHistoryItem[];
}

export type AuditAction =
  | 'ACCOUNT_CREATED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_STATUS_CHANGED'
  | 'TRANSACTION_CREATED'
  | 'TRANSACTION_UPDATED'
  | 'TRANSACTION_DELETED'
  | 'TRANSACTION_RESTORED'
  | 'REPORT_GENERATED'
  | 'EXPORT_GENERATED'
  | 'SETTINGS_UPDATED'
  | 'CREATE'
  | 'UPDATE'
  | 'SOFT_DELETE'
  | 'RESTORE'
  | 'RECALCULATE';

export interface AuditLog {
  _id: string;
  organizationId: string;
  action: AuditAction | string;
  entityType: 'ACCOUNT' | 'TRANSACTION' | 'REPORT' | 'SETTING' | 'SYSTEM' | string;
  entityId: string;
  accountId?: string;
  accountName?: string;
  transactionId?: string;
  userId?: string;
  user?: string;
  before?: Record<string, any>;
  previousState?: Record<string, any>;
  after?: Record<string, any>;
  newState?: Record<string, any>;
  changedFields?: string[];
  ipAddress?: string;
  userAgent?: string;
  createdAt?: string;
  timestamp?: string;
  description?: string;
  notes?: string;
}

export interface SystemSettings {
  organizationId?: string;
  businessName: string;
  businessLogo?: string;
  address: string;
  phone: string;
  email: string;
  currency?: string;
  currencySymbol?: string;
  dateFormat: string;
  rowsPerPage?: number;
  reportFooter: string;
  financialYearStartMonth?: number;
  defaultDashboardPeriod?: string;
}

export type BusinessSettings = SystemSettings;

export interface AccountStatement {
  account: Account;
  period: { dateFrom: string; dateTo: string };
  openingBalancePaisa: number;
  openingBalanceType: BalanceType;
  periodDebitPaisa: number;
  periodCreditPaisa: number;
  netMovementPaisa: number;
  closingBalancePaisa: number;
  closingBalanceType: BalanceType;
  totalBilledPaisa?: number;
  totalPaidPaisa?: number;
  remainingAmountPaisa?: number;
  paidPercentage?: number;
  paymentStatus?: PaymentStatus;
  transactions: Transaction[];
  generatedAt: string;
}

export type DateFilterPreset =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'LAST_30_DAYS'
  | 'THIS_MONTH'
  | 'PREVIOUS_MONTH'
  | 'LAST_3_MONTHS'
  | 'LAST_6_MONTHS'
  | 'THIS_YEAR'
  | 'PREVIOUS_YEAR'
  | 'ALL_TIME'
  | 'CUSTOM';

export interface DateRange {
  preset: DateFilterPreset;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  label: string;
}

export interface DashboardSummary {
  // Primary KPI cards (Top row of ~4)
  totalAccounts: number;
  activeAccounts: number;
  periodDebitPaisa: number;
  periodCreditPaisa: number;
  netMovementPaisa: number;
  
  // Payment Tracking System (Billed, Paid, Remaining)
  totalBilledPaisa?: number;
  totalPaidPaisa?: number;
  totalRemainingPaisa?: number;
  overallPaidPercentage?: number;
  unpaidAccountsCount?: number;
  partialAccountsCount?: number;
  paidAccountsCount?: number;

  // Secondary metrics
  totalTransactions: number;
  transactionsToday: number;
  transactionsThisMonth: number;
  accountsActiveToday: number;
  accountsActiveThisMonth: number;
  totalDebitBalancesPaisa: number;
  totalCreditBalancesPaisa: number;
  netOutstandingPositionPaisa: number;
  avgTransactionValuePaisa: number;
  
  // Opening & Closing for the period
  openingSystemPositionPaisa: number;
  closingSystemPositionPaisa: number;
}

export interface PeriodComparison {
  currentPeriod: {
    label: string;
    debitPaisa: number;
    creditPaisa: number;
    netMovementPaisa: number;
    transactionCount: number;
    activeAccounts: number;
    avgTransactionPaisa: number;
  };
  comparisonPeriod: {
    label: string;
    debitPaisa: number;
    creditPaisa: number;
    netMovementPaisa: number;
    transactionCount: number;
    activeAccounts: number;
    avgTransactionPaisa: number;
  };
  percentageChanges: {
    debit: number | null;
    credit: number | null;
    netMovement: number | null;
    transactions: number | null;
    activeAccounts: number | null;
  };
}
