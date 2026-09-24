import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { database } from '../../core/db';
import {
  assessmentAnswersTable,
  misstepsTable,
  questionSetsTable,
  questionsTable,
  competenciesTable,
} from '../../core/db/schema';
import { invalidRequest } from '../../core/errors';
import { buildAssessmentWithSheet } from '../exams';
import type { MisstepPracticePayload } from './mistakes.schemas';

/**
 * The mistake bank: every question a student has got wrong, as a worklist that
 * drains.
 *
 * One row per (student, question) rather than per attempt — missing the same
 * question three times bumps `missCount` instead of filing three entries, so the
 * bank stays something a student can work through rather than a log they scroll.
 * A later correct answer stamps `resolvedAt`, which is what makes it drain.
 *
 * v1 has no spaced repetition on purpose: a row resolves on one correct answer.
 * If it turns out students re-miss resolved items often, the next step is SM-2
 * columns reusing `nextReviewPlan()` from `vocab.service.ts`, which already does
 * exactly this for words.
 */

/** A blank counts as a miss — `markAnswer` already treats unanswered as wrong. */
type GradedAnswer = { answerId: string; questionId: string; isCorrect: boolean | null };

/**
 * Files this exam's wrong answers and clears the ones it got right.
 *
 * Called from `commitAssessment`, which is the grading authority: the practice confirm
 * step also writes `isCorrect`, but submit regrades everything, so recording here
 * cannot disagree with the score the student was shown.
 *
 * **Live exams do not call this at submit.** Their results are hidden until the
 * teacher releases them, and a bank that filled up the moment a student clicked
 * submit would tell them which questions they had missed before the teacher had
 * released anything. `registerMisstepsOnRelease` handles those instead.
 */
export async function registerMisstepsForAssessment(examId: string, studentId: string): Promise<void> {
  const graded: GradedAnswer[] = await database
    .select({
      answerId: assessmentAnswersTable.id,
      questionId: assessmentAnswersTable.questionId,
      isCorrect: assessmentAnswersTable.isCorrect,
    })
    .from(assessmentAnswersTable)
    .where(eq(assessmentAnswersTable.examId, examId));

  const missed = graded.filter((answer) => answer.isCorrect === false);
  const correct = graded.filter((answer) => answer.isCorrect === true);

  if (missed.length > 0) {
    await database
      .insert(misstepsTable)
      .values(
        missed.map((answer) => ({
          studentId,
          questionId: answer.questionId,
          examAnswerId: answer.answerId,
        })),
      )
      .onConflictDoUpdate({
        target: [misstepsTable.studentId, misstepsTable.questionId],
        set: {
          missCount: sql`${misstepsTable.missCount} + 1`,
          lastMissedAt: new Date(),
          examAnswerId: sql`excluded.exam_answer_id`,
          // Missing it again reopens it, so a question that was resolved and then
          // forgotten comes back into the worklist rather than staying closed.
          resolvedAt: null,
        },
      });
  }

  if (correct.length > 0) {
    await database
      .update(misstepsTable)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(misstepsTable.studentId, studentId),
          inArray(
            misstepsTable.questionId,
            correct.map((answer) => answer.questionId),
          ),
          isNull(misstepsTable.resolvedAt),
        ),
      );
  }
}

/**
 * Files a live-exam participant's mistakes, at the moment the teacher releases
 * their results rather than when they submitted.
 *
 * Both sections in one call, and safe to skip: the caller only invokes it for a
 * participant who was not already released, so a second release cannot bump
 * every `missCount` a second time.
 */
export async function registerMisstepsOnRelease(
  studentId: string,
  examIds: (string | null)[],
): Promise<void> {
  for (const examId of examIds) {
    if (examId) await registerMisstepsForAssessment(examId, studentId);
  }
}

export interface MisstepFilters {
  subject?: 'english' | 'math';
  skillCode?: string;
  status?: 'open' | 'resolved';
}

/**
 * The bank itself.
 *
 * The correct answer and explanation are included: these questions come from
 * exams the student has already completed and reviewed, so withholding them here
 * would hide something they have already been shown — and a worklist you cannot
 * learn from is just a list of failures.
 */
