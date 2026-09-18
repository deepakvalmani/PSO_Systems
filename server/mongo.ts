import { MongoClient, Db } from 'mongodb';
import { Account, Transaction, AuditLog, SystemSettings, Organization, AppUser } from '../src/types';
import dotenv from 'dotenv';

dotenv.config();

// SECURITY: never hardcode a real connection string here. If MONGODB_URI is
// unset, Mongo-backed persistence is simply disabled and server/db.ts falls
// back to the local JSON file store.
const MONGO_URI = process.env.MONGODB_URI || '';

if (!MONGO_URI) {
  console.error(
    '[MongoDB] MONGODB_URI is not set. Mongo-backed persistence is DISABLED for this run; ' +
      'the app will fall back to the local JSON file store (server/db.ts). ' +
      'Set MONGODB_URI in your environment (see .env.example) to enable MongoDB Atlas sync.'
  );
}

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;
let lastSyncedAt: string | null = null;
let connectionError: string | null = MONGO_URI ? null : 'MONGODB_URI not configured';

export async function getMongoClient(): Promise<{ client: MongoClient; db: Db } | null> {
  if (!MONGO_URI) return null;

  if (client && db && isConnected) {
    return { client, db };
  }

  try {
    client = new MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });
    await client.connect();
    // Connect to database specified in connection string URL (or default)
    db = client.db();
    isConnected = true;
    connectionError = null;
    console.log(`[MongoDB] Connected successfully using database URL (Database: "${db.databaseName}")`);

    // Ensure collections and indexes exist
    await ensureIndexes(db);

    return { client, db };
  } catch (err: any) {
    isConnected = false;
    connectionError = err.message || 'Failed to connect to MongoDB';
    console.error('[MongoDB] Connection error:', err.message);
    return null;
  }
}

async function ensureIndexes(database: Db) {
  try {
    await database.collection('accounts').createIndex({ _id: 1 });
    await database.collection('accounts').createIndex({ organizationId: 1 });
    await database.collection('accounts').createIndex({ organizationId: 1, accountCode: 1 }, { unique: true, sparse: true });
    await database.collection('transactions').createIndex({ _id: 1 });
    await database.collection('transactions').createIndex({ organizationId: 1 });
    await database.collection('transactions').createIndex({ organizationId: 1, transactionNumber: 1 }, { unique: true, sparse: true });
    await database.collection('transactions').createIndex({ accountId: 1, date: 1 });
    await database.collection('auditLogs').createIndex({ _id: 1 });
    await database.collection('auditLogs').createIndex({ organizationId: 1 });
    await database.collection('organizations').createIndex({ _id: 1 });
    await database.collection('organizations').createIndex({ slug: 1 }, { unique: true, sparse: true });
    await database.collection('users').createIndex({ _id: 1 });
    await database.collection('users').createIndex({ username: 1 }, { unique: true, sparse: true });
    await database.collection('users').createIndex({ organizationId: 1 });
    await database.collection('settings').createIndex({ organizationId: 1 }, { unique: true, sparse: true });
  } catch (err: any) {
    console.warn('[MongoDB] Index creation note:', err.message);
  }
}

export async function loadDataFromMongo(): Promise<{
  accounts: Account[];
  transactions: Transaction[];
  auditLogs: AuditLog[];
  organizations: Organization[];
  users: AppUser[];
  settingsByOrg: Record<string, SystemSettings>;
} | null> {
  try {
    const conn = await getMongoClient();
    if (!conn) return null;

    const orgsCount = await conn.db.collection('organizations').countDocuments();
    if (orgsCount === 0) {
      console.log('[MongoDB] No organizations found. Needs initial seed (run `npm run seed`).');
      return null;
    }

    const accounts = (await conn.db.collection('accounts').find({}).toArray()) as any[];
    const transactions = (await conn.db.collection('transactions').find({}).toArray()) as any[];
    const auditLogs = (await conn.db.collection('auditLogs').find({}).sort({ createdAt: -1 }).limit(2000).toArray()) as any[];
    const organizations = (await conn.db.collection('organizations').find({}).toArray()) as any[];
    const users = (await conn.db.collection('users').find({}).toArray()) as any[];
    const settingsDocs = (await conn.db.collection('settings').find({}).toArray()) as any[];

    const settingsByOrg: Record<string, SystemSettings> = {};
    for (const s of settingsDocs) {
      if (s.organizationId) settingsByOrg[s.organizationId] = s;
    }

    console.log(
      `[MongoDB] Loaded ${organizations.length} organizations, ${users.length} users, ${accounts.length} accounts, ${transactions.length} transactions, and ${auditLogs.length} audit logs from MongoDB Atlas.`
    );

    return { accounts, transactions, auditLogs, organizations, users, settingsByOrg };
  } catch (err: any) {
    console.error('[MongoDB] Error loading data from MongoDB:', err.message);
    return null;
  }
}

