import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole, LEARNER_ROLES } from '../../core/http/middleware/auth';
import { validatedBody, validatedQuery, checkBody, checkQuery } from '../../core/http/middleware/validate';
import * as mistakes from './mistakes.service';
import {
  mistakePracticeRules,
  mistakeQueryRules,
  type MisstepPracticePayload,
  type MisstepQuery,
} from './mistakes.schemas';

export const misstepsStudentRoutes = Router();

misstepsStudentRoutes.use(requireSession, requireAccountRole(LEARNER_ROLES));

// ── Mistake bank ─────────────────────────────────────────────────────────────

/**
 * Every question this student has got wrong, worst first.
 *
 * Includes the correct answer and explanation: these come from exams the student
 * has already completed and reviewed, so nothing is revealed that they have not
 * already been shown.
 */
misstepsStudentRoutes.get(
  '/mistakes',
  checkQuery(mistakeQueryRules),
  wrapAsync(async (req, res) => {
    res.json(await mistakes.collectMissteps(sessionUserId(req), validatedQuery<MisstepQuery>(req)));
  }),
);

/** Open counts per domain, for the summary strip above the list. */
misstepsStudentRoutes.get(
  '/mistakes/summary',
  wrapAsync(async (req, res) => {
    res.json(await mistakes.fetchMisstepSummary(sessionUserId(req)));
  }),
);

/**
 * Builds a review exam from open mistakes. Resolution happens through the
 * ordinary submit path, not here.
 */
misstepsStudentRoutes.post(
  '/mistakes/practice',
  checkBody(mistakePracticeRules),
  wrapAsync(async (req, res) => {
    const result = await mistakes.openMisstepPractice(
      sessionUserId(req),
      validatedBody<MisstepPracticePayload>(req),
    );
    res.status(201).json(result);
  }),
);
