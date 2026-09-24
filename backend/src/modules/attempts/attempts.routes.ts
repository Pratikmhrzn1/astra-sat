import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import { dependencyDown } from '../../core/errors';
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
attemptsStudentRouter.use(requireSession, requireAccountRole(['student']));

// ── Catalogue ────────────────────────────────────────────────────────────────

attemptsStudentRouter.get(
  '/question-sets',
  wrapAsync(async (_req, res) => {
    res.json(await exams.getCatalogue());
  }),
);

attemptsStudentRouter.get(
  '/question-sets/:setId',
  wrapAsync(async (req, res) => {
    res.json(await exams.getSetWithQuestions(req.params.setId));
  }),
);

// ── Exam lifecycle ───────────────────────────────────────────────────────────

attemptsStudentRouter.post(
  '/exams',
  checkBody(startExamSchema),
  wrapAsync(async (req, res) => {
    const result = await exams.startExam(sessionUserId(req), validatedBody<StartExamInput>(req));
    res.status(201).json(result);
  }),
);

attemptsStudentRouter.get(
  '/exams',
  wrapAsync(async (req, res) => {
    res.json(await exams.listExams(sessionUserId(req)));
  }),
);

attemptsStudentRouter.get(
  '/exams/:examId',
  wrapAsync(async (req, res) => {
    // `?open=1` is the player sitting down to the exam, which starts a mock
    // module's clock. A plain read — the player pre-fetching the next section —
    // must not.
    res.json(await exams.getExam(req.params.examId, sessionUserId(req), { open: req.query.open === '1' }));
  }),
);

attemptsStudentRouter.put(
  '/exams/:examId/answers',
  checkBody(saveAnswersSchema),
  wrapAsync(async (req, res) => {
    await exams.saveAnswers(req.params.examId, sessionUserId(req), validatedBody<SaveAnswersInput>(req));
    res.json({ ok: true });
  }),
);

/** Grades the exam, responds, then generates the narrative behind the response. */
attemptsStudentRouter.post(
  '/exams/:examId/submit',
  checkBody(submitExamSchema),
  wrapAsync(async (req, res) => {
    const input = validatedBody<SubmitExamInput>(req);
    const result = await exams.submitExam(req.params.examId, sessionUserId(req), input.timeSpentSeconds, input.answers);

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
  wrapAsync(async (req, res) => {
    res.json(await exams.getResults(req.params.examId, sessionUserId(req)));
  }),
);

// ── Narratives ───────────────────────────────────────────────────────────────

attemptsStudentRouter.get(
  '/exams/:examId/narrative',
  wrapAsync(async (req, res) => {
    res.json(await exams.getNarrative(req.params.examId, sessionUserId(req)));
  }),
);

attemptsStudentRouter.post(
  '/exams/:examId/narrative/retry',
  wrapAsync(async (req, res) => {
    if (!narrative.narrativesEnabled()) {
      throw dependencyDown('Narrative model not configured');
    }

    const { narrativeId, exam } = await exams.retryNarrative(req.params.examId, sessionUserId(req));
    res.json({ ok: true });
    narrative.generateNarrativeInBackground(exam.id, narrativeId, exam);
  }),
);

// ── Mock tests ───────────────────────────────────────────────────────────────

attemptsStudentRouter.post(
  '/mock-tests',
  wrapAsync(async (req, res) => {
    res.status(201).json(await mock.startMockTest(sessionUserId(req)));
  }),
);

attemptsStudentRouter.post(
  '/mock-tests/:mockTestId/next-module',
  checkBody(nextModuleSchema),
  wrapAsync(async (req, res) => {
    const { submittedExamId } = validatedBody<NextModuleInput>(req);
    // Module 2 is chosen from Module 1's score, so a Module 1 whose time ran out
    // unsubmitted is graded first rather than blocking the mock.
    await exams.closeIfExpired(submittedExamId, sessionUserId(req));
    res.json(await mock.startNextModule(sessionUserId(req), req.params.mockTestId, submittedExamId));
  }),
);

attemptsStudentRouter.get(
  '/mock-tests',
  wrapAsync(async (req, res) => {
    res.json(await mock.listMockTests(sessionUserId(req)));
  }),
);

attemptsStudentRouter.get(
  '/mock-tests/:mockTestId',
  wrapAsync(async (req, res) => {
    res.json(await mock.getMockTest(sessionUserId(req), req.params.mockTestId));
  }),
);

export const attemptsAdminRouter = Router();

attemptsAdminRouter.use(requireSession, requireAccountRole(['admin']));

/**
 * Scores exams and mocks that finished before scaled scoring existed.
 *
 * Blocks the request thread while it walks the corpus, like the auto-tag job
 * above — fine at the current size, and it returns real counts rather than a job
 * id. Safe to run more than once: it only fills columns that are still NULL.
 */
attemptsAdminRouter.post(
  '/scoring/backfill',
  wrapAsync(async (req, res) => {
    const result = await scoringBackfill.backfillScores();
    await logAudit({ actorId: sessionUserId(req), action: 'scoring.backfill_run', payload: { ...result } });
    res.json(result);
  }),
);
