import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { parseOrReject } from '../../core/http/middleware/validate';
import * as service from './platform-feedback.service';
import { submitFeedbackSchema } from './platform-feedback.schemas';

/** Any signed-in user files a report; only admins read, mark and delete them. */
export const platformFeedbackRouter = Router();

platformFeedbackRouter.post(
  '/',
  requireSession,
  wrapAsync(async (req, res) => {
    const input = parseOrReject(submitFeedbackSchema, req.body);
    const row = await service.submitFeedback(sessionUserId(req), input);
    res.status(201).json({ id: row.id });
  }),
);

platformFeedbackRouter.get(
  '/',
  requireSession,
  requireAccountRole(['admin']),
  wrapAsync(async (_req, res) => {
    res.json(await service.listFeedback());
  }),
);

platformFeedbackRouter.patch(
  '/:id/read',
  requireSession,
  requireAccountRole(['admin']),
  wrapAsync(async (req, res) => {
    await service.markRead(req.params.id);
    res.json({ ok: true });
  }),
);

platformFeedbackRouter.delete(
  '/:id',
  requireSession,
  requireAccountRole(['admin']),
  wrapAsync(async (req, res) => {
    await service.deleteFeedback(req.params.id);
    res.status(204).send();
  }),
);
