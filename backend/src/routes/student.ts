import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql, desc } from 'drizzle-orm';
import { db } from '../db';
import { users, questionSets, questions, passages, exams, examAnswers, aiFeedback, mockTests, feedback } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  FeedbackContext,
  FeedbackType,
  getApplicableFeedbackTypes,
  orchestrateConfirmFeedback,
} from '../services/aiClient';

const router = Router();
router.use(requireAuth, requireRole(['student']));

// Parse a fraction or decimal string to a number for SPR comparison
function parseSPRValue(s: string): number | null {
  const t = s.trim();
  const frac = t.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const den = parseInt(frac[2]);
    return den === 0 ? null : parseInt(frac[1]) / den;
  }
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function sprIsCorrect(student: string, correct: string): boolean {
  if (student.trim().toLowerCase() === correct.trim().toLowerCase()) return true;
  const sv = parseSPRValue(student);
  const cv = parseSPRValue(correct);
  if (sv !== null && cv !== null) return Math.abs(sv - cv) < 0.001;
  return false;
}

// Question fields returned to the student (no correct answer revealed)
const questionSelect = {
  id: questions.id,
  questionType: questions.questionType,
  questionText: questions.questionText,
  optionA: questions.optionA,
  optionB: questions.optionB,
  optionC: questions.optionC,
  optionD: questions.optionD,
  passageId: questions.passageId,
  passageText: passages.passageText,
  passageTitle: passages.title,
  orderIndex: questions.orderIndex,
};

