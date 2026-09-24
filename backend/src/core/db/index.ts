import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { settings } from '../config/env';
import * as schema from './schema';

/**
 * The one connection pool. Import `db` for queries; `pool` is for raw SQL that
 * Drizzle cannot express (enum DDL, admin restore) and for shutdown.
 */
export const pgPool = new Pool({
  connectionString: settings.databaseUrl,
  ssl: settings.databaseSsl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

// An idle client erroring (network blip, server restart) must not take the
// process down — the pool discards it and the next query gets a fresh one.
pgPool.on('error', (err) => {
  console.error('[db] Unexpected idle client error:', err);
});

export const database = drizzle(pgPool, { schema });

export type DbHandle = typeof database;

/** Drizzle's transaction callback type — for services that accept `tx | db`. */
export type DbTransaction = Parameters<Parameters<DbHandle['transaction']>[0]>[0];
