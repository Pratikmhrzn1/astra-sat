import { Router } from 'express';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession, requireAccountRole, LEARNER_ROLES } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import * as vocab from './vocab.service';
import * as service from './word-bank.service';
import {
  appraiseLexiconRules,
  vocabWordRules,
  type ReviewLexiconPayload,
  type LexiconWordPayload,
} from './vocab.schemas';

/** Spaced-repetition review for students, and the word bank teachers maintain. */

export const lexiconStudentRoutes = Router();

lexiconStudentRoutes.use(requireSession, requireAccountRole(LEARNER_ROLES));

// ── Vocabulary ───────────────────────────────────────────────────────────────

lexiconStudentRoutes.get(
  '/vocab/due',
  wrapAsync(async (req, res) => {
    res.json(await vocab.loadDueItems(sessionUserId(req)));
  }),
);

lexiconStudentRoutes.post(
  '/vocab/:vocabId/review',
  checkBody(appraiseLexiconRules),
  wrapAsync(async (req, res) => {
    const { isCorrect } = validatedBody<ReviewLexiconPayload>(req);
    res.json(await vocab.appraiseQuestionWord(sessionUserId(req), req.params.vocabId, isCorrect));
  }),
);

lexiconStudentRoutes.post(
  '/vocab/teacher/:wordId/review',
  checkBody(appraiseLexiconRules),
  wrapAsync(async (req, res) => {
    const { isCorrect } = validatedBody<ReviewLexiconPayload>(req);
    res.json(await vocab.appraiseTeacherWord(sessionUserId(req), req.params.wordId, isCorrect));
  }),
);

export const lexiconTeacherRoutes = Router();

lexiconTeacherRoutes.use(requireSession, requireAccountRole(['teacher']));

// ── Vocabulary bank ──────────────────────────────────────────────────────────

lexiconTeacherRoutes.get(
  '/vocab-words',
  wrapAsync(async (_req, res) => {
    res.json(await service.collectLexiconWords());
  }),
);

lexiconTeacherRoutes.post(
  '/vocab-words',
  checkBody(vocabWordRules),
  wrapAsync(async (req, res) => {
    res.status(201).json(await service.addLexiconWord(validatedBody<LexiconWordPayload>(req)));
  }),
);

lexiconTeacherRoutes.delete(
  '/vocab-words/:wordId',
  wrapAsync(async (req, res) => {
    await service.removeLexiconWord(req.params.wordId);
    res.json({ ok: true });
  }),
);
