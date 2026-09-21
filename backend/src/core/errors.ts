/**
 * Errors a service or route may throw.
 *
 * Domain code says *what* went wrong (`notFound('Exam not found')`); it never
 * picks an HTTP status. `core/http/middleware/error.ts` is the one place a kind
 * becomes a status code and a response body, so services stay usable outside a
 * request (startup jobs, scripts) and the transport mapping lives in one spot.
 *
 * The response body is always `{ error: string }` (plus optional `details` and
 * `meta` fields), because the frontend reads exactly `response.data.error`.
 */
export type ErrorKind =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'too_many_requests'
  | 'unavailable'
  | 'internal';

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly details?: unknown;
  /** Extra fields merged into the response body — e.g. `retryAfterSeconds`. */
  readonly meta?: Record<string, unknown>;

  constructor(kind: ErrorKind, message: string, options: { details?: unknown; meta?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'AppError';
    this.kind = kind;
    this.details = options.details;
    this.meta = options.meta;
    Error.captureStackTrace?.(this, AppError);
  }

  /**
   * Returns a copy carrying extra top-level response fields — used where the
   * client needs machine-readable context alongside the message, such as
   * `attemptsRemaining` on a rejected login.
   */
  withMeta(meta: Record<string, unknown>): AppError {
    return new AppError(this.kind, this.message, {
      details: this.details,
      meta: { ...this.meta, ...meta },
    });
  }
}

export const badRequest = (message: string, meta?: Record<string, unknown>) =>
  new AppError('bad_request', message, { meta });

export const unauthorized = (message = 'Not authenticated') => new AppError('unauthorized', message);

export const forbidden = (message = 'Insufficient permissions') => new AppError('forbidden', message);

export const notFound = (message = 'Not found') => new AppError('not_found', message);

export const conflict = (message: string) => new AppError('conflict', message);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError('unprocessable', message, { details });

export const tooManyRequests = (message: string, meta?: Record<string, unknown>) =>
  new AppError('too_many_requests', message, { meta });

/** A dependency the feature needs is not configured or not reachable (e.g. an AI model). */
export const unavailable = (message: string) => new AppError('unavailable', message);

/** A known failure whose message is safe to show, unlike an unexpected throw. */
export const internal = (message: string, meta?: Record<string, unknown>) =>
  new AppError('internal', message, { meta });

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
