import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
import { logAudit } from '../audit';
import * as service from './survey.service';
import {
  createQuestionSchema,
  reorderQuestionsSchema,
  submitSurveySchema,
  updateQuestionSchema,
  type CreateQuestionInput,
  type ReorderQuestionsInput,
  type SubmitSurveyInput,
  type UpdateQuestionInput,
} from './survey.schemas';

/**
 * Two audiences, one domain: admins author the onboarding survey, students
 * answer it once. Mounted under /admin and /student respectively, so each keeps
 * the role gate its prefix implies.
 */

export const surveyAdminRouter = Router();

surveyAdminRouter.use(requireAuth, requireRole(['admin']));

surveyAdminRouter.get(
  '/survey-questions',
  asyncHandler(async (_req, res) => {
    res.json(await service.listQuestions());
  }),
);

surveyAdminRouter.post(
  '/survey-questions',
  validateBody(createQuestionSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createQuestion(currentUserId(req), body<CreateQuestionInput>(req)));
  }),
);

/** Whole-list ordering, sent as the ids in their new order. */
surveyAdminRouter.put(
  '/survey-questions/reorder',
  validateBody(reorderQuestionsSchema),
  asyncHandler(async (req, res) => {
    await service.reorderQuestions(body<ReorderQuestionsInput>(req));
    res.json({ ok: true });
  }),
);

surveyAdminRouter.patch(
  '/survey-questions/:id',
  validateBody(updateQuestionSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateQuestion(req.params.id, body<UpdateQuestionInput>(req)));
  }),
);

/** Destructive: the answers given to the question go with it, hence the audit row. */
surveyAdminRouter.delete(
  '/survey-questions/:id',
  asyncHandler(async (req, res) => {
    const responseCount = await service.countResponses(req.params.id);
    await service.deleteQuestion(req.params.id);
    await logAudit({
      actorId: currentUserId(req),
      action: 'survey.question_deleted',
      targetType: 'survey_question',
      targetId: req.params.id,
      payload: { responsesRemoved: responseCount },
    });
    res.status(204).send();
  }),
);

surveyAdminRouter.get(
  '/survey-responses',
  asyncHandler(async (_req, res) => {
    res.json(await service.listResponses());
  }),
);

export const surveyStudentRouter = Router();

surveyStudentRouter.use(requireAuth, requireRole(['student']));

surveyStudentRouter.get(
  '/survey',
  asyncHandler(async (req, res) => {
    res.json(await service.getSurveyForStudent(currentUserId(req)));
  }),
);

surveyStudentRouter.post(
  '/survey',
  validateBody(submitSurveySchema),
  asyncHandler(async (req, res) => {
    res.json(await service.submitSurvey(currentUserId(req), body<SubmitSurveyInput>(req)));
  }),
);
