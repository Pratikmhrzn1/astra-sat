import { desc, eq, and, sql } from 'drizzle-orm';
import { db } from '../../db';
import { exams, mockTests } from '../../db/schema';
import { badRequest, notFound } from '../../http/errors';
import * as repo from './student.repository';

/**
 * Adaptive mock tests.
 *
 * A mock is four exams chained through one `mock_tests` row: English M1, Math
 * M1, then a Module 2 for each whose difficulty depends on how the student did
 * in Module 1. That mirrors the Digital SAT, where the second module of each
 * section adapts to the first.
 */

/** At or above this share of Module 1 correct, Module 2 steps up to hard. */
const HARD_MODULE_THRESHOLD = 0.6;

type Subject = 'english' | 'math';

/**
 * Picks a random eligible set, trying each filter in turn.
 *
 * Selection is random rather than sequential so two students starting a mock
 * together do not sit the same paper. Drafts and live-exam sets are never
 * eligible. The fallbacks matter operationally: a deployment that has not
 * authored a `hard` English set should still be able to run a mock, one tier
 * off, rather than failing at the module boundary.
 */
async function pickRandomSetId(options: {
  subject: Subject;
  difficulty?: string;
  excludeSetId?: string;
}): Promise<string | null> {
  const conditions = [
    sql`subject = ${options.subject}`,
    sql`is_draft = false`,
    sql`is_live_exam = false`,
  ];
  if (options.difficulty) conditions.push(sql`difficulty = ${options.difficulty}`);
  if (options.excludeSetId) conditions.push(sql`id != ${options.excludeSetId}`);

  const result = await db.execute(
    sql`SELECT id FROM question_sets WHERE ${sql.join(conditions, sql` AND `)} ORDER BY RANDOM() LIMIT 1`,
  );
  const row = result.rows[0] as { id: string } | undefined;
  return row?.id ?? null;
}

async function pickModule1Set(subject: Subject): Promise<string> {
  // Everyone starts at the same difficulty; that is what makes Module 1 a fair
  // measurement to adapt from.
  const setId =
    (await pickRandomSetId({ subject, difficulty: 'medium' })) ?? (await pickRandomSetId({ subject }));

  if (!setId) {
    const label = subject === 'english' ? 'English' : 'Math';
    throw badRequest(`No ${label} question sets available`);
  }
  return setId;
}

async function createSectionExam(studentId: string, setId: string, subject: Subject) {
  const questionRows = await repo.findQuestionsForSet(setId);
  if (questionRows.length === 0) {
    const label = subject === 'english' ? 'English Module 1' : 'Math Module 1';
    throw badRequest(`${label} set has no questions`);
  }

  const exam = await repo.createExamWithAnswerSheet({
    studentId,
    setId,
    type: subject === 'english' ? 'mock_english' : 'mock_math',
    questionIds: questionRows.map((q) => q.id),
  });

  return { exam, questions: repo.withPublicImageUrls(questionRows) };
}

export async function startMockTest(studentId: string) {
  const [englishSetId, mathSetId] = await Promise.all([
    pickModule1Set('english'),
    pickModule1Set('math'),
  ]);

  const english = await createSectionExam(studentId, englishSetId, 'english');
  const math = await createSectionExam(studentId, mathSetId, 'math');

  const [mockTest] = await db
    .insert(mockTests)
    .values({ studentId, englishExamId: english.exam.id, mathExamId: math.exam.id })
    .returning();

  return {
    mockTest,
    englishExam: english.exam,
    mathExam: math.exam,
    englishQuestions: english.questions,
    mathQuestions: math.questions,
  };
}

/**
 * Hands out the Module 2 that follows a submitted Module 1.
 *
 * Idempotent by design: the client calls this during a section transition, and
 * a reload or double submit there must not create a second Module 2 or move the
 * student to a different paper. If one already exists it is returned as-is.
 */
