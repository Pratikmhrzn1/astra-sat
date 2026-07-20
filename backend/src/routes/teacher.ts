import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db';
import { users, questionSets, questions, passages, exams, examAnswers, feedback, teacherVocabWords } from '../db/schema';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(requireAuth, requireRole(['teacher']));

// ── Students ────────────────────────────────────────────────────────────────

router.get('/students', async (req, res) => {
  const teacherId = req.user!.sub;
  try {
    const students = await db
      .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
      .from(users)
      .where(and(eq(users.teacherId, teacherId), eq(users.role, 'student')));
    return res.json(students);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/students/:studentId/exams', async (req, res) => {
  const teacherId = req.user!.sub;
  const { studentId } = req.params;
  try {
    const studentRows = await db.select().from(users)
      .where(and(eq(users.id, studentId), eq(users.teacherId, teacherId))).limit(1);
    if (studentRows.length === 0) return res.status(404).json({ error: 'Student not found or not assigned to you' });
    const rows = await db
      .select({ id: exams.id, type: exams.type, status: exams.status, score: exams.score, totalQuestions: exams.totalQuestions, startedAt: exams.startedAt, completedAt: exams.completedAt, setTitle: questionSets.title, subject: questionSets.subject })
      .from(exams).innerJoin(questionSets, eq(exams.setId, questionSets.id))
      .where(eq(exams.studentId, studentId)).orderBy(desc(exams.startedAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/students/:studentId/exams/:examId/results', async (req, res) => {
  const teacherId = req.user!.sub;
  const { studentId, examId } = req.params;
  try {
    const studentRows = await db.select().from(users)
      .where(and(eq(users.id, studentId), eq(users.teacherId, teacherId))).limit(1);
    if (studentRows.length === 0) return res.status(404).json({ error: 'Student not found or not assigned to you' });
    const examRows = await db.select().from(exams)
      .where(and(eq(exams.id, examId), eq(exams.studentId, studentId))).limit(1);
    if (examRows.length === 0) return res.status(404).json({ error: 'Exam not found' });

    const exam = examRows[0];
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

    return res.json({ exam, set: setRows[0] || null, student: studentRows[0], results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Feedback ─────────────────────────────────────────────────────────────────

const sendFeedbackSchema = z.object({
  studentId: z.string().uuid(),
  examId: z.string().uuid().optional(),
  content: z.string().min(1, 'Feedback content is required').max(5000),
});

router.post('/feedback', validateBody(sendFeedbackSchema), async (req, res) => {
  const teacherId = req.user!.sub;
  const { studentId, examId, content } = req.body;
  try {
    const studentRows = await db.select().from(users)
      .where(and(eq(users.id, studentId), eq(users.teacherId, teacherId))).limit(1);
    if (studentRows.length === 0) return res.status(403).json({ error: 'Student not assigned to you' });
    const [fb] = await db.insert(feedback).values({ teacherId, studentId, examId: examId || null, content }).returning();
    return res.status(201).json(fb);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/feedback', async (req, res) => {
  const teacherId = req.user!.sub;
  try {
    const rows = await db
      .select({ id: feedback.id, content: feedback.content, isRead: feedback.isRead, createdAt: feedback.createdAt, examId: feedback.examId, studentName: users.name, studentEmail: users.email })
      .from(feedback).innerJoin(users, eq(feedback.studentId, users.id))
      .where(eq(feedback.teacherId, teacherId)).orderBy(desc(feedback.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Question Sets ─────────────────────────────────────────────────────────────

router.get('/question-sets', async (_req, res) => {
  try {
    const rows = await db.select().from(questionSets).orderBy(desc(questionSets.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const createSetSchema = z.object({
  title: z.string().min(1).max(255),
  subject: z.enum(['english', 'math']),
  description: z.string().max(2000).optional().default(''),
  difficulty: z.enum(['low', 'medium', 'hard']).nullable().optional(),
  isLiveExam: z.boolean().optional().default(false),
});

router.post('/question-sets', validateBody(createSetSchema), async (req, res) => {
  const teacherId = req.user!.sub;
  const { title, subject, description, difficulty, isLiveExam } = req.body;
  try {
    const [set] = await db.insert(questionSets).values({ title, subject, description, difficulty: difficulty ?? null, createdBy: teacherId, isDraft: true, isLiveExam: isLiveExam ?? false }).returning();
    return res.status(201).json(set);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const importJsonSchema = z.object({
  title: z.string().min(1).max(255),
  subject: z.enum(['english', 'math']),
  description: z.string().max(2000).optional().default(''),
  passages: z.array(z.object({
    title: z.string().max(255).optional().default(''),
    passageText: z.string().min(1),
    orderIndex: z.number().int().optional(),
  })).optional().default([]),
  questions: z.array(z.object({
    passageIndex: z.number().int().nullable().optional(),
    questionType: z.enum(['multiple_choice', 'student_produced_response']),
    questionText: z.string().min(1),
    subSkill: z.enum(['grammar', 'inference', 'command_of_evidence', 'vocab_in_context', 'transitions']).nullable().optional(),
    optionA: z.string().nullable().optional(),
    optionB: z.string().nullable().optional(),
    optionC: z.string().nullable().optional(),
    optionD: z.string().nullable().optional(),
    correctAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
    correctAnswerText: z.string().nullable().optional(),
    explanation: z.string().nullable().optional(),
    orderIndex: z.number().int().optional(),
  })).min(1, 'At least one question is required'),
});

router.post('/question-sets/import-json', validateBody(importJsonSchema), async (req, res) => {
  const teacherId = req.user!.sub;
  const { title, subject, description, passages: passagesData, questions: questionsData } = req.body;
  try {
    const [set] = await db.insert(questionSets)
      .values({ title, subject, description, createdBy: teacherId })
      .returning();

    const insertedPassageIds: string[] = [];
    for (let i = 0; i < passagesData.length; i++) {
      const p = passagesData[i];
      const [inserted] = await db.insert(passages).values({
        setId: set.id,
        title: p.title ?? '',
        passageText: p.passageText,
        orderIndex: p.orderIndex ?? i,
      }).returning({ id: passages.id });
      insertedPassageIds.push(inserted.id);
    }

    for (let i = 0; i < questionsData.length; i++) {
      const q = questionsData[i];
      const passageId = (q.passageIndex != null && insertedPassageIds[q.passageIndex])
        ? insertedPassageIds[q.passageIndex]
        : null;
      await db.insert(questions).values({
        setId: set.id,
        passageId,
        questionType: q.questionType,
        questionText: q.questionText,
        subSkill: (q.subSkill ?? null) as 'grammar' | 'inference' | 'command_of_evidence' | 'vocab_in_context' | 'transitions' | null,
        optionA: q.optionA ?? null,
        optionB: q.optionB ?? null,
        optionC: q.optionC ?? null,
        optionD: q.optionD ?? null,
        correctAnswer: (q.correctAnswer ?? null) as 'a' | 'b' | 'c' | 'd' | null,
        correctAnswerText: q.correctAnswerText ?? null,
        explanation: q.explanation ?? null,
        orderIndex: q.orderIndex ?? i,
      });
    }

    return res.status(201).json({
      set,
      questionCount: questionsData.length,
      passageCount: passagesData.length,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/question-sets/:setId', validateBody(createSetSchema.partial()), async (req, res) => {
  const { setId } = req.params;
  try {
    const setRows = await db.select().from(questionSets)
      .where(eq(questionSets.id, setId)).limit(1);
    if (setRows.length === 0) return res.status(404).json({ error: 'Question set not found' });
    const [updated] = await db.update(questionSets).set({ ...req.body, updatedAt: new Date() }).where(eq(questionSets.id, setId)).returning();
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/question-sets/:setId/publish', async (req, res) => {
  const { setId } = req.params;
  try {
    const setRows = await db.select().from(questionSets).where(eq(questionSets.id, setId)).limit(1);
    if (setRows.length === 0) return res.status(404).json({ error: 'Question set not found' });
    const [updated] = await db.update(questionSets)
      .set({ isDraft: false, updatedAt: new Date() })
      .where(eq(questionSets.id, setId))
      .returning();
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/question-sets/:setId', async (req, res) => {
  const { setId } = req.params;
  try {
    const setRows = await db.select().from(questionSets)
      .where(eq(questionSets.id, setId)).limit(1);
    if (setRows.length === 0) return res.status(404).json({ error: 'Question set not found' });
    const examUsage = await db.select({ id: exams.id }).from(exams).where(eq(exams.setId, setId)).limit(1);
    if (examUsage.length > 0) return res.status(400).json({ error: 'Cannot delete a set that has been used in exams' });
    await db.delete(questionSets).where(eq(questionSets.id, setId));
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Passages ──────────────────────────────────────────────────────────────────

async function assertSetExists(setId: string, res: any): Promise<boolean> {
  const rows = await db.select({ id: questionSets.id }).from(questionSets)
    .where(eq(questionSets.id, setId)).limit(1);
  if (rows.length === 0) { res.status(404).json({ error: 'Question set not found' }); return false; }
  return true;
}

router.get('/question-sets/:setId/passages', async (req, res) => {
  const { setId } = req.params;
  try {
    if (!(await assertSetExists(setId, res))) return;
    const rows = await db.select().from(passages)
      .where(eq(passages.setId, setId)).orderBy(passages.orderIndex);
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const createPassageSchema = z.object({
  title: z.string().max(255).optional().default(''),
  passageText: z.string().min(1, 'Passage text is required').max(20000),
  orderIndex: z.number().int().min(0).optional().default(0),
});

router.post('/question-sets/:setId/passages', validateBody(createPassageSchema), async (req, res) => {
  const { setId } = req.params;
  try {
    if (!(await assertSetExists(setId, res))) return;
    const [p] = await db.insert(passages).values({ setId, ...req.body }).returning();
    return res.status(201).json(p);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/passages/:passageId', validateBody(createPassageSchema.partial()), async (req, res) => {
  const { passageId } = req.params;
  try {
    const rows = await db.select({ id: passages.id }).from(passages)
      .where(eq(passages.id, passageId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Passage not found' });
    const [updated] = await db.update(passages).set(req.body).where(eq(passages.id, passageId)).returning();
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/passages/:passageId', async (req, res) => {
  const { passageId } = req.params;
  try {
    const rows = await db.select({ id: passages.id }).from(passages)
      .where(eq(passages.id, passageId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Passage not found' });
    await db.delete(passages).where(eq(passages.id, passageId));
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Questions ─────────────────────────────────────────────────────────────────

router.get('/question-sets/:setId/questions', async (req, res) => {
  const { setId } = req.params;
  try {
    if (!(await assertSetExists(setId, res))) return;
    const qs = await db.select().from(questions)
      .where(eq(questions.setId, setId)).orderBy(questions.orderIndex);
    return res.json(qs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const subSkillField = z
  .enum(['grammar', 'inference', 'command_of_evidence', 'vocab_in_context', 'transitions'])
  .nullable()
  .optional();

const createQuestionSchema = z.discriminatedUnion('questionType', [
  z.object({
    questionType: z.literal('multiple_choice'),
    passageId: z.string().uuid().nullable().optional(),
    subSkill: subSkillField,
    questionText: z.string().min(1, 'Question text is required'),
    optionA: z.string().min(1, 'Option A is required'),
    optionB: z.string().min(1, 'Option B is required'),
    optionC: z.string().min(1, 'Option C is required'),
    optionD: z.string().min(1, 'Option D is required'),
    correctAnswer: z.enum(['a', 'b', 'c', 'd']),
    explanation: z.string().optional().nullable(),
    orderIndex: z.number().int().min(0).default(0),
  }),
  z.object({
    questionType: z.literal('student_produced_response'),
    passageId: z.string().uuid().nullable().optional(),
    subSkill: subSkillField,
    questionText: z.string().min(1, 'Question text is required'),
    optionA: z.string().optional().nullable(),
    optionB: z.string().optional().nullable(),
    optionC: z.string().optional().nullable(),
    optionD: z.string().optional().nullable(),
    correctAnswer: z.enum(['a', 'b', 'c', 'd']).optional().nullable(),
    correctAnswerText: z.string().min(1, 'Correct answer is required for SPR'),
    explanation: z.string().optional().nullable(),
    orderIndex: z.number().int().min(0).default(0),
  }),
]);

router.post('/question-sets/:setId/questions', validateBody(createQuestionSchema), async (req, res) => {
  const { setId } = req.params;
  try {
    if (!(await assertSetExists(setId, res))) return;
    const values = {
      setId,
      ...req.body,
      // teacher-set tags are always human_confirmed
      subSkillSource: req.body.subSkill ? 'human_confirmed' : null,
    };
    const [q] = await db.insert(questions).values(values).returning();
    return res.status(201).json(q);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/questions/:questionId', async (req, res) => {
  const { questionId } = req.params;
  try {
    const qRows = await db.select({ id: questions.id }).from(questions)
      .where(eq(questions.id, questionId)).limit(1);
    if (qRows.length === 0) return res.status(404).json({ error: 'Question not found' });
    const [updated] = await db.update(questions).set(req.body).where(eq(questions.id, questionId)).returning();
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const updateSubSkillSchema = z.object({
  subSkill: z.enum(['grammar', 'inference', 'command_of_evidence', 'vocab_in_context', 'transitions']).nullable().optional(),
  subSkillSource: z.enum(['ai_suggested', 'human_confirmed']),
});

router.put('/questions/:questionId/subskill', validateBody(updateSubSkillSchema), async (req, res) => {
  const { questionId } = req.params;
  const { subSkill, subSkillSource } = req.body;
  try {
    const qRows = await db.select({ id: questions.id }).from(questions)
      .where(eq(questions.id, questionId)).limit(1);
    if (qRows.length === 0) return res.status(404).json({ error: 'Question not found' });
    const [updated] = await db
      .update(questions)
      .set({ subSkill: subSkill ?? null, subSkillSource })
      .where(eq(questions.id, questionId))
      .returning();
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/questions/:questionId', async (req, res) => {
  const { questionId } = req.params;
  try {
    const qRows = await db.select({ id: questions.id }).from(questions)
      .where(eq(questions.id, questionId)).limit(1);
    if (qRows.length === 0) return res.status(404).json({ error: 'Question not found' });
    await db.delete(questions).where(eq(questions.id, questionId));
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Teacher vocab word bank ────────────────────────────────────────────────────

const vocabWordSchema = z.object({
  word: z.string().min(1).max(100),
  definition: z.string().min(1).max(500),
  exampleSentence: z.string().max(500).optional(),
});

router.get('/vocab-words', async (_req, res) => {
  try {
    const rows = await db.select().from(teacherVocabWords).orderBy(desc(teacherVocabWords.createdAt));
    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/vocab-words', validateBody(vocabWordSchema), async (req, res) => {
  const { word, definition, exampleSentence } = req.body;
  try {
    const [row] = await db.insert(teacherVocabWords).values({
      word: word.trim(),
      definition: definition.trim(),
      exampleSentence: (exampleSentence ?? '').trim(),
    }).returning();
    return res.status(201).json(row);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/vocab-words/:wordId', async (req, res) => {
  try {
    const rows = await db.select({ id: teacherVocabWords.id })
      .from(teacherVocabWords).where(eq(teacherVocabWords.id, req.params.wordId)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: 'Word not found' });
    await db.delete(teacherVocabWords).where(eq(teacherVocabWords.id, req.params.wordId));
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
