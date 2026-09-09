import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { isHttpError } from '../errors';
import { env } from '../../config/env';

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};

/**
 * The single place an error becomes a response.
 *
 * Known failures (HttpError, ZodError) keep their message; everything else is
 * logged in full and answered with a generic 500, so internal details — SQL
 * text, file paths, driver messages — never reach a client.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // A handler that already responded and then failed (the response-first
  // background-work pattern) cannot be answered again; let Express close it.
  if (res.headersSent) return next(err);

  if (isHttpError(err)) {
    if (err.status >= 500) console.error(`[${req.method} ${req.originalUrl}]`, err);
    return res.status(err.status).json({
      error: err.message,
      ...(err.details !== undefined ? { details: err.details } : {}),
      ...(err.meta ?? {}),
    });
  }

  // A schema parsed outside validation middleware (e.g. inside a service).
  if (err instanceof ZodError) {
    return res.status(422).json({ error: 'Validation failed', details: err.flatten().fieldErrors });
  }

  console.error(`[${req.method} ${req.originalUrl}] Unhandled error:`, err);
  return res.status(500).json({
    error: 'Internal server error',
    ...(env.isProduction ? {} : { details: err instanceof Error ? err.message : String(err) }),
  });
};
