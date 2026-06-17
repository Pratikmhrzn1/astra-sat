import { Router } from 'express';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../db';
import { users, accessCodes } from '../db/schema';
import { hashPassword, comparePassword } from '../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import rateLimit from 'express-rate-limit';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  accessCode: z.string().min(1, 'Access code is required'),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

router.post('/register', authLimiter, validateBody(registerSchema), async (req, res) => {
  const { email, name, password, accessCode } = req.body;
  try {
    const codeRows = await db
      .select()
      .from(accessCodes)
      .where(
        and(
          eq(accessCodes.code, accessCode),
          eq(accessCodes.isActive, true)
        )
      )
      .limit(1);

    if (codeRows.length === 0) {
      return res.status(400).json({ error: 'Invalid or inactive access code' });
    }

    const codeRow = codeRows[0];
    if (codeRow.maxUses !== null && codeRow.useCount >= codeRow.maxUses) {
      return res.status(400).json({ error: 'Access code has reached its usage limit' });
    }

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await hashPassword(password);

    const [newUser] = await db
      .insert(users)
      .values({ email, name, passwordHash, role: codeRow.role })
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role });

    await db
      .update(accessCodes)
      .set({ useCount: codeRow.useCount + 1 })
      .where(eq(accessCodes.id, codeRow.id));

    const payload = { sub: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken({ sub: newUser.id });

    return res.status(201).json({ accessToken, refreshToken, user: newUser });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  try {
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (userRows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = userRows[0];
    const valid = await comparePassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = { sub: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken({ sub: user.id });

    return res.json({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;
  try {
    const payload = verifyRefreshToken(refreshToken);
    const userRows = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (userRows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = userRows[0];
    const newAccessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    return res.json({ accessToken: newAccessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

router.post('/logout', (_req, res) => {
  return res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        teacherId: users.teacherId,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, req.user!.sub))
      .limit(1);

    if (userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json(userRows[0]);
  } catch (err) {
    console.error('Me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
