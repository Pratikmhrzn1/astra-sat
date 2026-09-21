import jwt from 'jsonwebtoken';
import { env } from '../config/env';

/**
 * Access tokens are short-lived (15 min) and sent as a bearer header; refresh
 * tokens are long-lived (7 days), delivered as an httpOnly cookie, and only
 * ever stored server-side as a sha256 hash.
 *
 * Secrets come from validated config — there is deliberately no development
 * fallback, since a hardcoded default silently signs production tokens with a
 * value that is public in the source tree.
 */
export interface TokenPayload {
  /** User id. Also exposed as `sub` for compatibility with existing tokens. */
  id: string;
  sub: string;
  email: string;
  name: string;
  role: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export function signAccessToken(user: { id: string; email: string; name: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    env.jwt.accessSecret,
    { expiresIn: env.jwt.accessTtl },
  );
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshTtl });
}

export function verifyAccessToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.jwt.accessSecret) as Omit<TokenPayload, 'id'>;
  // `id` is an alias so handlers never have to remember the JWT spelling.
  return { ...payload, id: payload.sub };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
}
