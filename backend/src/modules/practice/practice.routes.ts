import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import * as chat from './chat.service';
import * as practice from './practice.service';
import * as skillPassages from './skill-passage.service';
import * as topic from './topic.service';
import {
  chatRules,
  confirmAnswerRules,
  topicAssessmentRules,
  type ChatPayload,
  type ConfirmAnswerPayload,
  type TopicAssessmentPayload,
} from './practice.schemas';

/** Practice support around an exam: per-question confirm, topic exams, skill passages and the tutor chat. */

export const drillsStudentRoutes = Router();

drillsStudentRoutes.use(requireSession, requireAccountRole(['student']));

/**
 * Practice confirm. Responds as soon as feedback is ready, then checks whether
 * this miss crosses a remediation threshold — the student never waits on that.
 */
drillsStudentRoutes.post(
  '/exams/:examId/questions/:questionId/confirm',
  checkBody(confirmAnswerRules),
  wrapAsync(async (req, res) => {
    const studentId = sessionUserId(req);
    const result = await practice.acknowledgeAnswer(
      studentId,
      req.params.examId,
      req.params.questionId,
      validatedBody<ConfirmAnswerPayload>(req),
    );

    res.json({
      isCorrect: result.isCorrect,
      feedbacks: result.feedbacks,
      vocabTrackingId: result.vocabTrackingId,
    });

    if (result.skillTrigger) {
      void skillPassages
        .maybeTriggerCompetencyPassage(
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
drillsStudentRoutes.post(
  '/exams/topic',
  checkBody(topicAssessmentRules),
  wrapAsync(async (req, res) => {
    const result = await topic.openTopicAssessment(sessionUserId(req), validatedBody<TopicAssessmentPayload>(req));
    res.status(201).json(result);
  }),
);

// ── Skill passages ───────────────────────────────────────────────────────────

drillsStudentRoutes.get(
  '/skill-passages/available',
  wrapAsync(async (req, res) => {
    res.json(await skillPassages.loadAvailableSkillPassages(sessionUserId(req)));
  }),
);

// ── Tutor chat ───────────────────────────────────────────────────────────────

drillsStudentRoutes.post(
  '/chat',
  checkBody(chatRules),
  wrapAsync(async (req, res) => {
    res.json(await chat.dispatchMessage(sessionUserId(req), validatedBody<ChatPayload>(req)));
  }),
);

drillsStudentRoutes.get(
  '/chat/:sessionId/messages',
  wrapAsync(async (req, res) => {
    res.json(await chat.collectMessages(sessionUserId(req), req.params.sessionId));
  }),
);