export async function clearMongoDb(): Promise<{
  success: boolean;
  accountsDeleted: number;
  transactionsDeleted: number;
  auditLogsDeleted: number;
}> {
  try {
    const conn = await getMongoClient();
    if (!conn) {
      return { success: false, accountsDeleted: 0, transactionsDeleted: 0, auditLogsDeleted: 0 };
    }

    const accRes = await conn.db.collection('accounts').deleteMany({});
    const txnRes = await conn.db.collection('transactions').deleteMany({});
    const auditRes = await conn.db.collection('auditLogs').deleteMany({});

    console.log(
      `[MongoDB] Cleared all data: ${accRes.deletedCount} accounts, ${txnRes.deletedCount} txns, ${auditRes.deletedCount} audit logs`
    );
    lastSyncedAt = new Date().toISOString();

    return {
      success: true,
      accountsDeleted: accRes.deletedCount,
      transactionsDeleted: txnRes.deletedCount,
      auditLogsDeleted: auditRes.deletedCount,
    };
  } catch (err: any) {
    console.error('[MongoDB] Error wiping MongoDB database:', err.message);
    return { success: false, accountsDeleted: 0, transactionsDeleted: 0, auditLogsDeleted: 0 };
  }
}

export async function saveAllToMongo(data: {
  accounts: Account[];
  transactions: Transaction[];
  auditLogs: AuditLog[];
  organizations?: Organization[];
  users?: AppUser[];
  settingsByOrg?: Record<string, SystemSettings>;
}): Promise<boolean> {
  try {
    const conn = await getMongoClient();
    if (!conn) return false;

    const accountsColl = conn.db.collection('accounts');
    const txnsColl = conn.db.collection('transactions');
    const auditsColl = conn.db.collection('auditLogs');
    const settingsColl = conn.db.collection('settings');
    const orgsColl = conn.db.collection('organizations');
    const usersColl = conn.db.collection('users');

    if (data.accounts.length > 0) {
      const ops = data.accounts.map((acc) => ({
        replaceOne: { filter: { _id: acc._id }, replacement: acc, upsert: true },
      }));
      await accountsColl.bulkWrite(ops as any);
    }

    if (data.transactions.length > 0) {
      const ops = data.transactions.map((txn) => ({
        replaceOne: { filter: { _id: txn._id }, replacement: txn, upsert: true },
      }));
      await txnsColl.bulkWrite(ops as any);
    }

    if (data.auditLogs.length > 0) {
      const recentAudits = data.auditLogs.slice(0, 1000);
      const ops = recentAudits.map((log) => ({
        replaceOne: { filter: { _id: log._id }, replacement: log, upsert: true },
      }));
      await auditsColl.bulkWrite(ops as any);
    }

    if (data.organizations && data.organizations.length > 0) {
      const ops = data.organizations.map((org) => ({
        replaceOne: { filter: { _id: org._id }, replacement: org, upsert: true },
      }));
      await orgsColl.bulkWrite(ops as any);
    }

    if (data.users && data.users.length > 0) {
      const ops = data.users.map((u) => ({
        replaceOne: { filter: { _id: u._id }, replacement: u, upsert: true },
      }));
      await usersColl.bulkWrite(ops as any);
    }

    if (data.settingsByOrg) {
      for (const [orgId, settings] of Object.entries(data.settingsByOrg)) {
        await settingsColl.replaceOne(
          { organizationId: orgId } as any,
          { organizationId: orgId, ...settings } as any,
          { upsert: true }
        );
      }
    }

    lastSyncedAt = new Date().toISOString();
    return true;
  } catch (err: any) {
    console.error('[MongoDB] Error syncing data to MongoDB:', err.message);
    connectionError = err.message;
    return false;
  }
}

export async function getMongoStatus() {
  try {
    const conn = await getMongoClient();
    if (!conn) {
      return {
        connected: false,
        database: db?.databaseName || 'Not configured',
        uriConfigured: !!MONGO_URI,
        maskedUri: MONGO_URI ? MONGO_URI.replace(/:([^:@]+)@/, ':****@') : '(not set)',
        error: connectionError || 'Could not connect to MongoDB server',
        lastSyncedAt,
      };
    }

    const ping = await conn.db.command({ ping: 1 });
    const accountsCount = await conn.db.collection('accounts').countDocuments();
    const transactionsCount = await conn.db.collection('transactions').countDocuments();
    const auditLogsCount = await conn.db.collection('auditLogs').countDocuments();
    const organizationsCount = await conn.db.collection('organizations').countDocuments();

    return {
      connected: true,
      pingOk: ping.ok === 1,
      database: conn.db.databaseName,
      uriConfigured: true,
      maskedUri: MONGO_URI.replace(/:([^:@]+)@/, ':****@'),
      stats: {
        accountsCount,
        transactionsCount,
        auditLogsCount,
        organizationsCount,
      },
      lastSyncedAt: lastSyncedAt || new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      connected: false,
      database: db?.databaseName || 'Not configured',
      error: err.message,
      maskedUri: MONGO_URI ? MONGO_URI.replace(/:([^:@]+)@/, ':****@') : '(not set)',
      lastSyncedAt,
    };
  }
}
