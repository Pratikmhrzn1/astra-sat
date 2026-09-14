import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../config/env';
import * as schema from './schema';

/**
 * The one connection pool. Import `db` for queries; `pool` is for raw SQL that
 * Drizzle cannot express (enum DDL, admin restore) and for shutdown.
 */
export const pool = new Pool({
  connectionString: env.databaseUrl,
  ssl: env.databaseSsl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// An idle client erroring (network blip, server restart) must not take the
// process down — the pool discards it and the next query gets a fresh one.
pool.on('error', (err) => {
  console.error('[db] Unexpected idle client error:', err);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;

/** Drizzle's transaction callback type — for services that accept `tx | db`. */
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