export async function collectMissteps(studentId: string, filters: MisstepFilters) {
  const conditions = [eq(misstepsTable.studentId, studentId)];
  if (filters.subject) conditions.push(eq(questionSetsTable.subject, filters.subject));
  if (filters.skillCode) conditions.push(eq(questionsTable.skillCode, filters.skillCode));
  if (filters.status === 'open') conditions.push(isNull(misstepsTable.resolvedAt));
  if (filters.status === 'resolved') conditions.push(isNotNull(misstepsTable.resolvedAt));

  return database
    .select({
      questionId: questionsTable.id,
      questionType: questionsTable.questionType,
      questionText: questionsTable.questionText,
      optionA: questionsTable.optionA,
      optionB: questionsTable.optionB,
      optionC: questionsTable.optionC,
      optionD: questionsTable.optionD,
      correctAnswer: questionsTable.correctAnswer,
      correctAnswerText: questionsTable.correctAnswerText,
      explanation: questionsTable.explanation,
      /**
       * What the student actually picked, from the attempt that most recently
       * got it wrong. Null in two different ways, and the caller must tell them
       * apart: the join misses when `exam_answer_id` was cleared (ON DELETE SET
       * NULL), and `selectedAnswer` is itself null when the question was left
       * blank — `markAnswer` counts a blank as wrong, so skipped questions are
       * in the bank too.
       */
      selectedAnswer: assessmentAnswersTable.selectedAnswer,
      selectedAnswerText: assessmentAnswersTable.selectedAnswerText,
      skillCode: questionsTable.skillCode,
      skillLabel: competenciesTable.label,
      /** The domain a skill sits under, or the code itself when it is a domain. */
      domainCode: sql<string | null>`COALESCE(${competenciesTable.parentCode}, ${competenciesTable.code})`,
      subject: questionSetsTable.subject,
      difficulty: questionsTable.difficulty,
      missCount: misstepsTable.missCount,
      firstMissedAt: misstepsTable.firstMissedAt,
      lastMissedAt: misstepsTable.lastMissedAt,
      resolvedAt: misstepsTable.resolvedAt,
    })
    .from(misstepsTable)
    .innerJoin(questionsTable, eq(misstepsTable.questionId, questionsTable.id))
    .innerJoin(questionSetsTable, eq(questionsTable.setId, questionSetsTable.id))
    .leftJoin(competenciesTable, eq(questionsTable.skillCode, competenciesTable.code))
    .leftJoin(assessmentAnswersTable, eq(misstepsTable.examAnswerId, assessmentAnswersTable.id))
    .where(and(...conditions))
    .orderBy(sql`${misstepsTable.missCount} DESC, ${misstepsTable.lastMissedAt} DESC`);
}

/** Open counts per domain, for the summary strip above the list. */
export async function fetchMisstepSummary(studentId: string) {
  return database
    .select({
      domainCode: sql<string | null>`COALESCE(${competenciesTable.parentCode}, ${competenciesTable.code})`,
      subject: questionSetsTable.subject,
      openCount: sql<number>`count(*)::int`,
    })
    .from(misstepsTable)
    .innerJoin(questionsTable, eq(misstepsTable.questionId, questionsTable.id))
    .innerJoin(questionSetsTable, eq(questionsTable.setId, questionSetsTable.id))
    .leftJoin(competenciesTable, eq(questionsTable.skillCode, competenciesTable.code))
    .where(and(eq(misstepsTable.studentId, studentId), isNull(misstepsTable.resolvedAt)))
    .groupBy(sql`COALESCE(${competenciesTable.parentCode}, ${competenciesTable.code})`, questionSetsTable.subject)
    .orderBy(sql`count(*) DESC`);
}

/**
 * Builds a review exam from the student's open mistakes.
 *
 * Hardest first — most-missed, then most-recently-missed — so a short session
 * spends its questions where they are worth most.
 *
 * Nothing is resolved here. The exam goes through the ordinary submit path, so
 * `registerMisstepsForAssessment` does the resolving with exactly the same grading rules
 * as any other exam. That is the point of routing it through a real exam rather
 * than building a bespoke quiz.
 */
export async function openMisstepPractice(studentId: string, input: MisstepPracticePayload) {
  const conditions = [eq(misstepsTable.studentId, studentId), isNull(misstepsTable.resolvedAt)];
  if (input.subject) conditions.push(eq(questionSetsTable.subject, input.subject));
  if (input.skillCode) conditions.push(eq(questionsTable.skillCode, input.skillCode));

  const rows = await database
    .select({ questionId: questionsTable.id })
    .from(misstepsTable)
    .innerJoin(questionsTable, eq(misstepsTable.questionId, questionsTable.id))
    .innerJoin(questionSetsTable, eq(questionsTable.setId, questionSetsTable.id))
    .where(and(...conditions, isNull(questionsTable.retiredAt)))
    .orderBy(sql`${misstepsTable.missCount} DESC, ${misstepsTable.lastMissedAt} DESC`)
    .limit(input.limit);

  if (rows.length === 0) {
    throw invalidRequest('No open mistakes to practise yet — take an exam first.');
  }

  const exam = await buildAssessmentWithSheet({
    studentId,
    setId: null,
    label: 'Mistake review',
    type: 'individual',
    questionIds: rows.map((row) => row.questionId),
  });

  return { exam, questionCount: rows.length };
}

/**
 * Whether this exam is a live-exam sitting.
 *
 * Live exams share the `mock_english` / `mock_math` types with mock modules and
 * are told apart by which table references them — the same reason mock membership
 * is looked up rather than inferred from `exam.type`.
 */
export async function isLiveAssessmentSitting(examId: string): Promise<boolean> {
  const [row] = await database.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM live_exam_participants
      WHERE english_exam_id = ${examId} OR math_exam_id = ${examId}
    ) AS exists
  `).then((result) => result.rows as { exists: boolean }[]);

  return row?.exists ?? false;
}
