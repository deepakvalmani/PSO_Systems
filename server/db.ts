import fs from 'fs';
import path from 'path';
import { Account, Transaction, AuditLog, SystemSettings, Organization, AppUser } from '../src/types';
import { loadDataFromMongo, saveAllToMongo, clearMongoDb } from './mongo';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'ledger_store.json');

export interface DatabaseSchema {
  accounts: Account[];
  transactions: Transaction[];
  auditLogs: AuditLog[];
  organizations: Organization[];
  users: AppUser[];
  settingsByOrg: Record<string, SystemSettings>;
}

export const defaultSettings: Omit<SystemSettings, 'organizationId'> = {
  businessName: 'My Petrol Pump',
  businessLogo: '',
  address: '',
  phone: '',
  email: '',
  currency: 'Rs.',
  dateFormat: 'DD/MM/YYYY',
  rowsPerPage: 25,
  reportFooter: 'This is a computer-generated financial document.',
  financialYearStartMonth: 7, // July in Pakistan / Commonwealth
  defaultDashboardPeriod: 'THIS_MONTH',
};

export function makeDefaultSettingsForOrg(organizationId: string, businessName?: string): SystemSettings {
  return {
    ...defaultSettings,
    organizationId,
    businessName: businessName || defaultSettings.businessName,
  };
}

// Ensure data directory exists. Best-effort only: on read-only/ephemeral
// filesystems (e.g. Vercel serverless functions), this local JSON store is
// unavailable and unnecessary as long as MongoDB is configured — Mongo is
// always tried first in initDb()/getDb() below.
try {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn('[DB] Local data directory unavailable (expected on read-only filesystems):', (err as Error).message);
}

let dbCache: DatabaseSchema | null = null;
let isMongoInitialized = false;

function emptyDb(): DatabaseSchema {
  return {
    accounts: [],
    transactions: [],
    auditLogs: [],
    organizations: [],
    users: [],
    settingsByOrg: {},
  };
}

function normalizeDb(raw: Partial<DatabaseSchema> | null | undefined): DatabaseSchema {
  const db = emptyDb();
  if (!raw) return db;
  db.accounts = raw.accounts || [];
  db.transactions = raw.transactions || [];
  db.auditLogs = raw.auditLogs || [];
  db.organizations = raw.organizations || [];
  db.users = raw.users || [];
  db.settingsByOrg = raw.settingsByOrg || {};
  return db;
}

export async function clearAllData(): Promise<{
  success: boolean;
  accountsCleared: number;
  transactionsCleared: number;
  auditLogsCleared: number;
}> {
  const accountsCleared = dbCache?.accounts?.length || 0;
  const transactionsCleared = dbCache?.transactions?.length || 0;
  const auditLogsCleared = dbCache?.auditLogs?.length || 0;

  dbCache = {
    accounts: [],
    transactions: [],
    auditLogs: [],
    organizations: dbCache?.organizations || [],
    users: dbCache?.users || [],
    settingsByOrg: dbCache?.settingsByOrg || {},
  };

  writeDbFileAtomic(dbCache);

  // Clear remote MongoDB Atlas collections completely
  try {
    await clearMongoDb();
  } catch (err) {
    console.error('Error clearing MongoDB:', err);
  }

  return {
    success: true,
    accountsCleared,
    transactionsCleared,
    auditLogsCleared,
  };
}

export async function initDb(): Promise<DatabaseSchema> {
  if (isMongoInitialized && dbCache) {
    return dbCache;
  }

  // 1. Attempt to load from MongoDB Atlas
  try {
    const mongoData = await loadDataFromMongo();
    if (mongoData) {
      dbCache = normalizeDb(mongoData);
      for (const acc of dbCache.accounts) {
        recalculateLedgerInMemory(acc._id, dbCache);
      }
      isMongoInitialized = true;
      // Also write to local backup
      writeDbFileAtomic(dbCache);
      return dbCache;
    }
  } catch (err) {
    console.error('[DB] Failed initializing from MongoDB, falling back to local store:', err);
  }

  // 2. Load from local store
  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = normalizeDb(JSON.parse(content));
      for (const acc of dbCache.accounts) {
        recalculateLedgerInMemory(acc._id, dbCache);
      }
      isMongoInitialized = true;
      return dbCache;
    } catch (err) {
      console.error('Error reading database file:', err);
    }
  }

  // Empty fresh database — run `npm run seed` to create the super-admin and
  // first organization.
  dbCache = emptyDb();
  saveDb(dbCache);
  isMongoInitialized = true;
  return dbCache;
}

