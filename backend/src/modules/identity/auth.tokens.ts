import crypto from 'crypto';
import type { Response } from 'express';
import { db } from '../../core/db';
import { env } from '../../core/config/env';
import { signAccessToken, signRefreshToken } from '../../core/lib/jwt';
import * as repo from './auth.repository';

/**
 * Refresh-token issuing and rotation.
 *
 * Refresh tokens rotate on every use: the old hash is deleted and a new one
 * stored in the same transaction. That makes a stolen token single-use, but it
 * also means several browser tabs refreshing at once will race — exactly one
 * wins the delete, and the losers must not be logged out. The grace map below
 * is what lets a loser recover the winner's tokens.
 */

const REFRESH_COOKIE = 'rt';

/** Winners publish their result here for ~30s so simultaneous losers can read it. */
const GRACE_MS = 30_000;
const recentlyRotated = new Map<string, { accessToken: string; rawToken: string; expiresAt: number }>();

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.http.cookieSecure,
    // Cross-site in production (API and app may be different origins), lax in
    // dev where both are localhost and 'none' would require HTTPS.
    sameSite: env.isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: env.jwt.refreshTtlMs,
  });
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, path: '/' });
}

export function readRefreshCookie(req: { cookies?: Record<string, string> }): string | undefined {
  return req.cookies?.[REFRESH_COOKIE];
}

/** Mints a refresh token and records its hash. Returns the raw token. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const jti = crypto.randomBytes(16).toString('hex');
  const rawToken = signRefreshToken({ sub: userId, jti });
  await repo.storeRefreshToken(userId, hashToken(rawToken), new Date(Date.now() + env.jwt.refreshTtlMs));
  return rawToken;
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await repo.deleteRefreshToken(hashToken(rawToken));
}

export interface RotationResult {
  accessToken: string;
  rawToken: string;
}

export function readGraceEntry(oldHash: string): RotationResult | null {
  const cached = recentlyRotated.get(oldHash);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return { accessToken: cached.accessToken, rawToken: cached.rawToken };
}

function publishGraceEntry(oldHash: string, result: RotationResult): void {
  recentlyRotated.set(oldHash, { ...result, expiresAt: Date.now() + GRACE_MS });
  setTimeout(() => recentlyRotated.delete(oldHash), GRACE_MS).unref?.();
}

/**
 * Atomically swaps one refresh token for a fresh pair.
 *
 * Returns null when another request already rotated this token — the delete
 * matched no rows, so this caller lost the race and should fall back to the
 * grace map rather than treating it as an invalid session.
 */
export async function rotateRefreshToken(
  oldHash: string,
  user: { id: string; email: string; name: string; role: string },
): Promise<RotationResult | null> {
  const result = await db.transaction(async (tx): Promise<RotationResult | null> => {
    const wasDeleted = await repo.deleteRefreshToken(oldHash, tx);
    if (!wasDeleted) return null;

    const jti = crypto.randomBytes(16).toString('hex');
    const rawToken = signRefreshToken({ sub: user.id, jti });
    await repo.storeRefreshToken(user.id, hashToken(rawToken), new Date(Date.now() + env.jwt.refreshTtlMs), tx);

    return { accessToken: signAccessToken(user), rawToken };
  });

  if (result) publishGraceEntry(oldHash, result);
  return result;
}
