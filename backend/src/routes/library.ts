import path from 'path';
import fs from 'fs';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { db } from '../db';
import { libraryItems, users } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { UPLOAD_DIR } from '../index';

const router = Router();

// ── File upload ───────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/upload', requireAuth, requireRole(['teacher', 'admin']), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return res.json({
    url: `${baseUrl}/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
  });
});

// ── List items ────────────────────────────────────────────────────────────────

router.get('/', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user!.role === 'admin';
    const sel = {
      id: libraryItems.id,
      title: libraryItems.title,
      description: libraryItems.description,
      fileUrl: libraryItems.fileUrl,
      fileType: libraryItems.fileType,
      fileName: libraryItems.fileName,
      noteContent: libraryItems.noteContent,
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

// ── Create item ───────────────────────────────────────────────────────────────

const createSchema = z.union([
  z.object({
    title: z.string().min(1).max(200).trim(),
    description: z.string().max(2000).trim().optional(),
    fileType: z.enum(['note']),
    noteContent: z.string().min(1).max(50000),
    fileName: z.string().max(300).optional(),
  }),
  z.object({
    title: z.string().min(1).max(200).trim(),
    description: z.string().max(2000).trim().optional(),
    fileType: z.enum(['audio', 'video', 'image', 'document', 'other']),
    fileUrl: z.string().url(),
    fileName: z.string().max(300).optional(),
  }),
]);

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

// ── Update item ───────────────────────────────────────────────────────────────

const updateSchema = z.object({
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(2000).trim().nullable().optional(),
  noteContent: z.string().max(50000).nullable().optional(),
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

// ── Delete item ───────────────────────────────────────────────────────────────

router.delete('/:id', requireAuth, requireRole(['teacher', 'admin']), async (req, res) => {
  try {
    const existing = await db.select().from(libraryItems).where(eq(libraryItems.id, req.params.id)).limit(1);
    if (existing.length === 0) return res.status(404).json({ error: 'Item not found' });

    if (req.user!.role === 'teacher' && existing[0].uploadedBy !== req.user!.sub) {
      return res.status(403).json({ error: 'You can only delete your own items' });
    }

    // Delete the uploaded file from disk if this was a local upload
    const fileUrl = existing[0].fileUrl;
    if (fileUrl) {
      const urlPath = new URL(fileUrl).pathname;
      if (urlPath.startsWith('/uploads/')) {
        const diskPath = path.join(UPLOAD_DIR, path.basename(urlPath));
        try { fs.unlinkSync(diskPath); } catch { /* file already gone */ }
      }
    }

    await db.delete(libraryItems).where(eq(libraryItems.id, req.params.id));
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
