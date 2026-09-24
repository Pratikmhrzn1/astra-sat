import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import * as service from './roster.service';

export const rosterTeacherRouter = Router();

rosterTeacherRouter.use(requireSession, requireAccountRole(['teacher']));

// ── Roster ───────────────────────────────────────────────────────────────────

rosterTeacherRouter.get(
  '/students',
  wrapAsync(async (req, res) => {
    res.json(await service.listStudents(sessionUserId(req)));
  }),
);

rosterTeacherRouter.get(
  '/students/:studentId',
  wrapAsync(async (req, res) => {
    res.json(await service.getStudentDetail(sessionUserId(req), req.params.studentId));
  }),
);

rosterTeacherRouter.get(
  '/students/:studentId/analytics',
  wrapAsync(async (req, res) => {
    res.json(await service.getStudentAnalytics(sessionUserId(req), req.params.studentId));
  }),
);

rosterTeacherRouter.get(
  '/students/:studentId/exams',
  wrapAsync(async (req, res) => {
    res.json(await service.listStudentExams(sessionUserId(req), req.params.studentId));
  }),
);

rosterTeacherRouter.get(
  '/students/:studentId/exams/:examId/results',
  wrapAsync(async (req, res) => {
    res.json(
      await service.getStudentExamResults(
        sessionUserId(req),
        req.params.studentId,
        req.params.examId,
      ),
    );
  }),
);
