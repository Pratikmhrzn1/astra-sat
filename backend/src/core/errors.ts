/**
 * Errors a service or route may throw.
 *
 * Domain code says *what* went wrong (`missing('Exam not found')`); it never
 * picks an HTTP status. `core/http/middleware/error.ts` is the one place a kind
 * becomes a status code and a response body, so services stay usable outside a
 * request (startup jobs, scripts) and the transport mapping lives in one spot.
 *
 * The response body is always `{ error: string }` (plus optional `details` and
 * `meta` fields, including `code` from `withCode`), because the frontend reads
 * exactly `response.data.error`.
 */
export type FailureKind =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'unprocessable'
  | 'too_many_requests'
  | 'unavailable'
  | 'internal';

export class ServiceError extends Error {
  readonly kind: FailureKind;
  readonly details?: unknown;
  /** Extra fields merged into the response body — e.g. `retryAfterSeconds`. */
  readonly meta?: Record<string, unknown>;

  constructor(kind: FailureKind, message: string, options: { details?: unknown; meta?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'ServiceError';
    this.kind = kind;
    this.details = options.details;
    this.meta = options.meta;
    Error.captureStackTrace?.(this, ServiceError);
  }

  /**
   * Returns a copy carrying extra top-level response fields — used where the
   * client needs machine-readable context alongside the message, such as
   * `attemptsRemaining` on a rejected login.
   */
  withMeta(meta: Record<string, unknown>): ServiceError {
    return new ServiceError(this.kind, this.message, {
      details: this.details,
      meta: { ...this.meta, ...meta },
    });
  }

  /**
   * Adds a machine-readable `code` to the response body (`EMAIL_NOT_VERIFIED`,
   * `ACCOUNT_PENDING`, …) for clients that branch on the reason rather than
   * display the message.
   */
  withCode(code: string): ServiceError {
    return this.withMeta({ code });
  }
}

export const invalidRequest = (message: string, meta?: Record<string, unknown>) =>
  new ServiceError('bad_request', message, { meta });

export const notAuthenticated = (message = 'Not authenticated') => new ServiceError('unauthorized', message);

export const notPermitted = (message = 'Insufficient permissions') => new ServiceError('forbidden', message);

export const missing = (message = 'Not found') => new ServiceError('not_found', message);

export const stateConflict = (message: string) => new ServiceError('conflict', message);

export const unprocessableInput = (message: string, details?: unknown) =>
  new ServiceError('unprocessable', message, { details });

export const rateLimited = (message: string, meta?: Record<string, unknown>) =>
  new ServiceError('too_many_requests', message, { meta });

/** A dependency the feature needs is not configured or not reachable (e.g. an AI model). */
export const dependencyDown = (message: string) => new ServiceError('unavailable', message);

/** A known failure whose message is safe to show, unlike an unexpected throw. */
export const internalFailure = (message: string, meta?: Record<string, unknown>) =>
  new ServiceError('internal', message, { meta });

export function isServiceError(err: unknown): err is ServiceError {
  return err instanceof ServiceError;
}
