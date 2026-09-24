import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { parseOrReject } from '../../core/http/middleware/validate';
import * as service from './platform-feedback.service';
import { commitFeedbackRules } from './platform-feedback.schemas';

/** Any signed-in user files a report; only admins read, mark and delete them. */
export const reportRoutes = Router();

reportRoutes.post(
  '/',
  requireSession,
  wrapAsync(async (req, res) => {
    const input = parseOrReject(commitFeedbackRules, req.body);
    const row = await service.commitFeedback(sessionUserId(req), input);
    res.status(201).json({ id: row.id });
  }),
);

reportRoutes.get(
  '/',
  requireSession,
  requireAccountRole(['admin']),
  wrapAsync(async (_req, res) => {
    res.json(await service.collectReports());
  }),
);

reportRoutes.patch(
  '/:id/read',
  requireSession,
  requireAccountRole(['admin']),
  wrapAsync(async (req, res) => {
    await service.flagReportSeen(req.params.id);
    res.json({ ok: true });
  }),
);

reportRoutes.delete(
  '/:id',
  requireSession,
  requireAccountRole(['admin']),
  wrapAsync(async (req, res) => {
    await service.removeFeedback(req.params.id);
    res.status(204).send();
  }),
);
