import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import { logTrail } from '../audit';
import * as service from './survey.service';
import {
  addIntakeQuestionRules,
  reorderQuestionsRules,
  commitIntakeRules,
  editIntakeQuestionRules,
  type CreateIntakeQuestionPayload,
  type ReorderQuestionsPayload,
  type SubmitIntakePayload,
  type UpdateIntakeQuestionPayload,
} from './survey.schemas';

/**
 * Two audiences, one domain: admins author the onboarding survey, students
 * answer it once. Mounted under /admin and /student respectively, so each keeps
 * the role gate its prefix implies.
 */

export const intakeAdminRoutes = Router();

intakeAdminRoutes.use(requireSession, requireAccountRole(['admin']));

intakeAdminRoutes.get(
  '/survey-questions',
  wrapAsync(async (_req, res) => {
    res.json(await service.collectIntakeQuestions());
  }),
);

intakeAdminRoutes.post(
  '/survey-questions',
  checkBody(addIntakeQuestionRules),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.addIntakeQuestion(sessionUserId(req), validatedBody<CreateIntakeQuestionPayload>(req)));
  }),
);

/** Whole-list ordering, sent as the ids in their new order. */
intakeAdminRoutes.put(
  '/survey-questions/reorder',
  checkBody(reorderQuestionsRules),
  wrapAsync(async (req, res) => {
    await service.resequenceIntakeQuestions(validatedBody<ReorderQuestionsPayload>(req));
    res.json({ ok: true });
  }),
);

intakeAdminRoutes.patch(
  '/survey-questions/:id',
  checkBody(editIntakeQuestionRules),
  wrapAsync(async (req, res) => {
    res.json(await service.editIntakeQuestion(req.params.id, validatedBody<UpdateIntakeQuestionPayload>(req)));
  }),
);

/** Destructive: the answers given to the question go with it, hence the audit row. */
intakeAdminRoutes.delete(
  '/survey-questions/:id',
  wrapAsync(async (req, res) => {
    const responseCount = await service.tallyResponses(req.params.id);
    await service.removeIntakeQuestion(req.params.id);
    await logTrail({
      actorId: sessionUserId(req),
      action: 'survey.question_deleted',
      targetType: 'survey_question',
      targetId: req.params.id,
      payload: { responsesRemoved: responseCount },
    });
    res.status(204).send();
  }),
);

intakeAdminRoutes.get(
  '/survey-responses',
  wrapAsync(async (_req, res) => {
    res.json(await service.collectResponses());
  }),
);

export const intakeStudentRoutes = Router();

intakeStudentRoutes.use(requireSession, requireAccountRole(['student']));

intakeStudentRoutes.get(
  '/survey',
  wrapAsync(async (req, res) => {
    res.json(await service.fetchIntakeForStudent(sessionUserId(req)));
  }),
);

intakeStudentRoutes.post(
  '/survey',
  checkBody(commitIntakeRules),
  wrapAsync(async (req, res) => {
    res.json(await service.commitIntake(sessionUserId(req), validatedBody<SubmitIntakePayload>(req)));
  }),
);
