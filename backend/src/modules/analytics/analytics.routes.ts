import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import * as analytics from './analytics.service';
import * as profile from './profile.service';
import { updateProfileSchema, type UpdateProfileInput } from './analytics.schemas';

/** A student's own goal and progress analytics. Teachers read the same numbers through modules/roster. */

export const analyticsStudentRouter = Router();

analyticsStudentRouter.use(requireSession, requireAccountRole(['student']));

// ── Profile ──────────────────────────────────────────────────────────────────

/** Null when no goal has been set — the dashboard prompts rather than guessing. */
analyticsStudentRouter.get(
  '/profile',
  wrapAsync(async (req, res) => {
    res.json(await profile.getProfile(sessionUserId(req)));
  }),
);

analyticsStudentRouter.put(
  '/profile',
  checkBody(updateProfileSchema),
  wrapAsync(async (req, res) => {
    res.json(await profile.upsertProfile(sessionUserId(req), validatedBody<UpdateProfileInput>(req)));
  }),
);

// ── Analytics ────────────────────────────────────────────────────────────────

/** Domain accuracy, the score trend and readiness, for the progress view. */
analyticsStudentRouter.get(
  '/analytics/overview',
  wrapAsync(async (req, res) => {
    res.json(await analytics.overview(sessionUserId(req)));
  }),
);
