import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../http/middleware/auth';
import { body, validateBody } from '../../http/middleware/validate';
import * as service from './live-exam.service';
import {
  createSessionSchema,
  saveFeedbackSchema,
  type CreateSessionInput,
  type SaveFeedbackInput,
} from './live-exam.service';

/**
 * Mounted at the API root rather than under a prefix, because its paths already
 * name their audience: `/teacher/live-exams`, `/live/:joinCode`,
 * `/student/notifications`.
 *
 * Unlike the other routers this one cannot gate a single role at the top — it
 * serves teachers, students and one public endpoint. Each route therefore
 * states its own requirement, and 'Forbidden' is preserved as the message the
 * existing clients expect.
 */
export const liveExamRouter = Router();

const teacherOnly = [requireAuth, requireRole(['teacher'], 'Forbidden')] as const;
const studentOnly = [requireAuth, requireRole(['student'], 'Forbidden')] as const;

// ── Teacher ──────────────────────────────────────────────────────────────────

liveExamRouter.get(
  '/teacher/live-exams',
  ...teacherOnly,
  asyncHandler(async (req, res) => {
    res.json(await service.listSessions(currentUserId(req)));
  }),
);

liveExamRouter.post(
  '/teacher/live-exams',
  ...teacherOnly,
  validateBody(createSessionSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createSession(currentUserId(req), body<CreateSessionInput>(req)));
  }),
);

// Declared before '/teacher/live-exams/:sessionId' so it is not captured by it.
liveExamRouter.get(
  '/teacher/live-exam-sets',
  ...teacherOnly,
  asyncHandler(async (_req, res) => {
    res.json(await service.listLiveExamSets());
  }),
);

liveExamRouter.get(
  '/teacher/live-exams/:sessionId',
  ...teacherOnly,
  asyncHandler(async (req, res) => {
    res.json(await service.getSessionDetail(req.params.sessionId, currentUserId(req)));
  }),
);

liveExamRouter.post(
  '/teacher/live-exams/:sessionId/start',
  ...teacherOnly,
  asyncHandler(async (req, res) => {
    res.json(await service.startSession(req.params.sessionId, currentUserId(req)));
  }),
);

liveExamRouter.get(
  '/teacher/live-exams/:sessionId/participants/:participantId',
  ...teacherOnly,
  asyncHandler(async (req, res) => {
    res.json(
      await service.getParticipantResult(
        req.params.sessionId,
        req.params.participantId,
        currentUserId(req),
      ),
    );
  }),
);

liveExamRouter.post(
  '/teacher/live-exams/:sessionId/participants/:participantId/feedback',
  ...teacherOnly,
  validateBody(saveFeedbackSchema),
  asyncHandler(async (req, res) => {
    await service.saveParticipantFeedback(
      req.params.sessionId,
      req.params.participantId,
      currentUserId(req),
      body<SaveFeedbackInput>(req),
    );
    res.json({ ok: true });
  }),
);

liveExamRouter.post(
  '/teacher/live-exams/:sessionId/participants/:participantId/release',
  ...teacherOnly,
  asyncHandler(async (req, res) => {
    res.json(
      await service.releaseParticipantResult(
        req.params.sessionId,
        req.params.participantId,
        currentUserId(req),
      ),
    );
  }),
);

liveExamRouter.post(
  '/teacher/live-exams/:sessionId/release-all',
  ...teacherOnly,
  asyncHandler(async (req, res) => {
    res.json(await service.releaseAllResults(req.params.sessionId, currentUserId(req)));
  }),
);

// ── Lobby ────────────────────────────────────────────────────────────────────

/**
 * Public: the lobby page renders before the student has been checked, and this
 * only exposes the session's title, state and section durations.
 */
liveExamRouter.get(
  '/live/:joinCode/status',
  asyncHandler(async (req, res) => {
    res.json(await service.getSessionStatus(req.params.joinCode));
  }),
);

liveExamRouter.post(
  '/live/:joinCode/join',
  ...studentOnly,
  asyncHandler(async (req, res) => {
    res.json(await service.joinSession(req.params.joinCode, currentUserId(req)));
  }),
);

liveExamRouter.get(
  '/live/:joinCode/poll',
  ...studentOnly,
  asyncHandler(async (req, res) => {
    res.json(await service.pollSession(req.params.joinCode, currentUserId(req)));
  }),
);

// ── Student ──────────────────────────────────────────────────────────────────

liveExamRouter.get(
  '/student/live-exam-results',
  ...studentOnly,
  asyncHandler(async (req, res) => {
    res.json(await service.listStudentResults(currentUserId(req)));
  }),
);

liveExamRouter.get(
  '/student/notifications',
  ...studentOnly,
  asyncHandler(async (req, res) => {
    res.json(await service.listUnreadNotifications(currentUserId(req)));
  }),
);

liveExamRouter.post(
  '/student/notifications/:id/read',
  ...studentOnly,
  asyncHandler(async (req, res) => {
    await service.markNotificationRead(req.params.id, currentUserId(req));
    res.json({ ok: true });
  }),
);
