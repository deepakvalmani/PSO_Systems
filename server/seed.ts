/**
 * One-off seed script. Run with: npm run seed
 *
 * Creates:
 *   - A SUPER_ADMIN user (username: admin) with a freshly generated password
 *   - The "Ahmed Petroleum Service" organization with an ORG_ADMIN user
 *
 * Generated passwords are printed to stdout ONCE and are never written to
 * disk or committed anywhere. Copy them somewhere safe immediately.
 *
 * Safe to re-run: if the super-admin or the organization already exist, the
 * script reports that and skips creating them again instead of erroring.
 */
import { initDb, saveDb, getSettingsForOrg } from './db';
import { saveAllToMongo } from './mongo';
import { hashPassword, generateStrongPassword } from './auth';
import { DEFAULT_PLAN_ID, getPlanFeatures } from './plans';
import { Organization, AppUser } from '../src/types';

async function main() {
  const db = await initDb();

  console.log('--- LedgerOne seed script ---');

  // 1. Super admin
  let superAdmin = db.users.find((u) => u.role === 'SUPER_ADMIN' && u.username === 'admin');
  if (superAdmin) {
    console.log('[seed] Super-admin user "admin" already exists — skipping creation.');
  } else {
    const password = generateStrongPassword(16);
    const passwordHash = await hashPassword(password);
    superAdmin = {
      _id: `user_${Date.now()}_super`,
      organizationId: null,
      username: 'admin',
      passwordHash,
      role: 'SUPER_ADMIN',
      createdAt: new Date().toISOString(),
    };
    db.users.push(superAdmin);
    console.log('\n[seed] Created SUPER_ADMIN user:');
    console.log(`  username: admin`);
    console.log(`  password: ${password}`);
    console.log('  (copy this now — it will not be shown again and is not stored anywhere)');
  }

  // 2. Ahmed Petroleum Service organization + org-admin
  const slug = 'ahmed-petroleum-service';
  let org = db.organizations.find((o) => o.slug === slug);
  if (org) {
    console.log('\n[seed] Organization "Ahmed Petroleum Service" already exists — skipping creation.');
  } else {
    const now = new Date().toISOString();
    org = {
      _id: `org_${Date.now()}`,
      name: 'Ahmed Petroleum Service',
      slug,
      phone: '',
      address: '',
      city: '',
      isActive: true,
      planId: DEFAULT_PLAN_ID,
      features: getPlanFeatures(DEFAULT_PLAN_ID),
      createdAt: now,
      updatedAt: now,
    } as Organization;
    db.organizations.push(org);
    getSettingsForOrg(db, org._id).businessName = org.name;

    const username = 'ahmedpetroleum';
    const password = generateStrongPassword(16);
    const passwordHash = await hashPassword(password);
    const orgAdmin: AppUser = {
      _id: `user_${Date.now()}_org`,
      organizationId: org._id,
      username,
      passwordHash,
      role: 'ORG_ADMIN',
      createdAt: now,
    };
    db.users.push(orgAdmin);

    console.log('\n[seed] Created organization "Ahmed Petroleum Service" and its ORG_ADMIN user:');
    console.log(`  username: ${username}`);
    console.log(`  password: ${password}`);
    console.log('  (copy this now — it will not be shown again and is not stored anywhere)');
  }

  saveDb(db);
  // saveDb() fires the MongoDB sync asynchronously (fire-and-forget) so the
  // local JSON write isn't blocked on network I/O. Since this script exits
  // right after seeding, explicitly await the Mongo write here too —
  // otherwise the process can exit before the remote write completes.
  const mongoSynced = await saveAllToMongo(db);
  if (mongoSynced) {
    console.log('[seed] Synced to MongoDB Atlas.');
  } else {
    console.log('[seed] MongoDB not configured/unavailable — data saved to local JSON store only.');
  }
  console.log('\n[seed] Done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Fatal error:', err);
    process.exit(1);
  });