export async function startNextModule(studentId: string, mockTestId: string, submittedExamId: string) {
  const [mockTest] = await db
    .select()
    .from(mockTests)
    .where(and(eq(mockTests.id, mockTestId), eq(mockTests.studentId, studentId)))
    .limit(1);
  if (!mockTest) throw notFound('Mock test not found');

  const isEnglish = mockTest.englishExamId === submittedExamId;
  const isMath = mockTest.mathExamId === submittedExamId;
  if (!isEnglish && !isMath) throw badRequest('Exam does not belong to this mock test');

  const existingM2Id = isEnglish ? mockTest.englishM2ExamId : mockTest.mathM2ExamId;
  if (existingM2Id) {
    const [existing] = await db.select().from(exams).where(eq(exams.id, existingM2Id)).limit(1);
    if (existing) {
      const questionRows = await repo.findQuestionsForExam(existing.id);
      return { m2ExamId: existingM2Id, m2Questions: repo.withPublicImageUrls(questionRows) };
    }
  }

  const module1 = await repo.findOwnedExam(submittedExamId, studentId);
  if (!module1) throw notFound('M1 exam not found');
  // The score is the whole input to the adaptive decision, so Module 1 has to
  // be graded before Module 2 can be chosen.
  if (module1.status !== 'completed') throw badRequest('M1 exam not yet submitted');

  const ratio = module1.totalQuestions > 0 ? (module1.score ?? 0) / module1.totalQuestions : 0;
  const difficulty = ratio >= HARD_MODULE_THRESHOLD ? 'hard' : 'low';
  const subject: Subject = isEnglish ? 'english' : 'math';

  const setId =
    // Prefer a set at the chosen difficulty that the student has not just sat.
    (await pickRandomSetId({ subject, difficulty, excludeSetId: module1.setId ?? undefined })) ??
    (await pickRandomSetId({ subject, difficulty })) ??
    (await pickRandomSetId({ subject, excludeSetId: module1.setId ?? undefined }));

  if (!setId) {
    throw badRequest(`No ${subject} Module 2 question set available`);
  }

  const questionRows = await repo.findQuestionsForSet(setId);
  if (questionRows.length === 0) throw badRequest('Module 2 set has no questions');

  const module2 = await repo.createExamWithAnswerSheet({
    studentId,
    setId,
    type: isEnglish ? 'mock_english' : 'mock_math',
    questionIds: questionRows.map((q) => q.id),
  });

  if (isEnglish) {
    await db
      .update(mockTests)
      .set({ englishM2ExamId: module2.id })
      .where(eq(mockTests.id, mockTestId));
  } else {
    // Math Module 2 is the last section, so issuing it completes the mock.
    await db
      .update(mockTests)
      .set({ mathM2ExamId: module2.id, status: 'completed', completedAt: new Date() })
      .where(eq(mockTests.id, mockTestId));
  }

  return {
    m2ExamId: module2.id,
    m2Questions: repo.withPublicImageUrls(questionRows),
    m2Difficulty: difficulty,
    percentage: Math.round(ratio * 100),
  };
}

export async function listMockTests(studentId: string) {
  return db
    .select()
    .from(mockTests)
    .where(eq(mockTests.studentId, studentId))
    .orderBy(desc(mockTests.startedAt));
}

export async function getMockTest(studentId: string, mockTestId: string) {
  const [mockTest] = await db
    .select()
    .from(mockTests)
    .where(and(eq(mockTests.id, mockTestId), eq(mockTests.studentId, studentId)))
    .limit(1);
  if (!mockTest) throw notFound('Mock test not found');

  const [englishExam, mathExam] = await Promise.all([
    findExamOrNull(mockTest.englishExamId),
    findExamOrNull(mockTest.mathExamId),
  ]);

  return { mockTest, englishExam, mathExam };
}

async function findExamOrNull(examId: string | null) {
  if (!examId) return null;
  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  return exam ?? null;
}
