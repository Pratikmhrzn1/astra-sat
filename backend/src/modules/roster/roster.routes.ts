import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import * as service from './roster.service';

export const cohortTeacherRoutes = Router();

cohortTeacherRoutes.use(requireSession, requireAccountRole(['teacher']));

// ── Roster ───────────────────────────────────────────────────────────────────

cohortTeacherRoutes.get(
  '/students',
  wrapAsync(async (req, res) => {
    res.json(await service.collectStudents(sessionUserId(req)));
  }),
);

cohortTeacherRoutes.get(
  '/students/:studentId',
  wrapAsync(async (req, res) => {
    res.json(await service.fetchStudentDetail(sessionUserId(req), req.params.studentId));
  }),
);

cohortTeacherRoutes.get(
  '/students/:studentId/analytics',
  wrapAsync(async (req, res) => {
    res.json(await service.fetchStudentAnalytics(sessionUserId(req), req.params.studentId));
  }),
);

cohortTeacherRoutes.get(
  '/students/:studentId/exams',
  wrapAsync(async (req, res) => {
    res.json(await service.collectStudentAssessments(sessionUserId(req), req.params.studentId));
  }),
);

cohortTeacherRoutes.get(
  '/students/:studentId/exams/:examId/results',
  wrapAsync(async (req, res) => {
    res.json(
      await service.fetchStudentAssessmentResults(
        sessionUserId(req),
        req.params.studentId,
        req.params.examId,
      ),
    );
  }),
);
