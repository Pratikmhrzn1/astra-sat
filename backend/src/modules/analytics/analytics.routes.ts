import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole, LEARNER_ROLES } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import * as analytics from './analytics.service';
import * as profile from './profile.service';
import { editLearnerProfileRules, type UpdateLearnerProfilePayload } from './analytics.schemas';

/** A student's own goal and progress analytics. Teachers read the same numbers through modules/roster. */

export const insightsStudentRoutes = Router();

insightsStudentRoutes.use(requireSession, requireAccountRole(LEARNER_ROLES));

// ── Profile ──────────────────────────────────────────────────────────────────

/** Null when no goal has been set — the dashboard prompts rather than guessing. */
insightsStudentRoutes.get(
  '/profile',
  wrapAsync(async (req, res) => {
    res.json(await profile.fetchLearnerProfile(sessionUserId(req)));
  }),
);

insightsStudentRoutes.put(
  '/profile',
  checkBody(editLearnerProfileRules),
  wrapAsync(async (req, res) => {
    res.json(await profile.saveLearnerProfile(sessionUserId(req), validatedBody<UpdateLearnerProfilePayload>(req)));
  }),
);

// ── Analytics ────────────────────────────────────────────────────────────────

/** Domain accuracy, the score trend and readiness, for the progress view. */
insightsStudentRoutes.get(
  '/analytics/overview',
  wrapAsync(async (req, res) => {
    res.json(await analytics.insightsOverview(sessionUserId(req)));
  }),
);
