import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';

/**
 * Request validation. A failure is a 422 carrying per-field messages, matching
 * the shape the frontend already renders: `{ error, details: { field: [msg] } }`.
 *
 * Each validator replaces the request property with the *parsed* value, so
 * handlers receive coerced, defaulted, trimmed data rather than raw strings.
 * Read them back with the `Body`/`Query`/`Params` helpers below to stay typed.
 */
function validate(source: 'body' | 'query' | 'params', schema: ZodSchema<unknown>): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      res.status(422).json({ error: 'Validation failed', details: result.error.flatten().fieldErrors });
      return;
    }
    // `req.query`/`req.params` are getter-backed in some Express versions;
    // defineProperty keeps the assignment working either way.
    Object.defineProperty(req, source, { value: result.data, writable: true, configurable: true });
    next();
  };
}

export const validateBody = <T>(schema: ZodSchema<T>): RequestHandler => validate('body', schema);
export const validateQuery = <T>(schema: ZodSchema<T>): RequestHandler => validate('query', schema);
export const validateParams = <T>(schema: ZodSchema<T>): RequestHandler => validate('params', schema);

/** Typed accessors — `const { email } = Body<typeof schema>(req)`. */
export const body = <T>(req: { body: unknown }): T => req.body as T;
export const query = <T>(req: { query: unknown }): T => req.query as T;
export const params = <T>(req: { params: unknown }): T => req.params as T;
