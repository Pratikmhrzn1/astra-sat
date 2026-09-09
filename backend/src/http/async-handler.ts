import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so a rejected promise reaches the error
 * middleware instead of hanging the request.
 *
 * Express 4 does not await handlers: an unhandled rejection inside one leaves
 * the client waiting until it times out. The previous codebase solved this by
 * requiring every handler to wrap its whole body in try/catch, which is easy to
 * forget and noisy to read. Wrapping once here replaces that convention —
 * handlers now throw (see http/errors.ts) and stay linear.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
