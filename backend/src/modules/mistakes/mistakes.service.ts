import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '../../core/db';
import {
  examAnswers,
  mistakes,
  questionSets,
  questions,
  skills,
} from '../../core/db/schema';
import { badRequest } from '../../core/errors';
import { createExamWithAnswerSheet } from '../exams';
import type { MistakePracticeInput } from './mistakes.schemas';

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
 * columns reusing `nextSchedule()` from `vocab.service.ts`, which already does
 * exactly this for words.
 */

/** A blank counts as a miss — `gradeAnswer` already treats unanswered as wrong. */
type GradedAnswer = { answerId: string; questionId: string; isCorrect: boolean | null };

/**
 * Files this exam's wrong answers and clears the ones it got right.
 *
 * Called from `submitExam`, which is the grading authority: the practice confirm
 * step also writes `isCorrect`, but submit regrades everything, so recording here
 * cannot disagree with the score the student was shown.
 *
 * **Live exams do not call this at submit.** Their results are hidden until the
 * teacher releases them, and a bank that filled up the moment a student clicked
 * submit would tell them which questions they had missed before the teacher had
 * released anything. `recordMistakesOnRelease` handles those instead.
 */
export async function recordMistakesForExam(examId: string, studentId: string): Promise<void> {
  const graded: GradedAnswer[] = await db
    .select({
      answerId: examAnswers.id,
      questionId: examAnswers.questionId,
      isCorrect: examAnswers.isCorrect,
    })
    .from(examAnswers)
    .where(eq(examAnswers.examId, examId));

  const missed = graded.filter((answer) => answer.isCorrect === false);
  const correct = graded.filter((answer) => answer.isCorrect === true);

  if (missed.length > 0) {
    await db
      .insert(mistakes)
      .values(
        missed.map((answer) => ({
          studentId,
          questionId: answer.questionId,
          examAnswerId: answer.answerId,
        })),
      )
      .onConflictDoUpdate({
        target: [mistakes.studentId, mistakes.questionId],
        set: {
          missCount: sql`${mistakes.missCount} + 1`,
          lastMissedAt: new Date(),
          examAnswerId: sql`excluded.exam_answer_id`,
          // Missing it again reopens it, so a question that was resolved and then
          // forgotten comes back into the worklist rather than staying closed.
          resolvedAt: null,
        },
      });
  }

  if (correct.length > 0) {
    await db
      .update(mistakes)
      .set({ resolvedAt: new Date() })
      .where(
        and(
          eq(mistakes.studentId, studentId),
          inArray(
            mistakes.questionId,
            correct.map((answer) => answer.questionId),
          ),
          isNull(mistakes.resolvedAt),
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
export async function recordMistakesOnRelease(
  studentId: string,
  examIds: (string | null)[],
): Promise<void> {
  for (const examId of examIds) {
    if (examId) await recordMistakesForExam(examId, studentId);
  }
}

export interface MistakeFilters {
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
export async function listMistakes(studentId: string, filters: MistakeFilters) {
  const conditions = [eq(mistakes.studentId, studentId)];
  if (filters.subject) conditions.push(eq(questionSets.subject, filters.subject));
  if (filters.skillCode) conditions.push(eq(questions.skillCode, filters.skillCode));
  if (filters.status === 'open') conditions.push(isNull(mistakes.resolvedAt));
  if (filters.status === 'resolved') conditions.push(isNotNull(mistakes.resolvedAt));

  return db
    .select({
      questionId: questions.id,
      questionType: questions.questionType,
      questionText: questions.questionText,
      optionA: questions.optionA,
      optionB: questions.optionB,
      optionC: questions.optionC,
      optionD: questions.optionD,
      correctAnswer: questions.correctAnswer,
      correctAnswerText: questions.correctAnswerText,
      explanation: questions.explanation,
      skillCode: questions.skillCode,
      skillLabel: skills.label,
      /** The domain a skill sits under, or the code itself when it is a domain. */
      domainCode: sql<string | null>`COALESCE(${skills.parentCode}, ${skills.code})`,
      subject: questionSets.subject,
      difficulty: questions.difficulty,
      missCount: mistakes.missCount,
      firstMissedAt: mistakes.firstMissedAt,
      lastMissedAt: mistakes.lastMissedAt,
      resolvedAt: mistakes.resolvedAt,
    })
    .from(mistakes)
    .innerJoin(questions, eq(mistakes.questionId, questions.id))
    .innerJoin(questionSets, eq(questions.setId, questionSets.id))
    .leftJoin(skills, eq(questions.skillCode, skills.code))
    .where(and(...conditions))
    .orderBy(sql`${mistakes.missCount} DESC, ${mistakes.lastMissedAt} DESC`);
}

/** Open counts per domain, for the summary strip above the list. */
export async function getMistakeSummary(studentId: string) {
  return db
    .select({
      domainCode: sql<string | null>`COALESCE(${skills.parentCode}, ${skills.code})`,
      subject: questionSets.subject,
      openCount: sql<number>`count(*)::int`,
    })
    .from(mistakes)
    .innerJoin(questions, eq(mistakes.questionId, questions.id))
    .innerJoin(questionSets, eq(questions.setId, questionSets.id))
    .leftJoin(skills, eq(questions.skillCode, skills.code))
    .where(and(eq(mistakes.studentId, studentId), isNull(mistakes.resolvedAt)))
    .groupBy(sql`COALESCE(${skills.parentCode}, ${skills.code})`, questionSets.subject)
    .orderBy(sql`count(*) DESC`);
}

/**
 * Builds a review exam from the student's open mistakes.
 *
 * Hardest first — most-missed, then most-recently-missed — so a short session
 * spends its questions where they are worth most.
 *
 * Nothing is resolved here. The exam goes through the ordinary submit path, so
 * `recordMistakesForExam` does the resolving with exactly the same grading rules
 * as any other exam. That is the point of routing it through a real exam rather
 * than building a bespoke quiz.
 */
export async function startMistakePractice(studentId: string, input: MistakePracticeInput) {
  const conditions = [eq(mistakes.studentId, studentId), isNull(mistakes.resolvedAt)];
  if (input.subject) conditions.push(eq(questionSets.subject, input.subject));
  if (input.skillCode) conditions.push(eq(questions.skillCode, input.skillCode));

  const rows = await db
    .select({ questionId: questions.id })
    .from(mistakes)
    .innerJoin(questions, eq(mistakes.questionId, questions.id))
    .innerJoin(questionSets, eq(questions.setId, questionSets.id))
    .where(and(...conditions, isNull(questions.retiredAt)))
    .orderBy(sql`${mistakes.missCount} DESC, ${mistakes.lastMissedAt} DESC`)
    .limit(input.limit);

  if (rows.length === 0) {
    throw badRequest('No open mistakes to practise yet — take an exam first.');
  }

  const exam = await createExamWithAnswerSheet({
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
export async function isLiveExamAttempt(examId: string): Promise<boolean> {
  const [row] = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM live_exam_participants
      WHERE english_exam_id = ${examId} OR math_exam_id = ${examId}
    ) AS exists
  `).then((result) => result.rows as { exists: boolean }[]);

  return row?.exists ?? false;
}
