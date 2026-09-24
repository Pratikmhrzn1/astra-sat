import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
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

vocabStudentRouter.use(requireSession, requireAccountRole(['student']));

// ── Vocabulary ───────────────────────────────────────────────────────────────

vocabStudentRouter.get(
  '/vocab/due',
  wrapAsync(async (req, res) => {
    res.json(await vocab.findDueItems(sessionUserId(req)));
  }),
);

vocabStudentRouter.post(
  '/vocab/:vocabId/review',
  checkBody(reviewVocabSchema),
  wrapAsync(async (req, res) => {
    const { isCorrect } = validatedBody<ReviewVocabInput>(req);
    res.json(await vocab.reviewQuestionWord(sessionUserId(req), req.params.vocabId, isCorrect));
  }),
);

vocabStudentRouter.post(
  '/vocab/teacher/:wordId/review',
  checkBody(reviewVocabSchema),
  wrapAsync(async (req, res) => {
    const { isCorrect } = validatedBody<ReviewVocabInput>(req);
    res.json(await vocab.reviewTeacherWord(sessionUserId(req), req.params.wordId, isCorrect));
  }),
);

export const vocabTeacherRouter = Router();

vocabTeacherRouter.use(requireSession, requireAccountRole(['teacher']));

// ── Vocabulary bank ──────────────────────────────────────────────────────────

vocabTeacherRouter.get(
  '/vocab-words',
  wrapAsync(async (_req, res) => {
    res.json(await service.listVocabWords());
  }),
);

vocabTeacherRouter.post(
  '/vocab-words',
  checkBody(vocabWordSchema),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.createVocabWord(validatedBody<VocabWordInput>(req)));
  }),
);

vocabTeacherRouter.delete(
  '/vocab-words/:wordId',
  wrapAsync(async (req, res) => {
    await service.deleteVocabWord(req.params.wordId);
    res.json({ ok: true });
  }),
);
