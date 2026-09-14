import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../core/http/async-handler';
import { requireAuth } from '../../core/http/middleware/auth';
import { query, validateQuery } from '../../core/http/middleware/validate';
import * as service from './skills.service';

export const skillsRouter = Router();

/**
 * Readable by any signed-in user, not role-gated like the other routers.
 *
 * The taxonomy is reference data three audiences need: teachers tag against it,
 * students browse practice by it, and admins measure coverage with it. There is
 * nothing student-specific or teacher-specific to protect here — it is the same
 * eight domains for everyone.
 */
skillsRouter.use(requireAuth);

const listQuerySchema = z.object({
  // Query strings are text, so the flag is compared rather than coerced: a bare
  // `?withCounts` or `?withCounts=false` must not silently switch it on.
  withCounts: z.string().optional(),
});
type ListQuery = z.infer<typeof listQuerySchema>;

skillsRouter.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const withCounts = query<ListQuery>(req).withCounts === 'true';
    res.json(await service.getSkillTree(withCounts));
  }),
);
