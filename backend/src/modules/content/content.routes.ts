import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, query, validateBody, validateQuery } from '../../core/http/middleware/validate';
import { logAudit } from '../audit';
import * as classification from './classification.service';
import * as contentReview from './content-review.service';
import * as service from './content.service';
import {
  createPassageSchema,
  createQuestionSchema,
  createSetSchema,
  flagContentSchema,
  importJsonSchema,
  listContentQuerySchema,
  updatePassageSchema,
  updateQuestionSchema,
  updateSetSchema,
  updateSubSkillSchema,
  type CreatePassageInput,
  type CreateQuestionInput,
  type CreateSetInput,
  type FlagContentInput,
  type ImportJsonInput,
  type ListContentQuery,
  type UpdatePassageInput,
  type UpdateQuestionInput,
  type UpdateSetInput,
  type UpdateSubSkillInput,
} from './content.schemas';

/** Question-set authoring for teachers, and AI tagging / generated-content review for admins. */

export const contentTeacherRouter = Router();

contentTeacherRouter.use(requireAuth, requireRole(['teacher']));

// ── Question sets ────────────────────────────────────────────────────────────

contentTeacherRouter.get(
  '/question-sets',
  asyncHandler(async (_req, res) => {
    res.json(await service.listSets());
  }),
);

contentTeacherRouter.post(
  '/question-sets',
  validateBody(createSetSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createSet(currentUserId(req), body<CreateSetInput>(req)));
  }),
);

// Registered before '/question-sets/:setId' so the literal path is not
// swallowed by the parameterised one.
contentTeacherRouter.post(
  '/question-sets/import-json',
  validateBody(importJsonSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.importSetFromJson(currentUserId(req), body<ImportJsonInput>(req)));
  }),
);

contentTeacherRouter.put(
  '/question-sets/:setId',
  validateBody(updateSetSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateSet(req.params.setId, body<UpdateSetInput>(req)));
  }),
);

contentTeacherRouter.post(
  '/question-sets/:setId/publish',
  asyncHandler(async (req, res) => {
    res.json(await service.publishSet(req.params.setId));
  }),
);

contentTeacherRouter.delete(
  '/question-sets/:setId',
  asyncHandler(async (req, res) => {
    const result = await service.deleteSet(req.params.setId);
    await logAudit({
      actorId: currentUserId(req),
      action: result.archived ? 'question_set.archived' : 'question_set.deleted',
      targetType: 'question_set', targetId: req.params.setId,
      payload: { title: result.title },
    });
    // `archived` tells the editor which happened, so it can say so.
    res.json({ ok: true, archived: result.archived });
  }),
);

// ── Passages ─────────────────────────────────────────────────────────────────

contentTeacherRouter.get(
  '/question-sets/:setId/passages',
  asyncHandler(async (req, res) => {
    res.json(await service.listPassages(req.params.setId));
  }),
);

contentTeacherRouter.post(
  '/question-sets/:setId/passages',
  validateBody(createPassageSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createPassage(req.params.setId, body<CreatePassageInput>(req)));
  }),
);

contentTeacherRouter.put(
  '/passages/:passageId',
  validateBody(updatePassageSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updatePassage(req.params.passageId, body<UpdatePassageInput>(req)));
  }),
);

contentTeacherRouter.delete(
  '/passages/:passageId',
  asyncHandler(async (req, res) => {
    await service.deletePassage(req.params.passageId);
    res.json({ ok: true });
  }),
);

// ── Questions ────────────────────────────────────────────────────────────────

contentTeacherRouter.get(
  '/question-sets/:setId/questions',
  asyncHandler(async (req, res) => {
    res.json(await service.listQuestions(req.params.setId));
  }),
);

contentTeacherRouter.post(
  '/question-sets/:setId/questions',
  validateBody(createQuestionSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createQuestion(req.params.setId, body<CreateQuestionInput>(req)));
  }),
);

contentTeacherRouter.put(
  '/questions/:questionId',
  validateBody(updateQuestionSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateQuestion(req.params.questionId, body<UpdateQuestionInput>(req)));
  }),
);

contentTeacherRouter.put(
  '/questions/:questionId/subskill',
  validateBody(updateSubSkillSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateQuestionSubSkill(req.params.questionId, body<UpdateSubSkillInput>(req)));
  }),
);

contentTeacherRouter.delete(
  '/questions/:questionId',
  asyncHandler(async (req, res) => {
    const { retired } = await service.deleteQuestion(req.params.questionId);
    res.json({ ok: true, retired });
  }),
);

export const contentAdminRouter = Router();

contentAdminRouter.use(requireAuth, requireRole(['admin']));

/** Long-running: it walks every untagged English question in batches. */
contentAdminRouter.post(
  '/questions/auto-tag-subskill',
  asyncHandler(async (_req, res) => {
    res.json(await classification.autoTagSubSkills());
  }),
);

// ── Generated content review ─────────────────────────────────────────────────

contentAdminRouter.get(
  '/generated-content',
  validateQuery(listContentQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await contentReview.listGeneratedContent(query<ListContentQuery>(req)));
  }),
);

contentAdminRouter.patch(
  '/generated-content/:id/flag',
  validateBody(flagContentSchema),
  asyncHandler(async (req, res) => {
    res.json(await contentReview.flagContent(req.params.id, body<FlagContentInput>(req)));
  }),
);
