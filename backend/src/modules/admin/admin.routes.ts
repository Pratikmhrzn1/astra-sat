import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
import { listAudit, logAudit } from '../audit';
import * as database from './database.service';
import * as service from './admin.service';
import {
  restoreSchema,
  runSqlSchema,
  type RestoreInput,
  type RunSqlInput,
} from './admin.schemas';

/** Platform operations: overview stats, the database console, AI spend and the audit log. */

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin']));

// ── Overview ─────────────────────────────────────────────────────────────────

adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json(await service.getStats());
  }),
);

// ── Database console ─────────────────────────────────────────────────────────
// Destructive by design; see database.service.ts.

adminRouter.get(
  '/backup',
  asyncHandler(async (req, res) => {
    const { backup, filename } = await database.createBackup();
    // A backup is every user's data leaving the server, so it is recorded too.
    await logAudit({ actorId: currentUserId(req), action: 'db.backup_downloaded', payload: { filename } });
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  }),
);

adminRouter.post(
  '/restore',
  validateBody(restoreSchema),
  asyncHandler(async (req, res) => {
    const input = body<RestoreInput>(req);
    const rowCounts = Object.fromEntries(Object.entries(input.data).map(([k, rows]) => [k, Array.isArray(rows) ? rows.length : 0]));
    try {
      const result = await database.restoreBackup(input);
      // Written after the restore, so the restored audit_log cannot erase it.
      await logAudit({ actorId: currentUserId(req), action: 'db.restored', payload: { ok: true, version: input.version, rowCounts } });
      res.json(result);
    } catch (err) {
      await logAudit({ actorId: currentUserId(req), action: 'db.restored', payload: { ok: false, version: input.version, error: (err as Error).message } });
      throw err;
    }
  }),
);

adminRouter.post(
  '/migrate',
  asyncHandler(async (req, res) => {
    const result = await database.runMigrationsNow();
    await logAudit({ actorId: currentUserId(req), action: 'db.migrations_run' });
    res.json(result);
  }),
);

adminRouter.post(
  '/run-sql',
  validateBody(runSqlSchema),
  asyncHandler(async (req, res) => {
    const statement = body<RunSqlInput>(req).sql;
    // The statement is recorded; its result rows never are.
    const sqlText = statement.length > 4000 ? `${statement.slice(0, 4000)}…` : statement;
    try {
      const result = await database.runSql(statement);
      await logAudit({ actorId: currentUserId(req), action: 'db.sql_run', payload: { ok: true, sql: sqlText, rowsAffected: result.rowsAffected } });
      res.json(result);
    } catch (err) {
      await logAudit({ actorId: currentUserId(req), action: 'db.sql_run', payload: { ok: false, sql: sqlText, error: (err as Error).message } });
      throw err;
    }
  }),
);

// ── AI tooling ───────────────────────────────────────────────────────────────

adminRouter.get(
  '/ai-model-stats',
  asyncHandler(async (_req, res) => {
    res.json(await service.getModelStats());
  }),
);

// ── Audit log ────────────────────────────────────────────────────────────────

/** Read-only. Nothing in the application edits or deletes audit rows. */
adminRouter.get(
  '/audit-log',
  asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit ?? 100);
    res.json(await listAudit(Number.isFinite(limit) ? limit : 100));
  }),
);
