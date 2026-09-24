import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, validatedQuery, checkBody, checkQuery } from '../../core/http/middleware/validate';
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

contentTeacherRouter.use(requireSession, requireAccountRole(['teacher']));

// ── Question sets ────────────────────────────────────────────────────────────

contentTeacherRouter.get(
  '/question-sets',
  wrapAsync(async (_req, res) => {
    res.json(await service.listSets());
  }),
);

contentTeacherRouter.post(
  '/question-sets',
  checkBody(createSetSchema),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.createSet(sessionUserId(req), validatedBody<CreateSetInput>(req)));
  }),
);

// Registered before '/question-sets/:setId' so the literal path is not
// swallowed by the parameterised one.
contentTeacherRouter.post(
  '/question-sets/import-json',
  checkBody(importJsonSchema),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.importSetFromJson(sessionUserId(req), validatedBody<ImportJsonInput>(req)));
  }),
);

contentTeacherRouter.put(
  '/question-sets/:setId',
  checkBody(updateSetSchema),
  wrapAsync(async (req, res) => {
    res.json(await service.updateSet(req.params.setId, validatedBody<UpdateSetInput>(req)));
  }),
);

contentTeacherRouter.post(
  '/question-sets/:setId/publish',
  wrapAsync(async (req, res) => {
    res.json(await service.publishSet(req.params.setId));
  }),
);

contentTeacherRouter.delete(
  '/question-sets/:setId',
  wrapAsync(async (req, res) => {
    const result = await service.deleteSet(req.params.setId);
    await logAudit({
      actorId: sessionUserId(req),
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
  wrapAsync(async (req, res) => {
    res.json(await service.listPassages(req.params.setId));
  }),
);

contentTeacherRouter.post(
  '/question-sets/:setId/passages',
  checkBody(createPassageSchema),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.createPassage(req.params.setId, validatedBody<CreatePassageInput>(req)));
  }),
);

contentTeacherRouter.put(
  '/passages/:passageId',
  checkBody(updatePassageSchema),
  wrapAsync(async (req, res) => {
    res.json(await service.updatePassage(req.params.passageId, validatedBody<UpdatePassageInput>(req)));
  }),
);

contentTeacherRouter.delete(
  '/passages/:passageId',
  wrapAsync(async (req, res) => {
    await service.deletePassage(req.params.passageId);
    res.json({ ok: true });
  }),
);

// ── Questions ────────────────────────────────────────────────────────────────

contentTeacherRouter.get(
  '/question-sets/:setId/questions',
  wrapAsync(async (req, res) => {
    res.json(await service.listQuestions(req.params.setId));
  }),
);

contentTeacherRouter.post(
  '/question-sets/:setId/questions',
  checkBody(createQuestionSchema),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.createQuestion(req.params.setId, validatedBody<CreateQuestionInput>(req)));
  }),
);

contentTeacherRouter.put(
  '/questions/:questionId',
  checkBody(updateQuestionSchema),
  wrapAsync(async (req, res) => {
    res.json(await service.updateQuestion(req.params.questionId, validatedBody<UpdateQuestionInput>(req)));
  }),
);

contentTeacherRouter.put(
  '/questions/:questionId/subskill',
  checkBody(updateSubSkillSchema),
  wrapAsync(async (req, res) => {
    res.json(await service.updateQuestionSubSkill(req.params.questionId, validatedBody<UpdateSubSkillInput>(req)));
  }),
);

contentTeacherRouter.delete(
  '/questions/:questionId',
  wrapAsync(async (req, res) => {
    const { retired } = await service.deleteQuestion(req.params.questionId);
    res.json({ ok: true, retired });
  }),
);

export const contentAdminRouter = Router();

contentAdminRouter.use(requireSession, requireAccountRole(['admin']));

/** Long-running: it walks every untagged English question in batches. */
contentAdminRouter.post(
  '/questions/auto-tag-subskill',
  wrapAsync(async (_req, res) => {
    res.json(await classification.autoTagSubSkills());
  }),
);

// ── Generated content review ─────────────────────────────────────────────────

contentAdminRouter.get(
  '/generated-content',
  checkQuery(listContentQuerySchema),
  wrapAsync(async (req, res) => {
    res.json(await contentReview.listGeneratedContent(validatedQuery<ListContentQuery>(req)));
  }),
);

contentAdminRouter.patch(
  '/generated-content/:id/flag',
  checkBody(flagContentSchema),
  wrapAsync(async (req, res) => {
    res.json(await contentReview.flagContent(req.params.id, validatedBody<FlagContentInput>(req)));
  }),
);
