import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
import * as inbox from './inbox.service';
import * as service from './messages.service';
import { sendFeedbackSchema, type SendFeedbackInput } from './messages.schemas';

/** Teacher → student feedback messages: sent from the teacher portal, read in the student inbox. */

export const messagesStudentRouter = Router();

messagesStudentRouter.use(requireAuth, requireRole(['student']));

// ── Teacher feedback inbox ───────────────────────────────────────────────────

messagesStudentRouter.get(
  '/feedback',
  asyncHandler(async (req, res) => {
    res.json(await inbox.listFeedback(currentUserId(req)));
  }),
);

messagesStudentRouter.put(
  '/feedback/:feedbackId/read',
  asyncHandler(async (req, res) => {
    await inbox.markFeedbackRead(currentUserId(req), req.params.feedbackId);
    res.json({ ok: true });
  }),
);

export const messagesTeacherRouter = Router();

messagesTeacherRouter.use(requireAuth, requireRole(['teacher']));

// ── Feedback ─────────────────────────────────────────────────────────────────

messagesTeacherRouter.post(
  '/feedback',
  validateBody(sendFeedbackSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.sendFeedback(currentUserId(req), body<SendFeedbackInput>(req)));
  }),
);

messagesTeacherRouter.get(
  '/feedback',
  asyncHandler(async (req, res) => {
    res.json(await service.listSentFeedback(currentUserId(req)));
  }),
);
