import { Router } from 'express';
import { z } from 'zod';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../db';
import { users, questionSets, questions, exams, examAnswers, mockTests, feedback } from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();
router.use(requireAuth, requireRole(['student']));

router.get('/question-sets', async (req, res) => {
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
    const setRows = await db
      .select()
      .from(questionSets)
      .where(eq(questionSets.id, req.params.setId))
      .limit(1);

    if (setRows.length === 0) {
      return res.status(404).json({ error: 'Question set not found' });
    }

    const qs = await db
      .select({
        id: questions.id,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        orderIndex: questions.orderIndex,
      })
      .from(questions)
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
    const setRows = await db
      .select()
      .from(questionSets)
      .where(eq(questionSets.id, setId))
      .limit(1);

    if (setRows.length === 0) {
      return res.status(404).json({ error: 'Question set not found' });
    }

    const qs = await db
      .select({
        id: questions.id,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        orderIndex: questions.orderIndex,
      })
      .from(questions)
      .where(eq(questions.setId, setId))
      .orderBy(questions.orderIndex);

    if (qs.length === 0) {
      return res.status(400).json({ error: 'This question set has no questions' });
    }

    const [exam] = await db
      .insert(exams)
      .values({ studentId, setId, type, totalQuestions: qs.length })
      .returning();

    await db.insert(examAnswers).values(
      qs.map((q) => ({ examId: exam.id, questionId: q.id }))
    );

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
      .select({
        id: exams.id,
        setId: exams.setId,
        type: exams.type,
        status: exams.status,
        score: exams.score,
        totalQuestions: exams.totalQuestions,
        startedAt: exams.startedAt,
        completedAt: exams.completedAt,
        setTitle: questionSets.title,
        subject: questionSets.subject,
      })
      .from(exams)
      .innerJoin(questionSets, eq(exams.setId, questionSets.id))
      .where(eq(exams.studentId, studentId))
      .orderBy(desc(exams.startedAt));

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams/:examId', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const examRows = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId)))
      .limit(1);

    if (examRows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const exam = examRows[0];

    const qs = await db
      .select({
        id: questions.id,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        orderIndex: questions.orderIndex,
      })
      .from(questions)
      .where(eq(questions.setId, exam.setId))
      .orderBy(questions.orderIndex);

    const answers = await db
      .select({
        questionId: examAnswers.questionId,
        selectedAnswer: examAnswers.selectedAnswer,
        answeredAt: examAnswers.answeredAt,
      })
      .from(examAnswers)
      .where(eq(examAnswers.examId, exam.id));

    return res.json({ exam, questions: qs, answers });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const saveAnswersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      selectedAnswer: z.enum(['a', 'b', 'c', 'd']).nullable(),
    })
  ),
  timeSpentSeconds: z.number().int().optional(),
});