router.get('/question-sets', async (_req, res) => {
  try {
    const sets = await db
      .select({
        id: questionSets.id,
        title: questionSets.title,
        subject: questionSets.subject,
        description: questionSets.description,
        createdAt: questionSets.createdAt,
        questionCount: sql<number>`(SELECT COUNT(*) FROM questions WHERE questions.set_id = question_sets.id)::int`,
      })
      .from(questionSets)
      .orderBy(desc(questionSets.createdAt));
    return res.json(sets);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/question-sets/:setId', async (req, res) => {
  try {
    const setRows = await db.select().from(questionSets)
      .where(eq(questionSets.id, req.params.setId)).limit(1);
    if (setRows.length === 0) return res.status(404).json({ error: 'Question set not found' });
    const qs = await db
      .select(questionSelect)
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, req.params.setId))
      .orderBy(questions.orderIndex);
    return res.json({ ...setRows[0], questions: qs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const startExamSchema = z.object({
  setId: z.string().uuid('Invalid set ID'),
  type: z.enum(['individual']).default('individual'),
});

router.post('/exams', validateBody(startExamSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { setId, type } = req.body;
  try {
    const setRows = await db.select().from(questionSets).where(eq(questionSets.id, setId)).limit(1);
    if (setRows.length === 0) return res.status(404).json({ error: 'Question set not found' });

    const qs = await db
      .select(questionSelect)
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, setId))
      .orderBy(questions.orderIndex);

    if (qs.length === 0) return res.status(400).json({ error: 'This question set has no questions' });

    const [exam] = await db.insert(exams).values({ studentId, setId, type, totalQuestions: qs.length }).returning();
    await db.insert(examAnswers).values(qs.map((q) => ({ examId: exam.id, questionId: q.id })));
    return res.status(201).json({ exam, questions: qs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db
      .select({ id: exams.id, setId: exams.setId, type: exams.type, status: exams.status, score: exams.score, totalQuestions: exams.totalQuestions, startedAt: exams.startedAt, completedAt: exams.completedAt, setTitle: questionSets.title, subject: questionSets.subject })
      .from(exams).innerJoin(questionSets, eq(exams.setId, questionSets.id))
      .where(eq(exams.studentId, studentId)).orderBy(desc(exams.startedAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams/:examId', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const exam = examRows[0];
    const qs = await db
      .select(questionSelect)
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, exam.setId))
      .orderBy(questions.orderIndex);

    const answers = await db
      .select({ questionId: examAnswers.questionId, selectedAnswer: examAnswers.selectedAnswer, selectedAnswerText: examAnswers.selectedAnswerText, answeredAt: examAnswers.answeredAt })
      .from(examAnswers).where(eq(examAnswers.examId, exam.id));

    return res.json({ exam, questions: qs, answers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const saveAnswersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    selectedAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
    selectedAnswerText: z.string().max(200).nullable().optional(),
  })),
  timeSpentSeconds: z.number().int().optional(),
});

router.put('/exams/:examId/answers', validateBody(saveAnswersSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { answers, timeSpentSeconds } = req.body;
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    if (examRows[0].status === 'completed') return res.status(400).json({ error: 'Exam already completed' });

    for (const ans of answers) {
      const hasAnswer = ans.selectedAnswer != null || (ans.selectedAnswerText && ans.selectedAnswerText.trim() !== '');
      await db.update(examAnswers).set({
        selectedAnswer: ans.selectedAnswer ?? null,
        selectedAnswerText: ans.selectedAnswerText ?? null,
        answeredAt: hasAnswer ? new Date() : null,
      }).where(and(eq(examAnswers.examId, req.params.examId), eq(examAnswers.questionId, ans.questionId)));
    }

    if (timeSpentSeconds !== undefined) {
      await db.update(exams).set({ timeSpentSeconds }).where(eq(exams.id, req.params.examId));
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Practice mode: per-question confirm ──────────────────────────────────────

const confirmSchema = z.object({
  selectedAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
  selectedAnswerText: z.string().max(200).nullable().optional(),
  confidence: z.enum(['sure', 'eliminated', 'guessed']),
  reasoning: z.string().max(1000).optional(),
});

router.post('/exams/:examId/questions/:questionId/confirm', validateBody(confirmSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { examId, questionId } = req.params;
  const { selectedAnswer, selectedAnswerText, confidence, reasoning } = req.body;

  try {
    // Verify exam belongs to student and is practice mode only
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRows[0];
    if (exam.status === 'completed') return res.status(400).json({ error: 'Exam already completed' });
    if (exam.type !== 'individual') return res.status(400).json({ error: 'Confirm is only available in practice mode' });

    // Fetch question with passage and set subject — both needed for trap_explainer routing
    const qRows = await db
      .select({
        id: questions.id,
        questionType: questions.questionType,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        correctAnswer: questions.correctAnswer,
        correctAnswerText: questions.correctAnswerText,
        subSkill: questions.subSkill,
        passageText: passages.passageText,
        subject: questionSets.subject,
      })
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .innerJoin(questionSets, eq(questions.setId, questionSets.id))
      .where(and(eq(questions.id, questionId), eq(questions.setId, exam.setId)))
      .limit(1);
    if (qRows.length === 0) return res.status(404).json({ error: 'Question not found' });
    const q = qRows[0];

    // Get the examAnswer row
    const answerRows = await db.select().from(examAnswers)
      .where(and(eq(examAnswers.examId, examId), eq(examAnswers.questionId, questionId))).limit(1);
    if (answerRows.length === 0) return res.status(404).json({ error: 'Answer record not found' });
    const answerRow = answerRows[0];

    // Write the answer (confirm is authoritative — overrides any autosave)
    const hasAnswer = selectedAnswer != null || (selectedAnswerText && selectedAnswerText.trim() !== '');
    await db.update(examAnswers).set({
      selectedAnswer: selectedAnswer ?? null,
      selectedAnswerText: selectedAnswerText ?? null,
      answeredAt: hasAnswer ? new Date() : null,
    }).where(eq(examAnswers.id, answerRow.id));

    // Score immediately — same deterministic logic as final submit
    let isCorrect: boolean;
    if (q.questionType === 'student_produced_response') {
      isCorrect = selectedAnswerText ? sprIsCorrect(selectedAnswerText, q.correctAnswerText ?? '') : false;
    } else {
      isCorrect = selectedAnswer != null && selectedAnswer === q.correctAnswer;
    }
    await db.update(examAnswers).set({ isCorrect }).where(eq(examAnswers.id, answerRow.id));

    // Build the feedback context once — shared by all prompt builders
    const ctx: FeedbackContext = {
      questionText: q.questionText,
      questionType: q.questionType,
      subSkill: q.subSkill ?? null,
      subject: q.subject,
      optionA: q.optionA,
      optionB: q.optionB,
      optionC: q.optionC,
      optionD: q.optionD,
      correctAnswer: q.correctAnswer ?? null,
      correctAnswerText: q.correctAnswerText ?? null,
      selectedAnswer: selectedAnswer ?? null,
      selectedAnswerText: selectedAnswerText ?? null,
      isCorrect,
      confidence,
      reasoning: reasoning ?? null,
      passageText: q.passageText ?? null,
    };

    // Determine which types apply for this question+answer combination
    const applicableTypes = getApplicableFeedbackTypes(ctx);

    // Check cache for all applicable types in one query
    const cachedRows = await db
      .select({ feedbackType: aiFeedback.feedbackType, content: aiFeedback.content })
      .from(aiFeedback)
      .where(eq(aiFeedback.examAnswerId, answerRow.id));
    const cachedByType = new Map<string, unknown>(cachedRows.map((r) => [r.feedbackType, r.content]));

    // Only fire AI for types not already in cache
    const uncachedTypes = applicableTypes.filter((t) => !cachedByType.has(t)) as FeedbackType[];

    if (uncachedTypes.length > 0) {
      // All uncached calls run in parallel — Promise.all, not sequential awaits
      const results = await orchestrateConfirmFeedback(ctx, uncachedTypes);

      // Write each successful result independently; failures are already caught inside orchestrateConfirmFeedback
      await Promise.all(
        results
          .filter((r) => r.aiResult !== null)
          .map((r) =>
            db.insert(aiFeedback).values({
              examAnswerId: answerRow.id,
              feedbackType: r.feedbackType as FeedbackType,
              content: r.aiResult!.parsed as Record<string, unknown>,
              modelUsed: r.aiResult!.modelUsed,
              latencyMs: r.aiResult!.latencyMs,
              promptTokens: r.aiResult!.promptTokens,
              completionTokens: r.aiResult!.completionTokens,
              costUsd: String(r.aiResult!.costUsd),
              parseFailed: r.aiResult!.parseFailed,
            }),
          ),
      );

      // Merge new results into the cache map for response building
      for (const r of results) {
        if (r.aiResult) cachedByType.set(r.feedbackType, r.aiResult.parsed);
      }
    }

    // Build response — only applicable types, null for any that failed
    const feedbacks: Record<string, unknown> = {};
    for (const t of applicableTypes) {
      feedbacks[t] = cachedByType.get(t) ?? null;
    }

    return res.json({ isCorrect, feedbacks });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const submitSchema = z.object({ timeSpentSeconds: z.number().int().optional() });

router.post('/exams/:examId/submit', validateBody(submitSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { timeSpentSeconds } = req.body;
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRows[0];
    if (exam.status === 'completed') return res.status(400).json({ error: 'Exam already completed' });

    const answersWithQuestions = await db
      .select({
        answerId: examAnswers.id,
        questionType: questions.questionType,
        selectedAnswer: examAnswers.selectedAnswer,
        selectedAnswerText: examAnswers.selectedAnswerText,
        correctAnswer: questions.correctAnswer,
        correctAnswerText: questions.correctAnswerText,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(eq(examAnswers.examId, exam.id));

    let score = 0;
    for (const row of answersWithQuestions) {
      let isCorrect: boolean;
      if (row.questionType === 'student_produced_response') {
        isCorrect = row.selectedAnswerText
          ? sprIsCorrect(row.selectedAnswerText, row.correctAnswerText ?? '')
          : false;
      } else {
        isCorrect = row.selectedAnswer !== null && row.selectedAnswer === row.correctAnswer;
      }
      if (isCorrect) score++;
      const hasAnswer = row.selectedAnswer != null || (row.selectedAnswerText && row.selectedAnswerText.trim() !== '');
      await db.update(examAnswers).set({ isCorrect, answeredAt: hasAnswer ? new Date() : null })
        .where(eq(examAnswers.id, row.answerId));
    }

    const [updated] = await db.update(exams).set({
      status: 'completed', score, completedAt: new Date(),
      timeSpentSeconds: timeSpentSeconds ?? exam.timeSpentSeconds,
    }).where(eq(exams.id, exam.id)).returning();

    return res.json({ score, total: exam.totalQuestions, percentage: Math.round((score / exam.totalQuestions) * 100), exam: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams/:examId/results', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });
    const exam = examRows[0];
    if (exam.status !== 'completed') return res.status(400).json({ error: 'Exam not yet completed' });

    const results = await db
      .select({
        questionId: questions.id,
        questionType: questions.questionType,
        questionText: questions.questionText,
        optionA: questions.optionA, optionB: questions.optionB, optionC: questions.optionC, optionD: questions.optionD,
        correctAnswer: questions.correctAnswer,
        correctAnswerText: questions.correctAnswerText,
        explanation: questions.explanation,
        selectedAnswer: examAnswers.selectedAnswer,
        selectedAnswerText: examAnswers.selectedAnswerText,
        isCorrect: examAnswers.isCorrect,
        orderIndex: questions.orderIndex,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(eq(examAnswers.examId, exam.id))
      .orderBy(questions.orderIndex);

    const setRows = await db.select({ title: questionSets.title, subject: questionSets.subject })
      .from(questionSets).where(eq(questionSets.id, exam.setId)).limit(1);

    return res.json({ exam, set: setRows[0] || null, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/mock-tests', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const englishSetRows = await db.execute(sql`SELECT id FROM question_sets WHERE subject = 'english' ORDER BY RANDOM() LIMIT 1`);
    const mathSetRows = await db.execute(sql`SELECT id FROM question_sets WHERE subject = 'math' ORDER BY RANDOM() LIMIT 1`);
    if (englishSetRows.rows.length === 0) return res.status(400).json({ error: 'No English question sets available' });
    if (mathSetRows.rows.length === 0) return res.status(400).json({ error: 'No Math question sets available' });

    const englishSetId = (englishSetRows.rows[0] as any).id;
    const mathSetId = (mathSetRows.rows[0] as any).id;

    const englishQs = await db.select(questionSelect).from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, englishSetId)).orderBy(questions.orderIndex);
    const mathQs = await db.select(questionSelect).from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.setId, mathSetId)).orderBy(questions.orderIndex);

    const [englishExam] = await db.insert(exams).values({ studentId, setId: englishSetId, type: 'mock_english', totalQuestions: englishQs.length }).returning();
    const [mathExam] = await db.insert(exams).values({ studentId, setId: mathSetId, type: 'mock_math', totalQuestions: mathQs.length }).returning();
    if (englishQs.length > 0) await db.insert(examAnswers).values(englishQs.map((q) => ({ examId: englishExam.id, questionId: q.id })));
    if (mathQs.length > 0) await db.insert(examAnswers).values(mathQs.map((q) => ({ examId: mathExam.id, questionId: q.id })));

    const [mockTest] = await db.insert(mockTests).values({ studentId, englishExamId: englishExam.id, mathExamId: mathExam.id }).returning();
    return res.status(201).json({ mockTest, englishExam, mathExam, englishQuestions: englishQs, mathQuestions: mathQs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mock-tests', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db.select().from(mockTests).where(eq(mockTests.studentId, studentId)).orderBy(desc(mockTests.startedAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mock-tests/:mockTestId', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const mtRows = await db.select().from(mockTests)
      .where(and(eq(mockTests.id, req.params.mockTestId), eq(mockTests.studentId, studentId))).limit(1);
    if (mtRows.length === 0) return res.status(404).json({ error: 'Mock test not found' });
    const mt = mtRows[0];
    let englishExam = null;
    let mathExam = null;
    if (mt.englishExamId) { const r = await db.select().from(exams).where(eq(exams.id, mt.englishExamId)).limit(1); englishExam = r[0] || null; }
    if (mt.mathExamId) { const r = await db.select().from(exams).where(eq(exams.id, mt.mathExamId)).limit(1); mathExam = r[0] || null; }
    return res.json({ mockTest: mt, englishExam, mathExam });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/feedback', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db
      .select({ id: feedback.id, content: feedback.content, isRead: feedback.isRead, createdAt: feedback.createdAt, readAt: feedback.readAt, examId: feedback.examId, teacherName: users.name, teacherEmail: users.email })
      .from(feedback).innerJoin(users, eq(feedback.teacherId, users.id))
      .where(eq(feedback.studentId, studentId)).orderBy(desc(feedback.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/feedback/:feedbackId/read', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db.update(feedback).set({ isRead: true, readAt: new Date() })
      .where(and(eq(feedback.id, req.params.feedbackId), eq(feedback.studentId, studentId))).returning();
    if (rows.length === 0) return res.status(404).json({ error: 'Feedback not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
