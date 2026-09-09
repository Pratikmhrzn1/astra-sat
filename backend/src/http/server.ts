import fs from 'fs';
import type { Server } from 'http';
import { env } from '../config/env';
import { pool } from '../db';
import { runMigrations } from '../db/migrate';
import { createApp } from './app';

/**
 * Boot sequence: prepare the upload directory, bring the schema up to date,
 * then listen. Migrations run *before* the port opens so no request can hit a
 * half-migrated database, and a failure exits non-zero so the orchestrator
 * restarts (or halts) rather than serving a broken app.
 */
export async function startServer(): Promise<Server> {
  fs.mkdirSync(env.uploads.dir, { recursive: true });

  console.log('[boot] Running database migrations…');
  await runMigrations();

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`[boot] SAT Prep backend listening on http://localhost:${env.port} (${env.nodeEnv})`);
  });

  installShutdownHandlers(server);
  return server;
}

/**
 * Stops accepting connections, lets in-flight requests finish, then closes the
 * pool. Without this a redeploy severs live requests — including exam submits.
 */
function installShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — closing server…`);

    const forceExit = setTimeout(() => {
      console.error('[shutdown] Timed out after 10s — forcing exit.');
      process.exit(1);
    }, 10_000);
    forceExit.unref();

    server.close(async (err) => {
      if (err) console.error('[shutdown] Error closing server:', err);
      try {
        await pool.end();
        console.log('[shutdown] Database pool closed.');
      } catch (poolErr) {
        console.error('[shutdown] Error closing pool:', poolErr);
      }
      process.exit(err ? 1 : 0);
    });
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Background AI work runs detached from requests; a rejection there must be
  // loud rather than silently killing the process under future Node defaults.
  process.on('unhandledRejection', (reason) => {
    console.error('[process] Unhandled promise rejection:', reason);
  });
}
