import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, validatedQuery, checkBody, checkQuery } from '../../core/http/middleware/validate';
import * as mistakes from './mistakes.service';
import {
  mistakePracticeSchema,
  mistakeQuerySchema,
  type MistakePracticeInput,
  type MistakeQuery,
} from './mistakes.schemas';

export const mistakesStudentRouter = Router();

mistakesStudentRouter.use(requireSession, requireAccountRole(['student']));

// ── Mistake bank ─────────────────────────────────────────────────────────────

/**
 * Every question this student has got wrong, worst first.
 *
 * Includes the correct answer and explanation: these come from exams the student
 * has already completed and reviewed, so nothing is revealed that they have not
 * already been shown.
 */
mistakesStudentRouter.get(
  '/mistakes',
  checkQuery(mistakeQuerySchema),
  wrapAsync(async (req, res) => {
    res.json(await mistakes.listMistakes(sessionUserId(req), validatedQuery<MistakeQuery>(req)));
  }),
);

/** Open counts per domain, for the summary strip above the list. */
mistakesStudentRouter.get(
  '/mistakes/summary',
  wrapAsync(async (req, res) => {
    res.json(await mistakes.getMistakeSummary(sessionUserId(req)));
  }),
);

/**
 * Builds a review exam from open mistakes. Resolution happens through the
 * ordinary submit path, not here.
 */
mistakesStudentRouter.post(
  '/mistakes/practice',
  checkBody(mistakePracticeSchema),
  wrapAsync(async (req, res) => {
    const result = await mistakes.startMistakePractice(
      sessionUserId(req),
      validatedBody<MistakePracticeInput>(req),
    );
    res.status(201).json(result);
  }),
);
