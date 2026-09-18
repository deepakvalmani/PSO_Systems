var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api-src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => handler
});
module.exports = __toCommonJS(index_exports);

// app-server.ts
var import_express = __toESM(require("express"));
var import_cookie_parser = __toESM(require("cookie-parser"));
var import_path2 = __toESM(require("path"));

// server/db.ts
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));

// server/mongo.ts
var import_mongodb = require("mongodb");
var import_dotenv = __toESM(require("dotenv"));
import_dotenv.default.config();
var MONGO_URI = process.env.MONGODB_URI || "";
if (!MONGO_URI) {
  console.error(
    "[MongoDB] MONGODB_URI is not set. Mongo-backed persistence is DISABLED for this run; the app will fall back to the local JSON file store (server/db.ts). Set MONGODB_URI in your environment (see .env.example) to enable MongoDB Atlas sync."
  );
}
var client = null;
var db = null;
var isConnected = false;
var lastSyncedAt = null;
var connectionError = MONGO_URI ? null : "MONGODB_URI not configured";
async function getMongoClient() {
  if (!MONGO_URI) return null;
  if (client && db && isConnected) {
    return { client, db };
  }
  try {
    client = new import_mongodb.MongoClient(MONGO_URI, {
      serverSelectionTimeoutMS: 5e3,
      connectTimeoutMS: 1e4
    });
    await client.connect();
    db = client.db();
    isConnected = true;
    connectionError = null;
    console.log(`[MongoDB] Connected successfully using database URL (Database: "${db.databaseName}")`);
    await ensureIndexes(db);
    return { client, db };
  } catch (err) {
    isConnected = false;
    connectionError = err.message || "Failed to connect to MongoDB";
    console.error("[MongoDB] Connection error:", err.message);
    return null;
  }
}
async function ensureIndexes(database) {
  try {
    await database.collection("accounts").createIndex({ _id: 1 });
    await database.collection("accounts").createIndex({ organizationId: 1 });
    await database.collection("accounts").createIndex({ organizationId: 1, accountCode: 1 }, { unique: true, sparse: true });
    await database.collection("transactions").createIndex({ _id: 1 });
    await database.collection("transactions").createIndex({ organizationId: 1 });
    await database.collection("transactions").createIndex({ organizationId: 1, transactionNumber: 1 }, { unique: true, sparse: true });
    await database.collection("transactions").createIndex({ accountId: 1, date: 1 });
    await database.collection("auditLogs").createIndex({ _id: 1 });
    await database.collection("auditLogs").createIndex({ organizationId: 1 });
    await database.collection("organizations").createIndex({ _id: 1 });
    await database.collection("organizations").createIndex({ slug: 1 }, { unique: true, sparse: true });
    await database.collection("users").createIndex({ _id: 1 });
    await database.collection("users").createIndex({ username: 1 }, { unique: true, sparse: true });
    await database.collection("users").createIndex({ organizationId: 1 });
    await database.collection("settings").createIndex({ organizationId: 1 }, { unique: true, sparse: true });
  } catch (err) {
    console.warn("[MongoDB] Index creation note:", err.message);
  }
}
async function loadDataFromMongo() {
  try {
    const conn = await getMongoClient();
    if (!conn) return null;
    const orgsCount = await conn.db.collection("organizations").countDocuments();
    if (orgsCount === 0) {
      console.log("[MongoDB] No organizations found. Needs initial seed (run `npm run seed`).");
      return null;
    }
    const accounts = await conn.db.collection("accounts").find({}).toArray();
    const transactions = await conn.db.collection("transactions").find({}).toArray();
    const auditLogs = await conn.db.collection("auditLogs").find({}).sort({ createdAt: -1 }).limit(2e3).toArray();
    const organizations = await conn.db.collection("organizations").find({}).toArray();
    const users = await conn.db.collection("users").find({}).toArray();
    const settingsDocs = await conn.db.collection("settings").find({}).toArray();
    const settingsByOrg = {};
    for (const s of settingsDocs) {
      if (s.organizationId) settingsByOrg[s.organizationId] = s;
    }
    console.log(
      `[MongoDB] Loaded ${organizations.length} organizations, ${users.length} users, ${accounts.length} accounts, ${transactions.length} transactions, and ${auditLogs.length} audit logs from MongoDB Atlas.`
    );
    return { accounts, transactions, auditLogs, organizations, users, settingsByOrg };
  } catch (err) {
    console.error("[MongoDB] Error loading data from MongoDB:", err.message);
    return null;
  }
}
async function saveAllToMongo(data) {
  try {
    const conn = await getMongoClient();
    if (!conn) return false;
    const accountsColl = conn.db.collection("accounts");
    const txnsColl = conn.db.collection("transactions");
    const auditsColl = conn.db.collection("auditLogs");
    const settingsColl = conn.db.collection("settings");
    const orgsColl = conn.db.collection("organizations");
    const usersColl = conn.db.collection("users");
    if (data.accounts.length > 0) {
      const ops = data.accounts.map((acc) => ({
        replaceOne: { filter: { _id: acc._id }, replacement: acc, upsert: true }
      }));
      await accountsColl.bulkWrite(ops);
    }
    if (data.transactions.length > 0) {
      const ops = data.transactions.map((txn) => ({
        replaceOne: { filter: { _id: txn._id }, replacement: txn, upsert: true }
      }));
      await txnsColl.bulkWrite(ops);
    }
    if (data.auditLogs.length > 0) {
      const recentAudits = data.auditLogs.slice(0, 1e3);
      const ops = recentAudits.map((log) => ({
        replaceOne: { filter: { _id: log._id }, replacement: log, upsert: true }
      }));
      await auditsColl.bulkWrite(ops);
    }
    if (data.organizations && data.organizations.length > 0) {
      const ops = data.organizations.map((org) => ({
        replaceOne: { filter: { _id: org._id }, replacement: org, upsert: true }
      }));
      await orgsColl.bulkWrite(ops);
    }
    if (data.users && data.users.length > 0) {
      const ops = data.users.map((u) => ({
        replaceOne: { filter: { _id: u._id }, replacement: u, upsert: true }
      }));
      await usersColl.bulkWrite(ops);
    }
    if (data.settingsByOrg) {
      for (const [orgId, settings] of Object.entries(data.settingsByOrg)) {
        await settingsColl.replaceOne(
          { organizationId: orgId },
          { organizationId: orgId, ...settings },
          { upsert: true }
        );
      }
    }
    lastSyncedAt = (/* @__PURE__ */ new Date()).toISOString();
    return true;
  } catch (err) {
    console.error("[MongoDB] Error syncing data to MongoDB:", err.message);
    connectionError = err.message;
    return false;
  }
}
async function getMongoStatus() {
  try {
    const conn = await getMongoClient();
    if (!conn) {
      return {
        connected: false,
        database: db?.databaseName || "Not configured",
        uriConfigured: !!MONGO_URI,
        maskedUri: MONGO_URI ? MONGO_URI.replace(/:([^:@]+)@/, ":****@") : "(not set)",
        error: connectionError || "Could not connect to MongoDB server",
        lastSyncedAt
      };
    }
    const ping = await conn.db.command({ ping: 1 });
    const accountsCount = await conn.db.collection("accounts").countDocuments();
    const transactionsCount = await conn.db.collection("transactions").countDocuments();
    const auditLogsCount = await conn.db.collection("auditLogs").countDocuments();
    const organizationsCount = await conn.db.collection("organizations").countDocuments();
    return {
      connected: true,
      pingOk: ping.ok === 1,
      database: conn.db.databaseName,
      uriConfigured: true,
      maskedUri: MONGO_URI.replace(/:([^:@]+)@/, ":****@"),
      stats: {
        accountsCount,
        transactionsCount,
        auditLogsCount,
        organizationsCount
      },
      lastSyncedAt: lastSyncedAt || (/* @__PURE__ */ new Date()).toISOString()
    };
  } catch (err) {
    return {
      connected: false,
      database: db?.databaseName || "Not configured",
      error: err.message,
      maskedUri: MONGO_URI ? MONGO_URI.replace(/:([^:@]+)@/, ":****@") : "(not set)",
      lastSyncedAt
    };
  }
}

