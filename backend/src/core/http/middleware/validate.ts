import type { RequestHandler } from 'express';
import type { ZodSchema, ZodTypeAny, output } from 'zod';
import { badRequest } from '../../errors';

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

/**
 * Parses a payload inside a service, reporting the first message as a 400.
 *
 * Most routes validate at the edge with `validateBody`, which answers 422 with
 * per-field details. A few endpoints predate that and their clients read a
 * single message from a 400 instead; this keeps that contract intact without
 * spreading two validation styles through the routing layer.
 *
 * Returns the parsed value (defaults applied), so it is typed as the schema's output.
 */
export function parseOrBadRequest<S extends ZodTypeAny>(schema: S, payload: unknown): output<S> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw badRequest(result.error.errors[0]?.message ?? 'Invalid request body');
  }
  return result.data;
}
