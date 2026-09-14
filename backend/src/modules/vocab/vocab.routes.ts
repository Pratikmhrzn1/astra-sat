import { Router } from 'express';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth, requireRole } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
import * as vocab from './vocab.service';
import * as service from './word-bank.service';
import {
  reviewVocabSchema,
  vocabWordSchema,
  type ReviewVocabInput,
  type VocabWordInput,
} from './vocab.schemas';

/** Spaced-repetition review for students, and the word bank teachers maintain. */

export const vocabStudentRouter = Router();

vocabStudentRouter.use(requireAuth, requireRole(['student']));

// ── Vocabulary ───────────────────────────────────────────────────────────────

vocabStudentRouter.get(
  '/vocab/due',
  asyncHandler(async (req, res) => {
    res.json(await vocab.findDueItems(currentUserId(req)));
  }),
);

vocabStudentRouter.post(
  '/vocab/:vocabId/review',
  validateBody(reviewVocabSchema),
  asyncHandler(async (req, res) => {
    const { isCorrect } = body<ReviewVocabInput>(req);
    res.json(await vocab.reviewQuestionWord(currentUserId(req), req.params.vocabId, isCorrect));
  }),
);

vocabStudentRouter.post(
  '/vocab/teacher/:wordId/review',
  validateBody(reviewVocabSchema),
  asyncHandler(async (req, res) => {
    const { isCorrect } = body<ReviewVocabInput>(req);
    res.json(await vocab.reviewTeacherWord(currentUserId(req), req.params.wordId, isCorrect));
  }),
);

export const vocabTeacherRouter = Router();

vocabTeacherRouter.use(requireAuth, requireRole(['teacher']));

// ── Vocabulary bank ──────────────────────────────────────────────────────────

vocabTeacherRouter.get(
  '/vocab-words',
  asyncHandler(async (_req, res) => {
    res.json(await service.listVocabWords());
  }),
);

vocabTeacherRouter.post(
  '/vocab-words',
  validateBody(vocabWordSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.createVocabWord(body<VocabWordInput>(req)));
  }),
);

vocabTeacherRouter.delete(
  '/vocab-words/:wordId',
  asyncHandler(async (req, res) => {
    await service.deleteVocabWord(req.params.wordId);
    res.json({ ok: true });
  }),
);
