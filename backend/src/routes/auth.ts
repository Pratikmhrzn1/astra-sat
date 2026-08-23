import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { eq, and, gt } from 'drizzle-orm';
import { db } from '../db';
import { users, accessCodes, refreshTokens, passwordResetTokens } from '../db/schema';
import { hashPassword, comparePassword } from '../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../lib/email';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV !== 'production',
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const isProd = process.env.NODE_ENV === 'production';
const cookieSecure = process.env.COOKIE_SECURE !== 'false' && isProd;

function setRefreshCookie(res: Response, token: string): void {
  res.cookie('rt', token, {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie('rt', { httpOnly: true, path: '/' });
}

async function mintAndStoreRefreshToken(userId: string): Promise<string> {
  const jti = crypto.randomBytes(16).toString('hex');
  const rawToken = signRefreshToken({ sub: userId, jti });
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
  return rawToken;
}

// ── Multi-tab grace window ────────────────────────────────────────────────────
// When two tabs both fire /refresh simultaneously, only one wins the DB
// transaction. The loser checks this map so it gets the same new access token
// without being forced to log out.
const recentlyRotated = new Map<string, { accessToken: string; rawToken: string; expiresAt: number }>();
const GRACE_MS = 30_000;

// ── Per-account login failure tracking ───────────────────────────────────────
// Keyed by lowercase email. Resets on successful login or after lockout expires.
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

interface LoginAttemptRecord {
  failures: number;
  lockedUntil: number; // epoch ms; 0 = not locked
}
const loginAttempts = new Map<string, LoginAttemptRecord>();

function getLoginRecord(email: string): LoginAttemptRecord {
  let rec = loginAttempts.get(email);
  if (!rec) { rec = { failures: 0, lockedUntil: 0 }; loginAttempts.set(email, rec); }
  return rec;
}

function recordLoginFailure(email: string): LoginAttemptRecord {
  const rec = getLoginRecord(email);
  rec.failures += 1;
  if (rec.failures >= LOGIN_MAX_FAILURES) rec.lockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
  return rec;
}

function resetLoginRecord(email: string): void {
  loginAttempts.delete(email);
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().max(30).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  accessCode: z.string().min(1, 'Access code is required'),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/register', authLimiter, validateBody(registerSchema), async (req: Request, res: Response) => {
  const { email, name, phone, password, accessCode } = req.body;
  try {
    const codeRows = await db
      .select()
      .from(accessCodes)
      .where(and(eq(accessCodes.code, accessCode), eq(accessCodes.isActive, true)))
      .limit(1);

    if (codeRows.length === 0) {
      return res.status(400).json({ error: 'Invalid or inactive access code' });
    }

    const codeRow = codeRows[0];
    if (codeRow.maxUses !== null && codeRow.useCount >= codeRow.maxUses) {
      return res.status(400).json({ error: 'Access code has reached its usage limit' });
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    if (codeRow.role === 'student' && !phone?.trim()) {
      return res.status(400).json({ error: 'Phone number is required for student accounts' });
    }

    const passwordHash = await hashPassword(password);
    const [newUser] = await db
      .insert(users)
      .values({ email, name, phone: phone?.trim() ?? null, passwordHash, role: codeRow.role })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

    await db.update(accessCodes).set({ useCount: codeRow.useCount + 1 }).where(eq(accessCodes.id, codeRow.id));

    sendWelcomeEmail(newUser.email, newUser.name, password).catch((err) =>
      console.error('Welcome email failed:', err),
    );

    const accessToken = signAccessToken({ sub: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role });
    const rawRefreshToken = await mintAndStoreRefreshToken(newUser.id);

    setRefreshCookie(res, rawRefreshToken);
    return res.status(201).json({ accessToken, user: newUser });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;
  try {
    // Per-account lockout check — must run before bcrypt to prevent brute-force
    const attemptRec = getLoginRecord(email);
    if (attemptRec.lockedUntil > Date.now()) {
      const secondsLeft = Math.ceil((attemptRec.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        error: `Too many failed login attempts. Please try again in ${Math.ceil(secondsLeft / 60)} minute${Math.ceil(secondsLeft / 60) === 1 ? '' : 's'}.`,
        retryAfterSeconds: secondsLeft,
      });
    }

    const userRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];

    // Always run bcrypt even when user not found — prevents timing-based email enumeration
    const hashToCheck = user?.passwordHash ?? '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXX';
    const valid = await comparePassword(password, hashToCheck);

    if (!user || !valid) {
      const updated = recordLoginFailure(email);
      const remaining = LOGIN_MAX_FAILURES - updated.failures;
      if (updated.lockedUntil > 0) {
        return res.status(429).json({
          error: 'Too many failed login attempts. Account locked for 15 minutes.',
          retryAfterSeconds: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
        });
      }
      return res.status(401).json({
        error: 'Invalid email or password',
        attemptsRemaining: remaining > 0 ? remaining : 0,
      });
    }

    // Successful login — clear failure record
    resetLoginRecord(email);

    const accessToken = signAccessToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
    const rawRefreshToken = await mintAndStoreRefreshToken(user.id);

    setRefreshCookie(res, rawRefreshToken);
    return res.json({
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const rawToken: string | undefined = req.cookies?.rt;
    if (!rawToken) return res.status(401).json({ error: 'No refresh token' });

    // Verify JWT signature first — fast fail for tampered/expired tokens
    let userId: string;
    try {
      const payload = verifyRefreshToken(rawToken);
      userId = payload.sub;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const oldHash = sha256(rawToken);

    // Grace window: losing tab on a simultaneous refresh gets the cached result
    const cached = recentlyRotated.get(oldHash);
    if (cached && cached.expiresAt > Date.now()) {
      setRefreshCookie(res, cached.rawToken);
      return res.json({ accessToken: cached.accessToken });
    }

    // Look up user for fresh role/name/email in the new access token
    const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userRows.length === 0) return res.status(401).json({ error: 'User not found' });
    const user = userRows[0];

    // Atomic rotation: delete old hash, insert new one — if delete returns 0 rows,
    // another concurrent request already rotated this token.
    type RotateResult = { accessToken: string; rawToken: string };
    const txResult: RotateResult | null = await db.transaction(async (tx): Promise<RotateResult | null> => {
      const deleted = await tx
        .delete(refreshTokens)
        .where(eq(refreshTokens.tokenHash, oldHash))
        .returning({ id: refreshTokens.id });

      if (deleted.length === 0) return null; // race lost

      const newAccessToken = signAccessToken({ sub: user.id, email: user.email, name: user.name, role: user.role });
      const jti = crypto.randomBytes(16).toString('hex');
      const newRawToken = signRefreshToken({ sub: user.id, jti });
      const newHash = sha256(newRawToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await tx.insert(refreshTokens).values({ userId: user.id, tokenHash: newHash, expiresAt });

      return { accessToken: newAccessToken, rawToken: newRawToken };
    });

    if (!txResult) {
      // Lost the race — wait briefly for the winner to populate the grace map
      await new Promise<void>((r) => setTimeout(r, 50));
      const retry = recentlyRotated.get(oldHash);
      if (retry && retry.expiresAt > Date.now()) {
        setRefreshCookie(res, retry.rawToken);
        return res.json({ accessToken: retry.accessToken });
      }
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Populate grace map so a concurrent losing tab can recover without logout
    recentlyRotated.set(oldHash, { ...txResult, expiresAt: Date.now() + GRACE_MS });
    setTimeout(() => recentlyRotated.delete(oldHash), GRACE_MS);

    setRefreshCookie(res, txResult.rawToken);
    return res.json({ accessToken: txResult.accessToken });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', requireAuth, async (req: Request, res: Response) => {
  try {
    const rawToken: string | undefined = req.cookies?.rt;
    if (rawToken) {
      const tokenHash = sha256(rawToken);
      await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));
    }
    clearRefreshCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userRows = await db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, teacherId: users.teacherId, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, req.user!.sub))
      .limit(1);

    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
    return res.json(userRows[0]);
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});

router.post('/change-password', requireAuth, validateBody(changePasswordSchema), async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userRows = await db.select().from(users).where(eq(users.id, req.user!.sub)).limit(1);
    if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = userRows[0];

    const valid = await comparePassword(currentPassword, user.passwordHash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const newHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, user.id));
    return res.json({ ok: true });
  } catch (err) {
    console.error('Change password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
});

router.patch('/profile', requireAuth, validateBody(updateProfileSchema), async (req: Request, res: Response) => {
  try {
    const { name } = req.body;
    const [updated] = await db
      .update(users)
      .set({ name })
      .where(eq(users.id, req.user!.sub))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

    if (!updated) return res.status(404).json({ error: 'User not found' });
    return res.json(updated);
  } catch (err) {
    console.error('Update profile error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), async (req: Request, res: Response) => {
  const { email } = req.body;
  try {
    const [user] = await db.select({ id: users.id, email: users.email, name: users.name })
      .from(users).where(eq(users.email, email)).limit(1);

    // Always return 200 so we don't reveal whether the email exists
    if (!user) return res.json({ ok: true });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.insert(passwordResetTokens).values({ userId: user.id, token, expiresAt });

    sendPasswordResetEmail(user.email, user.name, token).catch((err) =>
      console.error('Password reset email failed:', err),
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

router.post('/reset-password', validateBody(resetPasswordSchema), async (req: Request, res: Response) => {
  const { token, password } = req.body;
  try {
    const now = new Date();
    const [row] = await db.select().from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.token, token), gt(passwordResetTokens.expiresAt, now)))
      .limit(1);

    if (!row) return res.status(400).json({ error: 'Reset link is invalid or has expired' });
    if (row.usedAt) return res.status(400).json({ error: 'Reset link has already been used' });

    const passwordHash = await hashPassword(password);

    await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId));
    await db.update(passwordResetTokens).set({ usedAt: now }).where(eq(passwordResetTokens.id, row.id));

    return res.json({ ok: true });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
