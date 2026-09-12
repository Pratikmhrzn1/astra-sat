import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../http/middleware/auth';
import { body, validateBody } from '../../http/middleware/validate';
import { HttpError } from '../../http/errors';
import * as chat from './chat.service';
import * as exams from './exams.service';
import * as inbox from './inbox.service';
import * as mock from './mock.service';
import * as narrative from './narrative.service';
import * as practice from './practice.service';
import * as profile from './profile.service';
import * as skillPassages from './skill-passage.service';
import * as vocab from './vocab.service';
import {
  chatSchema,
  confirmAnswerSchema,
  nextModuleSchema,
  reviewVocabSchema,
  saveAnswersSchema,
  startExamSchema,
  submitExamSchema,
  updateProfileSchema,
  type ChatInput,
  type ConfirmAnswerInput,
  type NextModuleInput,
  type ReviewVocabInput,
  type SaveAnswersInput,
  type StartExamInput,
  type SubmitExamInput,
  type UpdateProfileInput,
} from './student.schemas';

export const studentRouter = Router();

// Applied once here rather than per route, so a route added below cannot
// accidentally be reachable by a teacher or an anonymous caller.
studentRouter.use(requireAuth, requireRole(['student']));

// ── Catalogue ────────────────────────────────────────────────────────────────

studentRouter.get(
  '/question-sets',
  asyncHandler(async (_req, res) => {
    res.json(await exams.getCatalogue());
  }),
);

studentRouter.get(
  '/question-sets/:setId',
  asyncHandler(async (req, res) => {
    res.json(await exams.getSetWithQuestions(req.params.setId));
  }),
);

// ── Exam lifecycle ───────────────────────────────────────────────────────────

studentRouter.post(
  '/exams',
  validateBody(startExamSchema),
  asyncHandler(async (req, res) => {
    const result = await exams.startExam(currentUserId(req), body<StartExamInput>(req));
    res.status(201).json(result);
  }),
);

studentRouter.get(
  '/exams',
  asyncHandler(async (req, res) => {
    res.json(await exams.listExams(currentUserId(req)));
  }),
);

studentRouter.get(
  '/exams/:examId',
  asyncHandler(async (req, res) => {
    res.json(await exams.getExam(req.params.examId, currentUserId(req)));
  }),
);

studentRouter.put(
  '/exams/:examId/answers',
  validateBody(saveAnswersSchema),
  asyncHandler(async (req, res) => {
    await exams.saveAnswers(req.params.examId, currentUserId(req), body<SaveAnswersInput>(req));
    res.json({ ok: true });
  }),
);

/**
 * Practice confirm. Responds as soon as feedback is ready, then checks whether
 * this miss crosses a remediation threshold — the student never waits on that.
 */
studentRouter.post(
  '/exams/:examId/questions/:questionId/confirm',
  validateBody(confirmAnswerSchema),
  asyncHandler(async (req, res) => {
    const studentId = currentUserId(req);
    const result = await practice.confirmAnswer(
      studentId,
      req.params.examId,
      req.params.questionId,
      body<ConfirmAnswerInput>(req),
    );

    res.json({
      isCorrect: result.isCorrect,
      feedbacks: result.feedbacks,
      vocabTrackingId: result.vocabTrackingId,
    });

    if (result.skillTrigger) {
      void skillPassages
        .checkAndTriggerSkillPassage(
          studentId,
          result.skillTrigger.subSkill,
          result.skillTrigger.questionText,
          result.skillTrigger.questionId,
        )
        .catch((err) => console.error('[skill-passage] Trigger check failed:', err));
    }
  }),
);

/** Grades the exam, responds, then generates the narrative behind the response. */
studentRouter.post(
  '/exams/:examId/submit',
  validateBody(submitExamSchema),
  asyncHandler(async (req, res) => {
    const result = await exams.submitExam(
      req.params.examId,
      currentUserId(req),
      body<SubmitExamInput>(req).timeSpentSeconds,
    );

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

studentRouter.get(
  '/exams/:examId/results',
  asyncHandler(async (req, res) => {
    res.json(await exams.getResults(req.params.examId, currentUserId(req)));
  }),
);

// ── Profile ──────────────────────────────────────────────────────────────────

/** Null when no goal has been set — the dashboard prompts rather than guessing. */
studentRouter.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json(await profile.getProfile(currentUserId(req)));
  }),
);

