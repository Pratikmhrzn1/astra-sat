import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import * as service from './roster.service';

export const rosterTeacherRouter = Router();

rosterTeacherRouter.use(requireAuth, requireRole(['teacher']));

// ── Roster ───────────────────────────────────────────────────────────────────

rosterTeacherRouter.get(
  '/students',
  asyncHandler(async (req, res) => {
    res.json(await service.listStudents(currentUserId(req)));
  }),
);

rosterTeacherRouter.get(
  '/students/:studentId',
  asyncHandler(async (req, res) => {
    res.json(await service.getStudentDetail(currentUserId(req), req.params.studentId));
  }),
);

rosterTeacherRouter.get(
  '/students/:studentId/analytics',
  asyncHandler(async (req, res) => {
    res.json(await service.getStudentAnalytics(currentUserId(req), req.params.studentId));
  }),
);

rosterTeacherRouter.get(
  '/students/:studentId/exams',
  asyncHandler(async (req, res) => {
    res.json(await service.listStudentExams(currentUserId(req), req.params.studentId));
  }),
);

rosterTeacherRouter.get(
  '/students/:studentId/exams/:examId/results',
  asyncHandler(async (req, res) => {
    res.json(
      await service.getStudentExamResults(
        currentUserId(req),
        req.params.studentId,
        req.params.examId,
      ),
    );
  }),
);
