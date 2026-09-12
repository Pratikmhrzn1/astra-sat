import { eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { examAnswers, exams, questionSets, questions } from '../../db/schema';
import { badRequest, notFound } from '../../http/errors';
import { toSectionScore } from '../scoring';
import * as mistakes from './mistakes.service';
import * as mock from './mock.service';
import * as narrative from './narrative.service';
import * as repo from './student.repository';
import { gradeAnswer, hasAnswer, percentage } from './scoring';
import type { SaveAnswersInput, StartExamInput } from './student.schemas';

/**
 * The practice-exam lifecycle: start, load, autosave, submit, review.
 */

export async function startExam(studentId: string, { setId, type }: StartExamInput) {
  const set = await repo.findSetById(setId);
  if (!set) throw notFound('Question set not found');

  const questionRows = await repo.findQuestionsForSet(setId);
  if (questionRows.length === 0) throw badRequest('This question set has no questions');

  const exam = await repo.createExamWithAnswerSheet({
    studentId,
    setId,
    type,
    questionIds: questionRows.map((q) => q.id),
  });

  return { exam, questions: repo.withPublicImageUrls(questionRows) };
}

/**
 * Loads an exam for the player, plus the mock it belongs to (if any) so the
 * client can chain from one section to the next without a second round trip.
 */
export async function getExam(examId: string, studentId: string) {
  const exam = await repo.findOwnedExam(examId, studentId);
  if (!exam) throw notFound('Exam not found');

  const [questionRows, answers] = await Promise.all([
    repo.findQuestionsForExam(exam.id),
    db
      .select({
        questionId: examAnswers.questionId,
        selectedAnswer: examAnswers.selectedAnswer,
        selectedAnswerText: examAnswers.selectedAnswerText,
        answeredAt: examAnswers.answeredAt,
      })
      .from(examAnswers)
      .where(eq(examAnswers.examId, exam.id)),
  ]);

  // Only the Math section start is needed here: the player chains English ->
  // Math at the section boundary. It comes from the mock rather than from a
  // sibling lookup keyed on this exam, so it resolves from either English
  // module rather than only from Module 1.
  const mockContext = await mock.findMockContextForExam(exam.id);

  return {
    exam,
    questions: repo.withPublicImageUrls(questionRows),
    answers,
    mockTestId: mockContext?.mockTest.id ?? null,
    mathExamId: mockContext?.mockTest.mathExamId ?? null,
  };
}

/**
 * Autosave. Called every 30 seconds by the player, so it is written as a single
 * statement: one round trip regardless of question count, instead of one UPDATE
 * per answer.
 *
 * Answers are matched by `(exam_id, question_id)` against rows created with the
 * exam, so a question id that is not part of this exam updates nothing rather
 * than inserting a stray answer.
 */
export async function saveAnswers(
  examId: string,
  studentId: string,
  { answers, timeSpentSeconds }: SaveAnswersInput,
): Promise<void> {
  const exam = await repo.findOwnedExam(examId, studentId);
  if (!exam) throw notFound('Exam not found');
  if (exam.status === 'completed') throw badRequest('Exam already completed');

  if (answers.length > 0) {
    const now = new Date();
    const rows = answers.map(
      (answer) =>
        sql`(${answer.questionId}::uuid, ${answer.selectedAnswer ?? null}::answer_choice, ${
          answer.selectedAnswerText ?? null
        }::text, ${hasAnswer(answer.selectedAnswer, answer.selectedAnswerText) ? now : null}::timestamp)`,
    );

    await db.execute(sql`
      UPDATE exam_answers AS ea
      SET selected_answer = v.selected_answer,
          selected_answer_text = v.selected_answer_text,
          answered_at = v.answered_at
      FROM (VALUES ${sql.join(rows, sql`, `)})
        AS v(question_id, selected_answer, selected_answer_text, answered_at)
      WHERE ea.exam_id = ${examId}::uuid AND ea.question_id = v.question_id
    `);
  }

  if (timeSpentSeconds !== undefined) {
    await db.update(exams).set({ timeSpentSeconds }).where(eq(exams.id, examId));
  }
}

export interface SubmitResult {
  score: number;
  total: number;
  percentage: number;
  exam: typeof exams.$inferSelect;
  /** Set when a narrative was queued; the caller starts it after responding. */
  pendingNarrative: { narrativeId: string; exam: narrative.NarrativeExam } | null;
}

/**
 * Grades and closes an exam.
 *
 * Every answer is regraded here rather than trusting flags written earlier: the
 * practice confirm step also sets `is_correct`, and submit is the authority.
 * The client's reported score is never an input — only its elapsed time is.
 */
export async function submitExam(
  examId: string,
  studentId: string,
  timeSpentSeconds: number | undefined,
): Promise<SubmitResult> {
  const exam = await repo.findOwnedExam(examId, studentId);
  if (!exam) throw notFound('Exam not found');
  if (exam.status === 'completed') throw badRequest('Exam already completed');

  const answers = await db
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

  const graded = answers.map((answer) => ({
    answerId: answer.answerId,
    isCorrect: gradeAnswer(answer),
    answeredAt: hasAnswer(answer.selectedAnswer, answer.selectedAnswerText) ? new Date() : null,
  }));
  const score = graded.filter((row) => row.isCorrect).length;

  if (graded.length > 0) {
    const rows = graded.map(
      (row) => sql`(${row.answerId}::uuid, ${row.isCorrect}::boolean, ${row.answeredAt}::timestamp)`,
    );
    await db.execute(sql`
      UPDATE exam_answers AS ea
      SET is_correct = v.is_correct, answered_at = v.answered_at
      FROM (VALUES ${sql.join(rows, sql`, `)}) AS v(id, is_correct, answered_at)
      WHERE ea.id = v.id
    `);
  }

  // A mock module is not a section — half of one — so it never carries a scaled
  // score of its own; the mock's own row gets the two section scores once all
  // four modules are in. Membership is the test rather than `exam.type`, because
  // live exams are created with the same mock_* types and no mock row.
  const mockContext = await mock.findMockContextForExam(exam.id);
  const scaledScore = mockContext
    ? null
    : toSectionScore(score, exam.totalQuestions, 'none');

  const [updated] = await db
    .update(exams)
    .set({
      status: 'completed',
      score,
      scaledScore,
      completedAt: new Date(),
      timeSpentSeconds: timeSpentSeconds ?? exam.timeSpentSeconds,
    })
    .where(eq(exams.id, exam.id))
    .returning();

  // On the critical path on purpose: the student goes straight to a results page
  // that reports the mock total, so it must be written before the response
  // rather than behind it like the AI work below. It re-reads the mock because
  // the lookup above ran before this module was marked completed.
  if (mockContext) await mock.finalizeMockIfComplete(exam.id);

  // Every wrong answer joins the mistake bank, and every right one clears an
  // open entry — except in a live exam, whose results stay hidden until the
  // teacher releases them. Filling the bank at submit would tell that student
  // which questions they had missed before the teacher had released anything,
  // so those are recorded on release instead.
  if (!(await mistakes.isLiveExamAttempt(exam.id))) {
    await mistakes.recordMistakesForExam(exam.id, studentId);
  }

  // Created before responding so the client always has a row to poll.
  const narrativeId = await narrative.createPendingNarrative(exam.id);

  return {
    score,
    total: exam.totalQuestions,
    percentage: percentage(score, exam.totalQuestions),
    exam: updated,
    pendingNarrative: narrativeId ? { narrativeId, exam: updated } : null,
  };
}

/** Full review of a finished exam — the only student read that reveals answers. */
export async function getResults(examId: string, studentId: string) {
  const exam = await repo.findOwnedExam(examId, studentId);
  if (!exam) throw notFound('Exam not found');
  if (exam.status !== 'completed') throw badRequest('Exam not yet completed');

  const [results, set] = await Promise.all([
    db
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
        explanation: questions.explanation,
        selectedAnswer: examAnswers.selectedAnswer,
        selectedAnswerText: examAnswers.selectedAnswerText,
        isCorrect: examAnswers.isCorrect,
        orderIndex: examAnswers.orderIndex,
      })
      .from(examAnswers)
      .innerJoin(questions, eq(examAnswers.questionId, questions.id))
      .where(eq(examAnswers.examId, exam.id))
      .orderBy(examAnswers.orderIndex),
    // An exam assembled across sets has no owning set to describe.
    exam.setId
      ? db
          .select({ title: questionSets.title, subject: questionSets.subject })
          .from(questionSets)
          .where(eq(questionSets.id, exam.setId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // A module of a mock is reported as part of its mock, not on its own: the
  // headline is the mock's 400-1600 total and the review runs across all four
  // modules. The client used to be told which sibling to fetch through an
  // `?englishExamId=` query parameter it had carried since the player, which
  // silently produced a single-module /800 report whenever it went missing.
  const mockContext = await mock.findMockContextForExam(exam.id);

  return {
    exam,
    set: set[0] ?? null,
    results,
    mock: mockContext
      ? {
          id: mockContext.mockTest.id,
          status: mockContext.mockTest.status,
          rwScore: mockContext.mockTest.rwScore,
          mathScore: mockContext.mockTest.mathScore,
          totalScore: mockContext.mockTest.totalScore,
          completedAt: mockContext.mockTest.completedAt,
          modules: mockContext.modules,
        }
      : null,
  };
}

/** Narrative retry — resets the row and regenerates behind the response. */
export async function retryNarrative(examId: string, studentId: string) {
  const exam = await repo.findOwnedExam(examId, studentId);
  if (!exam) throw notFound('Exam not found');
  if (exam.status !== 'completed') throw badRequest('Exam not completed');

  const narrativeId = await narrative.resetNarrative(exam.id);
  return { narrativeId, exam };
}

export async function getNarrative(examId: string, studentId: string) {
  const exam = await repo.findOwnedExam(examId, studentId);
  if (!exam) throw notFound('Exam not found');

  const row = await narrative.findNarrative(examId);
  if (!row) throw notFound('Narrative not found');
  return row;
}

export async function listExams(studentId: string) {
  return repo.listExamsForStudent(studentId);
}

export async function getCatalogue() {
  return repo.findPublishedSets();
}

export async function getSetWithQuestions(setId: string) {
  const set = await repo.findSetById(setId);
  if (!set) throw notFound('Question set not found');
  const questionRows = await repo.findQuestionsForSet(setId);
  return { ...set, questions: repo.withPublicImageUrls(questionRows) };
}

/** Guards a route that only makes sense when the practice exam is this student's. */
export async function assertOwnedExam(examId: string, studentId: string) {
  const exam = await repo.findOwnedExam(examId, studentId);
  if (!exam) throw notFound('Exam not found');
  return exam;
}
