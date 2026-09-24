import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import { dependencyDown } from '../../core/errors';
import { narrative } from '../practice';
import * as exams from './attempts.service';
import * as mock from './mock.service';
import * as scoringBackfill from './scoring-backfill.service';
import { logTrail } from '../audit';
import {
  nextModuleRules,
  storeAnswersRules,
  openAssessmentRules,
  commitAssessmentRules,
  type NextModulePayload,
  type SaveAnswersPayload,
  type StartAssessmentPayload,
  type SubmitAssessmentPayload,
} from './attempts.schemas';

/**
 * Sitting an exam: the catalogue, a practice exam's lifecycle, its results and
 * narrative, and the adaptive mock chain. Mounted at /student (and /admin for
 * the score backfill) by api.router.ts.
 */

export const sittingsStudentRoutes = Router();

// Applied once here rather than per route, so a route added below cannot
// accidentally be reachable by a teacher or an anonymous caller.
sittingsStudentRoutes.use(requireSession, requireAccountRole(['student']));

// ── Catalogue ────────────────────────────────────────────────────────────────

sittingsStudentRoutes.get(
  '/question-sets',
  wrapAsync(async (_req, res) => {
    res.json(await exams.fetchCatalogue());
  }),
);

sittingsStudentRoutes.get(
  '/question-sets/:setId',
  wrapAsync(async (req, res) => {
    res.json(await exams.fetchSetWithQuestions(req.params.setId));
  }),
);

// ── Exam lifecycle ───────────────────────────────────────────────────────────

sittingsStudentRoutes.post(
  '/exams',
  checkBody(openAssessmentRules),
  wrapAsync(async (req, res) => {
    const result = await exams.openAssessment(sessionUserId(req), validatedBody<StartAssessmentPayload>(req));
    res.status(201).json(result);
  }),
);

sittingsStudentRoutes.get(
  '/exams',
  wrapAsync(async (req, res) => {
    res.json(await exams.collectAssessments(sessionUserId(req)));
  }),
);

sittingsStudentRoutes.get(
  '/exams/:examId',
  wrapAsync(async (req, res) => {
    // `?open=1` is the player sitting down to the exam, which starts a mock
    // module's clock. A plain read — the player pre-fetching the next section —
    // must not.
    res.json(await exams.fetchAssessment(req.params.examId, sessionUserId(req), { open: req.query.open === '1' }));
  }),
);

sittingsStudentRoutes.put(
  '/exams/:examId/answers',
  checkBody(storeAnswersRules),
  wrapAsync(async (req, res) => {
    await exams.storeAnswers(req.params.examId, sessionUserId(req), validatedBody<SaveAnswersPayload>(req));
    res.json({ ok: true });
  }),
);

/** Grades the exam, responds, then generates the narrative behind the response. */
sittingsStudentRoutes.post(
  '/exams/:examId/submit',
  checkBody(commitAssessmentRules),
  wrapAsync(async (req, res) => {
    const input = validatedBody<SubmitAssessmentPayload>(req);
    const result = await exams.commitAssessment(req.params.examId, sessionUserId(req), input.timeSpentSeconds, input.answers);

    res.json({
      score: result.score,
      total: result.total,
      percentage: result.percentage,
      exam: result.exam,
    });

    if (result.pendingNarrative) {
      narrative.produceNarrativeInBackground(
        result.exam.id,
        result.pendingNarrative.narrativeId,
        result.pendingNarrative.exam,
      );
    }
  }),
);

sittingsStudentRoutes.get(
  '/exams/:examId/results',
  wrapAsync(async (req, res) => {
    res.json(await exams.fetchResults(req.params.examId, sessionUserId(req)));
  }),
);

// ── Narratives ───────────────────────────────────────────────────────────────

sittingsStudentRoutes.get(
  '/exams/:examId/narrative',
  wrapAsync(async (req, res) => {
    res.json(await exams.fetchNarrative(req.params.examId, sessionUserId(req)));
  }),
);

sittingsStudentRoutes.post(
  '/exams/:examId/narrative/retry',
  wrapAsync(async (req, res) => {
    if (!narrative.narrativesAvailable()) {
      throw dependencyDown('Narrative model not configured');
    }

    const { narrativeId, exam } = await exams.reRunNarrative(req.params.examId, sessionUserId(req));
    res.json({ ok: true });
    narrative.produceNarrativeInBackground(exam.id, narrativeId, exam);
  }),
);

// ── Mock tests ───────────────────────────────────────────────────────────────

sittingsStudentRoutes.post(
  '/mock-tests',
  wrapAsync(async (req, res) => {
    res.status(201).json(await mock.openMockTest(sessionUserId(req)));
  }),
);

sittingsStudentRoutes.post(
  '/mock-tests/:mockTestId/next-module',
  checkBody(nextModuleRules),
  wrapAsync(async (req, res) => {
    const { submittedExamId } = validatedBody<NextModulePayload>(req);
    // Module 2 is chosen from Module 1's score, so a Module 1 whose time ran out
    // unsubmitted is graded first rather than blocking the mock.
    await exams.closeWhenExpired(submittedExamId, sessionUserId(req));
    res.json(await mock.openNextModule(sessionUserId(req), req.params.mockTestId, submittedExamId));
  }),
);

sittingsStudentRoutes.get(
  '/mock-tests',
  wrapAsync(async (req, res) => {
    res.json(await mock.collectMockTests(sessionUserId(req)));
  }),
);

sittingsStudentRoutes.get(
  '/mock-tests/:mockTestId',
  wrapAsync(async (req, res) => {
    res.json(await mock.fetchMockTest(sessionUserId(req), req.params.mockTestId));
  }),
);

export const sittingsAdminRoutes = Router();

sittingsAdminRoutes.use(requireSession, requireAccountRole(['admin']));

/**
 * Scores exams and mocks that finished before scaled scoring existed.
 *
 * Blocks the request thread while it walks the corpus, like the auto-tag job
 * above — fine at the current size, and it returns real counts rather than a job
 * id. Safe to run more than once: it only fills columns that are still NULL.
 */
sittingsAdminRoutes.post(
  '/scoring/backfill',
  wrapAsync(async (req, res) => {
    const result = await scoringBackfill.fillMissingScores();
    await logTrail({ actorId: sessionUserId(req), action: 'scoring.backfill_run', payload: { ...result } });
    res.json(result);
  }),
);