studentRouter.put(
  '/profile',
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    res.json(await profile.upsertProfile(currentUserId(req), body<UpdateProfileInput>(req)));
  }),
);

// ── Narratives ───────────────────────────────────────────────────────────────

studentRouter.get(
  '/exams/:examId/narrative',
  asyncHandler(async (req, res) => {
    res.json(await exams.getNarrative(req.params.examId, currentUserId(req)));
  }),
);

studentRouter.post(
  '/exams/:examId/narrative/retry',
  asyncHandler(async (req, res) => {
    if (!narrative.narrativesEnabled()) {
      throw new HttpError(503, 'Narrative model not configured');
    }

    const { narrativeId, exam } = await exams.retryNarrative(req.params.examId, currentUserId(req));
    res.json({ ok: true });
    narrative.generateNarrativeInBackground(exam.id, narrativeId, exam);
  }),
);

// ── Skill passages ───────────────────────────────────────────────────────────

studentRouter.get(
  '/skill-passages/available',
  asyncHandler(async (req, res) => {
    res.json(await skillPassages.findAvailableSkillPassages(currentUserId(req)));
  }),
);

// ── Mock tests ───────────────────────────────────────────────────────────────

studentRouter.post(
  '/mock-tests',
  asyncHandler(async (req, res) => {
    res.status(201).json(await mock.startMockTest(currentUserId(req)));
  }),
);

studentRouter.post(
  '/mock-tests/:mockTestId/next-module',
  validateBody(nextModuleSchema),
  asyncHandler(async (req, res) => {
    const { submittedExamId } = body<NextModuleInput>(req);
    res.json(await mock.startNextModule(currentUserId(req), req.params.mockTestId, submittedExamId));
  }),
);

studentRouter.get(
  '/mock-tests',
  asyncHandler(async (req, res) => {
    res.json(await mock.listMockTests(currentUserId(req)));
  }),
);

studentRouter.get(
  '/mock-tests/:mockTestId',
  asyncHandler(async (req, res) => {
    res.json(await mock.getMockTest(currentUserId(req), req.params.mockTestId));
  }),
);

// ── Teacher feedback inbox ───────────────────────────────────────────────────

studentRouter.get(
  '/feedback',
  asyncHandler(async (req, res) => {
    res.json(await inbox.listFeedback(currentUserId(req)));
  }),
);

studentRouter.put(
  '/feedback/:feedbackId/read',
  asyncHandler(async (req, res) => {
    await inbox.markFeedbackRead(currentUserId(req), req.params.feedbackId);
    res.json({ ok: true });
  }),
);

// ── Vocabulary ───────────────────────────────────────────────────────────────

studentRouter.get(
  '/vocab/due',
  asyncHandler(async (req, res) => {
    res.json(await vocab.findDueItems(currentUserId(req)));
  }),
);

studentRouter.post(
  '/vocab/:vocabId/review',
  validateBody(reviewVocabSchema),
  asyncHandler(async (req, res) => {
    const { isCorrect } = body<ReviewVocabInput>(req);
    res.json(await vocab.reviewQuestionWord(currentUserId(req), req.params.vocabId, isCorrect));
  }),
);

studentRouter.post(
  '/vocab/teacher/:wordId/review',
  validateBody(reviewVocabSchema),
  asyncHandler(async (req, res) => {
    const { isCorrect } = body<ReviewVocabInput>(req);
    res.json(await vocab.reviewTeacherWord(currentUserId(req), req.params.wordId, isCorrect));
  }),
);

// ── Tutor chat ───────────────────────────────────────────────────────────────

studentRouter.post(
  '/chat',
  validateBody(chatSchema),
  asyncHandler(async (req, res) => {
    res.json(await chat.sendMessage(currentUserId(req), body<ChatInput>(req)));
  }),
);

studentRouter.get(
  '/chat/:sessionId/messages',
  asyncHandler(async (req, res) => {
    res.json(await chat.listMessages(currentUserId(req), req.params.sessionId));
  }),
);
