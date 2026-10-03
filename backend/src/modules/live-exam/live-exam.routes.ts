import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole, LEARNER_ROLES } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import * as service from './live-exam.service';
import {
  addSessionRules,
  storeFeedbackRules,
  type CreateSessionPayload,
  type SaveFeedbackPayload,
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
export const liveSessionRoutes = Router();

const teacherOnly = [requireSession, requireAccountRole(['teacher'], 'Forbidden')] as const;
const studentOnly = [requireSession, requireAccountRole(LEARNER_ROLES, 'Forbidden')] as const;

// ── Teacher ──────────────────────────────────────────────────────────────────

liveSessionRoutes.get(
  '/teacher/live-exams',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.collectSessions(sessionUserId(req)));
  }),
);

liveSessionRoutes.post(
  '/teacher/live-exams',
  ...teacherOnly,
  checkBody(addSessionRules),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.addSession(sessionUserId(req), validatedBody<CreateSessionPayload>(req)));
  }),
);

// Declared before '/teacher/live-exams/:sessionId' so it is not captured by it.
liveSessionRoutes.get(
  '/teacher/live-exam-sets',
  ...teacherOnly,
  wrapAsync(async (_req, res) => {
    res.json(await service.collectLiveAssessmentSets());
  }),
);

liveSessionRoutes.get(
  '/teacher/live-exams/:sessionId',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.fetchSessionDetail(req.params.sessionId, sessionUserId(req)));
  }),
);

liveSessionRoutes.post(
  '/teacher/live-exams/:sessionId/start',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.openSession(req.params.sessionId, sessionUserId(req)));
  }),
);

liveSessionRoutes.get(
  '/teacher/live-exams/:sessionId/participants/:participantId',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(
      await service.fetchParticipantResult(
        req.params.sessionId,
        req.params.participantId,
        sessionUserId(req),
      ),
    );
  }),
);

liveSessionRoutes.post(
  '/teacher/live-exams/:sessionId/participants/:participantId/feedback',
  ...teacherOnly,
  checkBody(storeFeedbackRules),
  wrapAsync(async (req, res) => {
    await service.storeParticipantFeedback(
      req.params.sessionId,
      req.params.participantId,
      sessionUserId(req),
      validatedBody<SaveFeedbackPayload>(req),
    );
    res.json({ ok: true });
  }),
);

liveSessionRoutes.post(
  '/teacher/live-exams/:sessionId/participants/:participantId/release',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(
      await service.publishParticipantResult(
        req.params.sessionId,
        req.params.participantId,
        sessionUserId(req),
      ),
    );
  }),
);

liveSessionRoutes.post(
  '/teacher/live-exams/:sessionId/release-all',
  ...teacherOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.publishAllResults(req.params.sessionId, sessionUserId(req)));
  }),
);

// ── Lobby ────────────────────────────────────────────────────────────────────

/**
 * Public: the lobby page renders before the student has been checked, and this
 * only exposes the session's title, state and section durations.
 */
liveSessionRoutes.get(
  '/live/:joinCode/status',
  wrapAsync(async (req, res) => {
    res.json(await service.fetchSessionStatus(req.params.joinCode));
  }),
);

liveSessionRoutes.post(
  '/live/:joinCode/join',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.enterSession(req.params.joinCode, sessionUserId(req)));
  }),
);

liveSessionRoutes.get(
  '/live/:joinCode/poll',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.checkSession(req.params.joinCode, sessionUserId(req)));
  }),
);

// ── Student ──────────────────────────────────────────────────────────────────

liveSessionRoutes.get(
  '/student/live-exam-results',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.collectStudentResults(sessionUserId(req)));
  }),
);

liveSessionRoutes.get(
  '/student/notifications',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    res.json(await service.collectUnreadNotifications(sessionUserId(req)));
  }),
);

liveSessionRoutes.post(
  '/student/notifications/:id/read',
  ...studentOnly,
  wrapAsync(async (req, res) => {
    await service.flagNotificationSeen(req.params.id, sessionUserId(req));
    res.json({ ok: true });
  }),
);
