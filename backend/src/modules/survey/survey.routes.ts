import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
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

surveyAdminRouter.use(requireSession, requireAccountRole(['admin']));

surveyAdminRouter.get(
  '/survey-questions',
  wrapAsync(async (_req, res) => {
    res.json(await service.listQuestions());
  }),
);

surveyAdminRouter.post(
  '/survey-questions',
  checkBody(createQuestionSchema),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.createQuestion(sessionUserId(req), validatedBody<CreateQuestionInput>(req)));
  }),
);

/** Whole-list ordering, sent as the ids in their new order. */
surveyAdminRouter.put(
  '/survey-questions/reorder',
  checkBody(reorderQuestionsSchema),
  wrapAsync(async (req, res) => {
    await service.reorderQuestions(validatedBody<ReorderQuestionsInput>(req));
    res.json({ ok: true });
  }),
);

surveyAdminRouter.patch(
  '/survey-questions/:id',
  checkBody(updateQuestionSchema),
  wrapAsync(async (req, res) => {
    res.json(await service.updateQuestion(req.params.id, validatedBody<UpdateQuestionInput>(req)));
  }),
);

/** Destructive: the answers given to the question go with it, hence the audit row. */
surveyAdminRouter.delete(
  '/survey-questions/:id',
  wrapAsync(async (req, res) => {
    const responseCount = await service.countResponses(req.params.id);
    await service.deleteQuestion(req.params.id);
    await logAudit({
      actorId: sessionUserId(req),
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
  wrapAsync(async (_req, res) => {
    res.json(await service.listResponses());
  }),
);

export const surveyStudentRouter = Router();

surveyStudentRouter.use(requireSession, requireAccountRole(['student']));

surveyStudentRouter.get(
  '/survey',
  wrapAsync(async (req, res) => {
    res.json(await service.getSurveyForStudent(sessionUserId(req)));
  }),
);

surveyStudentRouter.post(
  '/survey',
  checkBody(submitSurveySchema),
  wrapAsync(async (req, res) => {
    res.json(await service.submitSurvey(sessionUserId(req), validatedBody<SubmitSurveyInput>(req)));
  }),
);
