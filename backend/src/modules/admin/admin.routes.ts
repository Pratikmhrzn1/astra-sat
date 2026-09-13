import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../http/middleware/auth';
import { body, query, validateBody, validateQuery } from '../../http/middleware/validate';
import { listAudit, logAudit } from '../audit/audit.service';
import * as classification from './classification.service';
import * as contentReview from './content-review.service';
import * as database from './database.service';
import * as scoringBackfill from './scoring-backfill.service';
import * as service from './admin.service';
import {
  assignStudentsSchema,
  createAccessCodeSchema,
  flagContentSchema,
  listContentQuerySchema,
  restoreSchema,
  runSqlSchema,
  updateUserSchema,
  type AssignStudentsInput,
  type CreateAccessCodeInput,
  type FlagContentInput,
  type ListContentQuery,
  type RestoreInput,
  type RunSqlInput,
  type UpdateUserInput,
} from './admin.schemas';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole(['admin']));

// ── Overview ─────────────────────────────────────────────────────────────────

adminRouter.get(
  '/stats',
  asyncHandler(async (_req, res) => {
    res.json(await service.getStats());
  }),
);

// ── Users ────────────────────────────────────────────────────────────────────

adminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    res.json(await service.listUsers());
  }),
);

/** Bulk roster assignment. Registered before /users/:userId so it is not eaten by it. */
adminRouter.put(
  '/users/assign-teacher',
  validateBody(assignStudentsSchema),
  asyncHandler(async (req, res) => {
    const input = body<AssignStudentsInput>(req);
    const result = await service.assignStudentsToTeacher(input);
    await logAudit({
      actorId: currentUserId(req), action: 'users.assigned_teacher',
      targetType: 'user', targetId: input.teacherId ?? undefined,
      payload: { teacherId: input.teacherId, studentIds: input.studentIds, assigned: result.assigned },
    });
    res.json(result);
  }),
);

adminRouter.put(
  '/users/:userId',
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    const input = body<UpdateUserInput>(req);
    const updated = await service.updateUser(req.params.userId, input);
    await logAudit({
      actorId: currentUserId(req), action: 'user.updated', targetType: 'user', targetId: req.params.userId,
      // Which fields changed, never their values: a password must not reach the log.
      payload: {
        fields: Object.keys(input).filter((k) => input[k as keyof UpdateUserInput] !== undefined),
        ...(input.teacherId !== undefined && { teacherId: input.teacherId }),
      },
    });
    res.json(updated);
  }),
);

adminRouter.delete(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    await service.deleteUser(req.params.userId, currentUserId(req));
    await logAudit({ actorId: currentUserId(req), action: 'user.deleted', targetType: 'user', targetId: req.params.userId });
    res.json({ ok: true });
  }),
);

// ── Access codes ─────────────────────────────────────────────────────────────

adminRouter.get(
  '/access-codes',
  asyncHandler(async (_req, res) => {
    res.json(await service.listAccessCodes());
  }),
);

adminRouter.post(
  '/access-codes',
  validateBody(createAccessCodeSchema),
  asyncHandler(async (req, res) => {
    const input = body<CreateAccessCodeInput>(req);
    const created = await service.createAccessCode(currentUserId(req), input);
    await logAudit({
      actorId: currentUserId(req), action: 'access_code.created', targetType: 'access_code', targetId: created?.id,
      // Not the code itself: it is a signup credential, and an admin code grants admin.
      payload: { role: input.role, maxUses: input.maxUses ?? null },
    });
    res.status(201).json(created);
  }),
);

adminRouter.delete(
  '/access-codes/:codeId',
  asyncHandler(async (req, res) => {
    await service.deleteAccessCode(req.params.codeId);
    await logAudit({ actorId: currentUserId(req), action: 'access_code.deleted', targetType: 'access_code', targetId: req.params.codeId });
    res.json({ ok: true });
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

/** Long-running: it walks every untagged English question in batches. */
adminRouter.post(
  '/questions/auto-tag-subskill',
  asyncHandler(async (_req, res) => {
    res.json(await classification.autoTagSubSkills());
  }),
);

/**
 * Scores exams and mocks that finished before scaled scoring existed.
 *
 * Blocks the request thread while it walks the corpus, like the auto-tag job
 * above — fine at the current size, and it returns real counts rather than a job
 * id. Safe to run more than once: it only fills columns that are still NULL.
 */
adminRouter.post(
  '/scoring/backfill',
  asyncHandler(async (req, res) => {
    const result = await scoringBackfill.backfillScores();
    await logAudit({ actorId: currentUserId(req), action: 'scoring.backfill_run', payload: { ...result } });
    res.json(result);
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

// ── Generated content review ─────────────────────────────────────────────────

adminRouter.get(
  '/generated-content',
  validateQuery(listContentQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await contentReview.listGeneratedContent(query<ListContentQuery>(req)));
  }),
);

adminRouter.patch(
  '/generated-content/:id/flag',
  validateBody(flagContentSchema),
  asyncHandler(async (req, res) => {
    res.json(await contentReview.flagContent(req.params.id, body<FlagContentInput>(req)));
  }),
);
