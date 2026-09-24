import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import * as inbox from './inbox.service';
import * as service from './messages.service';
import { sendFeedbackSchema, type SendFeedbackInput } from './messages.schemas';

/** Teacher → student feedback messages: sent from the teacher portal, read in the student inbox. */

export const messagesStudentRouter = Router();

messagesStudentRouter.use(requireSession, requireAccountRole(['student']));

// ── Teacher feedback inbox ───────────────────────────────────────────────────

messagesStudentRouter.get(
  '/feedback',
  wrapAsync(async (req, res) => {
    res.json(await inbox.listFeedback(sessionUserId(req)));
  }),
);

messagesStudentRouter.put(
  '/feedback/:feedbackId/read',
  wrapAsync(async (req, res) => {
    await inbox.markFeedbackRead(sessionUserId(req), req.params.feedbackId);
    res.json({ ok: true });
  }),
);

export const messagesTeacherRouter = Router();

messagesTeacherRouter.use(requireSession, requireAccountRole(['teacher']));

// ── Feedback ─────────────────────────────────────────────────────────────────

messagesTeacherRouter.post(
  '/feedback',
  checkBody(sendFeedbackSchema),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.sendFeedback(sessionUserId(req), validatedBody<SendFeedbackInput>(req)));
  }),
);

messagesTeacherRouter.get(
  '/feedback',
  wrapAsync(async (req, res) => {
    res.json(await service.listSentFeedback(sessionUserId(req)));
  }),
);
