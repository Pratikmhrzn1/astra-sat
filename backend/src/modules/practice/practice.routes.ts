import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
import * as chat from './chat.service';
import * as practice from './practice.service';
import * as skillPassages from './skill-passage.service';
import * as topic from './topic.service';
import {
  chatSchema,
  confirmAnswerSchema,
  topicExamSchema,
  type ChatInput,
  type ConfirmAnswerInput,
  type TopicExamInput,
} from './practice.schemas';

/** Practice support around an exam: per-question confirm, topic exams, skill passages and the tutor chat. */

export const practiceStudentRouter = Router();

practiceStudentRouter.use(requireAuth, requireRole(['student']));

/**
 * Practice confirm. Responds as soon as feedback is ready, then checks whether
 * this miss crosses a remediation threshold — the student never waits on that.
 */
practiceStudentRouter.post(
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

// ── Topic practice ───────────────────────────────────────────────────────────

/** An exam drawn across every published set for one domain or skill. */
practiceStudentRouter.post(
  '/exams/topic',
  validateBody(topicExamSchema),
  asyncHandler(async (req, res) => {
    const result = await topic.startTopicExam(currentUserId(req), body<TopicExamInput>(req));
    res.status(201).json(result);
  }),
);

// ── Skill passages ───────────────────────────────────────────────────────────

practiceStudentRouter.get(
  '/skill-passages/available',
  asyncHandler(async (req, res) => {
    res.json(await skillPassages.findAvailableSkillPassages(currentUserId(req)));
  }),
);

// ── Tutor chat ───────────────────────────────────────────────────────────────

practiceStudentRouter.post(
  '/chat',
  validateBody(chatSchema),
  asyncHandler(async (req, res) => {
    res.json(await chat.sendMessage(currentUserId(req), body<ChatInput>(req)));
  }),
);

practiceStudentRouter.get(
  '/chat/:sessionId/messages',
  asyncHandler(async (req, res) => {
    res.json(await chat.listMessages(currentUserId(req), req.params.sessionId));
  }),
);
