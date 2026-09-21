import { Router } from 'express';
import multer from 'multer';
import { env } from '../../core/config/env';
import { asyncHandler } from '../../core/http/async-handler';
import { badRequest } from '../../core/errors';
import { currentUser, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { parseOrBadRequest } from '../../core/http/middleware/validate';
import * as service from './library.service';

export const libraryRouter = Router();

/**
 * Uploads land on disk with a generated name.
 *
 * The original filename is never used as the stored name — it is sanitised and
 * prefixed with a timestamp and random suffix, which both prevents path tricks
 * and stops two people uploading "notes.pdf" from overwriting each other.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, env.uploads.dir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

libraryRouter.post(
  '/upload',
  requireAuth,
  requireRole(['teacher', 'admin']),
  upload.single('file'),
  (req, res) => {
    if (!req.file) throw badRequest('No file uploaded');
    // Falls back to the request origin so local dev works without configuring
    // a public base URL.
    const baseUrl = env.http.publicBaseUrl ?? `${req.protocol}://${req.get('host')}`;
    res.json({ url: `${baseUrl}/uploads/${req.file.filename}`, fileName: req.file.originalname });
  },
);

libraryRouter.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await service.listItems(currentUser(req).role));
  }),
);

libraryRouter.post(
  '/',
  requireAuth,
  requireRole(['teacher', 'admin']),
  asyncHandler(async (req, res) => {
    const input = parseOrBadRequest(service.createItemSchema, req.body);
    res.status(201).json(await service.createItem(currentUser(req).id, input));
  }),
);

libraryRouter.patch(
  '/:id',
  requireAuth,
  requireRole(['teacher', 'admin']),
  asyncHandler(async (req, res) => {
    const input = parseOrBadRequest(service.updateItemSchema, req.body);
    res.json(await service.updateItem(req.params.id, currentUser(req), input));
  }),
);

libraryRouter.delete(
  '/:id',
  requireAuth,
  requireRole(['teacher', 'admin']),
  asyncHandler(async (req, res) => {
    await service.deleteItem(req.params.id, currentUser(req));
    res.status(204).send();
  }),
);