// server/db.ts
var DATA_DIR = import_path.default.join(process.cwd(), "data");
var DB_FILE = import_path.default.join(DATA_DIR, "ledger_store.json");
var defaultSettings = {
  businessName: "My Petrol Pump",
  businessLogo: "",
  address: "",
  phone: "",
  email: "",
  currency: "Rs.",
  dateFormat: "DD/MM/YYYY",
  rowsPerPage: 25,
  reportFooter: "This is a computer-generated financial document.",
  financialYearStartMonth: 7,
  // July in Pakistan / Commonwealth
  defaultDashboardPeriod: "THIS_MONTH"
};
function makeDefaultSettingsForOrg(organizationId, businessName) {
  return {
    ...defaultSettings,
    organizationId,
    businessName: businessName || defaultSettings.businessName
  };
}
try {
  if (!import_fs.default.existsSync(DATA_DIR)) {
    import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
  }
} catch (err) {
  console.warn("[DB] Local data directory unavailable (expected on read-only filesystems):", err.message);
}
var dbCache = null;
var isMongoInitialized = false;
function emptyDb() {
  return {
    accounts: [],
    transactions: [],
    auditLogs: [],
    organizations: [],
    users: [],
    settingsByOrg: {}
  };
}
function normalizeDb(raw) {
  const db2 = emptyDb();
  if (!raw) return db2;
  db2.accounts = raw.accounts || [];
  db2.transactions = raw.transactions || [];
  db2.auditLogs = raw.auditLogs || [];
  db2.organizations = raw.organizations || [];
  db2.users = raw.users || [];
  db2.settingsByOrg = raw.settingsByOrg || {};
  return db2;
}
async function initDb() {
  if (isMongoInitialized && dbCache) {
    return dbCache;
  }
  try {
    const mongoData = await loadDataFromMongo();
    if (mongoData) {
      dbCache = normalizeDb(mongoData);
      for (const acc of dbCache.accounts) {
        recalculateLedgerInMemory(acc._id, dbCache);
      }
      isMongoInitialized = true;
      writeDbFileAtomic(dbCache);
      return dbCache;
    }
  } catch (err) {
    console.error("[DB] Failed initializing from MongoDB, falling back to local store:", err);
  }
  if (import_fs.default.existsSync(DB_FILE)) {
    try {
      const content = import_fs.default.readFileSync(DB_FILE, "utf-8");
      dbCache = normalizeDb(JSON.parse(content));
      for (const acc of dbCache.accounts) {
        recalculateLedgerInMemory(acc._id, dbCache);
      }
      isMongoInitialized = true;
      return dbCache;
    } catch (err) {
      console.error("Error reading database file:", err);
    }
  }
  dbCache = emptyDb();
  saveDb(dbCache);
  isMongoInitialized = true;
  return dbCache;
}
function getDb() {
  if (dbCache) {
    return dbCache;
  }
  if (import_fs.default.existsSync(DB_FILE)) {
    try {
      const content = import_fs.default.readFileSync(DB_FILE, "utf-8");
      dbCache = normalizeDb(JSON.parse(content));
      for (const acc of dbCache.accounts) {
        recalculateLedgerInMemory(acc._id, dbCache);
      }
      return dbCache;
    } catch (err) {
      console.error("Error reading database file:", err);
    }
  }
  dbCache = emptyDb();
  saveDb(dbCache);
  return dbCache;
}
function getSettingsForOrg(db2, organizationId) {
  if (!db2.settingsByOrg[organizationId]) {
    db2.settingsByOrg[organizationId] = makeDefaultSettingsForOrg(organizationId);
  }
  return db2.settingsByOrg[organizationId];
}
function writeDbFileAtomic(data) {
  const tmpFile = import_path.default.join(DATA_DIR, `.ledger_store.${process.pid}.${Date.now()}.tmp`);
  try {
    import_fs.default.writeFileSync(tmpFile, JSON.stringify(data, null, 2), "utf-8");
    import_fs.default.renameSync(tmpFile, DB_FILE);
  } catch (err) {
    console.error("Error saving database to file:", err);
    try {
      if (import_fs.default.existsSync(tmpFile)) import_fs.default.unlinkSync(tmpFile);
    } catch {
    }
  }
}
var writeQueue = Promise.resolve();
function saveDb(data) {
  dbCache = data;
  const snapshot = JSON.parse(JSON.stringify(data));
  writeQueue = writeQueue.then(() => {
    writeDbFileAtomic(snapshot);
  }).catch((err) => {
    console.error("[DB] Error in serialized write queue:", err);
  });
  saveAllToMongo(data).catch((err) => {
    console.error("[DB] Asynchronous MongoDB sync error:", err);
  });
}
function recalculateLedgerInMemory(accountId, db2) {
  const account = db2.accounts.find((a) => a._id === accountId);
  if (!account) return;
  const nonDeleted = db2.transactions.filter((t) => t.accountId === accountId && !t.isDeleted).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });
  let running = account.openingBalancePaisa;
  let totalBilled = account.openingBalancePaisa > 0 ? account.openingBalancePaisa : 0;
  let totalPaid = account.openingBalancePaisa < 0 ? Math.abs(account.openingBalancePaisa) : 0;
  for (const txn of nonDeleted) {
    if (txn.type === "DEBIT") {
      running += txn.amountPaisa;
      totalBilled += txn.amountPaisa;
    } else {
      running -= txn.amountPaisa;
      totalPaid += txn.amountPaisa;
    }
    txn.balanceAfterPaisa = running;
    txn.balanceAfterType = running > 0 ? "DEBIT" : running < 0 ? "CREDIT" : "ZERO";
  }
  account.currentBalancePaisa = running;
  account.currentBalanceType = running > 0 ? "DEBIT" : running < 0 ? "CREDIT" : "ZERO";
  account.totalTransactions = nonDeleted.length;
  account.firstTransactionDate = nonDeleted[0]?.date || void 0;
  account.lastTransactionDate = nonDeleted[nonDeleted.length - 1]?.date || void 0;
  account.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
  account.totalBilledPaisa = totalBilled;
  account.totalPaidPaisa = totalPaid;
  account.remainingAmountPaisa = Math.max(0, running);
  if (running === 0) {
    account.paymentStatus = totalBilled > 0 ? "PAID_IN_FULL" : "ZERO";
    account.paidPercentage = totalBilled > 0 ? 100 : 0;
  } else if (running > 0) {
    if (totalPaid > 0) {
      account.paymentStatus = "PARTIALLY_PAID";
      account.paidPercentage = totalBilled > 0 ? Math.min(100, Math.max(0, Math.round(totalPaid / totalBilled * 100))) : 0;
    } else {
      account.paymentStatus = "UNPAID";
      account.paidPercentage = 0;
    }
  } else {
    account.paymentStatus = "ADVANCE";
    account.paidPercentage = 100;
  }
}

// server/services.ts
function orgAccounts(organizationId) {
  return getDb().accounts.filter((a) => a.organizationId === organizationId);
}
function orgTransactions(organizationId) {
  return getDb().transactions.filter((t) => t.organizationId === organizationId);
}
function recalculateAllLedgers(organizationId) {
  const db2 = getDb();
  for (const acc of db2.accounts.filter((a) => a.organizationId === organizationId)) {
    recalculateLedgerInMemory(acc._id, db2);
  }
  saveDb(db2);
}
function getAccountBalanceBeforeDate(organizationId, accountId, beforeDate) {
  const db2 = getDb();
  const acc = db2.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
  if (!acc) return 0;
  const preTxns = db2.transactions.filter(
    (t) => t.accountId === accountId && t.organizationId === organizationId && !t.isDeleted && t.date < beforeDate
  );
  let bal = acc.openingBalancePaisa;
  for (const t of preTxns) {
    if (t.type === "DEBIT") bal += t.amountPaisa;
    else bal -= t.amountPaisa;
  }
  return bal;
}
function getAccountBalanceAsOfDate(organizationId, accountId, asOfDate) {
  const db2 = getDb();
  const acc = db2.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
  if (!acc) return 0;
  const txns = db2.transactions.filter(
    (t) => t.accountId === accountId && t.organizationId === organizationId && !t.isDeleted && t.date <= asOfDate
  );
  let bal = acc.openingBalancePaisa;
  for (const t of txns) {
    if (t.type === "DEBIT") bal += t.amountPaisa;
    else bal -= t.amountPaisa;
  }
  return bal;
}
function generateAccountStatement(organizationId, accountId, dateFrom, dateTo) {
  const db2 = getDb();
  const account = db2.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
  if (!account) return null;
  const openingBalancePaisa = getAccountBalanceBeforeDate(organizationId, accountId, dateFrom);
  const periodTxns = db2.transactions.filter((t) => t.accountId === accountId && t.organizationId === organizationId && !t.isDeleted && t.date >= dateFrom && t.date <= dateTo).sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.createdAt.localeCompare(b.createdAt);
  });
  let running = openingBalancePaisa;
  let totalDebitPaisa = 0;
  let totalCreditPaisa = 0;
  const ledgerRows = periodTxns.map((t) => {
    if (t.type === "DEBIT") {
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
      debitPaisa: t.type === "DEBIT" ? t.amountPaisa : 0,
      creditPaisa: t.type === "CREDIT" ? t.amountPaisa : 0,
      balanceAfterPaisa: running,
      balanceAfterType: running > 0 ? "DEBIT" : running < 0 ? "CREDIT" : "ZERO",
      notes: t.notes
    };
  });
  const closingBalancePaisa = openingBalancePaisa + totalDebitPaisa - totalCreditPaisa;
  const totalBilledPaisa = openingBalancePaisa > 0 ? openingBalancePaisa + totalDebitPaisa : totalDebitPaisa;
  const totalPaidPaisa = openingBalancePaisa < 0 ? Math.abs(openingBalancePaisa) + totalCreditPaisa : totalCreditPaisa;
  const remainingAmountPaisa = Math.max(0, closingBalancePaisa);
  const paidPercentage = totalBilledPaisa > 0 ? Math.min(100, Math.max(0, Math.round(totalPaidPaisa / totalBilledPaisa * 100))) : totalPaidPaisa > 0 ? 100 : 0;
  const paymentStatus = closingBalancePaisa === 0 ? totalBilledPaisa > 0 ? "PAID_IN_FULL" : "ZERO" : closingBalancePaisa > 0 ? totalPaidPaisa > 0 ? "PARTIALLY_PAID" : "UNPAID" : "ADVANCE";
  return {
    account,
    statementPeriod: {
      dateFrom,
      dateTo
    },
    openingBalancePaisa,
    openingBalanceType: openingBalancePaisa > 0 ? "DEBIT" : openingBalancePaisa < 0 ? "CREDIT" : "ZERO",
    closingBalancePaisa,
    closingBalanceType: closingBalancePaisa > 0 ? "DEBIT" : closingBalancePaisa < 0 ? "CREDIT" : "ZERO",
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
    generatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
}
function getDashboardSummary(organizationId, dateFrom, dateTo) {
  const accounts = orgAccounts(organizationId);
  const nonDeleted = orgTransactions(organizationId).filter((t) => !t.isDeleted);
  const periodTxns = nonDeleted.filter((t) => t.date >= dateFrom && t.date <= dateTo);
  let periodDebitPaisa = 0;
  let periodCreditPaisa = 0;
  const activeAccountsInPeriod = /* @__PURE__ */ new Set();
  for (const t of periodTxns) {
    if (t.type === "DEBIT") periodDebitPaisa += t.amountPaisa;
    else periodCreditPaisa += t.amountPaisa;
    activeAccountsInPeriod.add(t.accountId);
  }
  const todayStr = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
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
  const avgTransactionValuePaisa = periodTxns.length > 0 ? Math.round((periodDebitPaisa + periodCreditPaisa) / periodTxns.length) : 0;
  let openingSystemPositionPaisa = 0;
  let closingSystemPositionPaisa = 0;
  for (const acc of accounts) {
    openingSystemPositionPaisa += getAccountBalanceBeforeDate(organizationId, acc._id, dateFrom);
    closingSystemPositionPaisa += getAccountBalanceAsOfDate(organizationId, acc._id, dateTo);
  }
  return {
    totalAccounts: accounts.length,
    activeAccounts: accounts.filter((a) => a.status === "ACTIVE").length,
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
      return billed > 0 ? Math.min(100, Math.round(paid / billed * 100)) : 100;
    })(),
    unpaidAccountsCount: accounts.filter((a) => a.paymentStatus === "UNPAID").length,
    partialAccountsCount: accounts.filter((a) => a.paymentStatus === "PARTIALLY_PAID").length,
    paidAccountsCount: accounts.filter((a) => a.paymentStatus === "PAID_IN_FULL").length,
    avgTransactionValuePaisa,
    openingSystemPositionPaisa,
    closingSystemPositionPaisa
  };
}
function getPeriodComparisonData(organizationId, currentFrom, currentTo, compareFrom, compareTo) {
  const txns = orgTransactions(organizationId).filter((t) => !t.isDeleted);
  const curTxns = txns.filter((t) => t.date >= currentFrom && t.date <= currentTo);
  const cmpTxns = txns.filter((t) => t.date >= compareFrom && t.date <= compareTo);
  let curDebit = 0, curCredit = 0;
  const curAccounts = /* @__PURE__ */ new Set();
  for (const t of curTxns) {
    if (t.type === "DEBIT") curDebit += t.amountPaisa;
    else curCredit += t.amountPaisa;
    curAccounts.add(t.accountId);
  }
  let cmpDebit = 0, cmpCredit = 0;
  const cmpAccounts = /* @__PURE__ */ new Set();
  for (const t of cmpTxns) {
    if (t.type === "DEBIT") cmpDebit += t.amountPaisa;
    else cmpCredit += t.amountPaisa;
    cmpAccounts.add(t.accountId);
  }
  const calcPct = (curr, prev) => {
    if (prev === 0) return curr === 0 ? 0 : null;
    return Number(((curr - prev) / Math.abs(prev) * 100).toFixed(1));
  };
  return {
    currentPeriod: {
      label: `${currentFrom} - ${currentTo}`,
      debitPaisa: curDebit,
      creditPaisa: curCredit,
      netMovementPaisa: curDebit - curCredit,
      transactionCount: curTxns.length,
      activeAccounts: curAccounts.size,
      avgTransactionPaisa: curTxns.length ? Math.round((curDebit + curCredit) / curTxns.length) : 0
    },
    comparisonPeriod: {
      label: `${compareFrom} - ${compareTo}`,
      debitPaisa: cmpDebit,
      creditPaisa: cmpCredit,
      netMovementPaisa: cmpDebit - cmpCredit,
      transactionCount: cmpTxns.length,
      activeAccounts: cmpAccounts.size,
      avgTransactionPaisa: cmpTxns.length ? Math.round((cmpDebit + cmpCredit) / cmpTxns.length) : 0
    },
    percentageChanges: {
      debit: calcPct(curDebit, cmpDebit),
      credit: calcPct(curCredit, cmpCredit),
      netMovement: calcPct(curDebit - curCredit, cmpDebit - cmpCredit),
      transactions: calcPct(curTxns.length, cmpTxns.length),
      activeAccounts: calcPct(curAccounts.size, cmpAccounts.size)
    }
  };
}
function getChartTrends(organizationId, dateFrom, dateTo, interval = "daily") {
  const txns = orgTransactions(organizationId).filter((t) => !t.isDeleted && t.date >= dateFrom && t.date <= dateTo).sort((a, b) => a.date.localeCompare(b.date));
  const buckets = {};
  for (const t of txns) {
    let key = t.date;
    let label = t.date.slice(5);
    if (interval === "monthly") {
      key = t.date.slice(0, 7);
      label = key;
    }
    if (!buckets[key]) {
      buckets[key] = { label, debitPkr: 0, creditPkr: 0, netPkr: 0, count: 0, activeAccounts: /* @__PURE__ */ new Set() };
    }
    const pkr = t.amountPaisa / 100;
    if (t.type === "DEBIT") {
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
      cumulativeCredit: Math.round(cumulativeCredit)
    };
  });
  return points;
}
function findPotentialDuplicates(organizationId, accountId, date, amountPaisa, type, description) {
  const cleanDesc = description.trim().toLowerCase();
  return orgTransactions(organizationId).filter(
    (t) => !t.isDeleted && t.accountId === accountId && t.date === date && t.amountPaisa === amountPaisa && t.type === type && t.description.trim().toLowerCase() === cleanDesc
  );
}

