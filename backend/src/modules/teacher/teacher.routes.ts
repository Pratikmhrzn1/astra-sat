import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../http/middleware/auth';
import { body, validateBody } from '../../http/middleware/validate';
import { logAudit } from '../audit/audit.service';
import * as service from './teacher.service';
import {
  createPassageSchema,
  createQuestionSchema,
  createSetSchema,
  importJsonSchema,
  sendFeedbackSchema,
  updatePassageSchema,
  updateQuestionSchema,
  updateSetSchema,
  updateSubSkillSchema,
  vocabWordSchema,
  type CreatePassageInput,
  type CreateQuestionInput,
  type CreateSetInput,
  type ImportJsonInput,
  type SendFeedbackInput,
  type UpdatePassageInput,
  type UpdateQuestionInput,
  type UpdateSetInput,
  type UpdateSubSkillInput,
  type VocabWordInput,
} from './teacher.schemas';

export const teacherRouter = Router();

teacherRouter.use(requireAuth, requireRole(['teacher']));

// ── Roster ───────────────────────────────────────────────────────────────────

teacherRouter.get(
  '/students',
  asyncHandler(async (req, res) => {
    res.json(await service.listStudents(currentUserId(req)));
  }),
);

teacherRouter.get(
  '/students/:studentId',
  asyncHandler(async (req, res) => {
    res.json(await service.getStudentDetail(currentUserId(req), req.params.studentId));
  }),
);

teacherRouter.get(
  '/students/:studentId/analytics',
  asyncHandler(async (req, res) => {
    res.json(await service.getStudentAnalytics(currentUserId(req), req.params.studentId));
  }),
);

teacherRouter.get(
  '/students/:studentId/exams',
  asyncHandler(async (req, res) => {
    res.json(await service.listStudentExams(currentUserId(req), req.params.studentId));
  }),
);

teacherRouter.get(
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

// ── Feedback ─────────────────────────────────────────────────────────────────

teacherRouter.post(
  '/feedback',
  validateBody(sendFeedbackSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.sendFeedback(currentUserId(req), body<SendFeedbackInput>(req)));
  }),
);

teacherRouter.get(
  '/feedback',
  asyncHandler(async (req, res) => {
    res.json(await service.listSentFeedback(currentUserId(req)));
  }),
);

// ── Question sets ────────────────────────────────────────────────────────────

teacherRouter.get(
  '/question-sets',
  asyncHandler(async (_req, res) => {
    res.json(await service.listSets());
  }),
);

teacherRouter.post(
  '/question-sets',
  validateBody(createSetSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createSet(currentUserId(req), body<CreateSetInput>(req)));
  }),
);

// Registered before '/question-sets/:setId' so the literal path is not
// swallowed by the parameterised one.
teacherRouter.post(
  '/question-sets/import-json',
  validateBody(importJsonSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.importSetFromJson(currentUserId(req), body<ImportJsonInput>(req)));
  }),
);

teacherRouter.put(
  '/question-sets/:setId',
  validateBody(updateSetSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateSet(req.params.setId, body<UpdateSetInput>(req)));
  }),
);

teacherRouter.post(
  '/question-sets/:setId/publish',
  asyncHandler(async (req, res) => {
    res.json(await service.publishSet(req.params.setId));
  }),
);

teacherRouter.delete(
  '/question-sets/:setId',
  asyncHandler(async (req, res) => {
    const result = await service.deleteSet(req.params.setId);
    await logAudit({
      actorId: currentUserId(req),
      action: result.archived ? 'question_set.archived' : 'question_set.deleted',
      targetType: 'question_set', targetId: req.params.setId,
      payload: { title: result.title },
    });
    // `archived` tells the editor which happened, so it can say so.
    res.json({ ok: true, archived: result.archived });
  }),
);

// ── Passages ─────────────────────────────────────────────────────────────────

teacherRouter.get(
  '/question-sets/:setId/passages',
  asyncHandler(async (req, res) => {
    res.json(await service.listPassages(req.params.setId));
  }),
);

teacherRouter.post(
  '/question-sets/:setId/passages',
  validateBody(createPassageSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createPassage(req.params.setId, body<CreatePassageInput>(req)));
  }),
);

teacherRouter.put(
  '/passages/:passageId',
  validateBody(updatePassageSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updatePassage(req.params.passageId, body<UpdatePassageInput>(req)));
  }),
);

teacherRouter.delete(
  '/passages/:passageId',
  asyncHandler(async (req, res) => {
    await service.deletePassage(req.params.passageId);
    res.json({ ok: true });
  }),
);

// ── Questions ────────────────────────────────────────────────────────────────

teacherRouter.get(
  '/question-sets/:setId/questions',
  asyncHandler(async (req, res) => {
    res.json(await service.listQuestions(req.params.setId));
  }),
);

teacherRouter.post(
  '/question-sets/:setId/questions',
  validateBody(createQuestionSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createQuestion(req.params.setId, body<CreateQuestionInput>(req)));
  }),
);

teacherRouter.put(
  '/questions/:questionId',
  validateBody(updateQuestionSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateQuestion(req.params.questionId, body<UpdateQuestionInput>(req)));
  }),
);

teacherRouter.put(
  '/questions/:questionId/subskill',
  validateBody(updateSubSkillSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateQuestionSubSkill(req.params.questionId, body<UpdateSubSkillInput>(req)));
  }),
);

teacherRouter.delete(
  '/questions/:questionId',
  asyncHandler(async (req, res) => {
    const { retired } = await service.deleteQuestion(req.params.questionId);
    res.json({ ok: true, retired });
  }),
);

// ── Vocabulary bank ──────────────────────────────────────────────────────────

teacherRouter.get(
  '/vocab-words',
  asyncHandler(async (_req, res) => {
    res.json(await service.listVocabWords());
  }),
);

teacherRouter.post(
  '/vocab-words',
  validateBody(vocabWordSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createVocabWord(body<VocabWordInput>(req)));
  }),
);

teacherRouter.delete(
  '/vocab-words/:wordId',
  asyncHandler(async (req, res) => {
    await service.deleteVocabWord(req.params.wordId);
    res.json({ ok: true });
  }),
);
