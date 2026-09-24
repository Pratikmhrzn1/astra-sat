import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
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

const teacherOnly = [requireSession, requireAccountRole(['teacher'], 'Forbidden')] as const;
const studentOnly = [requireSession, requireAccountRole(['student'], 'Forbidden')] as const;

// ── Teacher ──────────────────────────────────────────────────────────────────

liveExamRouter.get(
  '/teacher/live-exams',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.listSessions(sessionUserId(req)));
  }),
);

liveExamRouter.post(
  '/teacher/live-exams',
  ...teacherOnly,
  checkBody(createSessionSchema),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.createSession(sessionUserId(req), validatedBody<CreateSessionInput>(req)));
  }),
);

// Declared before '/teacher/live-exams/:sessionId' so it is not captured by it.
liveExamRouter.get(
  '/teacher/live-exam-sets',
  ...teacherOnly,
  wrapAsync(async (_req, res) => {
    res.json(await service.listLiveExamSets());
  }),
);

liveExamRouter.get(
  '/teacher/live-exams/:sessionId',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.getSessionDetail(req.params.sessionId, sessionUserId(req)));
  }),
);

liveExamRouter.post(
  '/teacher/live-exams/:sessionId/start',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.startSession(req.params.sessionId, sessionUserId(req)));
  }),
);

liveExamRouter.get(
  '/teacher/live-exams/:sessionId/participants/:participantId',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(
      await service.getParticipantResult(
        req.params.sessionId,
        req.params.participantId,
        sessionUserId(req),
      ),
    );
  }),
);

liveExamRouter.post(
  '/teacher/live-exams/:sessionId/participants/:participantId/feedback',
  ...teacherOnly,
  checkBody(saveFeedbackSchema),
  wrapAsync(async (req, res) => {
    await service.saveParticipantFeedback(
      req.params.sessionId,
      req.params.participantId,
      sessionUserId(req),
      validatedBody<SaveFeedbackInput>(req),
    );
    res.json({ ok: true });
  }),
);

liveExamRouter.post(
  '/teacher/live-exams/:sessionId/participants/:participantId/release',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(
      await service.releaseParticipantResult(
        req.params.sessionId,
        req.params.participantId,
        sessionUserId(req),
      ),
    );
  }),
);

liveExamRouter.post(
  '/teacher/live-exams/:sessionId/release-all',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.releaseAllResults(req.params.sessionId, sessionUserId(req)));
  }),
);

// ── Lobby ────────────────────────────────────────────────────────────────────

/**
 * Public: the lobby page renders before the student has been checked, and this
 * only exposes the session's title, state and section durations.
 */
liveExamRouter.get(
  '/live/:joinCode/status',
  wrapAsync(async (req, res) => {
    res.json(await service.getSessionStatus(req.params.joinCode));
  }),
);

liveExamRouter.post(
  '/live/:joinCode/join',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.joinSession(req.params.joinCode, sessionUserId(req)));
  }),
);

liveExamRouter.get(
  '/live/:joinCode/poll',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.pollSession(req.params.joinCode, sessionUserId(req)));
  }),
);

// ── Student ──────────────────────────────────────────────────────────────────

liveExamRouter.get(
  '/student/live-exam-results',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.listStudentResults(sessionUserId(req)));
  }),
);

liveExamRouter.get(
  '/student/notifications',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.listUnreadNotifications(sessionUserId(req)));
  }),
);

liveExamRouter.post(
  '/student/notifications/:id/read',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    await service.markNotificationRead(req.params.id, sessionUserId(req));
    res.json({ ok: true });
  }),
);