// server/auth.ts
var import_bcryptjs = __toESM(require("bcryptjs"));
var import_jsonwebtoken = __toESM(require("jsonwebtoken"));
var COOKIE_NAME = "ledgerone_session";
var DEV_ONLY_SECRET = "dev-only-insecure-secret-do-not-use-in-production";
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) return secret;
  if (process.env.NODE_ENV === "production") {
    console.error("[Auth] FATAL: JWT_SECRET is not set in production. Refusing to start.");
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  console.warn(
    "[Auth] WARNING: JWT_SECRET is not set. Falling back to an insecure dev-only secret. Set JWT_SECRET in your environment before deploying to production."
  );
  return DEV_ONLY_SECRET;
}
async function hashPassword(plain) {
  return import_bcryptjs.default.hash(plain, 10);
}
async function verifyPassword(plain, hash) {
  return import_bcryptjs.default.compare(plain, hash);
}
function signSession(payload) {
  return import_jsonwebtoken.default.sign(payload, getJwtSecret(), { expiresIn: "7d" });
}
function verifySession(token) {
  try {
    return import_jsonwebtoken.default.verify(token, getJwtSecret());
  } catch {
    return null;
  }
}
function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1e3,
    path: "/"
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}
var PUBLIC_PATHS = /* @__PURE__ */ new Set(["/api/health", "/api/auth/login"]);
function authMiddleware(req, res, next) {
  if (!req.path.startsWith("/api/")) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const session = verifySession(token);
  if (!session) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }
  req.userId = session.userId;
  req.organizationId = session.organizationId;
  req.userRole = session.role;
  next();
}
function requireSuperAdmin(req, res, next) {
  if (req.userRole !== "SUPER_ADMIN") {
    res.status(403).json({ error: "Super-admin access required" });
    return;
  }
  next();
}
function requireOrgScope(req, res, next) {
  if (req.userRole === "SUPER_ADMIN") {
    res.status(403).json({ error: "This route is scoped to a pump account, not the super-admin" });
    return;
  }
  if (!req.organizationId) {
    res.status(401).json({ error: "No organization associated with this session" });
    return;
  }
  next();
}
function generateStrongPassword(length = 14) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// server/plans.ts
var PLANS = {
  BASIC: {
    id: "BASIC",
    label: "Basic",
    features: {
      analytics: false,
      exports: false,
      multiUser: false,
      auditHistory: true,
      customReports: false
    }
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    features: {
      analytics: true,
      exports: true,
      multiUser: false,
      auditHistory: true,
      customReports: true
    }
  },
  ENTERPRISE: {
    id: "ENTERPRISE",
    label: "Enterprise",
    features: {
      analytics: true,
      exports: true,
      multiUser: true,
      auditHistory: true,
      customReports: true
    }
  }
};
var DEFAULT_PLAN_ID = "BASIC";
function getPlanFeatures(planId) {
  return { ...(PLANS[planId] || PLANS[DEFAULT_PLAN_ID]).features };
}

