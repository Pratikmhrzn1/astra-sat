import { Router } from 'express';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { libraryItems, users } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const sel = {
      id: libraryItems.id,
      title: libraryItems.title,
      description: libraryItems.description,
      fileUrl: libraryItems.fileUrl,
      fileType: libraryItems.fileType,
      mimeType: libraryItems.mimeType,
      fileName: libraryItems.fileName,
      hidden: libraryItems.hidden,
      uploadedBy: libraryItems.uploadedBy,
      uploaderName: users.name,
      createdAt: libraryItems.createdAt,
    };

    if (isAdmin) {
      const rows = await db.select(sel).from(libraryItems).leftJoin(users, eq(libraryItems.uploadedBy, users.id)).orderBy(desc(libraryItems.createdAt));
      return res.json(rows);
    }
    const rows = await db.select(sel).from(libraryItems).leftJoin(users, eq(libraryItems.uploadedBy, users.id)).where(eq(libraryItems.hidden, false)).orderBy(desc(libraryItems.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const createSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).trim().optional(),
  fileUrl: z.string().url(),
  fileType: z.enum(['audio', 'video', 'image', 'document', 'other']),
  mimeType: z.string().max(100).optional(),
  fileName: z.string().max(300).optional(),
});

router.post('/', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const body = createSchema.parse(req.body);
    const [row] = await db
      .insert(libraryItems)
      .values({ ...body, uploadedBy: req.user!.sub })
      .returning();
    return res.status(201).json(row);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  hidden: z.boolean().optional(),
});

router.patch('/:id', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const body = updateSchema.parse(req.body);
    const existing = await db.select().from(libraryItems).where(eq(libraryItems.id, req.params.id)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: 'Item not found' });

    if (req.user!.role === 'teacher' && existing[0].uploadedBy !== req.user!.sub) {
      return res.status(403).json({ error: 'You can only edit your own items' });
    }

    const [updated] = await db.update(libraryItems).set(body).where(eq(libraryItems.id, req.params.id)).returning();
    return res.json(updated);
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors[0].message });
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const existing = await db.select().from(libraryItems).where(eq(libraryItems.id, req.params.id)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: 'Item not found' });

    if (req.user!.role === 'teacher' && existing[0].uploadedBy !== req.user!.sub) {
      return res.status(403).json({ error: 'You can only delete your own items' });
    }

    await db.delete(libraryItems).where(eq(libraryItems.id, req.params.id));
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
