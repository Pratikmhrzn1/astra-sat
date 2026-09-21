import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
import * as analytics from './analytics.service';
import * as profile from './profile.service';
import { updateProfileSchema, type UpdateProfileInput } from './analytics.schemas';

/** A student's own goal and progress analytics. Teachers read the same numbers through modules/roster. */

export const analyticsStudentRouter = Router();

analyticsStudentRouter.use(requireAuth, requireRole(['student']));

// ── Profile ──────────────────────────────────────────────────────────────────

/** Null when no goal has been set — the dashboard prompts rather than guessing. */
analyticsStudentRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json(await profile.getProfile(currentUserId(req)));
  }),
);

analyticsStudentRouter.put(
  '/profile',
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    res.json(await profile.upsertProfile(currentUserId(req), body<UpdateProfileInput>(req)));
  }),
);

// ── Analytics ────────────────────────────────────────────────────────────────

/** Domain accuracy, the score trend and readiness, for the progress view. */
analyticsStudentRouter.get(
  '/analytics/overview',
  asyncHandler(async (req, res) => {
    res.json(await analytics.overview(currentUserId(req)));
  }),
);