// app-server.ts
var IS_SERVERLESS = !!process.env.VERCEL;
async function createApp() {
  const app = (0, import_express.default)();
  app.use(import_express.default.json());
  app.use((0, import_cookie_parser.default)());
  await initDb();
  const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
  const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
  const isValidDateStr = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isPositiveIntegerAmount = (v) => {
    const n = typeof v === "string" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) && n > 0;
  };
  const isValidTxnType = (v) => v === "DEBIT" || v === "CREDIT";
  const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `org-${Date.now()}`;
  function getOrgOrThrow(organizationId) {
    const db2 = getDb();
    const org = db2.organizations.find((o) => o._id === organizationId);
    if (!org) throw Object.assign(new Error("Organization not found"), { statusCode: 404 });
    return org;
  }
  function requireFeature(flag) {
    return (req, res, next) => {
      if (req.userRole === "SUPER_ADMIN") return next();
      const db2 = getDb();
      const org = db2.organizations.find((o) => o._id === req.organizationId);
      if (!org) {
        res.status(404).json({ error: "Organization not found" });
        return;
      }
      if (!org.features?.[flag]) {
        res.status(403).json({ error: `Your plan does not include this feature: ${flag}. Contact support to upgrade.` });
        return;
      }
      next();
    };
  }
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  });
  app.post("/api/auth/login", asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: "username and password are required" });
    }
    const db2 = getDb();
    const user = db2.users.find((u) => u.username && u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid username or password" });
    }
    user.lastLoginAt = (/* @__PURE__ */ new Date()).toISOString();
    saveDb(db2);
    const token = signSession({ userId: user._id, organizationId: user.organizationId, role: user.role });
    setSessionCookie(res, token);
    let organization = null;
    if (user.organizationId) {
      organization = db2.organizations.find((o) => o._id === user.organizationId) || null;
      if (organization && !organization.isActive) {
        clearSessionCookie(res);
        return res.status(403).json({ error: "This pump account has been suspended. Contact support." });
      }
    }
    res.json({
      user: { username: user.username, role: user.role, organizationId: user.organizationId },
      organization
    });
  }));
  app.post("/api/auth/logout", (req, res) => {
    clearSessionCookie(res);
    res.json({ success: true });
  });
  app.use(authMiddleware);
  app.get("/api/auth/me", (req, res) => {
    const db2 = getDb();
    const user = db2.users.find((u) => u._id === req.userId);
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    let organization = null;
    if (user.organizationId) {
      organization = db2.organizations.find((o) => o._id === user.organizationId) || null;
    }
    res.json({
      user: { username: user.username, role: user.role, organizationId: user.organizationId },
      organization
    });
  });
  app.post("/api/admin/organizations", requireSuperAdmin, asyncHandler(async (req, res) => {
    const { name, phone, address, city, username, password, planId, features } = req.body || {};
    if (!isNonEmptyString(name) || !isNonEmptyString(username) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: "name, username and password are required" });
    }
    const db2 = getDb();
    if (db2.users.some((u) => u.username && u.username.toLowerCase() === username.trim().toLowerCase())) {
      return res.status(409).json({ error: "That username is already taken" });
    }
    const chosenPlanId = planId && PLANS[planId] ? planId : DEFAULT_PLAN_ID;
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let n = 1;
    while (db2.organizations.some((o) => o.slug === slug)) {
      slug = `${baseSlug}-${++n}`;
    }
    const orgId = `org_${Date.now()}`;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const org = {
      _id: orgId,
      name: name.trim(),
      slug,
      phone: phone || "",
      address: address || "",
      city: city || "",
      isActive: true,
      planId: chosenPlanId,
      features: { ...getPlanFeatures(chosenPlanId), ...features || {} },
      createdAt: now,
      updatedAt: now
    };
    db2.organizations.push(org);
    const passwordHash = await hashPassword(password);
    const user = {
      _id: `user_${Date.now()}`,
      organizationId: orgId,
      username: username.trim(),
      passwordHash,
      role: "ORG_ADMIN",
      createdAt: now
    };
    db2.users.push(user);
    getSettingsForOrg(db2, orgId).businessName = org.name;
    saveDb(db2);
    res.status(201).json({ organization: org, username: user.username });
  }));
  app.get("/api/admin/organizations", requireSuperAdmin, (req, res) => {
    const db2 = getDb();
    const rows = db2.organizations.map((org) => {
      const accountCount = db2.accounts.filter((a) => a.organizationId === org._id).length;
      const transactionCount = db2.transactions.filter((t) => t.organizationId === org._id).length;
      const admins = db2.users.filter((u) => u.organizationId === org._id).map((u) => u.username);
      return { ...org, accountCount, transactionCount, admins };
    });
    res.json({ organizations: rows });
  });
  app.patch("/api/admin/organizations/:id", requireSuperAdmin, (req, res) => {
    const db2 = getDb();
    const org = db2.organizations.find((o) => o._id === req.params.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    const { name, phone, address, city, isActive, planId, features } = req.body || {};
    if (name !== void 0) org.name = name;
    if (phone !== void 0) org.phone = phone;
    if (address !== void 0) org.address = address;
    if (city !== void 0) org.city = city;
    if (isActive !== void 0) org.isActive = !!isActive;
    if (planId !== void 0 && PLANS[planId]) {
      org.planId = planId;
      org.features = { ...getPlanFeatures(planId), ...org.features || {} };
    }
    if (features !== void 0 && typeof features === "object") {
      org.features = { ...org.features, ...features };
    }
    org.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    saveDb(db2);
    res.json({ organization: org });
  });
  app.post("/api/admin/organizations/:id/reset-password", requireSuperAdmin, asyncHandler(async (req, res) => {
    const db2 = getDb();
    const org = db2.organizations.find((o) => o._id === req.params.id);
    if (!org) return res.status(404).json({ error: "Organization not found" });
    const user = db2.users.find((u) => u.organizationId === org._id && u.role === "ORG_ADMIN");
    if (!user) return res.status(404).json({ error: "No admin user found for this organization" });
    const newPassword = req.body && req.body.password || generateStrongPassword();
    user.passwordHash = await hashPassword(newPassword);
    saveDb(db2);
    res.json({ username: user.username, password: newPassword });
  }));
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/admin") || req.path.startsWith("/auth") || req.path === "/health") {
      return next();
    }
    return requireOrgScope(req, res, next);
  });
  app.get("/api/mongodb/status", requireSuperAdmin, async (req, res) => {
    const status = await getMongoStatus();
    res.json(status);
  });
  app.post("/api/mongodb/sync", requireSuperAdmin, asyncHandler(async (req, res) => {
    const db2 = getDb();
    const success = await saveAllToMongo(db2);
    res.json({ success, timestamp: (/* @__PURE__ */ new Date()).toISOString() });
  }));
  app.post("/api/database/clear", asyncHandler(async (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const accountsCleared = db2.accounts.filter((a) => a.organizationId === organizationId).length;
    const transactionsCleared = db2.transactions.filter((t) => t.organizationId === organizationId).length;
    const auditLogsCleared = db2.auditLogs.filter((l) => l.organizationId === organizationId).length;
    db2.accounts = db2.accounts.filter((a) => a.organizationId !== organizationId);
    db2.transactions = db2.transactions.filter((t) => t.organizationId !== organizationId);
    db2.auditLogs = db2.auditLogs.filter((l) => l.organizationId !== organizationId);
    saveDb(db2);
    res.json({
      message: "All accounts, transactions, and audit logs for your organization have been wiped.",
      success: true,
      accountsCleared,
      transactionsCleared,
      auditLogsCleared
    });
  }));
  app.get("/api/dashboard/summary", (req, res) => {
    const organizationId = req.organizationId;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const { dateFrom = `${today.slice(0, 8)}01`, dateTo = today } = req.query;
    const summary = getDashboardSummary(organizationId, dateFrom, dateTo);
    res.json(summary);
  });
  app.get("/api/dashboard/trends", (req, res) => {
    const organizationId = req.organizationId;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const { dateFrom = `${today.slice(0, 8)}01`, dateTo = today, interval = "daily" } = req.query;
    const trends = getChartTrends(organizationId, dateFrom, dateTo, interval);
    res.json(trends);
  });
  app.get("/api/dashboard/comparison", requireFeature("analytics"), (req, res) => {
    const organizationId = req.organizationId;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const {
      currentFrom = `${today.slice(0, 8)}01`,
      currentTo = today,
      compareFrom = `${today.slice(0, 8)}01`,
      compareTo = today
    } = req.query;
    const comparison = getPeriodComparisonData(organizationId, currentFrom, currentTo, compareFrom, compareTo);
    res.json(comparison);
  });
  app.get("/api/dashboard/tables", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const accounts = db2.accounts.filter((a) => a.organizationId === organizationId);
    const nonDeleted = db2.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted);
    const recentTxns = [...nonDeleted].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).slice(0, 8);
    const largestDebits = [...accounts].filter((a) => a.currentBalancePaisa > 0).sort((a, b) => b.currentBalancePaisa - a.currentBalancePaisa).slice(0, 5);
    const largestCredits = [...accounts].filter((a) => a.currentBalancePaisa < 0).sort((a, b) => a.currentBalancePaisa - b.currentBalancePaisa).slice(0, 5);
    const recentlyActive = [...accounts].filter((a) => a.lastTransactionDate).sort((a, b) => (b.lastTransactionDate || "").localeCompare(a.lastTransactionDate || "")).slice(0, 5);
    const refDate = Date.now();
    const dormant = accounts.map((a) => {
      const lastTime = a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : new Date(a.createdAt).getTime();
      const daysInactive = Math.floor((refDate - lastTime) / (1e3 * 60 * 60 * 24));
      return { ...a, daysInactive };
    }).filter((a) => a.daysInactive >= 30).sort((a, b) => b.daysInactive - a.daysInactive).slice(0, 5);
    res.json({
      recentTransactions: recentTxns,
      largestDebits,
      largestCredits,
      recentlyActive,
      dormant
    });
  });
  app.get("/api/accounts", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const {
      status,
      balanceType,
      paymentStatus,
      search,
      minBal,
      maxBal,
      lastActivity,
      page = "1",
      limit = "50"
    } = req.query;
    let list = db2.accounts.filter((a) => a.organizationId === organizationId);
    if (status && status !== "ALL") {
      list = list.filter((a) => a.status === status);
    }
    if (balanceType && balanceType !== "ALL") {
      list = list.filter((a) => a.currentBalanceType === balanceType);
    }
    if (paymentStatus && paymentStatus !== "ALL") {
      if (paymentStatus === "HAS_REMAINING") {
        list = list.filter((a) => (a.remainingAmountPaisa || 0) > 0);
      } else {
        list = list.filter((a) => a.paymentStatus === paymentStatus);
      }
    }
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) => a.accountName.toLowerCase().includes(q) || a.accountCode.toLowerCase().includes(q) || a.phone && a.phone.toLowerCase().includes(q) || a.address && a.address.toLowerCase().includes(q)
      );
    }
    if (minBal) {
      const min = parseInt(minBal, 10);
      list = list.filter((a) => Math.abs(a.currentBalancePaisa) >= min);
    }
    if (maxBal) {
      const max = parseInt(maxBal, 10);
      list = list.filter((a) => Math.abs(a.currentBalancePaisa) <= max);
    }
    if (lastActivity) {
      const ref = Date.now();
      list = list.filter((a) => {
        if (!a.lastTransactionDate) return lastActivity === "NEVER";
        const diffDays = Math.floor((ref - new Date(a.lastTransactionDate).getTime()) / (1e3 * 60 * 60 * 24));
        if (lastActivity === "TODAY") return diffDays === 0;
        if (lastActivity === "7_DAYS") return diffDays <= 7;
        if (lastActivity === "30_DAYS") return diffDays <= 30;
        if (lastActivity === "90_DAYS") return diffDays <= 90;
        if (lastActivity === "DORMANT_30") return diffDays > 30;
        if (lastActivity === "DORMANT_90") return diffDays > 90;
        return true;
      });
    }
    const total = list.length;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = list.slice(startIndex, startIndex + limitNum);
    const totalBilledPaisa = list.reduce((sum, a) => sum + (a.totalBilledPaisa || 0), 0);
    const totalPaidPaisa = list.reduce((sum, a) => sum + (a.totalPaidPaisa || 0), 0);
    const totalRemainingPaisa = list.reduce((sum, a) => sum + (a.remainingAmountPaisa || 0), 0);
    res.json({
      accounts: paginated,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      summary: {
        totalBilledPaisa,
        totalPaidPaisa,
        totalRemainingPaisa,
        unpaidCount: list.filter((a) => a.paymentStatus === "UNPAID").length,
        partialCount: list.filter((a) => a.paymentStatus === "PARTIALLY_PAID").length,
        paidCount: list.filter((a) => a.paymentStatus === "PAID_IN_FULL").length,
        advanceCount: list.filter((a) => a.paymentStatus === "ADVANCE").length
      }
    });
  });
  app.get("/api/accounts/:id", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const account = db2.accounts.find((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: "Account not found" });
    res.json(account);
  });
  app.get("/api/accounts/:id/summary", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const account = db2.accounts.find((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: "Account not found" });
    const txns = db2.transactions.filter((t) => t.accountId === account._id && t.organizationId === organizationId && !t.isDeleted).sort((a, b) => a.date.localeCompare(b.date));
    let totalDebitPaisa = 0;
    let totalCreditPaisa = 0;
    let debitCount = 0;
    let creditCount = 0;
    let largestDebitPaisa = 0;
    let largestCreditPaisa = 0;
    let activityThisMonth = 0;
    let activityThisYear = 0;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const thisMonthPrefix = today.slice(0, 7);
    const thisYearPrefix = today.slice(0, 4);
    for (const t of txns) {
      if (t.type === "DEBIT") {
        totalDebitPaisa += t.amountPaisa;
        debitCount++;
        if (t.amountPaisa > largestDebitPaisa) largestDebitPaisa = t.amountPaisa;
      } else {
        totalCreditPaisa += t.amountPaisa;
        creditCount++;
        if (t.amountPaisa > largestCreditPaisa) largestCreditPaisa = t.amountPaisa;
      }
      if (t.date.startsWith(thisMonthPrefix)) activityThisMonth++;
      if (t.date.startsWith(thisYearPrefix)) activityThisYear++;
    }
    const ref = Date.now();
    const lastDate = account.lastTransactionDate ? new Date(account.lastTransactionDate).getTime() : null;
    const daysSinceLast = lastDate ? Math.floor((ref - lastDate) / (1e3 * 60 * 60 * 24)) : null;
    res.json({
      account,
      openingBalancePaisa: account.openingBalancePaisa,
      totalDebitPaisa,
      totalCreditPaisa,
      currentBalancePaisa: account.currentBalancePaisa,
      transactionCount: txns.length,
      debitCount,
      creditCount,
      largestDebitPaisa,
      largestCreditPaisa,
      avgDebitPaisa: debitCount ? Math.round(totalDebitPaisa / debitCount) : 0,
      avgCreditPaisa: creditCount ? Math.round(totalCreditPaisa / creditCount) : 0,
      firstTransactionDate: account.firstTransactionDate,
      lastTransactionDate: account.lastTransactionDate,
      daysSinceLastTransaction: daysSinceLast,
      activityThisMonth,
      activityThisYear,
      totalBilledPaisa: account.totalBilledPaisa ?? (account.openingBalancePaisa > 0 ? account.openingBalancePaisa + totalDebitPaisa : totalDebitPaisa),
      totalPaidPaisa: account.totalPaidPaisa ?? (account.openingBalancePaisa < 0 ? Math.abs(account.openingBalancePaisa) + totalCreditPaisa : totalCreditPaisa),
      remainingAmountPaisa: account.remainingAmountPaisa ?? Math.max(0, account.currentBalancePaisa),
      paymentStatus: account.paymentStatus,
      paidPercentage: account.paidPercentage
    });
  });
  app.get("/api/accounts/:id/statement", (req, res) => {
    const organizationId = req.organizationId;
    const { dateFrom = "2000-01-01", dateTo = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) } = req.query;
    const statement = generateAccountStatement(organizationId, req.params.id, dateFrom, dateTo);
    if (!statement) return res.status(404).json({ error: "Account not found" });
    res.json(statement);
  });
  app.get("/api/accounts/:id/history", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const account = db2.accounts.find((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: "Account not found" });
    const {
      dateFrom,
      dateTo,
      search,
      type,
      page = "1",
      limit = "50",
      all = "false"
    } = req.query;
    let txns = db2.transactions.filter((t) => t.accountId === req.params.id && t.organizationId === organizationId && !t.isDeleted).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    if (dateFrom) txns = txns.filter((t) => t.date >= dateFrom);
    if (dateTo) txns = txns.filter((t) => t.date <= dateTo);
    if (type && type !== "ALL") txns = txns.filter((t) => t.type === type);
    if (search) {
      const q = search.trim().toLowerCase();
      txns = txns.filter(
        (t) => t.description.toLowerCase().includes(q) || t.reference.toLowerCase().includes(q) || t.transactionNumber.toLowerCase().includes(q)
      );
    }
    const total = txns.length;
    if (all === "true") {
      return res.json({ transactions: txns, total, page: 1, totalPages: 1 });
    }
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = txns.slice(startIndex, startIndex + limitNum);
    res.json({
      transactions: paginated,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  });
  app.get("/api/accounts/:id/balance-history", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const account = db2.accounts.find((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: "Account not found" });
    const txns = db2.transactions.filter((t) => t.accountId === req.params.id && t.organizationId === organizationId && !t.isDeleted).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    const points = txns.map((t) => ({
      date: t.date,
      ref: t.reference,
      balancePkr: t.balanceAfterPaisa / 100,
      debitPkr: t.type === "DEBIT" ? t.amountPaisa / 100 : 0,
      creditPkr: t.type === "CREDIT" ? t.amountPaisa / 100 : 0
    }));
    res.json(points);
  });
  app.get("/api/accounts/:id/timeline", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const accountId = req.params.id;
    const account = db2.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: "Account not found" });
    const txns = db2.transactions.filter((t) => t.accountId === accountId && t.organizationId === organizationId);
    const audits = db2.auditLogs.filter((l) => l.organizationId === organizationId && (l.accountId === accountId || l.entityId === accountId));
    const timelineItems = [];
    for (const t of txns) {
      timelineItems.push({
        id: t._id,
        date: t.date,
        title: `${t.type} Transaction ${t.transactionNumber}`,
        description: `${t.description} (Ref: ${t.reference})`,
        type: "TRANSACTION",
        badge: t.isDeleted ? "DELETED" : t.type,
        amountPaisa: t.amountPaisa,
        txnType: t.type
      });
      if (t.editHistory) {
        for (const eh of t.editHistory) {
          const cAt = eh.changedAt || eh.modifiedAt || (/* @__PURE__ */ new Date()).toISOString();
          timelineItems.push({
            id: `${t._id}_edit_${cAt}`,
            date: cAt.slice(0, 10),
            title: `Transaction Edited: ${t.transactionNumber}`,
            description: `Field "${eh.changedField || eh.field || "value"}" updated from ${eh.oldValue} to ${eh.newValue}`,
            type: "EDIT",
            badge: "MODIFIED"
          });
        }
      }
    }
    for (const a of audits) {
      if (a.entityType === "ACCOUNT") {
        const aDate = a.createdAt || a.timestamp || (/* @__PURE__ */ new Date()).toISOString();
        timelineItems.push({
          id: a._id,
          date: aDate.slice(0, 10),
          title: `Account Action: ${String(a.action).replace(/_/g, " ")}`,
          description: a.notes || a.description || "Account updated",
          type: "AUDIT",
          badge: "INFO"
        });
      }
    }
    timelineItems.sort((a, b) => b.date.localeCompare(a.date));
    res.json(timelineItems);
  });
  app.post("/api/accounts", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const { accountName, phone, address, notes, openingBalancePaisa = 0, status = "ACTIVE" } = req.body || {};
    if (!isNonEmptyString(accountName)) {
      return res.status(400).json({ error: "Account Name is required" });
    }
    if (openingBalancePaisa !== void 0 && openingBalancePaisa !== null) {
      const n = Number(openingBalancePaisa);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return res.status(400).json({ error: "openingBalancePaisa must be an integer number of paisa" });
      }
    }
    if (status !== void 0 && status !== "ACTIVE" && status !== "INACTIVE") {
      return res.status(400).json({ error: "status must be ACTIVE or INACTIVE" });
    }
    const orgAccountCount = db2.accounts.filter((a) => a.organizationId === organizationId).length;
    const nextCodeNum = orgAccountCount + 1;
    const accountCode = `ACC-${String(nextCodeNum).padStart(6, "0")}`;
    const newId = `acc_${Date.now()}`;
    const newAccount = {
      _id: newId,
      organizationId,
      accountCode,
      accountName,
      phone: phone || "",
      address: address || "",
      status: status || "ACTIVE",
      openingBalancePaisa: openingBalancePaisa || 0,
      openingBalanceType: openingBalancePaisa > 0 ? "DEBIT" : openingBalancePaisa < 0 ? "CREDIT" : "ZERO",
      currentBalancePaisa: openingBalancePaisa || 0,
      currentBalanceType: openingBalancePaisa > 0 ? "DEBIT" : openingBalancePaisa < 0 ? "CREDIT" : "ZERO",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: notes || "",
      totalTransactions: 0
    };
    db2.accounts.push(newAccount);
    db2.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: "ACCOUNT_CREATED",
      entityType: "ACCOUNT",
      entityId: newId,
      accountId: newId,
      accountName: newAccount.accountName,
      userId: req.userId || "admin",
      after: newAccount,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: `Created account ${accountCode} - ${accountName}`
    });
    saveDb(db2);
    res.status(201).json(newAccount);
  });
  app.put("/api/accounts/:id", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const index = db2.accounts.findIndex((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (index === -1) return res.status(404).json({ error: "Account not found" });
    const existing = db2.accounts[index];
    const updates = { ...req.body || {} };
    delete updates.organizationId;
    delete updates._id;
    if (updates.accountName !== void 0 && !isNonEmptyString(updates.accountName)) {
      return res.status(400).json({ error: "accountName cannot be empty" });
    }
    if (updates.status !== void 0 && updates.status !== "ACTIVE" && updates.status !== "INACTIVE") {
      return res.status(400).json({ error: "status must be ACTIVE or INACTIVE" });
    }
    if (updates.openingBalancePaisa !== void 0) {
      const n = Number(updates.openingBalancePaisa);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return res.status(400).json({ error: "openingBalancePaisa must be an integer number of paisa" });
      }
    }
    const changedFields = [];
    for (const key of Object.keys(updates)) {
      if (existing[key] !== updates[key] && key !== "accountCode") {
        changedFields.push(key);
      }
    }
    const updatedAccount = {
      ...existing,
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db2.accounts[index] = updatedAccount;
    if (updates.openingBalancePaisa !== void 0 && updates.openingBalancePaisa !== existing.openingBalancePaisa) {
      recalculateLedgerInMemory(existing._id, db2);
    }
    db2.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: updates.status && updates.status !== existing.status ? "ACCOUNT_STATUS_CHANGED" : "ACCOUNT_UPDATED",
      entityType: "ACCOUNT",
      entityId: existing._id,
      accountId: existing._id,
      accountName: updatedAccount.accountName,
      userId: req.userId || "admin",
      before: existing,
      after: updatedAccount,
      changedFields,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: `Updated account ${existing.accountCode}: ${changedFields.join(", ")}`
    });
    saveDb(db2);
    res.json(updatedAccount);
  });
  app.get("/api/transactions", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const {
      accountId,
      type,
      dateFrom,
      dateTo,
      search,
      minAmount,
      maxAmount,
      includeDeleted = "false",
      sort = "date",
      order = "desc",
      page = "1",
      limit = "50"
    } = req.query;
    let list = db2.transactions.filter((t) => t.organizationId === organizationId && (includeDeleted === "true" ? true : !t.isDeleted));
    if (accountId && accountId !== "ALL") {
      list = list.filter((t) => t.accountId === accountId);
    }
    if (type && type !== "ALL") {
      list = list.filter((t) => t.type === type);
    }
    if (dateFrom) list = list.filter((t) => t.date >= dateFrom);
    if (dateTo) list = list.filter((t) => t.date <= dateTo);
    if (minAmount) {
      const min = parseInt(minAmount, 10);
      list = list.filter((t) => t.amountPaisa >= min);
    }
    if (maxAmount) {
      const max = parseInt(maxAmount, 10);
      list = list.filter((t) => t.amountPaisa <= max);
    }
    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (t) => t.description.toLowerCase().includes(q) || t.reference.toLowerCase().includes(q) || t.transactionNumber.toLowerCase().includes(q) || t.accountName.toLowerCase().includes(q) || t.accountCode.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let valA = a[sort] || "";
      let valB = b[sort] || "";
      if (sort === "amount") {
        valA = a.amountPaisa;
        valB = b.amountPaisa;
      }
      if (order === "asc") {
        return valA > valB ? 1 : -1;
      }
      return valA < valB ? 1 : -1;
    });
    const total = list.length;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = list.slice(startIndex, startIndex + limitNum);
    let filteredDebitPaisa = 0;
    let filteredCreditPaisa = 0;
    for (const t of list) {
      if (t.type === "DEBIT") filteredDebitPaisa += t.amountPaisa;
      else filteredCreditPaisa += t.amountPaisa;
    }
    res.json({
      transactions: paginated,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      summary: {
        totalDebitPaisa: filteredDebitPaisa,
        totalCreditPaisa: filteredCreditPaisa,
        netMovementPaisa: filteredDebitPaisa - filteredCreditPaisa,
        count: total
      }
    });
  });
  app.post("/api/transactions/check-duplicate", (req, res) => {
    const organizationId = req.organizationId;
    const { accountId, date, amountPaisa, type, description } = req.body || {};
    if (!isNonEmptyString(accountId) || !isValidDateStr(date) || !isValidTxnType(type) || !isPositiveIntegerAmount(amountPaisa)) {
      return res.status(400).json({ error: "accountId, a valid date, type (DEBIT/CREDIT) and a positive amountPaisa are required" });
    }
    const duplicates = findPotentialDuplicates(organizationId, accountId, date, amountPaisa, type, description || "");
    res.json({
      isDuplicate: duplicates.length > 0,
      duplicates
    });
  });
  app.get("/api/transactions/:id", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const txn = db2.transactions.find((t) => t._id === req.params.id && t.organizationId === organizationId);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    const prevBalancePaisa = txn.type === "DEBIT" ? txn.balanceAfterPaisa - txn.amountPaisa : txn.balanceAfterPaisa + txn.amountPaisa;
    const audits = db2.auditLogs.filter(
      (a) => a.organizationId === organizationId && (a.transactionId === txn._id || a.entityId === txn._id)
    );
    res.json({
      ...txn,
      previousBalancePaisa: prevBalancePaisa,
      audits
    });
  });
  app.post("/api/transactions", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const {
      accountId,
      date,
      description,
      reference,
      type,
      amountPaisa,
      notes,
      enteredBy,
      allowDuplicate = false
    } = req.body || {};
    if (!isNonEmptyString(accountId) || !isValidDateStr(date) || !isValidTxnType(type) || !isPositiveIntegerAmount(amountPaisa)) {
      return res.status(400).json({
        error: "Account, a valid Date (YYYY-MM-DD), Type (DEBIT or CREDIT) and a positive integer Amount (in paisa) are required"
      });
    }
    if (description !== void 0 && typeof description !== "string") {
      return res.status(400).json({ error: "description must be a string" });
    }
    if (reference !== void 0 && typeof reference !== "string") {
      return res.status(400).json({ error: "reference must be a string" });
    }
    const account = db2.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: "Account not found" });
    const enteredByUser = req.userId || enteredBy || "data_entry_user";
    if (!allowDuplicate) {
      const dups = findPotentialDuplicates(organizationId, accountId, date, amountPaisa, type, description || "");
      if (dups.length > 0) {
        return res.status(409).json({
          warning: "A similar transaction already exists.",
          existing: dups[0]
        });
      }
    }
    const orgTxnCount = db2.transactions.filter((t) => t.organizationId === organizationId).length;
    const nextTxnNum = orgTxnCount + 1;
    const transactionNumber = `TXN-${String(nextTxnNum).padStart(6, "0")}`;
    const newId = `txn_${Date.now()}`;
    const newTxn = {
      _id: newId,
      organizationId,
      transactionNumber,
      accountId,
      accountCode: account.accountCode,
      accountName: account.accountName,
      date,
      type,
      amountPaisa: Math.abs(parseInt(amountPaisa, 10)),
      description: description || "",
      reference: reference || "",
      notes: notes || "",
      balanceAfterPaisa: 0,
      balanceAfterType: "ZERO",
      enteredBy: enteredByUser,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      isDeleted: false
    };
    db2.transactions.push(newTxn);
    recalculateLedgerInMemory(accountId, db2);
    const finalizedTxn = db2.transactions.find((t) => t._id === newId);
    db2.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: "TRANSACTION_CREATED",
      entityType: "TRANSACTION",
      entityId: newId,
      accountId,
      accountName: account.accountName,
      transactionId: newId,
      userId: enteredByUser,
      after: finalizedTxn,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: `Created ${type} ${transactionNumber} for ${account.accountName}: Rs. ${finalizedTxn.amountPaisa / 100}`
    });
    saveDb(db2);
    res.status(201).json(finalizedTxn);
  });
  app.put("/api/transactions/:id", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const index = db2.transactions.findIndex((t) => t._id === req.params.id && t.organizationId === organizationId);
    if (index === -1) return res.status(404).json({ error: "Transaction not found" });
    const existing = db2.transactions[index];
    const updates = { ...req.body || {} };
    delete updates.organizationId;
    delete updates._id;
    delete updates.accountId;
    if (updates.date !== void 0 && !isValidDateStr(updates.date)) {
      return res.status(400).json({ error: "date must be a valid YYYY-MM-DD string" });
    }
    if (updates.type !== void 0 && !isValidTxnType(updates.type)) {
      return res.status(400).json({ error: "type must be DEBIT or CREDIT" });
    }
    if (updates.amountPaisa !== void 0 && !isPositiveIntegerAmount(updates.amountPaisa)) {
      return res.status(400).json({ error: "amountPaisa must be a positive integer number of paisa" });
    }
    if (updates.description !== void 0 && !isNonEmptyString(updates.description)) {
      return res.status(400).json({ error: "description cannot be empty" });
    }
    if (updates.reference !== void 0 && typeof updates.reference !== "string") {
      return res.status(400).json({ error: "reference must be a string" });
    }
    if (updates.notes !== void 0 && typeof updates.notes !== "string") {
      return res.status(400).json({ error: "notes must be a string" });
    }
    const changedFields = [];
    const editHistoryItems = existing.editHistory || [];
    const allowedFields = ["date", "type", "amountPaisa", "description", "reference", "notes"];
    for (const f of allowedFields) {
      if (updates[f] !== void 0 && updates[f] !== existing[f]) {
        changedFields.push(f);
        editHistoryItems.push({
          oldValue: existing[f],
          newValue: updates[f],
          changedField: f,
          changedAt: (/* @__PURE__ */ new Date()).toISOString(),
          changedBy: req.userId || "admin"
        });
      }
    }
    const updatedTxn = {
      ...existing,
      ...updates,
      amountPaisa: updates.amountPaisa ? Math.abs(parseInt(updates.amountPaisa, 10)) : existing.amountPaisa,
      editHistory: editHistoryItems,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    db2.transactions[index] = updatedTxn;
    recalculateLedgerInMemory(existing.accountId, db2);
    db2.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: "TRANSACTION_UPDATED",
      entityType: "TRANSACTION",
      entityId: existing._id,
      accountId: updatedTxn.accountId,
      accountName: updatedTxn.accountName,
      transactionId: existing._id,
      userId: req.userId || "admin",
      before: existing,
      after: updatedTxn,
      changedFields,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: `Edited ${existing.transactionNumber}: ${changedFields.join(", ")}`
    });
    saveDb(db2);
    res.json(db2.transactions.find((t) => t._id === req.params.id));
  });
  app.delete("/api/transactions/:id", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const txn = db2.transactions.find((t) => t._id === req.params.id && t.organizationId === organizationId);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    const body = req.body || {};
    if (body.deleteReason !== void 0 && typeof body.deleteReason !== "string") {
      return res.status(400).json({ error: "deleteReason must be a string" });
    }
    if (body.reason !== void 0 && typeof body.reason !== "string") {
      return res.status(400).json({ error: "reason must be a string" });
    }
    txn.isDeleted = true;
    txn.deletedAt = (/* @__PURE__ */ new Date()).toISOString();
    txn.deletedBy = req.userId || "admin";
    txn.deleteReason = body.deleteReason || body.reason || "User requested deletion";
    recalculateLedgerInMemory(txn.accountId, db2);
    db2.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: "TRANSACTION_DELETED",
      entityType: "TRANSACTION",
      entityId: txn._id,
      accountId: txn.accountId,
      accountName: txn.accountName,
      transactionId: txn._id,
      userId: txn.deletedBy || "system",
      before: txn,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: `Soft deleted ${txn.transactionNumber}. Reason: ${txn.deleteReason}`
    });
    saveDb(db2);
    res.json({ success: true, message: "Transaction soft deleted and balance recalculated" });
  });
  app.post("/api/transactions/:id/restore", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const txn = db2.transactions.find((t) => t._id === req.params.id && t.organizationId === organizationId);
    if (!txn) return res.status(404).json({ error: "Transaction not found" });
    txn.isDeleted = false;
    txn.deletedAt = void 0;
    txn.deletedBy = void 0;
    txn.deleteReason = void 0;
    recalculateLedgerInMemory(txn.accountId, db2);
    db2.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: "TRANSACTION_RESTORED",
      entityType: "TRANSACTION",
      entityId: txn._id,
      accountId: txn.accountId,
      accountName: txn.accountName,
      transactionId: txn._id,
      userId: req.userId || "admin",
      after: txn,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: `Restored transaction ${txn.transactionNumber}`
    });
    saveDb(db2);
    res.json({ success: true, message: "Transaction restored and balance recalculated" });
  });
  app.get("/api/search", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const q = (req.query.q || "").trim().toLowerCase();
    if (!q) return res.json({ accounts: [], transactions: [] });
    const matchedAccounts = db2.accounts.filter(
      (a) => a.organizationId === organizationId && (a.accountName.toLowerCase().includes(q) || a.accountCode.toLowerCase().includes(q) || a.phone && a.phone.toLowerCase().includes(q) || a.address && a.address.toLowerCase().includes(q))
    ).slice(0, 5);
    const matchedTxns = db2.transactions.filter(
      (t) => t.organizationId === organizationId && !t.isDeleted && (t.transactionNumber.toLowerCase().includes(q) || t.reference.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.accountName.toLowerCase().includes(q))
    ).slice(0, 8);
    res.json({
      accounts: matchedAccounts,
      transactions: matchedTxns
    });
  });
  app.get("/api/audit-logs", requireFeature("auditHistory"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const { action, entityType, search, page = "1", limit = "50" } = req.query;
    let logs = db2.auditLogs.filter((l) => l.organizationId === organizationId);
    if (action && action !== "ALL") {
      logs = logs.filter((l) => l.action === action);
    }
    if (entityType && entityType !== "ALL") {
      logs = logs.filter((l) => l.entityType === entityType);
    }
    if (search) {
      const q = search.trim().toLowerCase();
      logs = logs.filter(
        (l) => l.accountName && l.accountName.toLowerCase().includes(q) || l.userId && l.userId.toLowerCase().includes(q) || l.notes && l.notes.toLowerCase().includes(q) || l.action.toLowerCase().includes(q)
      );
    }
    const total = logs.length;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = logs.slice(startIndex, startIndex + limitNum);
    res.json({
      logs: paginated,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  });
  app.get("/api/analytics/balance-analysis", requireFeature("analytics"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const accounts = db2.accounts.filter((a) => a.organizationId === organizationId);
    let totalDebitBalancesPaisa = 0;
    let totalCreditBalancesPaisa = 0;
    let debitCount = 0;
    let creditCount = 0;
    let zeroCount = 0;
    const brackets = {
      "0": 0,
      "1 - 50K": 0,
      "50K - 100K": 0,
      "100K - 500K": 0,
      "500K - 1M": 0,
      "1M+": 0
    };
    for (const a of accounts) {
      const balPkr = Math.abs(a.currentBalancePaisa) / 100;
      if (a.currentBalancePaisa > 0) {
        totalDebitBalancesPaisa += a.currentBalancePaisa;
        debitCount++;
      } else if (a.currentBalancePaisa < 0) {
        totalCreditBalancesPaisa += Math.abs(a.currentBalancePaisa);
        creditCount++;
      } else {
        zeroCount++;
      }
      if (balPkr === 0) brackets["0"]++;
      else if (balPkr <= 5e4) brackets["1 - 50K"]++;
      else if (balPkr <= 1e5) brackets["50K - 100K"]++;
      else if (balPkr <= 5e5) brackets["100K - 500K"]++;
      else if (balPkr <= 1e6) brackets["500K - 1M"]++;
      else brackets["1M+"]++;
    }
    res.json({
      totalDebitBalancesPaisa,
      totalCreditBalancesPaisa,
      netPositionPaisa: totalDebitBalancesPaisa - totalCreditBalancesPaisa,
      debitCount,
      creditCount,
      zeroCount,
      brackets: Object.keys(brackets).map((k) => ({ range: k, count: brackets[k] }))
    });
  });
  app.get("/api/analytics/dormant-accounts", requireFeature("analytics"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const ref = Date.now();
    const dormantAccounts = db2.accounts.filter((a) => a.organizationId === organizationId).map((a) => {
      const lastTime = a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : new Date(a.createdAt).getTime();
      const daysInactive = Math.floor((ref - lastTime) / (1e3 * 60 * 60 * 24));
      return {
        _id: a._id,
        accountCode: a.accountCode,
        accountName: a.accountName,
        currentBalancePaisa: a.currentBalancePaisa,
        currentBalanceType: a.currentBalanceType,
        lastTransactionDate: a.lastTransactionDate,
        daysInactive
      };
    });
    const buckets = {
      days30: dormantAccounts.filter((a) => a.daysInactive >= 30 && a.daysInactive < 60),
      days60: dormantAccounts.filter((a) => a.daysInactive >= 60 && a.daysInactive < 90),
      days90: dormantAccounts.filter((a) => a.daysInactive >= 90 && a.daysInactive < 180),
      days180: dormantAccounts.filter((a) => a.daysInactive >= 180 && a.daysInactive < 365),
      days365: dormantAccounts.filter((a) => a.daysInactive >= 365)
    };
    res.json({
      totalDormant: dormantAccounts.filter((a) => a.daysInactive >= 30).length,
      buckets,
      all: dormantAccounts.filter((a) => a.daysInactive >= 30).sort((a, b) => b.daysInactive - a.daysInactive)
    });
  });
  app.get("/api/analytics/data-quality", requireFeature("analytics"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const txns = db2.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted);
    const emptyDescriptions = txns.filter((t) => !t.description || t.description.trim() === "");
    const missingReferences = txns.filter((t) => !t.reference || t.reference.trim() === "");
    const map = /* @__PURE__ */ new Map();
    for (const t of txns) {
      const key = `${t.accountId}_${t.date}_${t.amountPaisa}_${t.type}_${t.description.trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    const potentialDuplicateGroups = Array.from(map.values()).filter((group) => group.length > 1);
    res.json({
      emptyDescriptionsCount: emptyDescriptions.length,
      emptyDescriptions: emptyDescriptions.slice(0, 10),
      missingReferencesCount: missingReferences.length,
      missingReferences: missingReferences.slice(0, 10),
      potentialDuplicateGroupsCount: potentialDuplicateGroups.length,
      potentialDuplicateGroups
    });
  });
  app.get("/api/analytics/full", requireFeature("analytics"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const { dateFrom = "2000-01-01", dateTo = "2999-12-31" } = req.query;
    const accounts = db2.accounts.filter((a) => a.organizationId === organizationId);
    const allOrgTxns = db2.transactions.filter((t) => t.organizationId === organizationId);
    const txns = allOrgTxns.filter(
      (t) => !t.isDeleted && (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo)
    );
    let totalDebitPaisa = 0;
    let totalCreditPaisa = 0;
    for (const t of txns) {
      if (t.type === "DEBIT") totalDebitPaisa += t.amountPaisa;
      else totalCreditPaisa += t.amountPaisa;
    }
    const start = new Date(dateFrom).getTime();
    const end = new Date(dateTo).getTime();
    const days = Math.max(1, Math.round(Math.abs(end - start) / (1e3 * 60 * 60 * 24)));
    const avgDailyTurnoverPaisa = Math.round((totalDebitPaisa + totalCreditPaisa) / days);
    const activeAccountsSet = new Set(txns.map((t) => t.accountId));
    const activeRatio = accounts.length > 0 ? `${Math.round(activeAccountsSet.size / accounts.length * 100)}%` : "0%";
    let netExposurePaisa = 0;
    let debitCount = 0;
    let creditCount = 0;
    let zeroCount = 0;
    for (const a of accounts) {
      if (a.currentBalancePaisa > 0) {
        netExposurePaisa += a.currentBalancePaisa;
        debitCount++;
      } else if (a.currentBalancePaisa < 0) {
        creditCount++;
      } else {
        zeroCount++;
      }
    }
    const monthsMap = {};
    for (const t of allOrgTxns.filter((x) => !x.isDeleted)) {
      const monthKey = t.date.slice(0, 7);
      if (!monthsMap[monthKey]) monthsMap[monthKey] = { debit: 0, credit: 0 };
      if (t.type === "DEBIT") monthsMap[monthKey].debit += t.amountPaisa / 100;
      else monthsMap[monthKey].credit += t.amountPaisa / 100;
    }
    const monthlyVolume = Object.keys(monthsMap).sort().slice(-6).map((m) => {
      const [y, mon] = m.split("-");
      const dateObj = new Date(parseInt(y, 10), parseInt(mon, 10) - 1, 1);
      const monthLabel = dateObj.toLocaleString("en-US", { month: "short", year: "numeric" });
      return {
        month: monthLabel,
        debit: monthsMap[m].debit,
        credit: monthsMap[m].credit
      };
    });
    const sizeBracketsMap = {
      "Under 10k": 0,
      "10k - 50k": 0,
      "50k - 200k": 0,
      "200k - 500k": 0,
      "500k+": 0
    };
    for (const t of txns) {
      const amtPkr = t.amountPaisa / 100;
      if (amtPkr < 1e4) sizeBracketsMap["Under 10k"]++;
      else if (amtPkr <= 5e4) sizeBracketsMap["10k - 50k"]++;
      else if (amtPkr <= 2e5) sizeBracketsMap["50k - 200k"]++;
      else if (amtPkr <= 5e5) sizeBracketsMap["200k - 500k"]++;
      else sizeBracketsMap["500k+"]++;
    }
    const sizeBrackets = Object.entries(sizeBracketsMap).map(([bracket, count]) => ({
      bracket,
      count
    }));
    const concentration = accounts.filter((a) => a.currentBalancePaisa > 0).sort((a, b) => b.currentBalancePaisa - a.currentBalancePaisa).slice(0, 5).map((a) => ({
      id: a._id,
      name: a.accountName,
      code: a.accountCode,
      balancePaisa: a.currentBalancePaisa,
      percentage: netExposurePaisa > 0 ? (a.currentBalancePaisa / netExposurePaisa * 100).toFixed(1) : "0"
    }));
    const topDebits = accounts.filter((a) => a.currentBalancePaisa > 0).sort((a, b) => b.currentBalancePaisa - a.currentBalancePaisa).slice(0, 5);
    const topCredits = accounts.filter((a) => a.currentBalancePaisa < 0).sort((a, b) => a.currentBalancePaisa - b.currentBalancePaisa).slice(0, 5);
    const ref = Date.now();
    let d30 = 0, d60 = 0, d90 = 0, d180 = 0;
    for (const a of accounts) {
      const lastTime = a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : new Date(a.createdAt).getTime();
      const daysInactive = Math.floor((ref - lastTime) / (1e3 * 60 * 60 * 24));
      if (daysInactive >= 180) d180++;
      else if (daysInactive >= 90) d90++;
      else if (daysInactive >= 60) d60++;
      else if (daysInactive >= 30) d30++;
    }
    res.json({
      totalDebitPaisa,
      totalCreditPaisa,
      avgDailyTurnoverPaisa,
      activeRatio,
      netExposurePaisa,
      monthlyVolume: monthlyVolume.length > 0 ? monthlyVolume : [{ month: "Current", debit: 0, credit: 0 }],
      balanceComposition: [
        { name: "Debit Balances", value: debitCount },
        { name: "Credit Balances", value: creditCount },
        { name: "Zero Balances", value: zeroCount }
      ],
      sizeBrackets,
      concentration,
      topDebits,
      topCredits,
      dormancyCounts: { d30, d60, d90, d180 }
    });
  });
  app.get("/api/analytics/compare", requireFeature("analytics"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const { periodA = "THIS_MONTH", periodB = "PREVIOUS_MONTH" } = req.query;
    const txns = db2.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted);
    const now = /* @__PURE__ */ new Date();
    const thisMonthStr = now.toISOString().slice(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = prevDate.toISOString().slice(0, 7);
    const txnsA = txns.filter((t) => {
      if (periodA === "THIS_MONTH") return t.date.startsWith(thisMonthStr);
      if (periodA === "LAST_30_DAYS") {
        const diff = (now.getTime() - new Date(t.date).getTime()) / (1e3 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
      }
      return t.date.startsWith(String(now.getFullYear()));
    });
    const txnsB = txns.filter((t) => {
      if (periodB === "PREVIOUS_MONTH") return t.date.startsWith(prevMonthStr);
      if (periodB === "LAST_YEAR") return t.date.startsWith(String(now.getFullYear() - 1));
      return true;
    });
    let debA = 0, credA = 0;
    for (const t of txnsA) {
      if (t.type === "DEBIT") debA += t.amountPaisa;
      else credA += t.amountPaisa;
    }
    let debB = 0, credB = 0;
    for (const t of txnsB) {
      if (t.type === "DEBIT") debB += t.amountPaisa;
      else credB += t.amountPaisa;
    }
    res.json({
      periodA,
      periodB,
      debitDiff: debA - debB,
      creditDiff: credA - credB,
      txnCountDiff: txnsA.length - txnsB.length,
      debitChangePct: debB > 0 ? Math.round((debA - debB) / debB * 100) : 0,
      creditChangePct: credB > 0 ? Math.round((credA - credB) / credB * 100) : 0
    });
  });
  app.get("/api/reports/balance-summary", requireFeature("exports"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const accounts = db2.accounts.filter((a) => a.organizationId === organizationId);
    let totalDebitPaisa = 0;
    let totalCreditPaisa = 0;
    const rows = accounts.map((a) => {
      const bal = a.currentBalancePaisa;
      const debPkr = bal > 0 ? bal / 100 : 0;
      const credPkr = bal < 0 ? Math.abs(bal) / 100 : 0;
      if (bal > 0) totalDebitPaisa += bal;
      if (bal < 0) totalCreditPaisa += Math.abs(bal);
      const remPkr = (a.remainingAmountPaisa !== void 0 ? a.remainingAmountPaisa : Math.max(0, bal)) / 100;
      return {
        "Account Code": a.accountCode,
        "Account Name": a.accountName,
        "Type": a.currentBalanceType,
        "Debit Balance": debPkr,
        "Credit Balance": credPkr,
        "Remaining Due": remPkr,
        "Payment Status": a.paymentStatus || "SETTLED"
      };
    });
    res.json({
      rows,
      totals: {
        totalDebitPaisa,
        totalCreditPaisa,
        netPaisa: totalDebitPaisa - totalCreditPaisa
      }
    });
  });
  const handleAsOfBalance = (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const accounts = db2.accounts.filter((a) => a.organizationId === organizationId);
    const { asOfDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10) } = req.query;
    let totalDebit = 0;
    let totalCredit = 0;
    const balances = accounts.map((a) => {
      const balPaisa = getAccountBalanceAsOfDate(organizationId, a._id, asOfDate);
      const lastTxnBefore = db2.transactions.filter((t) => t.accountId === a._id && t.organizationId === organizationId && !t.isDeleted && t.date <= asOfDate).sort((x, y) => y.date.localeCompare(x.date))[0]?.date;
      if (balPaisa > 0) totalDebit += balPaisa;
      if (balPaisa < 0) totalCredit += Math.abs(balPaisa);
      return {
        _id: a._id,
        "Account Code": a.accountCode,
        "Account Name": a.accountName,
        "Balance As Of": Math.abs(balPaisa) / 100,
        "Balance Type": balPaisa > 0 ? "DEBIT" : balPaisa < 0 ? "CREDIT" : "ZERO",
        "Last Transaction Date": lastTxnBefore || "\u2014"
      };
    });
    res.json({
      asOfDate,
      rows: balances,
      accounts: balances,
      totals: {
        totalDebitPaisa: totalDebit,
        totalCreditPaisa: totalCredit,
        netPaisa: totalDebit - totalCredit
      },
      totalDebitPaisa: totalDebit,
      totalCreditPaisa: totalCredit,
      netPositionPaisa: totalDebit - totalCredit
    });
  };
  app.get("/api/reports/as-of-balance", requireFeature("exports"), handleAsOfBalance);
  app.get("/api/reports/as-of-balances", requireFeature("exports"), handleAsOfBalance);
  app.get("/api/reports/executive-summary", requireFeature("exports"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const accounts = db2.accounts.filter((a) => a.organizationId === organizationId);
    const { dateFrom = "2000-01-01", dateTo = "2999-12-31" } = req.query;
    const txns = db2.transactions.filter(
      (t) => t.organizationId === organizationId && !t.isDeleted && (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo)
    );
    let totalDebit = 0;
    let totalCredit = 0;
    for (const t of txns) {
      if (t.type === "DEBIT") totalDebit += t.amountPaisa;
      else totalCredit += t.amountPaisa;
    }
    const net = totalDebit - totalCredit;
    const rows = [
      { "Metric": "Total Invoiced / Charges (Debit)", "Amount": totalDebit / 100, "Notes": "Gross billings in period" },
      { "Metric": "Total Received / Collections (Credit)", "Amount": totalCredit / 100, "Notes": "Cleared receipts in period" },
      { "Metric": "Net Operational Movement", "Amount": Math.abs(net) / 100, "Notes": net >= 0 ? "Net Receivable Increase" : "Net Payable Increase" },
      { "Metric": "Total Active Transactions", "Amount": txns.length, "Notes": "Recorded vouchers" },
      { "Metric": "Active Master Accounts", "Amount": accounts.length, "Notes": "Total registered accounts" }
    ];
    res.json({
      rows,
      totals: {
        totalDebitPaisa: totalDebit,
        totalCreditPaisa: totalCredit,
        netPaisa: net
      }
    });
  });
  app.get("/api/reports/all-transactions", requireFeature("exports"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const accounts = db2.accounts.filter((a) => a.organizationId === organizationId);
    const { dateFrom = "2000-01-01", dateTo = "2999-12-31" } = req.query;
    const txns = db2.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted && (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo)).sort((a, b) => b.date.localeCompare(a.date));
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = txns.map((t) => {
      const acc = accounts.find((a) => a._id === t.accountId);
      if (t.type === "DEBIT") totalDebit += t.amountPaisa;
      else totalCredit += t.amountPaisa;
      return {
        "Date": t.date,
        "Voucher #": t.transactionNumber,
        "Account Code": acc?.accountCode || "\u2014",
        "Account Name": acc?.accountName || t.accountName,
        "Type": t.type,
        "Debit Amount": t.type === "DEBIT" ? t.amountPaisa / 100 : 0,
        "Credit Amount": t.type === "CREDIT" ? t.amountPaisa / 100 : 0,
        "Description": t.description,
        "Balance After": t.balanceAfterPaisa / 100
      };
    });
    res.json({
      rows,
      totals: {
        totalDebitPaisa: totalDebit,
        totalCreditPaisa: totalCredit,
        netPaisa: totalDebit - totalCredit
      }
    });
  });
  app.get("/api/reports/inactive-accounts", requireFeature("exports"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const daysThreshold = parseInt(req.query.days || "30", 10);
    const ref = Date.now();
    let totalBalancePaisa = 0;
    const rows = db2.accounts.filter((a) => a.organizationId === organizationId).map((a) => {
      const lastTime = a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : new Date(a.createdAt).getTime();
      const daysInactive = Math.floor((ref - lastTime) / (1e3 * 60 * 60 * 24));
      return { a, daysInactive };
    }).filter((item) => item.daysInactive >= daysThreshold).sort((x, y) => y.daysInactive - x.daysInactive).map(({ a, daysInactive }) => {
      totalBalancePaisa += Math.abs(a.currentBalancePaisa);
      return {
        "Account Code": a.accountCode,
        "Account Name": a.accountName,
        "Balance": Math.abs(a.currentBalancePaisa) / 100,
        "Balance Type": a.currentBalanceType,
        "Last Activity Date": a.lastTransactionDate || "None",
        "Days Inactive": daysInactive
      };
    });
    res.json({
      rows,
      totals: {
        netPaisa: totalBalancePaisa,
        totalDebitPaisa: totalBalancePaisa,
        totalCreditPaisa: 0
      }
    });
  });
  app.get("/api/reports/custom", requireFeature("customReports"), (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    const { accountId, dateFrom, dateTo, type } = req.query;
    let txns = db2.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted);
    if (accountId) {
      txns = txns.filter((t) => t.accountId === accountId);
    }
    if (dateFrom) {
      txns = txns.filter((t) => t.date >= dateFrom);
    }
    if (dateTo) {
      txns = txns.filter((t) => t.date <= dateTo);
    }
    if (type && type !== "ALL") {
      txns = txns.filter((t) => t.type === type);
    }
    txns.sort((a, b) => b.date.localeCompare(a.date));
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = txns.map((t) => {
      const acc = db2.accounts.find((a) => a._id === t.accountId && a.organizationId === organizationId);
      if (t.type === "DEBIT") totalDebit += t.amountPaisa;
      else totalCredit += t.amountPaisa;
      return {
        "Date": t.date,
        "Voucher #": t.transactionNumber,
        "Account Name": acc?.accountName || t.accountName,
        "Type": t.type,
        "Amount": t.amountPaisa / 100,
        "Description": t.description,
        "Reference": t.reference || "\u2014"
      };
    });
    res.json({
      rows,
      totals: {
        totalDebitPaisa: totalDebit,
        totalCreditPaisa: totalCredit,
        netPaisa: totalDebit - totalCredit
      }
    });
  });
  app.get("/api/settings", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    res.json(getSettingsForOrg(db2, organizationId));
  });
  app.put("/api/settings", (req, res) => {
    const organizationId = req.organizationId;
    const db2 = getDb();
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "Request body must be a settings object" });
    }
    const current = getSettingsForOrg(db2, organizationId);
    const updates = { ...req.body };
    delete updates.organizationId;
    db2.settingsByOrg[organizationId] = { ...current, ...updates, organizationId };
    db2.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: "SETTINGS_UPDATED",
      entityType: "SETTING",
      entityId: "org_settings",
      userId: req.userId || "admin",
      after: db2.settingsByOrg[organizationId],
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      notes: "System configuration modified"
    });
    saveDb(db2);
    res.json(db2.settingsByOrg[organizationId]);
  });
  app.post("/api/recalculate-all", (req, res) => {
    recalculateAllLedgers(req.organizationId);
    res.json({ success: true, message: "All account ledgers recalculated sequentially." });
  });
  app.use("/api", (req, res) => {
    res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
  });
  app.use((err, req, res, next) => {
    console.error("[API] Unhandled error:", err);
    if (res.headersSent) return next(err);
    res.status(err?.statusCode || 500).json({ error: err?.message || "Internal server error" });
  });
  if (!IS_SERVERLESS) {
    if (process.env.NODE_ENV !== "production") {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa"
      });
      app.use(vite.middlewares);
    } else {
      const distPath = import_path2.default.join(process.cwd(), "dist");
      app.use(import_express.default.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(import_path2.default.join(distPath, "index.html"));
      });
    }
  }
  return app;
}
if (!IS_SERVERLESS) {
  createApp().then((app) => {
    const PORT = Number(process.env.PORT) || 3e3;
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  });
}

// api-src/index.ts
var appPromise = null;
async function handler(req, res) {
  if (!appPromise) {
    appPromise = createApp();
  }
  const app = await appPromise;
  return app(req, res);
}
