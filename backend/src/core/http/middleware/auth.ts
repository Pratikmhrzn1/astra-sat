import type { RequestHandler } from 'express';
import { verifyAccessToken, type TokenPayload } from '../../lib/jwt';
import { forbidden, unauthorized } from '../../errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireAuth`. Present on every route mounted behind it. */
      user?: TokenPayload;
    }
  }
}

export type Role = 'student' | 'teacher' | 'admin';

/** Verifies the `Authorization: Bearer <accessToken>` header. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('Missing or invalid authorization header');
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  next();
};

/**
 * Restricts a route to the given roles. Always mount behind `requireAuth`.
 *
 * Prefer applying this at the router root (`router.use(requireAuth,
 * requireRole(['student']))`) so new routes inherit the gate instead of each
 * handler repeating a check it can forget.
 */
export function requireRole(roles: Role[], message = 'Insufficient permissions'): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role as Role)) throw forbidden(message);
    next();
  };
}

/** The authenticated user, for handlers mounted behind `requireAuth`. */
export function currentUser(req: { user?: TokenPayload }): TokenPayload {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Shorthand for the common `req.user!.sub`. */
export function currentUserId(req: { user?: TokenPayload }): string {
  return currentUser(req).id;
}
