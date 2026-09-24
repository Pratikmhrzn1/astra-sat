import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, validatedQuery, checkBody, checkQuery } from '../../core/http/middleware/validate';
import { logTrail } from '../audit';
import * as classification from './classification.service';
import * as contentReview from './content-review.service';
import * as service from './content.service';
import {
  addPassageRules,
  addQuestionRules,
  addSetRules,
  flagContentRules,
  ingestJsonRules,
  collectContentQueryRules,
  editPassageRules,
  editQuestionRules,
  editSetRules,
  editSubSkillRules,
  type CreatePassagePayload,
  type CreateQuestionPayload,
  type CreateSetPayload,
  type FlagContentPayload,
  type ImportJsonPayload,
  type ContentQuery,
  type UpdatePassagePayload,
  type UpdateQuestionPayload,
  type UpdateSetPayload,
  type UpdateSubSkillPayload,
} from './content.schemas';

/** Question-set authoring for teachers, and AI tagging / generated-content review for admins. */

export const authoringTeacherRoutes = Router();

authoringTeacherRoutes.use(requireSession, requireAccountRole(['teacher']));

// ── Question sets ────────────────────────────────────────────────────────────

authoringTeacherRoutes.get(
  '/question-sets',
  wrapAsync(async (_req, res) => {
    res.json(await service.collectSets());
  }),
);

authoringTeacherRoutes.post(
  '/question-sets',
  checkBody(addSetRules),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.addSet(sessionUserId(req), validatedBody<CreateSetPayload>(req)));
  }),
);

// Registered before '/question-sets/:setId' so the literal path is not
// swallowed by the parameterised one.
authoringTeacherRoutes.post(
  '/question-sets/import-json',
  checkBody(ingestJsonRules),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.ingestSetFromJson(sessionUserId(req), validatedBody<ImportJsonPayload>(req)));
  }),
);

authoringTeacherRoutes.put(
  '/question-sets/:setId',
  checkBody(editSetRules),
  wrapAsync(async (req, res) => {
    res.json(await service.editSet(req.params.setId, validatedBody<UpdateSetPayload>(req)));
  }),
);

authoringTeacherRoutes.post(
  '/question-sets/:setId/publish',
  wrapAsync(async (req, res) => {
    res.json(await service.releaseSet(req.params.setId));
  }),
);

authoringTeacherRoutes.delete(
  '/question-sets/:setId',
  wrapAsync(async (req, res) => {
    const result = await service.removeSet(req.params.setId);
    await logTrail({
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

authoringTeacherRoutes.get(
  '/question-sets/:setId/passages',
  wrapAsync(async (req, res) => {
    res.json(await service.collectPassages(req.params.setId));
  }),
);

authoringTeacherRoutes.post(
  '/question-sets/:setId/passages',
  checkBody(addPassageRules),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.addPassage(req.params.setId, validatedBody<CreatePassagePayload>(req)));
  }),
);

authoringTeacherRoutes.put(
  '/passages/:passageId',
  checkBody(editPassageRules),
  wrapAsync(async (req, res) => {
    res.json(await service.editPassage(req.params.passageId, validatedBody<UpdatePassagePayload>(req)));
  }),
);

authoringTeacherRoutes.delete(
  '/passages/:passageId',
  wrapAsync(async (req, res) => {
    await service.removePassage(req.params.passageId);
    res.json({ ok: true });
  }),
);

// ── Questions ────────────────────────────────────────────────────────────────

authoringTeacherRoutes.get(
  '/question-sets/:setId/questions',
  wrapAsync(async (req, res) => {
    res.json(await service.collectQuestions(req.params.setId));
  }),
);

authoringTeacherRoutes.post(
  '/question-sets/:setId/questions',
  checkBody(addQuestionRules),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.addQuestion(req.params.setId, validatedBody<CreateQuestionPayload>(req)));
  }),
);

authoringTeacherRoutes.put(
  '/questions/:questionId',
  checkBody(editQuestionRules),
  wrapAsync(async (req, res) => {
    res.json(await service.editQuestion(req.params.questionId, validatedBody<UpdateQuestionPayload>(req)));
  }),
);

authoringTeacherRoutes.put(
  '/questions/:questionId/subskill',
  checkBody(editSubSkillRules),
  wrapAsync(async (req, res) => {
    res.json(await service.editQuestionSubSkill(req.params.questionId, validatedBody<UpdateSubSkillPayload>(req)));
  }),
);

authoringTeacherRoutes.delete(
  '/questions/:questionId',
  wrapAsync(async (req, res) => {
    const { retired } = await service.removeQuestion(req.params.questionId);
    res.json({ ok: true, retired });
  }),
);

export const authoringAdminRoutes = Router();

authoringAdminRoutes.use(requireSession, requireAccountRole(['admin']));

/** Long-running: it walks every untagged English question in batches. */
authoringAdminRoutes.post(
  '/questions/auto-tag-subskill',
  wrapAsync(async (_req, res) => {
    res.json(await classification.autoTagCompetencies());
  }),
);

// ── Generated content review ─────────────────────────────────────────────────

authoringAdminRoutes.get(
  '/generated-content',
  checkQuery(collectContentQueryRules),
  wrapAsync(async (req, res) => {
    res.json(await contentReview.collectGeneratedContent(validatedQuery<ContentQuery>(req)));
  }),
);

authoringAdminRoutes.patch(
  '/generated-content/:id/flag',
  checkBody(flagContentRules),
  wrapAsync(async (req, res) => {
    res.json(await contentReview.markContentQuality(req.params.id, validatedBody<FlagContentPayload>(req)));
  }),
);
