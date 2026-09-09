/**
 * Errors a route may throw. The error middleware turns these into responses;
 * anything else becomes a 500 with the detail logged but not disclosed.
 *
 * The response body is always `{ error: string }` (plus an optional `details`),
 * because the frontend reads exactly `response.data.error` in `getApiError()`.
 */
export class HttpError extends Error {
  readonly status: number;
  readonly details?: unknown;
  /** Extra fields merged into the response body — e.g. `retryAfterSeconds`. */
  readonly meta?: Record<string, unknown>;

  constructor(status: number, message: string, options: { details?: unknown; meta?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = options.details;
    this.meta = options.meta;
    Error.captureStackTrace?.(this, HttpError);
  }

  /**
   * Returns a copy carrying extra top-level response fields — used where the
   * client needs machine-readable context alongside the message, such as
   * `attemptsRemaining` on a rejected login.
   */
  withMeta(meta: Record<string, unknown>): HttpError {
    return new HttpError(this.status, this.message, {
      details: this.details,
      meta: { ...this.meta, ...meta },
    });
  }
}

export const badRequest = (message: string, meta?: Record<string, unknown>) =>
  new HttpError(400, message, { meta });

export const unauthorized = (message = 'Not authenticated') => new HttpError(401, message);

export const forbidden = (message = 'Insufficient permissions') => new HttpError(403, message);

export const notFound = (message = 'Not found') => new HttpError(404, message);

export const conflict = (message: string) => new HttpError(409, message);

export const unprocessable = (message: string, details?: unknown) =>
  new HttpError(422, message, { details });

export const tooManyRequests = (message: string, meta?: Record<string, unknown>) =>
  new HttpError(429, message, { meta });

export function isHttpError(err: unknown): err is HttpError {
  return err instanceof HttpError;
}
