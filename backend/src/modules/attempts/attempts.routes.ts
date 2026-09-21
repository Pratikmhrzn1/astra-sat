import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
import { unavailable } from '../../core/errors';
import { narrative } from '../practice';
import * as exams from './attempts.service';
import * as mock from './mock.service';
import * as scoringBackfill from './scoring-backfill.service';
import { logAudit } from '../audit';
import {
  nextModuleSchema,
  saveAnswersSchema,
  startExamSchema,
  submitExamSchema,
  type NextModuleInput,
  type SaveAnswersInput,
  type StartExamInput,
  type SubmitExamInput,
} from './attempts.schemas';

/**
 * Sitting an exam: the catalogue, a practice exam's lifecycle, its results and
 * narrative, and the adaptive mock chain. Mounted at /student (and /admin for
 * the score backfill) by api.router.ts.
 */

export const attemptsStudentRouter = Router();

// Applied once here rather than per route, so a route added below cannot
// accidentally be reachable by a teacher or an anonymous caller.
attemptsStudentRouter.use(requireAuth, requireRole(['student']));

// ── Catalogue ────────────────────────────────────────────────────────────────

attemptsStudentRouter.get(
  '/question-sets',
  asyncHandler(async (_req, res) => {
    res.json(await exams.getCatalogue());
  }),
);

attemptsStudentRouter.get(
  '/question-sets/:setId',
  asyncHandler(async (req, res) => {
    res.json(await exams.getSetWithQuestions(req.params.setId));
  }),
);

// ── Exam lifecycle ───────────────────────────────────────────────────────────

attemptsStudentRouter.post(
  '/exams',
  validateBody(startExamSchema),
  asyncHandler(async (req, res) => {
    const result = await exams.startExam(currentUserId(req), body<StartExamInput>(req));
    res.status(201).json(result);
  }),
);

attemptsStudentRouter.get(
  '/exams',
  asyncHandler(async (req, res) => {
    res.json(await exams.listExams(currentUserId(req)));
  }),
);

attemptsStudentRouter.get(
  '/exams/:examId',
  asyncHandler(async (req, res) => {
    // `?open=1` is the player sitting down to the exam, which starts a mock
    // module's clock. A plain read — the player pre-fetching the next section —
    // must not.
    res.json(await exams.getExam(req.params.examId, currentUserId(req), { open: req.query.open === '1' }));
  }),
);

attemptsStudentRouter.put(
  '/exams/:examId/answers',
  validateBody(saveAnswersSchema),
  asyncHandler(async (req, res) => {
    await exams.saveAnswers(req.params.examId, currentUserId(req), body<SaveAnswersInput>(req));
    res.json({ ok: true });
  }),
);

/** Grades the exam, responds, then generates the narrative behind the response. */
attemptsStudentRouter.post(
  '/exams/:examId/submit',
  validateBody(submitExamSchema),
  asyncHandler(async (req, res) => {
    const input = body<SubmitExamInput>(req);
    const result = await exams.submitExam(req.params.examId, currentUserId(req), input.timeSpentSeconds, input.answers);

    res.json({
      score: result.score,
      total: result.total,
      percentage: result.percentage,
      exam: result.exam,
    });

    if (result.pendingNarrative) {
      narrative.generateNarrativeInBackground(
        result.exam.id,
        result.pendingNarrative.narrativeId,
        result.pendingNarrative.exam,
      );
    }
  }),
);

attemptsStudentRouter.get(
  '/exams/:examId/results',
  asyncHandler(async (req, res) => {
    res.json(await exams.getResults(req.params.examId, currentUserId(req)));
  }),
);

// ── Narratives ───────────────────────────────────────────────────────────────

attemptsStudentRouter.get(
  '/exams/:examId/narrative',
  asyncHandler(async (req, res) => {
    res.json(await exams.getNarrative(req.params.examId, currentUserId(req)));
  }),
);

attemptsStudentRouter.post(
  '/exams/:examId/narrative/retry',
  asyncHandler(async (req, res) => {
    if (!narrative.narrativesEnabled()) {
      throw unavailable('Narrative model not configured');
    }

    const { narrativeId, exam } = await exams.retryNarrative(req.params.examId, currentUserId(req));
    res.json({ ok: true });
    narrative.generateNarrativeInBackground(exam.id, narrativeId, exam);
  }),
);

// ── Mock tests ───────────────────────────────────────────────────────────────

attemptsStudentRouter.post(
  '/mock-tests',
  asyncHandler(async (req, res) => {
    res.status(201).json(await mock.startMockTest(currentUserId(req)));
  }),
);

attemptsStudentRouter.post(
  '/mock-tests/:mockTestId/next-module',
  validateBody(nextModuleSchema),
  asyncHandler(async (req, res) => {
    const { submittedExamId } = body<NextModuleInput>(req);
    // Module 2 is chosen from Module 1's score, so a Module 1 whose time ran out
    // unsubmitted is graded first rather than blocking the mock.
    await exams.closeIfExpired(submittedExamId, currentUserId(req));
    res.json(await mock.startNextModule(currentUserId(req), req.params.mockTestId, submittedExamId));
  }),
);

attemptsStudentRouter.get(
  '/mock-tests',
  asyncHandler(async (req, res) => {
    res.json(await mock.listMockTests(currentUserId(req)));
  }),
);

attemptsStudentRouter.get(
  '/mock-tests/:mockTestId',
  asyncHandler(async (req, res) => {
    res.json(await mock.getMockTest(currentUserId(req), req.params.mockTestId));
  }),
);

export const attemptsAdminRouter = Router();

attemptsAdminRouter.use(requireAuth, requireRole(['admin']));

/**
 * Scores exams and mocks that finished before scaled scoring existed.
 *
 * Blocks the request thread while it walks the corpus, like the auto-tag job
 * above — fine at the current size, and it returns real counts rather than a job
 * id. Safe to run more than once: it only fills columns that are still NULL.
 */
attemptsAdminRouter.post(
  '/scoring/backfill',
  asyncHandler(async (req, res) => {
    const result = await scoringBackfill.backfillScores();
    await logAudit({ actorId: currentUserId(req), action: 'scoring.backfill_run', payload: { ...result } });
    res.json(result);
  }),
);
