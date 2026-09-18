import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { getDb, saveDb, initDb, recalculateLedgerInMemory, clearAllData, getSettingsForOrg } from './server/db';
import { getMongoStatus, saveAllToMongo } from './server/mongo';
import {
  recalculateAccountLedger,
  recalculateAllLedgers,
  generateAccountStatement,
  getDashboardSummary,
  getPeriodComparisonData,
  getChartTrends,
  getAccountBalanceAsOfDate,
  findPotentialDuplicates,
} from './server/services';
import { Account, Transaction, AuditLog, Organization, AppUser } from './src/types';
import {
  authMiddleware,
  requireSuperAdmin,
  requireOrgScope,
  hashPassword,
  verifyPassword,
  signSession,
  setSessionCookie,
  clearSessionCookie,
  generateStrongPassword,
} from './server/auth';
import { PLANS, DEFAULT_PLAN_ID, getPlanFeatures } from './server/plans';

const IS_SERVERLESS = !!process.env.VERCEL;

export async function createApp() {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  // Ensure DB & MongoDB Atlas are initialized
  await initDb();

  // Wraps an async route handler so a rejected promise (thrown error inside
  // an `async` handler) is forwarded to Express's error handler instead of
  // crashing the process / hanging the request.
  const asyncHandler =
    (fn: (req: express.Request, res: express.Response) => Promise<any>) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      Promise.resolve(fn(req, res)).catch(next);
    };

  // --- Small validation helpers -------------------------------------------------
  const isNonEmptyString = (v: any): v is string => typeof v === 'string' && v.trim().length > 0;
  const isValidDateStr = (v: any): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const isPositiveIntegerAmount = (v: any): boolean => {
    const n = typeof v === 'string' ? Number(v) : v;
    return typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n) && n > 0;
  };
  const isValidTxnType = (v: any): v is 'DEBIT' | 'CREDIT' => v === 'DEBIT' || v === 'CREDIT';

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `org-${Date.now()}`;

  function getOrgOrThrow(organizationId: string): Organization {
    const db = getDb();
    const org = db.organizations.find((o) => o._id === organizationId);
    if (!org) throw Object.assign(new Error('Organization not found'), { statusCode: 404 });
    return org;
  }

  /** 403s if the current org's plan does not include `flag`. */
  function requireFeature(flag: string) {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (req.userRole === 'SUPER_ADMIN') return next();
      const db = getDb();
      const org = db.organizations.find((o) => o._id === req.organizationId);
      if (!org) {
        res.status(404).json({ error: 'Organization not found' });
        return;
      }
      if (!org.features?.[flag]) {
        res.status(403).json({ error: `Your plan does not include this feature: ${flag}. Contact support to upgrade.` });
        return;
      }
      next();
    };
  }

  // --------------------------------------------------------------------------
  // Public routes (no auth)
  // --------------------------------------------------------------------------

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const db = getDb();
    const user = db.users.find((u) => u.username && u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    user.lastLoginAt = new Date().toISOString();
    saveDb(db);

    const token = signSession({ userId: user._id, organizationId: user.organizationId, role: user.role });
    setSessionCookie(res, token);

    let organization: Organization | null = null;
    if (user.organizationId) {
      organization = db.organizations.find((o) => o._id === user.organizationId) || null;
      if (organization && !organization.isActive) {
        clearSessionCookie(res);
        return res.status(403).json({ error: 'This pump account has been suspended. Contact support.' });
      }
    }

    res.json({
      user: { username: user.username, role: user.role, organizationId: user.organizationId },
      organization,
    });
  }));

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(res);
    res.json({ success: true });
  });

  // --------------------------------------------------------------------------
  // Auth middleware: everything below requires a valid session cookie.
  // --------------------------------------------------------------------------
  app.use(authMiddleware);

  app.get('/api/auth/me', (req, res) => {
    const db = getDb();
    const user = db.users.find((u) => u._id === req.userId);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    let organization: Organization | null = null;
    if (user.organizationId) {
      organization = db.organizations.find((o) => o._id === user.organizationId) || null;
    }

    res.json({
      user: { username: user.username, role: user.role, organizationId: user.organizationId },
      organization,
    });
  });

  // --------------------------------------------------------------------------
  // Super-admin: organization management
  // --------------------------------------------------------------------------

  app.post('/api/admin/organizations', requireSuperAdmin, asyncHandler(async (req, res) => {
    const { name, phone, address, city, username, password, planId, features } = req.body || {};
    if (!isNonEmptyString(name) || !isNonEmptyString(username) || !isNonEmptyString(password)) {
      return res.status(400).json({ error: 'name, username and password are required' });
    }

    const db = getDb();
    if (db.users.some((u) => u.username && u.username.toLowerCase() === username.trim().toLowerCase())) {
      return res.status(409).json({ error: 'That username is already taken' });
    }

    const chosenPlanId = (planId && PLANS[planId as keyof typeof PLANS]) ? planId : DEFAULT_PLAN_ID;
    const baseSlug = slugify(name);
    let slug = baseSlug;
    let n = 1;
    while (db.organizations.some((o) => o.slug === slug)) {
      slug = `${baseSlug}-${++n}`;
    }

    const orgId = `org_${Date.now()}`;
    const now = new Date().toISOString();
    const org: Organization = {
      _id: orgId,
      name: name.trim(),
      slug,
      phone: phone || '',
      address: address || '',
      city: city || '',
      isActive: true,
      planId: chosenPlanId,
      features: { ...getPlanFeatures(chosenPlanId), ...(features || {}) },
      createdAt: now,
      updatedAt: now,
    };
    db.organizations.push(org);

    const passwordHash = await hashPassword(password);
    const user: AppUser = {
      _id: `user_${Date.now()}`,
      organizationId: orgId,
      username: username.trim(),
      passwordHash,
      role: 'ORG_ADMIN',
      createdAt: now,
    };
    db.users.push(user);

    getSettingsForOrg(db, orgId).businessName = org.name;

    saveDb(db);
    res.status(201).json({ organization: org, username: user.username });
  }));

  app.get('/api/admin/organizations', requireSuperAdmin, (req, res) => {
    const db = getDb();
    const rows = db.organizations.map((org) => {
      const accountCount = db.accounts.filter((a) => a.organizationId === org._id).length;
      const transactionCount = db.transactions.filter((t) => t.organizationId === org._id).length;
      const admins = db.users.filter((u) => u.organizationId === org._id).map((u) => u.username);
      return { ...org, accountCount, transactionCount, admins };
    });
    res.json({ organizations: rows });
  });

  app.patch('/api/admin/organizations/:id', requireSuperAdmin, (req, res) => {
    const db = getDb();
    const org = db.organizations.find((o) => o._id === req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const { name, phone, address, city, isActive, planId, features } = req.body || {};
    if (name !== undefined) org.name = name;
    if (phone !== undefined) org.phone = phone;
    if (address !== undefined) org.address = address;
    if (city !== undefined) org.city = city;
    if (isActive !== undefined) org.isActive = !!isActive;
    if (planId !== undefined && PLANS[planId as keyof typeof PLANS]) {
      org.planId = planId;
      org.features = { ...getPlanFeatures(planId), ...(org.features || {}) };
    }
    if (features !== undefined && typeof features === 'object') {
      org.features = { ...org.features, ...features };
    }
    org.updatedAt = new Date().toISOString();

    saveDb(db);
    res.json({ organization: org });
  });

  app.post('/api/admin/organizations/:id/reset-password', requireSuperAdmin, asyncHandler(async (req, res) => {
    const db = getDb();
    const org = db.organizations.find((o) => o._id === req.params.id);
    if (!org) return res.status(404).json({ error: 'Organization not found' });

    const user = db.users.find((u) => u.organizationId === org._id && u.role === 'ORG_ADMIN');
    if (!user) return res.status(404).json({ error: 'No admin user found for this organization' });

    const newPassword = (req.body && req.body.password) || generateStrongPassword();
    user.passwordHash = await hashPassword(newPassword);
    saveDb(db);

    res.json({ username: user.username, password: newPassword });
  }));

  // --------------------------------------------------------------------------
  // Everything past this point is scoped to an authenticated pump (ORG_ADMIN).
  // Super-admin sessions have organizationId === null and are rejected here.
  // --------------------------------------------------------------------------
  app.use('/api', (req, res, next) => {
    if (req.path.startsWith('/admin') || req.path.startsWith('/auth') || req.path === '/health') {
      return next();
    }
    return requireOrgScope(req, res, next);
  });

  app.get('/api/mongodb/status', requireSuperAdmin, async (req, res) => {
    const status = await getMongoStatus();
    res.json(status);
  });

  app.post('/api/mongodb/sync', requireSuperAdmin, asyncHandler(async (req, res) => {
    const db = getDb();
    const success = await saveAllToMongo(db);
    res.json({ success, timestamp: new Date().toISOString() });
  }));

  // Database Wipe / Reset — scoped to the caller's own organization only.
  app.post('/api/database/clear', asyncHandler(async (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const accountsCleared = db.accounts.filter((a) => a.organizationId === organizationId).length;
    const transactionsCleared = db.transactions.filter((t) => t.organizationId === organizationId).length;
    const auditLogsCleared = db.auditLogs.filter((l) => l.organizationId === organizationId).length;

    db.accounts = db.accounts.filter((a) => a.organizationId !== organizationId);
    db.transactions = db.transactions.filter((t) => t.organizationId !== organizationId);
    db.auditLogs = db.auditLogs.filter((l) => l.organizationId !== organizationId);
    saveDb(db);

    res.json({
      message: 'All accounts, transactions, and audit logs for your organization have been wiped.',
      success: true,
      accountsCleared,
      transactionsCleared,
      auditLogsCleared,
    });
  }));

  // 1. Dashboard Summary
  app.get('/api/dashboard/summary', (req, res) => {
    const organizationId = req.organizationId!;
    const today = new Date().toISOString().slice(0, 10);
    const { dateFrom = `${today.slice(0, 8)}01`, dateTo = today } = req.query as Record<string, string>;
    const summary = getDashboardSummary(organizationId, dateFrom, dateTo);
    res.json(summary);
  });

  // 2. Dashboard Trends
  app.get('/api/dashboard/trends', (req, res) => {
    const organizationId = req.organizationId!;
    const today = new Date().toISOString().slice(0, 10);
    const { dateFrom = `${today.slice(0, 8)}01`, dateTo = today, interval = 'daily' } = req.query as Record<string, string>;
    const trends = getChartTrends(organizationId, dateFrom, dateTo, interval as any);
    res.json(trends);
  });

  // 3. Period Comparison
  app.get('/api/dashboard/comparison', requireFeature('analytics'), (req, res) => {
    const organizationId = req.organizationId!;
    const today = new Date().toISOString().slice(0, 10);
    const {
      currentFrom = `${today.slice(0, 8)}01`,
      currentTo = today,
      compareFrom = `${today.slice(0, 8)}01`,
      compareTo = today,
    } = req.query as Record<string, string>;

    const comparison = getPeriodComparisonData(organizationId, currentFrom, currentTo, compareFrom, compareTo);
    res.json(comparison);
  });

  // 4. Dashboard Auxiliary Tables (Recent, Largest Balances, Activity)
  app.get('/api/dashboard/tables', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const accounts = db.accounts.filter((a) => a.organizationId === organizationId);
    const nonDeleted = db.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted);

    const recentTxns = [...nonDeleted]
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, 8);

    const largestDebits = [...accounts]
      .filter((a) => a.currentBalancePaisa > 0)
      .sort((a, b) => b.currentBalancePaisa - a.currentBalancePaisa)
      .slice(0, 5);

    const largestCredits = [...accounts]
      .filter((a) => a.currentBalancePaisa < 0)
      .sort((a, b) => a.currentBalancePaisa - b.currentBalancePaisa)
      .slice(0, 5);

    const recentlyActive = [...accounts]
      .filter((a) => a.lastTransactionDate)
      .sort((a, b) => (b.lastTransactionDate || '').localeCompare(a.lastTransactionDate || ''))
      .slice(0, 5);

    const refDate = Date.now();
    const dormant = accounts
      .map((a) => {
        const lastTime = a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : new Date(a.createdAt).getTime();
        const daysInactive = Math.floor((refDate - lastTime) / (1000 * 60 * 60 * 24));
        return { ...a, daysInactive };
      })
      .filter((a) => a.daysInactive >= 30)
      .sort((a, b) => b.daysInactive - a.daysInactive)
      .slice(0, 5);

    res.json({
      recentTransactions: recentTxns,
      largestDebits,
      largestCredits,
      recentlyActive,
      dormant,
    });
  });

  // 5. Accounts List & Filtering
  app.get('/api/accounts', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const {
      status,
      balanceType,
      paymentStatus,
      search,
      minBal,
      maxBal,
      lastActivity,
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    let list = db.accounts.filter((a) => a.organizationId === organizationId);

    if (status && status !== 'ALL') {
      list = list.filter((a) => a.status === status);
    }

    if (balanceType && balanceType !== 'ALL') {
      list = list.filter((a) => a.currentBalanceType === balanceType);
    }

    if (paymentStatus && paymentStatus !== 'ALL') {
      if (paymentStatus === 'HAS_REMAINING') {
        list = list.filter((a) => (a.remainingAmountPaisa || 0) > 0);
      } else {
        list = list.filter((a) => a.paymentStatus === paymentStatus);
      }
    }

    if (search) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.accountName.toLowerCase().includes(q) ||
          a.accountCode.toLowerCase().includes(q) ||
          (a.phone && a.phone.toLowerCase().includes(q)) ||
          (a.address && a.address.toLowerCase().includes(q))
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
        if (!a.lastTransactionDate) return lastActivity === 'NEVER';
        const diffDays = Math.floor((ref - new Date(a.lastTransactionDate).getTime()) / (1000 * 60 * 60 * 24));
        if (lastActivity === 'TODAY') return diffDays === 0;
        if (lastActivity === '7_DAYS') return diffDays <= 7;
        if (lastActivity === '30_DAYS') return diffDays <= 30;
        if (lastActivity === '90_DAYS') return diffDays <= 90;
        if (lastActivity === 'DORMANT_30') return diffDays > 30;
        if (lastActivity === 'DORMANT_90') return diffDays > 90;
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
        unpaidCount: list.filter((a) => a.paymentStatus === 'UNPAID').length,
        partialCount: list.filter((a) => a.paymentStatus === 'PARTIALLY_PAID').length,
        paidCount: list.filter((a) => a.paymentStatus === 'PAID_IN_FULL').length,
        advanceCount: list.filter((a) => a.paymentStatus === 'ADVANCE').length,
      },
    });
  });

  // 6. Account Detail & Summary
  app.get('/api/accounts/:id', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const account = db.accounts.find((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: 'Account not found' });
    res.json(account);
  });

  // 7. Account Summary Analytics (for Account 360)
  app.get('/api/accounts/:id/summary', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const account = db.accounts.find((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const txns = db.transactions
      .filter((t) => t.accountId === account._id && t.organizationId === organizationId && !t.isDeleted)
      .sort((a, b) => a.date.localeCompare(b.date));

    let totalDebitPaisa = 0;
    let totalCreditPaisa = 0;
    let debitCount = 0;
    let creditCount = 0;
    let largestDebitPaisa = 0;
    let largestCreditPaisa = 0;
    let activityThisMonth = 0;
    let activityThisYear = 0;

    const today = new Date().toISOString().slice(0, 10);
    const thisMonthPrefix = today.slice(0, 7);
    const thisYearPrefix = today.slice(0, 4);

    for (const t of txns) {
      if (t.type === 'DEBIT') {
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
    const daysSinceLast = lastDate ? Math.floor((ref - lastDate) / (1000 * 60 * 60 * 24)) : null;

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
      paidPercentage: account.paidPercentage,
    });
  });

  // 8. Account Statement
  app.get('/api/accounts/:id/statement', (req, res) => {
    const organizationId = req.organizationId!;
    const { dateFrom = '2000-01-01', dateTo = new Date().toISOString().slice(0, 10) } = req.query as Record<string, string>;
    const statement = generateAccountStatement(organizationId, req.params.id, dateFrom, dateTo);
    if (!statement) return res.status(404).json({ error: 'Account not found' });
    res.json(statement);
  });

  // 9. Account History (Complete or Filtered with Pagination)
  app.get('/api/accounts/:id/history', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const account = db.accounts.find((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const {
      dateFrom,
      dateTo,
      search,
      type,
      page = '1',
      limit = '50',
      all = 'false',
    } = req.query as Record<string, string>;

    let txns = db.transactions
      .filter((t) => t.accountId === req.params.id && t.organizationId === organizationId && !t.isDeleted)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

    if (dateFrom) txns = txns.filter((t) => t.date >= dateFrom);
    if (dateTo) txns = txns.filter((t) => t.date <= dateTo);
    if (type && type !== 'ALL') txns = txns.filter((t) => t.type === type);
    if (search) {
      const q = search.trim().toLowerCase();
      txns = txns.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q) ||
          t.transactionNumber.toLowerCase().includes(q)
      );
    }

    const total = txns.length;
    if (all === 'true') {
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
      totalPages: Math.ceil(total / limitNum),
    });
  });

  // 10. Account Balance History (Points for chart)
  app.get('/api/accounts/:id/balance-history', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const account = db.accounts.find((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const txns = db.transactions
      .filter((t) => t.accountId === req.params.id && t.organizationId === organizationId && !t.isDeleted)
      .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));

    const points = txns.map((t) => ({
      date: t.date,
      ref: t.reference,
      balancePkr: t.balanceAfterPaisa / 100,
      debitPkr: t.type === 'DEBIT' ? t.amountPaisa / 100 : 0,
      creditPkr: t.type === 'CREDIT' ? t.amountPaisa / 100 : 0,
    }));

    res.json(points);
  });

  // 11. Account Activity Timeline
  app.get('/api/accounts/:id/timeline', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const accountId = req.params.id;
    const account = db.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const txns = db.transactions.filter((t) => t.accountId === accountId && t.organizationId === organizationId);
    const audits = db.auditLogs.filter((l) => l.organizationId === organizationId && (l.accountId === accountId || l.entityId === accountId));

    const timelineItems: Array<{
      id: string;
      date: string;
      title: string;
      description: string;
      type: 'TRANSACTION' | 'AUDIT' | 'EDIT';
      badge?: string;
      amountPaisa?: number;
      txnType?: string;
    }> = [];

    for (const t of txns) {
      timelineItems.push({
        id: t._id,
        date: t.date,
        title: `${t.type} Transaction ${t.transactionNumber}`,
        description: `${t.description} (Ref: ${t.reference})`,
        type: 'TRANSACTION',
        badge: t.isDeleted ? 'DELETED' : t.type,
        amountPaisa: t.amountPaisa,
        txnType: t.type,
      });

      if (t.editHistory) {
        for (const eh of t.editHistory) {
          const cAt = eh.changedAt || eh.modifiedAt || new Date().toISOString();
          timelineItems.push({
            id: `${t._id}_edit_${cAt}`,
            date: cAt.slice(0, 10),
            title: `Transaction Edited: ${t.transactionNumber}`,
            description: `Field "${eh.changedField || eh.field || 'value'}" updated from ${eh.oldValue} to ${eh.newValue}`,
            type: 'EDIT',
            badge: 'MODIFIED',
          });
        }
      }
    }

    for (const a of audits) {
      if (a.entityType === 'ACCOUNT') {
        const aDate = a.createdAt || a.timestamp || new Date().toISOString();
        timelineItems.push({
          id: a._id,
          date: aDate.slice(0, 10),
          title: `Account Action: ${String(a.action).replace(/_/g, ' ')}`,
          description: a.notes || a.description || 'Account updated',
          type: 'AUDIT',
          badge: 'INFO',
        });
      }
    }

    timelineItems.sort((a, b) => b.date.localeCompare(a.date));
    res.json(timelineItems);
  });

  // 12. Create Account
  app.post('/api/accounts', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const { accountName, phone, address, notes, openingBalancePaisa = 0, status = 'ACTIVE' } = req.body || {};

    if (!isNonEmptyString(accountName)) {
      return res.status(400).json({ error: 'Account Name is required' });
    }
    if (openingBalancePaisa !== undefined && openingBalancePaisa !== null) {
      const n = Number(openingBalancePaisa);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return res.status(400).json({ error: 'openingBalancePaisa must be an integer number of paisa' });
      }
    }
    if (status !== undefined && status !== 'ACTIVE' && status !== 'INACTIVE') {
      return res.status(400).json({ error: 'status must be ACTIVE or INACTIVE' });
    }

    const orgAccountCount = db.accounts.filter((a) => a.organizationId === organizationId).length;
    const nextCodeNum = orgAccountCount + 1;
    const accountCode = `ACC-${String(nextCodeNum).padStart(6, '0')}`;
    const newId = `acc_${Date.now()}`;

    const newAccount: Account = {
      _id: newId,
      organizationId,
      accountCode,
      accountName,
      phone: phone || '',
      address: address || '',
      status: status || 'ACTIVE',
      openingBalancePaisa: openingBalancePaisa || 0,
      openingBalanceType: openingBalancePaisa > 0 ? 'DEBIT' : openingBalancePaisa < 0 ? 'CREDIT' : 'ZERO',
      currentBalancePaisa: openingBalancePaisa || 0,
      currentBalanceType: openingBalancePaisa > 0 ? 'DEBIT' : openingBalancePaisa < 0 ? 'CREDIT' : 'ZERO',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      notes: notes || '',
      totalTransactions: 0,
    };

    db.accounts.push(newAccount);

    db.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: 'ACCOUNT_CREATED',
      entityType: 'ACCOUNT',
      entityId: newId,
      accountId: newId,
      accountName: newAccount.accountName,
      userId: req.userId || 'admin',
      after: newAccount,
      createdAt: new Date().toISOString(),
      notes: `Created account ${accountCode} - ${accountName}`,
    });

    saveDb(db);
    res.status(201).json(newAccount);
  });

  // 13. Update Account
  app.put('/api/accounts/:id', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const index = db.accounts.findIndex((a) => a._id === req.params.id && a.organizationId === organizationId);
    if (index === -1) return res.status(404).json({ error: 'Account not found' });

    const existing = db.accounts[index];
    const updates = { ...(req.body || {}) };
    // Never allow the client to move an account between organizations.
    delete updates.organizationId;
    delete updates._id;

    if (updates.accountName !== undefined && !isNonEmptyString(updates.accountName)) {
      return res.status(400).json({ error: 'accountName cannot be empty' });
    }
    if (updates.status !== undefined && updates.status !== 'ACTIVE' && updates.status !== 'INACTIVE') {
      return res.status(400).json({ error: 'status must be ACTIVE or INACTIVE' });
    }
    if (updates.openingBalancePaisa !== undefined) {
      const n = Number(updates.openingBalancePaisa);
      if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return res.status(400).json({ error: 'openingBalancePaisa must be an integer number of paisa' });
      }
    }

    const changedFields: string[] = [];
    for (const key of Object.keys(updates)) {
      if ((existing as any)[key] !== updates[key] && key !== 'accountCode') {
        changedFields.push(key);
      }
    }

    const updatedAccount = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    db.accounts[index] = updatedAccount;

    if (updates.openingBalancePaisa !== undefined && updates.openingBalancePaisa !== existing.openingBalancePaisa) {
      recalculateLedgerInMemory(existing._id, db);
    }

    db.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: updates.status && updates.status !== existing.status ? 'ACCOUNT_STATUS_CHANGED' : 'ACCOUNT_UPDATED',
      entityType: 'ACCOUNT',
      entityId: existing._id,
      accountId: existing._id,
      accountName: updatedAccount.accountName,
      userId: req.userId || 'admin',
      before: existing,
      after: updatedAccount,
      changedFields,
      createdAt: new Date().toISOString(),
      notes: `Updated account ${existing.accountCode}: ${changedFields.join(', ')}`,
    });

    saveDb(db);
    res.json(updatedAccount);
  });

  // 14. Transactions Explorer
  app.get('/api/transactions', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const {
      accountId,
      type,
      dateFrom,
      dateTo,
      search,
      minAmount,
      maxAmount,
      includeDeleted = 'false',
      sort = 'date',
      order = 'desc',
      page = '1',
      limit = '50',
    } = req.query as Record<string, string>;

    let list = db.transactions.filter((t) => t.organizationId === organizationId && (includeDeleted === 'true' ? true : !t.isDeleted));

    if (accountId && accountId !== 'ALL') {
      list = list.filter((t) => t.accountId === accountId);
    }

    if (type && type !== 'ALL') {
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
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.reference.toLowerCase().includes(q) ||
          t.transactionNumber.toLowerCase().includes(q) ||
          t.accountName.toLowerCase().includes(q) ||
          t.accountCode.toLowerCase().includes(q)
      );
    }

    list.sort((a, b) => {
      let valA: any = (a as any)[sort] || '';
      let valB: any = (b as any)[sort] || '';
      if (sort === 'amount') {
        valA = a.amountPaisa;
        valB = b.amountPaisa;
      }
      if (order === 'asc') {
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
      if (t.type === 'DEBIT') filteredDebitPaisa += t.amountPaisa;
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
        count: total,
      },
    });
  });

  // 15. Check Potential Duplicate Transaction
  app.post('/api/transactions/check-duplicate', (req, res) => {
    const organizationId = req.organizationId!;
    const { accountId, date, amountPaisa, type, description } = req.body || {};
    if (!isNonEmptyString(accountId) || !isValidDateStr(date) || !isValidTxnType(type) || !isPositiveIntegerAmount(amountPaisa)) {
      return res.status(400).json({ error: 'accountId, a valid date, type (DEBIT/CREDIT) and a positive amountPaisa are required' });
    }
    const duplicates = findPotentialDuplicates(organizationId, accountId, date, amountPaisa, type, description || '');
    res.json({
      isDuplicate: duplicates.length > 0,
      duplicates,
    });
  });

  // 16. Single Transaction Detail
  app.get('/api/transactions/:id', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const txn = db.transactions.find((t) => t._id === req.params.id && t.organizationId === organizationId);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    const prevBalancePaisa = txn.type === 'DEBIT'
      ? txn.balanceAfterPaisa - txn.amountPaisa
      : txn.balanceAfterPaisa + txn.amountPaisa;

    const audits = db.auditLogs.filter(
      (a) => a.organizationId === organizationId && (a.transactionId === txn._id || a.entityId === txn._id)
    );

    res.json({
      ...txn,
      previousBalancePaisa: prevBalancePaisa,
      audits,
    });
  });

  // 17. Create Transaction (Data Entry)
  app.post('/api/transactions', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const {
      accountId,
      date,
      description,
      reference,
      type,
      amountPaisa,
      notes,
      enteredBy,
      allowDuplicate = false,
    } = req.body || {};

    if (!isNonEmptyString(accountId) || !isValidDateStr(date) || !isValidTxnType(type) || !isPositiveIntegerAmount(amountPaisa)) {
      return res.status(400).json({
        error:
          'Account, a valid Date (YYYY-MM-DD), Type (DEBIT or CREDIT) and a positive integer Amount (in paisa) are required',
      });
    }
    if (description !== undefined && typeof description !== 'string') {
      return res.status(400).json({ error: 'description must be a string' });
    }
    if (reference !== undefined && typeof reference !== 'string') {
      return res.status(400).json({ error: 'reference must be a string' });
    }

    const account = db.accounts.find((a) => a._id === accountId && a.organizationId === organizationId);
    if (!account) return res.status(404).json({ error: 'Account not found' });

    const enteredByUser = req.userId || enteredBy || 'data_entry_user';

    if (!allowDuplicate) {
      const dups = findPotentialDuplicates(organizationId, accountId, date, amountPaisa, type, description || '');
      if (dups.length > 0) {
        return res.status(409).json({
          warning: 'A similar transaction already exists.',
          existing: dups[0],
        });
      }
    }

    const orgTxnCount = db.transactions.filter((t) => t.organizationId === organizationId).length;
    const nextTxnNum = orgTxnCount + 1;
    const transactionNumber = `TXN-${String(nextTxnNum).padStart(6, '0')}`;
    const newId = `txn_${Date.now()}`;

    const newTxn: Transaction = {
      _id: newId,
      organizationId,
      transactionNumber,
      accountId,
      accountCode: account.accountCode,
      accountName: account.accountName,
      date,
      type,
      amountPaisa: Math.abs(parseInt(amountPaisa, 10)),
      description: description || '',
      reference: reference || '',
      notes: notes || '',
      balanceAfterPaisa: 0,
      balanceAfterType: 'ZERO',
      enteredBy: enteredByUser,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isDeleted: false,
    };

    db.transactions.push(newTxn);
    recalculateLedgerInMemory(accountId, db);

    const finalizedTxn = db.transactions.find((t) => t._id === newId)!;

    db.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: 'TRANSACTION_CREATED',
      entityType: 'TRANSACTION',
      entityId: newId,
      accountId,
      accountName: account.accountName,
      transactionId: newId,
      userId: enteredByUser,
      after: finalizedTxn,
      createdAt: new Date().toISOString(),
      notes: `Created ${type} ${transactionNumber} for ${account.accountName}: Rs. ${finalizedTxn.amountPaisa / 100}`,
    });

    saveDb(db);
    res.status(201).json(finalizedTxn);
  });

  // 18. Edit Transaction
  app.put('/api/transactions/:id', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const index = db.transactions.findIndex((t) => t._id === req.params.id && t.organizationId === organizationId);
    if (index === -1) return res.status(404).json({ error: 'Transaction not found' });

    const existing = db.transactions[index];
    const updates = { ...(req.body || {}) };
    delete updates.organizationId;
    delete updates._id;
    delete updates.accountId; // moving a transaction between accounts/orgs is not supported via this route

    if (updates.date !== undefined && !isValidDateStr(updates.date)) {
      return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD string' });
    }
    if (updates.type !== undefined && !isValidTxnType(updates.type)) {
      return res.status(400).json({ error: 'type must be DEBIT or CREDIT' });
    }
    if (updates.amountPaisa !== undefined && !isPositiveIntegerAmount(updates.amountPaisa)) {
      return res.status(400).json({ error: 'amountPaisa must be a positive integer number of paisa' });
    }
    if (updates.description !== undefined && !isNonEmptyString(updates.description)) {
      return res.status(400).json({ error: 'description cannot be empty' });
    }
    if (updates.reference !== undefined && typeof updates.reference !== 'string') {
      return res.status(400).json({ error: 'reference must be a string' });
    }
    if (updates.notes !== undefined && typeof updates.notes !== 'string') {
      return res.status(400).json({ error: 'notes must be a string' });
    }

    const changedFields: string[] = [];
    const editHistoryItems = existing.editHistory || [];

    const allowedFields = ['date', 'type', 'amountPaisa', 'description', 'reference', 'notes'];
    for (const f of allowedFields) {
      if (updates[f] !== undefined && updates[f] !== (existing as any)[f]) {
        changedFields.push(f);
        editHistoryItems.push({
          oldValue: (existing as any)[f],
          newValue: updates[f],
          changedField: f,
          changedAt: new Date().toISOString(),
          changedBy: req.userId || 'admin',
        });
      }
    }

    const updatedTxn: Transaction = {
      ...existing,
      ...updates,
      amountPaisa: updates.amountPaisa ? Math.abs(parseInt(updates.amountPaisa, 10)) : existing.amountPaisa,
      editHistory: editHistoryItems,
      updatedAt: new Date().toISOString(),
    };

    db.transactions[index] = updatedTxn;
    recalculateLedgerInMemory(existing.accountId, db);

    db.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: 'TRANSACTION_UPDATED',
      entityType: 'TRANSACTION',
      entityId: existing._id,
      accountId: updatedTxn.accountId,
      accountName: updatedTxn.accountName,
      transactionId: existing._id,
      userId: req.userId || 'admin',
      before: existing,
      after: updatedTxn,
      changedFields,
      createdAt: new Date().toISOString(),
      notes: `Edited ${existing.transactionNumber}: ${changedFields.join(', ')}`,
    });

    saveDb(db);
    res.json(db.transactions.find((t) => t._id === req.params.id));
  });

  // 19. Soft Delete Transaction (Rule: Do NOT hard delete financial transactions)
  app.delete('/api/transactions/:id', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const txn = db.transactions.find((t) => t._id === req.params.id && t.organizationId === organizationId);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    const body = req.body || {};
    if (body.deleteReason !== undefined && typeof body.deleteReason !== 'string') {
      return res.status(400).json({ error: 'deleteReason must be a string' });
    }
    if (body.reason !== undefined && typeof body.reason !== 'string') {
      return res.status(400).json({ error: 'reason must be a string' });
    }

    txn.isDeleted = true;
    txn.deletedAt = new Date().toISOString();
    txn.deletedBy = req.userId || 'admin';
    txn.deleteReason = body.deleteReason || body.reason || 'User requested deletion';

    recalculateLedgerInMemory(txn.accountId, db);

    db.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: 'TRANSACTION_DELETED',
      entityType: 'TRANSACTION',
      entityId: txn._id,
      accountId: txn.accountId,
      accountName: txn.accountName,
      transactionId: txn._id,
      userId: txn.deletedBy || 'system',
      before: txn,
      createdAt: new Date().toISOString(),
      notes: `Soft deleted ${txn.transactionNumber}. Reason: ${txn.deleteReason}`,
    });

    saveDb(db);
    res.json({ success: true, message: 'Transaction soft deleted and balance recalculated' });
  });

  // 20. Restore Soft-Deleted Transaction
  app.post('/api/transactions/:id/restore', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const txn = db.transactions.find((t) => t._id === req.params.id && t.organizationId === organizationId);
    if (!txn) return res.status(404).json({ error: 'Transaction not found' });

    txn.isDeleted = false;
    txn.deletedAt = undefined;
    txn.deletedBy = undefined;
    txn.deleteReason = undefined;

    recalculateLedgerInMemory(txn.accountId, db);

    db.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: 'TRANSACTION_RESTORED',
      entityType: 'TRANSACTION',
      entityId: txn._id,
      accountId: txn.accountId,
      accountName: txn.accountName,
      transactionId: txn._id,
      userId: req.userId || 'admin',
      after: txn,
      createdAt: new Date().toISOString(),
      notes: `Restored transaction ${txn.transactionNumber}`,
    });

    saveDb(db);
    res.json({ success: true, message: 'Transaction restored and balance recalculated' });
  });

  // 21. Global Search (Accounts & Transactions)
  app.get('/api/search', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const q = (req.query.q as string || '').trim().toLowerCase();
    if (!q) return res.json({ accounts: [], transactions: [] });

    const matchedAccounts = db.accounts
      .filter(
        (a) =>
          a.organizationId === organizationId &&
          (a.accountName.toLowerCase().includes(q) ||
            a.accountCode.toLowerCase().includes(q) ||
            (a.phone && a.phone.toLowerCase().includes(q)) ||
            (a.address && a.address.toLowerCase().includes(q)))
      )
      .slice(0, 5);

    const matchedTxns = db.transactions
      .filter(
        (t) =>
          t.organizationId === organizationId &&
          !t.isDeleted &&
          (t.transactionNumber.toLowerCase().includes(q) ||
            t.reference.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.accountName.toLowerCase().includes(q))
      )
      .slice(0, 8);

    res.json({
      accounts: matchedAccounts,
      transactions: matchedTxns,
    });
  });

  // 22. Audit Logs API
  app.get('/api/audit-logs', requireFeature('auditHistory'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const { action, entityType, search, page = '1', limit = '50' } = req.query as Record<string, string>;

    let logs = db.auditLogs.filter((l) => l.organizationId === organizationId);

    if (action && action !== 'ALL') {
      logs = logs.filter((l) => l.action === action);
    }

    if (entityType && entityType !== 'ALL') {
      logs = logs.filter((l) => l.entityType === entityType);
    }

    if (search) {
      const q = search.trim().toLowerCase();
      logs = logs.filter(
        (l) =>
          (l.accountName && l.accountName.toLowerCase().includes(q)) ||
          (l.userId && l.userId.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q)) ||
          l.action.toLowerCase().includes(q)
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
      totalPages: Math.ceil(total / limitNum),
    });
  });

  // 23. Analytics: Balance Analysis
  app.get('/api/analytics/balance-analysis', requireFeature('analytics'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const accounts = db.accounts.filter((a) => a.organizationId === organizationId);

    let totalDebitBalancesPaisa = 0;
    let totalCreditBalancesPaisa = 0;
    let debitCount = 0;
    let creditCount = 0;
    let zeroCount = 0;

    const brackets: Record<string, number> = {
      '0': 0,
      '1 - 50K': 0,
      '50K - 100K': 0,
      '100K - 500K': 0,
      '500K - 1M': 0,
      '1M+': 0,
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

      if (balPkr === 0) brackets['0']++;
      else if (balPkr <= 50000) brackets['1 - 50K']++;
      else if (balPkr <= 100000) brackets['50K - 100K']++;
      else if (balPkr <= 500000) brackets['100K - 500K']++;
      else if (balPkr <= 1000000) brackets['500K - 1M']++;
      else brackets['1M+']++;
    }

    res.json({
      totalDebitBalancesPaisa,
      totalCreditBalancesPaisa,
      netPositionPaisa: totalDebitBalancesPaisa - totalCreditBalancesPaisa,
      debitCount,
      creditCount,
      zeroCount,
      brackets: Object.keys(brackets).map((k) => ({ range: k, count: brackets[k] })),
    });
  });

  // 24. Analytics: Inactive / Dormant Accounts
  app.get('/api/analytics/dormant-accounts', requireFeature('analytics'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const ref = Date.now();

    const dormantAccounts = db.accounts.filter((a) => a.organizationId === organizationId).map((a) => {
      const lastTime = a.lastTransactionDate ? new Date(a.lastTransactionDate).getTime() : new Date(a.createdAt).getTime();
      const daysInactive = Math.floor((ref - lastTime) / (1000 * 60 * 60 * 24));
      return {
        _id: a._id,
        accountCode: a.accountCode,
        accountName: a.accountName,
        currentBalancePaisa: a.currentBalancePaisa,
        currentBalanceType: a.currentBalanceType,
        lastTransactionDate: a.lastTransactionDate,
        daysInactive,
      };
    });

    const buckets = {
      days30: dormantAccounts.filter((a) => a.daysInactive >= 30 && a.daysInactive < 60),
      days60: dormantAccounts.filter((a) => a.daysInactive >= 60 && a.daysInactive < 90),
      days90: dormantAccounts.filter((a) => a.daysInactive >= 90 && a.daysInactive < 180),
      days180: dormantAccounts.filter((a) => a.daysInactive >= 180 && a.daysInactive < 365),
      days365: dormantAccounts.filter((a) => a.daysInactive >= 365),
    };

    res.json({
      totalDormant: dormantAccounts.filter((a) => a.daysInactive >= 30).length,
      buckets,
      all: dormantAccounts.filter((a) => a.daysInactive >= 30).sort((a, b) => b.daysInactive - a.daysInactive),
    });
  });

  // 25. Analytics: Data Quality Monitor
  app.get('/api/analytics/data-quality', requireFeature('analytics'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const txns = db.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted);

    const emptyDescriptions = txns.filter((t) => !t.description || t.description.trim() === '');
    const missingReferences = txns.filter((t) => !t.reference || t.reference.trim() === '');

    const map = new Map<string, Transaction[]>();
    for (const t of txns) {
      const key = `${t.accountId}_${t.date}_${t.amountPaisa}_${t.type}_${t.description.trim().toLowerCase()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    const potentialDuplicateGroups = Array.from(map.values()).filter((group) => group.length > 1);

    res.json({
      emptyDescriptionsCount: emptyDescriptions.length,
      emptyDescriptions: emptyDescriptions.slice(0, 10),
      missingReferencesCount: missingReferences.length,
      missingReferences: missingReferences.slice(0, 10),
      potentialDuplicateGroupsCount: potentialDuplicateGroups.length,
      potentialDuplicateGroups,
    });
  });

  // 25b. Analytics: Comprehensive System Analytics
  app.get('/api/analytics/full', requireFeature('analytics'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const { dateFrom = '2000-01-01', dateTo = '2999-12-31' } = req.query as Record<string, string>;

    const accounts = db.accounts.filter((a) => a.organizationId === organizationId);
    const allOrgTxns = db.transactions.filter((t) => t.organizationId === organizationId);

    const txns = allOrgTxns.filter(
      (t) => !t.isDeleted && (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo)
    );

    let totalDebitPaisa = 0;
    let totalCreditPaisa = 0;
    for (const t of txns) {
      if (t.type === 'DEBIT') totalDebitPaisa += t.amountPaisa;
      else totalCreditPaisa += t.amountPaisa;
    }

    const start = new Date(dateFrom).getTime();
    const end = new Date(dateTo).getTime();
    const days = Math.max(1, Math.round(Math.abs(end - start) / (1000 * 60 * 60 * 24)));
    const avgDailyTurnoverPaisa = Math.round((totalDebitPaisa + totalCreditPaisa) / days);

    const activeAccountsSet = new Set(txns.map((t) => t.accountId));
    const activeRatio =
      accounts.length > 0
        ? `${Math.round((activeAccountsSet.size / accounts.length) * 100)}%`
        : '0%';

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

    const monthsMap: Record<string, { debit: number; credit: number }> = {};
    for (const t of allOrgTxns.filter((x) => !x.isDeleted)) {
      const monthKey = t.date.slice(0, 7);
      if (!monthsMap[monthKey]) monthsMap[monthKey] = { debit: 0, credit: 0 };
      if (t.type === 'DEBIT') monthsMap[monthKey].debit += t.amountPaisa / 100;
      else monthsMap[monthKey].credit += t.amountPaisa / 100;
    }

    const monthlyVolume = Object.keys(monthsMap)
      .sort()
      .slice(-6)
      .map((m) => {
        const [y, mon] = m.split('-');
        const dateObj = new Date(parseInt(y, 10), parseInt(mon, 10) - 1, 1);
        const monthLabel = dateObj.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        return {
          month: monthLabel,
          debit: monthsMap[m].debit,
          credit: monthsMap[m].credit,
        };
      });

    const sizeBracketsMap = {
      'Under 10k': 0,
      '10k - 50k': 0,
      '50k - 200k': 0,
      '200k - 500k': 0,
      '500k+': 0,
    };
    for (const t of txns) {
      const amtPkr = t.amountPaisa / 100;
      if (amtPkr < 10000) sizeBracketsMap['Under 10k']++;
      else if (amtPkr <= 50000) sizeBracketsMap['10k - 50k']++;
      else if (amtPkr <= 200000) sizeBracketsMap['50k - 200k']++;
      else if (amtPkr <= 500000) sizeBracketsMap['200k - 500k']++;
      else sizeBracketsMap['500k+']++;
    }
    const sizeBrackets = Object.entries(sizeBracketsMap).map(([bracket, count]) => ({
      bracket,
      count,
    }));

    const concentration = accounts
      .filter((a) => a.currentBalancePaisa > 0)
      .sort((a, b) => b.currentBalancePaisa - a.currentBalancePaisa)
      .slice(0, 5)
      .map((a) => ({
        id: a._id,
        name: a.accountName,
        code: a.accountCode,
        balancePaisa: a.currentBalancePaisa,
        percentage:
          netExposurePaisa > 0
            ? ((a.currentBalancePaisa / netExposurePaisa) * 100).toFixed(1)
            : '0',
      }));

    const topDebits = accounts
      .filter((a) => a.currentBalancePaisa > 0)
      .sort((a, b) => b.currentBalancePaisa - a.currentBalancePaisa)
      .slice(0, 5);

    const topCredits = accounts
      .filter((a) => a.currentBalancePaisa < 0)
      .sort((a, b) => a.currentBalancePaisa - b.currentBalancePaisa)
      .slice(0, 5);

    const ref = Date.now();
    let d30 = 0, d60 = 0, d90 = 0, d180 = 0;
    for (const a of accounts) {
      const lastTime = a.lastTransactionDate
        ? new Date(a.lastTransactionDate).getTime()
        : new Date(a.createdAt).getTime();
      const daysInactive = Math.floor((ref - lastTime) / (1000 * 60 * 60 * 24));
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
      monthlyVolume: monthlyVolume.length > 0 ? monthlyVolume : [{ month: 'Current', debit: 0, credit: 0 }],
      balanceComposition: [
        { name: 'Debit Balances', value: debitCount },
        { name: 'Credit Balances', value: creditCount },
        { name: 'Zero Balances', value: zeroCount },
      ],
      sizeBrackets,
      concentration,
      topDebits,
      topCredits,
      dormancyCounts: { d30, d60, d90, d180 },
    });
  });

  // 25c. Analytics: Period Comparisons
  app.get('/api/analytics/compare', requireFeature('analytics'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const { periodA = 'THIS_MONTH', periodB = 'PREVIOUS_MONTH' } = req.query as Record<string, string>;

    const txns = db.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted);
    const now = new Date();
    const thisMonthStr = now.toISOString().slice(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = prevDate.toISOString().slice(0, 7);

    const txnsA = txns.filter((t) => {
      if (periodA === 'THIS_MONTH') return t.date.startsWith(thisMonthStr);
      if (periodA === 'LAST_30_DAYS') {
        const diff = (now.getTime() - new Date(t.date).getTime()) / (1000 * 60 * 60 * 24);
        return diff >= 0 && diff <= 30;
      }
      return t.date.startsWith(String(now.getFullYear()));
    });

    const txnsB = txns.filter((t) => {
      if (periodB === 'PREVIOUS_MONTH') return t.date.startsWith(prevMonthStr);
      if (periodB === 'LAST_YEAR') return t.date.startsWith(String(now.getFullYear() - 1));
      return true;
    });

    let debA = 0, credA = 0;
    for (const t of txnsA) {
      if (t.type === 'DEBIT') debA += t.amountPaisa;
      else credA += t.amountPaisa;
    }

    let debB = 0, credB = 0;
    for (const t of txnsB) {
      if (t.type === 'DEBIT') debB += t.amountPaisa;
      else credB += t.amountPaisa;
    }

    res.json({
      periodA,
      periodB,
      debitDiff: debA - debB,
      creditDiff: credA - credB,
      txnCountDiff: txnsA.length - txnsB.length,
      debitChangePct: debB > 0 ? Math.round(((debA - debB) / debB) * 100) : 0,
      creditChangePct: credB > 0 ? Math.round(((credA - credB) / credB) * 100) : 0,
    });
  });

  // 26. Reports: Balance Summary
  app.get('/api/reports/balance-summary', requireFeature('exports'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const accounts = db.accounts.filter((a) => a.organizationId === organizationId);
    let totalDebitPaisa = 0;
    let totalCreditPaisa = 0;

    const rows = accounts.map((a) => {
      const bal = a.currentBalancePaisa;
      const debPkr = bal > 0 ? bal / 100 : 0;
      const credPkr = bal < 0 ? Math.abs(bal) / 100 : 0;
      if (bal > 0) totalDebitPaisa += bal;
      if (bal < 0) totalCreditPaisa += Math.abs(bal);

      const remPkr = (a.remainingAmountPaisa !== undefined ? a.remainingAmountPaisa : Math.max(0, bal)) / 100;

      return {
        "Account Code": a.accountCode,
        "Account Name": a.accountName,
        "Type": a.currentBalanceType,
        "Debit Balance": debPkr,
        "Credit Balance": credPkr,
        "Remaining Due": remPkr,
        "Payment Status": a.paymentStatus || 'SETTLED',
      };
    });

    res.json({
      rows,
      totals: {
        totalDebitPaisa,
        totalCreditPaisa,
        netPaisa: totalDebitPaisa - totalCreditPaisa,
      },
    });
  });

  // 27. Reports: As-of Balance Report (supports both singular and plural endpoints)
  const handleAsOfBalance = (req: express.Request, res: express.Response) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const accounts = db.accounts.filter((a) => a.organizationId === organizationId);
    const { asOfDate = new Date().toISOString().slice(0, 10) } = req.query as Record<string, string>;

    let totalDebit = 0;
    let totalCredit = 0;

    const balances = accounts.map((a) => {
      const balPaisa = getAccountBalanceAsOfDate(organizationId, a._id, asOfDate);
      const lastTxnBefore = db.transactions
        .filter((t) => t.accountId === a._id && t.organizationId === organizationId && !t.isDeleted && t.date <= asOfDate)
        .sort((x, y) => y.date.localeCompare(x.date))[0]?.date;

      if (balPaisa > 0) totalDebit += balPaisa;
      if (balPaisa < 0) totalCredit += Math.abs(balPaisa);

      return {
        _id: a._id,
        "Account Code": a.accountCode,
        "Account Name": a.accountName,
        "Balance As Of": Math.abs(balPaisa) / 100,
        "Balance Type": balPaisa > 0 ? 'DEBIT' : balPaisa < 0 ? 'CREDIT' : 'ZERO',
        "Last Transaction Date": lastTxnBefore || '—',
      };
    });

    res.json({
      asOfDate,
      rows: balances,
      accounts: balances,
      totals: {
        totalDebitPaisa: totalDebit,
        totalCreditPaisa: totalCredit,
        netPaisa: totalDebit - totalCredit,
      },
      totalDebitPaisa: totalDebit,
      totalCreditPaisa: totalCredit,
      netPositionPaisa: totalDebit - totalCredit,
    });
  };

  app.get('/api/reports/as-of-balance', requireFeature('exports'), handleAsOfBalance);
  app.get('/api/reports/as-of-balances', requireFeature('exports'), handleAsOfBalance);

  // 28. Reports: Executive Summary
  app.get('/api/reports/executive-summary', requireFeature('exports'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const accounts = db.accounts.filter((a) => a.organizationId === organizationId);
    const { dateFrom = '2000-01-01', dateTo = '2999-12-31' } = req.query as Record<string, string>;

    const txns = db.transactions.filter(
      (t) => t.organizationId === organizationId && !t.isDeleted && (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo)
    );

    let totalDebit = 0;
    let totalCredit = 0;
    for (const t of txns) {
      if (t.type === 'DEBIT') totalDebit += t.amountPaisa;
      else totalCredit += t.amountPaisa;
    }

    const net = totalDebit - totalCredit;

    const rows = [
      { "Metric": "Total Invoiced / Charges (Debit)", "Amount": totalDebit / 100, "Notes": "Gross billings in period" },
      { "Metric": "Total Received / Collections (Credit)", "Amount": totalCredit / 100, "Notes": "Cleared receipts in period" },
      { "Metric": "Net Operational Movement", "Amount": Math.abs(net) / 100, "Notes": net >= 0 ? 'Net Receivable Increase' : 'Net Payable Increase' },
      { "Metric": "Total Active Transactions", "Amount": txns.length, "Notes": "Recorded vouchers" },
      { "Metric": "Active Master Accounts", "Amount": accounts.length, "Notes": "Total registered accounts" },
    ];

    res.json({
      rows,
      totals: {
        totalDebitPaisa: totalDebit,
        totalCreditPaisa: totalCredit,
        netPaisa: net,
      },
    });
  });

  // 29. Reports: All Transactions
  app.get('/api/reports/all-transactions', requireFeature('exports'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const accounts = db.accounts.filter((a) => a.organizationId === organizationId);
    const { dateFrom = '2000-01-01', dateTo = '2999-12-31' } = req.query as Record<string, string>;

    const txns = db.transactions
      .filter((t) => t.organizationId === organizationId && !t.isDeleted && (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo))
      .sort((a, b) => b.date.localeCompare(a.date));

    let totalDebit = 0;
    let totalCredit = 0;

    const rows = txns.map((t) => {
      const acc = accounts.find((a) => a._id === t.accountId);
      if (t.type === 'DEBIT') totalDebit += t.amountPaisa;
      else totalCredit += t.amountPaisa;

      return {
        "Date": t.date,
        "Voucher #": t.transactionNumber,
        "Account Code": acc?.accountCode || '—',
        "Account Name": acc?.accountName || t.accountName,
        "Type": t.type,
        "Debit Amount": t.type === 'DEBIT' ? t.amountPaisa / 100 : 0,
        "Credit Amount": t.type === 'CREDIT' ? t.amountPaisa / 100 : 0,
        "Description": t.description,
        "Balance After": t.balanceAfterPaisa / 100,
      };
    });

    res.json({
      rows,
      totals: {
        totalDebitPaisa: totalDebit,
        totalCreditPaisa: totalCredit,
        netPaisa: totalDebit - totalCredit,
      },
    });
  });

  // 30. Reports: Inactive Accounts
  app.get('/api/reports/inactive-accounts', requireFeature('exports'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const daysThreshold = parseInt((req.query.days as string) || '30', 10);
    const ref = Date.now();

    let totalBalancePaisa = 0;

    const rows = db.accounts
      .filter((a) => a.organizationId === organizationId)
      .map((a) => {
        const lastTime = a.lastTransactionDate
          ? new Date(a.lastTransactionDate).getTime()
          : new Date(a.createdAt).getTime();
        const daysInactive = Math.floor((ref - lastTime) / (1000 * 60 * 60 * 24));
        return { a, daysInactive };
      })
      .filter((item) => item.daysInactive >= daysThreshold)
      .sort((x, y) => y.daysInactive - x.daysInactive)
      .map(({ a, daysInactive }) => {
        totalBalancePaisa += Math.abs(a.currentBalancePaisa);
        return {
          "Account Code": a.accountCode,
          "Account Name": a.accountName,
          "Balance": Math.abs(a.currentBalancePaisa) / 100,
          "Balance Type": a.currentBalanceType,
          "Last Activity Date": a.lastTransactionDate || 'None',
          "Days Inactive": daysInactive,
        };
      });

    res.json({
      rows,
      totals: {
        netPaisa: totalBalancePaisa,
        totalDebitPaisa: totalBalancePaisa,
        totalCreditPaisa: 0,
      },
    });
  });

  // 31. Reports: Custom Builder
  app.get('/api/reports/custom', requireFeature('customReports'), (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    const { accountId, dateFrom, dateTo, type } = req.query as Record<string, string>;

    let txns = db.transactions.filter((t) => t.organizationId === organizationId && !t.isDeleted);

    if (accountId) {
      txns = txns.filter((t) => t.accountId === accountId);
    }
    if (dateFrom) {
      txns = txns.filter((t) => t.date >= dateFrom);
    }
    if (dateTo) {
      txns = txns.filter((t) => t.date <= dateTo);
    }
    if (type && type !== 'ALL') {
      txns = txns.filter((t) => t.type === type);
    }

    txns.sort((a, b) => b.date.localeCompare(a.date));

    let totalDebit = 0;
    let totalCredit = 0;

    const rows = txns.map((t) => {
      const acc = db.accounts.find((a) => a._id === t.accountId && a.organizationId === organizationId);
      if (t.type === 'DEBIT') totalDebit += t.amountPaisa;
      else totalCredit += t.amountPaisa;

      return {
        "Date": t.date,
        "Voucher #": t.transactionNumber,
        "Account Name": acc?.accountName || t.accountName,
        "Type": t.type,
        "Amount": t.amountPaisa / 100,
        "Description": t.description,
        "Reference": t.reference || '—',
      };
    });

    res.json({
      rows,
      totals: {
        totalDebitPaisa: totalDebit,
        totalCreditPaisa: totalCredit,
        netPaisa: totalDebit - totalCredit,
      },
    });
  });

  // 32. Settings Endpoints (per-organization)
  app.get('/api/settings', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    res.json(getSettingsForOrg(db, organizationId));
  });

  app.put('/api/settings', (req, res) => {
    const organizationId = req.organizationId!;
    const db = getDb();
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return res.status(400).json({ error: 'Request body must be a settings object' });
    }
    const current = getSettingsForOrg(db, organizationId);
    const updates = { ...req.body };
    delete updates.organizationId;
    db.settingsByOrg[organizationId] = { ...current, ...updates, organizationId };

    db.auditLogs.unshift({
      _id: `audit_${Date.now()}`,
      organizationId,
      action: 'SETTINGS_UPDATED',
      entityType: 'SETTING',
      entityId: 'org_settings',
      userId: req.userId || 'admin',
      after: db.settingsByOrg[organizationId],
      createdAt: new Date().toISOString(),
      notes: 'System configuration modified',
    });
    saveDb(db);
    res.json(db.settingsByOrg[organizationId]);
  });

  // 33. Central Balance Rebuild All (scoped to caller's org)
  app.post('/api/recalculate-all', (req, res) => {
    recalculateAllLedgers(req.organizationId!);
    res.json({ success: true, message: 'All account ledgers recalculated sequentially.' });
  });

  // Unmatched API routes -> JSON 404 instead of falling through to the SPA/Vite handler
  app.use('/api', (req, res) => {
    res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
  });

  // Global JSON error handler: any error thrown (sync) or passed via next(err)
  // (including from asyncHandler-wrapped routes) lands here instead of
  // crashing the process or hanging the client with no response.
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('[API] Unhandled error:', err);
    if (res.headersSent) return next(err);
    res.status(err?.statusCode || 500).json({ error: err?.message || 'Internal server error' });
  });

  // On Vercel, static assets + SPA fallback are served by Vercel's static
  // build/rewrites (see vercel.json) — this function only ever handles /api/*.
  if (!IS_SERVERLESS) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

// Only boot a long-running listener for local dev / traditional hosting.
// On Vercel, api/index.ts imports createApp() instead and this is skipped.
if (!IS_SERVERLESS) {
  createApp().then((app) => {
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  });
}
