import jwt from 'jsonwebtoken';
import { settings } from '../config/env';

/**
 * Access tokens are short-lived (15 min) and sent as a bearer header; refresh
 * tokens are long-lived (7 days), delivered as an httpOnly cookie, and only
 * ever stored server-side as a sha256 hash.
 *
 * Secrets come from validated config — there is deliberately no development
 * fallback, since a hardcoded default silently signs production tokens with a
 * value that is public in the source tree.
 */
export interface AccessClaims {
  /** User id. Also exposed as `sub` for compatibility with existing tokens. */
  id: string;
  sub: string;
  email: string;
  name: string;
  role: string;
}

export interface RefreshClaims {
  sub: string;
  jti: string;
}

export function mintAccessToken(user: { id: string; email: string; name: string; role: string }): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    settings.jwt.accessSecret,
    { expiresIn: settings.jwt.accessTtl },
  );
}

export function mintRefreshToken(payload: RefreshClaims): string {
  return jwt.sign(payload, settings.jwt.refreshSecret, { expiresIn: settings.jwt.refreshTtl });
}

export function readAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, settings.jwt.accessSecret) as Omit<AccessClaims, 'id'>;
  // `id` is an alias so handlers never have to remember the JWT spelling.
  return { ...payload, id: payload.sub };
}

export function readRefreshToken(token: string): RefreshClaims {
  return jwt.verify(token, settings.jwt.refreshSecret) as RefreshClaims;
}
