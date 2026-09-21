import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, query, validateBody, validateQuery } from '../../core/http/middleware/validate';
import * as mistakes from './mistakes.service';
import {
  mistakePracticeSchema,
  mistakeQuerySchema,
  type MistakePracticeInput,
  type MistakeQuery,
} from './mistakes.schemas';

export const mistakesStudentRouter = Router();

mistakesStudentRouter.use(requireAuth, requireRole(['student']));

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
  validateQuery(mistakeQuerySchema),
  asyncHandler(async (req, res) => {
    res.json(await mistakes.listMistakes(currentUserId(req), query<MistakeQuery>(req)));
  }),
);

/** Open counts per domain, for the summary strip above the list. */
mistakesStudentRouter.get(
  '/mistakes/summary',
  asyncHandler(async (req, res) => {
    res.json(await mistakes.getMistakeSummary(currentUserId(req)));
  }),
);

/**
 * Builds a review exam from open mistakes. Resolution happens through the
 * ordinary submit path, not here.
 */
mistakesStudentRouter.post(
  '/mistakes/practice',
  validateBody(mistakePracticeSchema),
  asyncHandler(async (req, res) => {
    const result = await mistakes.startMistakePractice(
      currentUserId(req),
      body<MistakePracticeInput>(req),
    );
    res.status(201).json(result);
  }),
);
