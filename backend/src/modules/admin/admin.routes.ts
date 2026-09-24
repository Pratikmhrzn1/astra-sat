import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import { collectTrail, logTrail } from '../audit';
import * as database from './database.service';
import * as service from './admin.service';
import {
  restoreRules,
  executeSqlRules,
  type RestorePayload,
  type RunSqlPayload,
} from './admin.schemas';

/** Platform operations: overview stats, the database console, AI spend and the audit log. */

export const consoleRoutes = Router();

consoleRoutes.use(requireSession, requireAccountRole(['admin']));

// ── Overview ─────────────────────────────────────────────────────────────────

consoleRoutes.get(
  '/stats',
  wrapAsync(async (_req, res) => {
    res.json(await service.fetchStats());
  }),
);

// ── Database console ─────────────────────────────────────────────────────────
// Destructive by design; see database.service.ts.

consoleRoutes.get(
  '/backup',
  wrapAsync(async (req, res) => {
    const { backup, filename } = await database.addBackup();
    // A backup is every user's data leaving the server, so it is recorded too.
    await logTrail({ actorId: sessionUserId(req), action: 'db.backup_downloaded', payload: { filename } });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  }),
);

consoleRoutes.post(
  '/restore',
  checkBody(restoreRules),
  wrapAsync(async (req, res) => {
    const input = validatedBody<RestorePayload>(req);
    const rowCounts = Object.fromEntries(Object.entries(input.data).map(([k, rows]) => [k, Array.isArray(rows) ? rows.length : 0]));
    try {
      const result = await database.applyBackup(input);
      // Written after the restore, so the restored audit_log cannot erase it.
      await logTrail({ actorId: sessionUserId(req), action: 'db.restored', payload: { ok: true, version: input.version, rowCounts } });
      res.json(result);
    } catch (err) {
      await logTrail({ actorId: sessionUserId(req), action: 'db.restored', payload: { ok: false, version: input.version, error: (err as Error).message } });
      throw err;
    }
  }),
);

consoleRoutes.post(
  '/migrate',
  wrapAsync(async (req, res) => {
    const result = await database.executeMigrationsNow();
    await logTrail({ actorId: sessionUserId(req), action: 'db.migrations_run' });
    res.json(result);
  }),
);

consoleRoutes.post(
  '/run-sql',
  checkBody(executeSqlRules),
  wrapAsync(async (req, res) => {
    const statement = validatedBody<RunSqlPayload>(req).sql;
    // The statement is recorded; its result rows never are.
    const sqlText = statement.length > 4000 ? `${statement.slice(0, 4000)}…` : statement;
    try {
      const result = await database.executeSql(statement);
      await logTrail({ actorId: sessionUserId(req), action: 'db.sql_run', payload: { ok: true, sql: sqlText, rowsAffected: result.rowsAffected } });
      res.json(result);
    } catch (err) {
      await logTrail({ actorId: sessionUserId(req), action: 'db.sql_run', payload: { ok: false, sql: sqlText, error: (err as Error).message } });
      throw err;
    }
  }),
);

// ── AI tooling ───────────────────────────────────────────────────────────────

consoleRoutes.get(
  '/ai-model-stats',
  wrapAsync(async (_req, res) => {
    res.json(await service.fetchModelStats());
  }),
);

// ── Audit log ────────────────────────────────────────────────────────────────

/** Read-only. Nothing in the application edits or deletes audit rows. */
consoleRoutes.get(
  '/audit-log',
  wrapAsync(async (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json(await collectTrail(Number.isFinite(limit) ? limit : 100));
  }),
);