export function getDb(): DatabaseSchema {
  if (dbCache) {
    return dbCache;
  }

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      dbCache = normalizeDb(JSON.parse(content));
      for (const acc of dbCache.accounts) {
        recalculateLedgerInMemory(acc._id, dbCache);
      }
      return dbCache;
    } catch (err) {
      console.error('Error reading database file:', err);
    }
  }

  dbCache = emptyDb();
  saveDb(dbCache);
  return dbCache;
}

/**
 * Returns (creating a default one if missing) the per-organization settings
 * document. Never trust a client-supplied organizationId for this — callers
 * must pass the organizationId derived from the authenticated session.
 */
export function getSettingsForOrg(db: DatabaseSchema, organizationId: string): SystemSettings {
  if (!db.settingsByOrg[organizationId]) {
    db.settingsByOrg[organizationId] = makeDefaultSettingsForOrg(organizationId);
  }
  return db.settingsByOrg[organizationId];
}

/**
 * Atomically persist the database to disk: write to a temp file in the same
 * directory, then rename it over the real file. A rename on the same
 * filesystem is atomic, so a crash or concurrent read mid-write can never
 * observe a half-written/corrupt ledger_store.json.
 */
function writeDbFileAtomic(data: DatabaseSchema): void {
  const tmpFile = path.join(DATA_DIR, `.ledger_store.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error('Error saving database to file:', err);
    // Best-effort cleanup of the temp file if the rename failed
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {}
  }
}

// Serialize writes: since saveDb can be invoked in quick succession
// (e.g. rapid-fire API calls), chain each write onto a promise so they
// happen strictly one-after-another instead of racing on the same file.
let writeQueue: Promise<void> = Promise.resolve();

export function saveDb(data: DatabaseSchema): void {
  dbCache = data;

  // Snapshot the JSON now (synchronously) so later mutations to `data`
  // before this queued write runs don't change what gets persisted.
  const snapshot: DatabaseSchema = JSON.parse(JSON.stringify(data));

  writeQueue = writeQueue.then(() => {
    writeDbFileAtomic(snapshot);
  }).catch((err) => {
    console.error('[DB] Error in serialized write queue:', err);
  });

  // Asynchronously push to MongoDB Atlas
  saveAllToMongo(data).catch((err) => {
    console.error('[DB] Asynchronous MongoDB sync error:', err);
  });
}

export function recalculateLedgerInMemory(accountId: string, db: DatabaseSchema): void {
  const account = db.accounts.find((a) => a._id === accountId);
  if (!account) return;

  const nonDeleted = db.transactions
    .filter((t) => t.accountId === accountId && !t.isDeleted)
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.createdAt.localeCompare(b.createdAt);
    });

  let running = account.openingBalancePaisa;
  let totalBilled = account.openingBalancePaisa > 0 ? account.openingBalancePaisa : 0;
  let totalPaid = account.openingBalancePaisa < 0 ? Math.abs(account.openingBalancePaisa) : 0;

  for (const txn of nonDeleted) {
    if (txn.type === 'DEBIT') {
      running += txn.amountPaisa;
      totalBilled += txn.amountPaisa;
    } else {
      running -= txn.amountPaisa;
      totalPaid += txn.amountPaisa;
    }
    txn.balanceAfterPaisa = running;
    txn.balanceAfterType = running > 0 ? 'DEBIT' : running < 0 ? 'CREDIT' : 'ZERO';
  }

  account.currentBalancePaisa = running;
  account.currentBalanceType = running > 0 ? 'DEBIT' : running < 0 ? 'CREDIT' : 'ZERO';
  account.totalTransactions = nonDeleted.length;
  account.firstTransactionDate = nonDeleted[0]?.date || undefined;
  account.lastTransactionDate = nonDeleted[nonDeleted.length - 1]?.date || undefined;
  account.updatedAt = new Date().toISOString();

  // Payment Tracking System: Billed, Paid, Remaining Amount & Status
  account.totalBilledPaisa = totalBilled;
  account.totalPaidPaisa = totalPaid;
  account.remainingAmountPaisa = Math.max(0, running);

  if (running === 0) {
    account.paymentStatus = totalBilled > 0 ? 'PAID_IN_FULL' : 'ZERO';
    account.paidPercentage = totalBilled > 0 ? 100 : 0;
  } else if (running > 0) {
    if (totalPaid > 0) {
      account.paymentStatus = 'PARTIALLY_PAID';
      account.paidPercentage = totalBilled > 0 ? Math.min(100, Math.max(0, Math.round((totalPaid / totalBilled) * 100))) : 0;
    } else {
      account.paymentStatus = 'UNPAID';
      account.paidPercentage = 0;
    }
  } else {
    // running < 0 (Advance / Credit)
    account.paymentStatus = 'ADVANCE';
    account.paidPercentage = 100;
  }
}
