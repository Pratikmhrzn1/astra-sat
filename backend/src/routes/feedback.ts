import { Router } from 'express';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { platformFeedback, users } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

const submitSchema = z.object({
  category: z.enum(['bug', 'suggestion', 'other']).default('other'),
  message: z.string().min(10).max(2000).trim(),
});

router.post('/', requireAuth, async (req, res) => {
  try {
    const body = submitSchema.parse(req.body);
    const [row] = await db
      .insert(platformFeedback)
      .values({ userId: req.user!.sub, category: body.category, message: body.message })
      .returning({ id: platformFeedback.id });
    return res.status(201).json({ id: row.id });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
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
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id/read', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const rows = await db
      .update(platformFeedback)
      .set({ isRead: true })
      .where(eq(platformFeedback.id, req.params.id))
      .returning({ id: platformFeedback.id });
    if (rows.length === 0) return res.status(404).json({ error: 'Feedback not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const rows = await db
      .delete(platformFeedback)
      .where(eq(platformFeedback.id, req.params.id))
      .returning({ id: platformFeedback.id });
    if (rows.length === 0) return res.status(404).json({ error: 'Feedback not found' });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
