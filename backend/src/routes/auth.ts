import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { users, accessCodes, refreshTokens } from '../db/schema';
import { hashPassword, comparePassword } from '../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

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
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie('rt', { httpOnly: true, path: '/api/auth' });
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

// ── Schemas ───────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  accessCode: z.string().min(1, 'Access code is required'),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/register', authLimiter, validateBody(registerSchema), async (req: Request, res: Response) => {
  const { email, name, password, accessCode } = req.body;
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

    const passwordHash = await hashPassword(password);
    const [newUser] = await db
      .insert(users)
      .values({ email, name, passwordHash, role: codeRow.role })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

    await db.update(accessCodes).set({ useCount: codeRow.useCount + 1 }).where(eq(accessCodes.id, codeRow.id));

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
    const userRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];

    // Always run bcrypt even when user not found — prevents timing-based email enumeration
    const hashToCheck = user?.passwordHash ?? '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXX';
    const valid = await comparePassword(password, hashToCheck);

    if (!user || !valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

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

export default router;
