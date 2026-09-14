import { Router } from 'express';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../core/db';
import { platformFeedback, users } from '../../core/db/schema';
import { asyncHandler } from '../../core/http/async-handler';
import { notFound } from '../../core/errors';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { parseOrBadRequest } from '../../core/http/middleware/validate';

/**
 * Bug reports and suggestions about the platform itself, submitted from the
 * in-app feedback modal. Any signed-in user can file one; only admins read them.
 */
export const platformFeedbackRouter = Router();

const submitSchema = z.object({
  category: z.enum(['bug', 'suggestion', 'other']).default('other'),
  message: z.string().min(10).max(2000).trim(),
});

platformFeedbackRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseOrBadRequest(submitSchema, req.body);
    const [row] = await db
      .insert(platformFeedback)
      .values({ userId: currentUserId(req), category: input.category, message: input.message })
      .returning({ id: platformFeedback.id });
    res.status(201).json({ id: row.id });
  }),
);

platformFeedbackRouter.get(
  '/',
  requireAuth,
  requireRole(['admin']),
  asyncHandler(async (_req, res) => {
    // LEFT JOIN so a report survives the reporter's account being deleted.
    const rows = await db
      .select({
        id: platformFeedback.id,
        category: platformFeedback.category,
        message: platformFeedback.message,
        isRead: platformFeedback.isRead,
        createdAt: platformFeedback.createdAt,
        userId: platformFeedback.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(platformFeedback)
      .leftJoin(users, eq(platformFeedback.userId, users.id))
      .orderBy(desc(platformFeedback.createdAt));
    res.json(rows);
  }),
);

platformFeedbackRouter.patch(
  '/:id/read',
  requireAuth,
  requireRole(['admin']),
  asyncHandler(async (req, res) => {
    const updated = await db
      .update(platformFeedback)
      .set({ isRead: true })
      .where(eq(platformFeedback.id, req.params.id))
      .returning({ id: platformFeedback.id });
    if (updated.length === 0) throw notFound('Feedback not found');
    res.json({ ok: true });
  }),
);

platformFeedbackRouter.delete(
  '/:id',
  requireAuth,
  requireRole(['admin']),
  asyncHandler(async (req, res) => {
    const deleted = await db
      .delete(platformFeedback)
      .where(eq(platformFeedback.id, req.params.id))
      .returning({ id: platformFeedback.id });
    if (deleted.length === 0) throw notFound('Feedback not found');
    res.status(204).send();
  }),
);
