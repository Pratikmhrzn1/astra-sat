import type { RequestHandler } from 'express';
import { readAccessToken, type AccessClaims } from '../../lib/jwt';
import { notPermitted, notAuthenticated } from '../../errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireSession`. Present on every route mounted behind it. */
      user?: AccessClaims;
    }
  }
}

export type AccountRole = 'trial' | 'student' | 'teacher' | 'admin';

/**
 * Everyone who sits exams: trial and full students reach exactly the same
 * routes, and differ only in their account's expiry date and daily test limit.
 * Gate learner routes with this, never with `['student']` alone.
 */
export const LEARNER_ROLES: readonly AccountRole[] = ['trial', 'student'];

export function isLearnerRole(role: string): boolean {
  return (LEARNER_ROLES as readonly string[]).includes(role);
}

/** Verifies the `Authorization: Bearer <accessToken>` header. */
export const requireSession: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw notAuthenticated('Missing or invalid authorization header');
  }
  try {
    req.user = readAccessToken(header.slice(7));
  } catch {
    throw notAuthenticated('Invalid or expired token');
  }
  next();
};

/**
 * Restricts a route to the given roles. Always mount behind `requireSession`.
 *
 * Prefer applying this at the router root (`router.use(requireSession,
 * requireAccountRole(LEARNER_ROLES))`) so new routes inherit the gate instead of each
 * handler repeating a check it can forget.
 */
export function requireAccountRole(roles: readonly AccountRole[], message = 'Insufficient permissions'): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw notAuthenticated();
    if (!roles.includes(req.user.role as AccountRole)) throw notPermitted(message);
    next();
  };
}

/** The authenticated user, for handlers mounted behind `requireSession`. */
export function sessionUser(req: { user?: AccessClaims }): AccessClaims {
  if (!req.user) throw notAuthenticated();
  return req.user;
}

/** Shorthand for the common `req.user!.sub`. */
export function sessionUserId(req: { user?: AccessClaims }): string {
  return sessionUser(req).id;
}
