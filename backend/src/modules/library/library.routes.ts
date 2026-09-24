import { Router } from 'express';
import multer from 'multer';
import { settings } from '../../core/config/env';
import { wrapAsync } from '../../core/http/async-handler';
import { invalidRequest } from '../../core/errors';
import { sessionUser, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { parseOrReject } from '../../core/http/middleware/validate';
import * as service from './library.service';

export const resourceRoutes = Router();

/**
 * Uploads land on disk with a generated name.
 *
 * The original filename is never used as the stored name — it is sanitised and
 * prefixed with a timestamp and random suffix, which both prevents path tricks
 * and stops two people uploading "notes.pdf" from overwriting each other.
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, settings.uploads.dir),
    filename: (_req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});

resourceRoutes.post(
  '/upload',
  requireSession,
  requireAccountRole(['teacher', 'admin']),
  upload.single('file'),
  (req, res) => {
    if (!req.file) throw invalidRequest('No file uploaded');
    // Falls back to the request origin so local dev works without configuring
    // a public base URL.
    const baseUrl = settings.http.publicBaseUrl ?? `${req.protocol}://${req.get('host')}`;
    res.json({ url: `${baseUrl}/uploads/${req.file.filename}`, fileName: req.file.originalname });
  },
);

resourceRoutes.get(
  '/',
  requireSession,
  wrapAsync(async (req, res) => {
    res.json(await service.collectItems(sessionUser(req).role));
  }),
);

resourceRoutes.post(
  '/',
  requireSession,
  requireAccountRole(['teacher', 'admin']),
  wrapAsync(async (req, res) => {
    const input = parseOrReject(service.addItemRules, req.body);
    res.status(201).json(await service.addItem(sessionUser(req).id, input));
  }),
);

resourceRoutes.patch(
  '/:id',
  requireSession,
  requireAccountRole(['teacher', 'admin']),
  wrapAsync(async (req, res) => {
    const input = parseOrReject(service.editItemRules, req.body);
    res.json(await service.editItem(req.params.id, sessionUser(req), input));
  }),
);

resourceRoutes.delete(
  '/:id',
  requireSession,
  requireAccountRole(['teacher', 'admin']),
  wrapAsync(async (req, res) => {
    await service.removeItem(req.params.id, sessionUser(req));
    res.status(204).send();
  }),
);
