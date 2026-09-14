import { desc, eq, and, inArray, or, sql } from 'drizzle-orm';
import { db } from '../../core/db';
import { exams, mockTests, questionSets } from '../../core/db/schema';
import { badRequest, notFound } from '../../core/errors';
import {
  MOCK_MODULE_LIMIT_SECONDS,
  createExamWithAnswerSheet,
  examRepository as repo,
  pathFromModuleDifficulty,
  toSectionScore,
  toTotalScore,
} from '../exams';

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
    sql`archived_at IS NULL`,
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

  const exam = await createExamWithAnswerSheet({
    studentId,
    setId,
    type: subject === 'english' ? 'mock_english' : 'mock_math',
    questionIds: questionRows.map((q) => q.id),
    timeLimitSeconds: MOCK_MODULE_LIMIT_SECONDS[subject],
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

  const module2 = await createExamWithAnswerSheet({
    studentId,
    setId,
    type: isEnglish ? 'mock_english' : 'mock_math',
    questionIds: questionRows.map((q) => q.id),
    timeLimitSeconds: MOCK_MODULE_LIMIT_SECONDS[subject],
  });

  // Issuing a module only records which exam it is. Completion belongs to the
  // submit path: marking the mock `completed` here meant it was complete the
  // instant Math Module 2 was *handed out*, so a student who abandoned it still
  // counted as having sat the mock — and there was no point in the lifecycle
  // left at which a composite score could be computed.
  await db
    .update(mockTests)
    .set(isEnglish ? { englishM2ExamId: module2.id } : { mathM2ExamId: module2.id })
    .where(eq(mockTests.id, mockTestId));

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

// ── Mock membership and scoring ──────────────────────────────────────────────

/** One module of a mock, in the order it is sat. */
export interface MockModule {
  examId: string;
  subject: Subject;
  /** 1 or 2. Module 2 is the adaptive one. */
  module: 1 | 2;
  status: 'in_progress' | 'completed' | 'abandoned';
  score: number | null;
  totalQuestions: number;
  /** The module's set difficulty, which is what Module 2 adapts. */
  setDifficulty: string | null;
}

export interface MockContext {
  mockTest: typeof mockTests.$inferSelect;
  /** Present modules in sitting order: English M1, M2, then Math M1, M2. */
  modules: MockModule[];
}

/**
 * The mock a given exam belongs to, or null if it belongs to none.
 *
 * Membership has to be looked up across all four columns. The previous helper
 * checked only `english_exam_id` and `math_exam_id` — the Module 1 rows — so
 * anything asked about a Module 2 exam came back empty, which is why a student
 * who finished a full adaptive mock was shown a single-module report.
 *
 * Note this is also the only correct test for "is this exam a mock module":
 * live exams are created with the same `mock_english` / `mock_math` types but
 * have no `mock_tests` row, so the type alone cannot tell them apart.
 */
export async function findMockContextForExam(examId: string): Promise<MockContext | null> {
  const [mockTest] = await db
    .select()
    .from(mockTests)
    .where(
      or(
        eq(mockTests.englishExamId, examId),
        eq(mockTests.englishM2ExamId, examId),
        eq(mockTests.mathExamId, examId),
        eq(mockTests.mathM2ExamId, examId),
      ),
    )
    .limit(1);
  if (!mockTest) return null;

  return { mockTest, modules: await loadModules(mockTest) };
}

const MODULE_SLOTS = [
  { column: 'englishExamId', subject: 'english', module: 1 },
  { column: 'englishM2ExamId', subject: 'english', module: 2 },
  { column: 'mathExamId', subject: 'math', module: 1 },
  { column: 'mathM2ExamId', subject: 'math', module: 2 },
] as const;

async function loadModules(mockTest: typeof mockTests.$inferSelect): Promise<MockModule[]> {
  const ids = MODULE_SLOTS.map((slot) => mockTest[slot.column]).filter(
    (id): id is string => id !== null,
  );
  if (ids.length === 0) return [];

  const rows = await db
    .select({
      id: exams.id,
      status: exams.status,
      score: exams.score,
      totalQuestions: exams.totalQuestions,
      setDifficulty: questionSets.difficulty,
    })
    .from(exams)
    .leftJoin(questionSets, eq(exams.setId, questionSets.id))
    .where(inArray(exams.id, ids));

  const byId = new Map(rows.map((row) => [row.id, row]));

  return MODULE_SLOTS.flatMap((slot) => {
    const examId = mockTest[slot.column];
    const row = examId ? byId.get(examId) : undefined;
    if (!examId || !row) return [];
    return [
      {
        examId,
        subject: slot.subject,
        module: slot.module,
        status: row.status,
        score: row.score,
        totalQuestions: row.totalQuestions,
        setDifficulty: row.setDifficulty,
      },
    ];
  });
}

/**
 * Scores and closes a mock, once every one of its four modules is submitted.
 *
 * Called from `submitExam` after grading. Completion lives here rather than in
 * `startNextModule` because a mock is finished when the student finishes it,
 * not when the last module is handed out.
 *
 * A section's raw score is Module 1 + Module 2 together — one module is not a
 * section, which is why individual mock modules never get a `scaled_score` of
 * their own. Which band that raw score can reach depends on the Module 2 the
 * student earned, so each section is scaled against its own adaptive path.
 *
 * Idempotent: the write is guarded on `status = 'in_progress'`, so a double
 * submit or a retry cannot rescore a mock that is already closed.
 */
export async function finalizeMockIfComplete(examId: string): Promise<void> {
  const context = await findMockContextForExam(examId);
  if (!context) return;

  const { mockTest, modules } = context;
  if (mockTest.status !== 'in_progress') return;
  if (modules.length !== MODULE_SLOTS.length) return;
  if (!modules.every((module) => module.status === 'completed')) return;

  const rwScore = scaleSection(modules.filter((m) => m.subject === 'english'));
  const mathScore = scaleSection(modules.filter((m) => m.subject === 'math'));

  await db
    .update(mockTests)
    .set({
      rwScore,
      mathScore,
      totalScore: toTotalScore(rwScore, mathScore),
      status: 'completed',
      completedAt: new Date(),
    })
    .where(and(eq(mockTests.id, mockTest.id), eq(mockTests.status, 'in_progress')));
}

/** Raw totals across a section's two modules, scaled against its adaptive path. */
function scaleSection(sectionModules: MockModule[]): number | null {
  const raw = sectionModules.reduce((sum, module) => sum + (module.score ?? 0), 0);
  const total = sectionModules.reduce((sum, module) => sum + module.totalQuestions, 0);
  const module2 = sectionModules.find((module) => module.module === 2);

  return toSectionScore(raw, total, pathFromModuleDifficulty(module2?.setDifficulty));
}
