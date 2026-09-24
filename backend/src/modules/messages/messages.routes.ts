import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import * as inbox from './inbox.service';
import * as service from './messages.service';
import { dispatchFeedbackRules, type SendFeedbackPayload } from './messages.schemas';

/** Teacher → student feedback messages: sent from the teacher portal, read in the student inbox. */

export const notesStudentRoutes = Router();

notesStudentRoutes.use(requireSession, requireAccountRole(['student']));

// ── Teacher feedback inbox ───────────────────────────────────────────────────

notesStudentRoutes.get(
  '/feedback',
  wrapAsync(async (req, res) => {
    res.json(await inbox.collectFeedback(sessionUserId(req)));
  }),
);

notesStudentRoutes.put(
  '/feedback/:feedbackId/read',
  wrapAsync(async (req, res) => {
    await inbox.flagNoteSeen(sessionUserId(req), req.params.feedbackId);
    res.json({ ok: true });
  }),
);

export const notesTeacherRoutes = Router();

notesTeacherRoutes.use(requireSession, requireAccountRole(['teacher']));

// ── Feedback ─────────────────────────────────────────────────────────────────

notesTeacherRoutes.post(
  '/feedback',
  checkBody(dispatchFeedbackRules),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.dispatchFeedback(sessionUserId(req), validatedBody<SendFeedbackPayload>(req)));
  }),
);

notesTeacherRoutes.get(
  '/feedback',
  wrapAsync(async (req, res) => {
    res.json(await service.collectSentFeedback(sessionUserId(req)));
  }),
);
