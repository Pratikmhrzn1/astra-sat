import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { parseOrBadRequest } from '../../core/http/middleware/validate';
import * as service from './platform-feedback.service';
import { submitFeedbackSchema } from './platform-feedback.schemas';

/** Any signed-in user files a report; only admins read, mark and delete them. */
export const platformFeedbackRouter = Router();

platformFeedbackRouter.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = parseOrBadRequest(submitFeedbackSchema, req.body);
    const row = await service.submitFeedback(currentUserId(req), input);
    res.status(201).json({ id: row.id });
  }),
);

platformFeedbackRouter.get(
  '/',
  requireAuth,
  requireRole(['admin']),
  asyncHandler(async (_req, res) => {
    res.json(await service.listFeedback());
  }),
);

platformFeedbackRouter.patch(
  '/:id/read',
  requireAuth,
  requireRole(['admin']),
  asyncHandler(async (req, res) => {
    await service.markRead(req.params.id);
    res.json({ ok: true });
  }),
);

platformFeedbackRouter.delete(
  '/:id',
  requireAuth,
  requireRole(['admin']),
  asyncHandler(async (req, res) => {
    await service.deleteFeedback(req.params.id);
    res.status(204).send();
  }),
);