router.put('/exams/:examId/answers', validateBody(saveAnswersSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { answers, timeSpentSeconds } = req.body;

  try {
    const examRows = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId)))
      .limit(1);

    if (examRows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    if (examRows[0].status === 'completed') {
      return res.status(400).json({ error: 'Exam already completed' });
    }

    for (const ans of answers) {
      await db
        .update(examAnswers)
        .set({
          selectedAnswer: ans.selectedAnswer,
          answeredAt: ans.selectedAnswer ? new Date() : null,
        })
        .where(
          and(
            eq(examAnswers.examId, req.params.examId),
            eq(examAnswers.questionId, ans.questionId)
          )
        );
    }

    if (timeSpentSeconds !== undefined) {
      await db
        .update(exams)
        .set({ timeSpentSeconds })
        .where(eq(exams.id, req.params.examId));
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

const submitSchema = z.object({
  timeSpentSeconds: z.number().int().optional(),
});

router.post('/exams/:examId/submit', validateBody(submitSchema), async (req, res) => {
  const studentId = req.user!.sub;
  const { timeSpentSeconds } = req.body;

  try {
    const examRows = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId)))
      .limit(1);

    if (examRows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const exam = examRows[0];

    if (exam.status === 'completed') {
      return res.status(400).json({ error: 'Exam already completed' });
    }

    const answersWithQuestions = await db
      .select({
        answerId: examAnswers.id,
        questionId: examAnswers.questionId,
        selectedAnswer: examAnswers.selectedAnswer,
        correctAnswer: questions.correctAnswer,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(eq(examAnswers.examId, exam.id));

    let score = 0;
    for (const row of answersWithQuestions) {
      const isCorrect = row.selectedAnswer === row.correctAnswer;
      if (isCorrect) score++;
      await db
        .update(examAnswers)
        .set({ isCorrect, answeredAt: row.selectedAnswer ? new Date() : null })
        .where(eq(examAnswers.id, row.answerId));
    }

    const [updated] = await db
      .update(exams)
      .set({
        status: 'completed',
        score,
        completedAt: new Date(),
        timeSpentSeconds: timeSpentSeconds ?? exam.timeSpentSeconds,
      })
      .where(eq(exams.id, exam.id))
      .returning();

    const percentage = Math.round((score / exam.totalQuestions) * 100);

    return res.json({
      score,
      total: exam.totalQuestions,
      percentage,
      exam: updated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/exams/:examId/results', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const examRows = await db
      .select()
      .from(exams)
      .where(and(eq(exams.id, req.params.examId), eq(exams.studentId, studentId)))
      .limit(1);

    if (examRows.length === 0) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    const exam = examRows[0];

    if (exam.status !== 'completed') {
      return res.status(400).json({ error: 'Exam not yet completed' });
    }

    const results = await db
      .select({
        questionId: questions.id,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        correctAnswer: questions.correctAnswer,
        explanation: questions.explanation,
        selectedAnswer: examAnswers.selectedAnswer,
        isCorrect: examAnswers.isCorrect,
        orderIndex: questions.orderIndex,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(eq(examAnswers.examId, exam.id))
      .orderBy(questions.orderIndex);

    const setRows = await db
      .select({ title: questionSets.title, subject: questionSets.subject })
      .from(questionSets)
      .where(eq(questionSets.id, exam.setId))
      .limit(1);

    return res.json({ exam, set: setRows[0] || null, results });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/mock-tests', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const englishSetRows = await db.execute(
      sql`SELECT id FROM question_sets WHERE subject = 'english' ORDER BY RANDOM() LIMIT 1`
    );

    const mathSetRows = await db.execute(
      sql`SELECT id FROM question_sets WHERE subject = 'math' ORDER BY RANDOM() LIMIT 1`
    );

    if (englishSetRows.rows.length === 0) {
      return res.status(400).json({ error: 'No English question sets available' });
    }
    if (mathSetRows.rows.length === 0) {
      return res.status(400).json({ error: 'No Math question sets available' });
    }

    const englishSetId = (englishSetRows.rows[0] as any).id;
    const mathSetId = (mathSetRows.rows[0] as any).id;

    const englishQs = await db
      .select({
        id: questions.id,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        orderIndex: questions.orderIndex,
      })
      .from(questions)
      .where(eq(questions.setId, englishSetId))
      .orderBy(questions.orderIndex);

    const mathQs = await db
      .select({
        id: questions.id,
        questionText: questions.questionText,
        optionA: questions.optionA,
        optionB: questions.optionB,
        optionC: questions.optionC,
        optionD: questions.optionD,
        orderIndex: questions.orderIndex,
      })
      .from(questions)
      .where(eq(questions.setId, mathSetId))
      .orderBy(questions.orderIndex);

    const [englishExam] = await db
      .insert(exams)
      .values({ studentId, setId: englishSetId, type: 'mock_english', totalQuestions: englishQs.length })
      .returning();

    const [mathExam] = await db
      .insert(exams)
      .values({ studentId, setId: mathSetId, type: 'mock_math', totalQuestions: mathQs.length })
      .returning();

    if (englishQs.length > 0) {
      await db.insert(examAnswers).values(englishQs.map((q) => ({ examId: englishExam.id, questionId: q.id })));
    }
    if (mathQs.length > 0) {
      await db.insert(examAnswers).values(mathQs.map((q) => ({ examId: mathExam.id, questionId: q.id })));
    }

    const [mockTest] = await db
      .insert(mockTests)
      .values({ studentId, englishExamId: englishExam.id, mathExamId: mathExam.id })
      .returning();

    return res.status(201).json({
      mockTest,
      englishExam,
      mathExam,
      englishQuestions: englishQs,
      mathQuestions: mathQs,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mock-tests', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db
      .select()
      .from(mockTests)
      .where(eq(mockTests.studentId, studentId))
      .orderBy(desc(mockTests.startedAt));

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/mock-tests/:mockTestId', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const mtRows = await db
      .select()
      .from(mockTests)
      .where(and(eq(mockTests.id, req.params.mockTestId), eq(mockTests.studentId, studentId)))
      .limit(1);

    if (mtRows.length === 0) {
      return res.status(404).json({ error: 'Mock test not found' });
    }

    const mt = mtRows[0];

    let englishExam = null;
    let mathExam = null;

    if (mt.englishExamId) {
      const rows = await db.select().from(exams).where(eq(exams.id, mt.englishExamId)).limit(1);
      englishExam = rows[0] || null;
    }

    if (mt.mathExamId) {
      const rows = await db.select().from(exams).where(eq(exams.id, mt.mathExamId)).limit(1);
      mathExam = rows[0] || null;
    }

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
      .select({
        id: feedback.id,
        content: feedback.content,
        isRead: feedback.isRead,
        createdAt: feedback.createdAt,
        readAt: feedback.readAt,
        examId: feedback.examId,
        teacherName: users.name,
        teacherEmail: users.email,
      })
      .from(feedback)
      .innerJoin(users, eq(feedback.teacherId, users.id))
      .where(eq(feedback.studentId, studentId))
      .orderBy(desc(feedback.createdAt));

    return res.json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/feedback/:feedbackId/read', async (req, res) => {
  const studentId = req.user!.sub;
  try {
    const rows = await db
      .update(feedback)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(feedback.id, req.params.feedbackId), eq(feedback.studentId, studentId)))
      .returning();

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
