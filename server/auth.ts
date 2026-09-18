import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { UserRole } from '../src/types';

const COOKIE_NAME = 'ledgerone_session';
const DEV_ONLY_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) return secret;

  if (process.env.NODE_ENV === 'production') {
    // Fail loudly rather than silently signing tokens with a guessable secret.
    console.error('[Auth] FATAL: JWT_SECRET is not set in production. Refusing to start.');
    throw new Error('JWT_SECRET environment variable is required in production');
  }

  console.warn(
    '[Auth] WARNING: JWT_SECRET is not set. Falling back to an insecure dev-only secret. ' +
      'Set JWT_SECRET in your environment before deploying to production.'
  );
  return DEV_ONLY_SECRET;
}

export interface SessionPayload {
  userId: string;
  organizationId: string | null;
  role: UserRole;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

// Augment Express Request with the fields our middleware attaches.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      organizationId?: string | null;
      userRole?: UserRole;
      userId?: string;
    }
  }
}

const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login']);

/**
 * Verifies the JWT session cookie on every /api/* route (except the public
 * paths above) and attaches req.organizationId / req.userRole / req.userId.
 * Route handlers must use these — never an organizationId taken from the
 * request body or query string — to scope every database read/write.
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api/')) return next();
  if (PUBLIC_PATHS.has(req.path)) return next();

  const token = (req as any).cookies?.[COOKIE_NAME];
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const session = verifySession(token);
  if (!session) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return;
  }

  req.userId = session.userId;
  req.organizationId = session.organizationId;
  req.userRole = session.role;
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole !== 'SUPER_ADMIN') {
    res.status(403).json({ error: 'Super-admin access required' });
    return;
  }
  next();
}

export function requireOrgScope(req: Request, res: Response, next: NextFunction): void {
  if (req.userRole === 'SUPER_ADMIN') {
    res.status(403).json({ error: 'This route is scoped to a pump account, not the super-admin' });
    return;
  }
  if (!req.organizationId) {
    res.status(401).json({ error: 'No organization associated with this session' });
    return;
  }
  next();
}

export function generateStrongPassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export { COOKIE_NAME };
