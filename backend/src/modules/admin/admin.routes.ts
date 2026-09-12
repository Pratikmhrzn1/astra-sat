import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../http/middleware/auth';
import { body, query, validateBody, validateQuery } from '../../http/middleware/validate';
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
    res.json(await service.assignStudentsToTeacher(body<AssignStudentsInput>(req)));
  }),
);

adminRouter.put(
  '/users/:userId',
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateUser(req.params.userId, body<UpdateUserInput>(req)));
  }),
);

adminRouter.delete(
  '/users/:userId',
  asyncHandler(async (req, res) => {
    await service.deleteUser(req.params.userId, currentUserId(req));
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
    res.status(201).json(await service.createAccessCode(currentUserId(req), body<CreateAccessCodeInput>(req)));
  }),
);

adminRouter.delete(
  '/access-codes/:codeId',
  asyncHandler(async (req, res) => {
    await service.deleteAccessCode(req.params.codeId);
    res.json({ ok: true });
  }),
);

// ── Database console ─────────────────────────────────────────────────────────
// Destructive by design; see database.service.ts.

adminRouter.get(
  '/backup',
  asyncHandler(async (_req, res) => {
    const { backup, filename } = await database.createBackup();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json(backup);
  }),
);

adminRouter.post(
  '/restore',
  validateBody(restoreSchema),
  asyncHandler(async (req, res) => {
    res.json(await database.restoreBackup(body<RestoreInput>(req)));
  }),
);

adminRouter.post(
  '/migrate',
  asyncHandler(async (_req, res) => {
    res.json(await database.runMigrationsNow());
  }),
);

adminRouter.post(
  '/run-sql',
  validateBody(runSqlSchema),
  asyncHandler(async (req, res) => {
    res.json(await database.runSql(body<RunSqlInput>(req).sql));
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
  asyncHandler(async (_req, res) => {
    res.json(await scoringBackfill.backfillScores());
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
