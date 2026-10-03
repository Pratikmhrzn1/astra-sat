import { and, eq, lt, sql } from 'drizzle-orm';
import { database } from '../../core/db';
import { assessmentAnswersTable, assessmentsTable, questionSetsTable, questionsTable } from '../../core/db/schema';
import { invalidRequest, stateConflict, isServiceError, missing } from '../../core/errors';
import {
  DEADLINE_LENIENCY_SECONDS,
  assertDailyTestAllowance,
  buildAssessmentWithSheet,
  examRepository as repo,
  markAnswer,
  isAnswered,
  isBeyondLeniency,
  toPercentage,
  settleDeadline,
  serverElapsedSeconds,
  toSectionResult,
} from '../exams';
import * as mistakes from '../mistakes';
import { narrative } from '../practice';
import * as mock from './mock.service';
import type { SaveAnswersPayload, StartAssessmentPayload } from './attempts.schemas';

/**
 * The practice-exam lifecycle: start, load, autosave, submit, review.
 */

export async function openAssessment(studentId: string, { setId, type }: StartAssessmentPayload) {
  await assertDailyTestAllowance(studentId);
  const set = await repo.loadSetById(setId);
  if (!set) throw missing('Question set not found');

  const questionRows = await repo.loadQuestionsForSet(setId);
  if (questionRows.length === 0) throw invalidRequest('This question set has no questions');

  const exam = await buildAssessmentWithSheet({
    studentId,
    setId,
    type,
    questionIds: questionRows.map((q) => q.id),
  });

  return { exam, questions: repo.withPublicImageLinks(questionRows) };
}

/**
 * Loads an exam for the player, plus the mock it belongs to (if any) so the
 * client can chain from one section to the next without a second round trip.
 */
export async function fetchAssessment(examId: string, studentId: string, { open = false }: { open?: boolean } = {}) {
  let exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam) throw missing('Exam not found');

  // Opening starts a mock module's clock; any read closes an expired exam.
  const deadline = await settleDeadline(exam, { open });
  if (exam.status === 'in_progress' && isBeyondLeniency(deadline)) {
    await closeExpiredAssessment(exam.id, studentId);
    exam = (await repo.loadOwnedAssessment(examId, studentId))!;
  }

  const [questionRows, answers] = await Promise.all([
    repo.loadQuestionsForAssessment(exam.id),
    database
      .select({
        questionId: assessmentAnswersTable.questionId,
        selectedAnswer: assessmentAnswersTable.selectedAnswer,
        selectedAnswerText: assessmentAnswersTable.selectedAnswerText,
        answeredAt: assessmentAnswersTable.answeredAt,
      })
      .from(assessmentAnswersTable)
      .where(eq(assessmentAnswersTable.examId, exam.id)),
  ]);

  // Only the Math section start is needed here: the player chains English ->
  // Math at the section boundary. It comes from the mock rather than from a
  // sibling lookup keyed on this exam, so it resolves from either English
  // module rather than only from Module 1.
  const mockContext = await mock.loadMockContextForAssessment(exam.id);
  const slot = mockContext?.modules.find((m) => m.examId === exam.id);

  return {
    exam,
    questions: repo.withPublicImageLinks(questionRows),
    answers,
    mockTestId: mockContext?.mockTest.id ?? null,
    mathExamId: mockContext?.mockTest.mathExamId ?? null,
    /**
     * Which module of its mock this exam is. The player used to learn this only
     * from router state, so a module reopened from a resume link or a reload in
     * a new tab lost its place in the adaptive chain.
     */
    mockSection: slot ? (`${slot.subject}_m${slot.module}` as const) : null,
    /** When this attempt ends, or null if untimed / not yet opened. The client counts down to this. */
    deadlineAt: deadline ? deadline.toISOString() : null,
    /** Lets the client correct for a wrong device clock. */
    serverNow: new Date().toISOString(),
  };
}

/**
 * Grades and closes an exam whose time ran out without a submit — the student
 * closed the tab, lost their connection, or simply stopped. Whatever autosave
 * had stored is what gets graded, exactly as if they had pressed submit at the
 * deadline. The AI narrative starts as it would after a normal submit.
 *
 * A concurrent real submit is safe: `commitAssessment` only closes an exam that is
 * still in progress, so whichever arrives second is refused.
 */
export async function closeExpiredAssessment(examId: string, studentId: string): Promise<void> {
  try {
    const result = await commitAssessment(examId, studentId, undefined);
    if (result.pendingNarrative) {
      narrative.produceNarrativeInBackground(result.exam.id, result.pendingNarrative.narrativeId, result.pendingNarrative.exam);
    }
  } catch (err) {
    // Already closed by the student's own submit a moment earlier: nothing to do.
    if (!(err instanceof Error && /already completed/i.test(err.message))) throw err;
  }
}

/** Closes an exam if its deadline has passed. Used before anything that depends on it being finished. */
export async function closeWhenExpired(examId: string, studentId: string): Promise<void> {
  const exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam || exam.status !== 'in_progress') return;
  if (isBeyondLeniency(await settleDeadline(exam, { open: false }))) await closeExpiredAssessment(examId, studentId);
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
export async function storeAnswers(
  examId: string,
  studentId: string,
  { answers, timeSpentSeconds }: SaveAnswersPayload,
): Promise<void> {
  const exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam) throw missing('Exam not found');
  if (exam.status === 'completed') throw invalidRequest('Exam already completed');

  // Past the deadline (plus grace) nothing more is accepted: the exam is graded
  // on what was saved in time, and this late write is refused.
  const deadline = await settleDeadline(exam, { open: false });
  if (isBeyondLeniency(deadline)) {
    await closeExpiredAssessment(examId, studentId);
    throw stateConflict('Time is up — this section has been submitted.');
  }

  if (answers.length > 0) {
    const now = new Date();
    const rows = answers.map(
      (answer) =>
        sql`(${answer.questionId}::uuid, ${answer.selectedAnswer ?? null}::answer_choice, ${
          answer.selectedAnswerText ?? null
        }::text, ${isAnswered(answer.selectedAnswer, answer.selectedAnswerText) ? now : null}::timestamp)`,
    );

    await database.execute(sql`
      UPDATE exam_answers AS ea
      SET selected_answer = v.selected_answer,
          selected_answer_text = v.selected_answer_text,
          answered_at = v.answered_at
      FROM (VALUES ${sql.join(rows, sql`, `)})
        AS v(question_id, selected_answer, selected_answer_text, answered_at)
      WHERE ea.exam_id = ${examId}::uuid AND ea.question_id = v.question_id
    `);
  }

  // A timed exam's time comes from its deadline, never from the client.
  const timed = deadline !== null;
  if (timeSpentSeconds !== undefined && !timed) {
    await database.update(assessmentsTable).set({ timeSpentSeconds }).where(eq(assessmentsTable.id, examId));
  }
}

export interface CommitOutcome {
  score: number;
  total: number;
  percentage: number;
  exam: typeof assessmentsTable.$inferSelect;
  /** Set when a narrative was queued; the caller starts it after responding. */
  pendingNarrative: { narrativeId: string; exam: narrative.NarrativeAssessment } | null;
}

/**
 * Grades and closes an exam.
 *
 * Every answer is regraded here rather than trusting flags written earlier: the
 * practice confirm step also sets `is_correct`, and submit is the authority.
 * The client's reported score is never an input — only its elapsed time is.
 */
export async function commitAssessment(
  examId: string,
  studentId: string,
  timeSpentSeconds: number | undefined,
  finalAnswers?: SaveAnswersPayload['answers'],
): Promise<CommitOutcome> {
  // Final answers first, through the same path as autosave — including its
  // deadline check. Past the deadline the save is refused and the exam closed
  // on what was stored in time; the "already completed" below then tells the
  // client, which treats it as done.
  if (finalAnswers && finalAnswers.length > 0) {
    try {
      await storeAnswers(examId, studentId, { answers: finalAnswers });
    } catch (err) {
      if (!(isServiceError(err) && err.kind === 'conflict')) throw err;
    }
  }

  const exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam) throw missing('Exam not found');
  if (exam.status === 'completed') throw invalidRequest('Exam already completed');

  const answers = await database
    .select({
      answerId: assessmentAnswersTable.id,
      questionType: questionsTable.questionType,
      selectedAnswer: assessmentAnswersTable.selectedAnswer,
      selectedAnswerText: assessmentAnswersTable.selectedAnswerText,
      correctAnswer: questionsTable.correctAnswer,
      correctAnswerText: questionsTable.correctAnswerText,
    })
    .from(assessmentAnswersTable)
    .innerJoin(questionsTable, eq(assessmentAnswersTable.questionId, questionsTable.id))
    .where(eq(assessmentAnswersTable.examId, exam.id));

  const graded = answers.map((answer) => ({
    answerId: answer.answerId,
    isCorrect: markAnswer(answer),
    answeredAt: isAnswered(answer.selectedAnswer, answer.selectedAnswerText) ? new Date() : null,
  }));
  const score = graded.filter((row) => row.isCorrect).length;

  if (graded.length > 0) {
    const rows = graded.map(
      (row) => sql`(${row.answerId}::uuid, ${row.isCorrect}::boolean, ${row.answeredAt}::timestamp)`,
    );
    await database.execute(sql`
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
  const mockContext = await mock.loadMockContextForAssessment(exam.id);
  const scaledScore = mockContext
    ? null
    : toSectionResult(score, exam.totalQuestions, 'none');

  // Timed by its own limit: computed from the deadline. A live section (timed by
  // its session) keeps the client figure, capped at the time it could have had.
  const deadline = await settleDeadline(exam, { open: false });
  const fromServer = serverElapsedSeconds(exam, deadline);
  const liveCap = deadline ? Math.max(0, Math.round((deadline.getTime() - exam.startedAt.getTime()) / 1000)) : null;
  const resolvedTimeSpent =
    fromServer ??
    (timeSpentSeconds !== undefined && liveCap !== null ? Math.min(timeSpentSeconds, liveCap) : timeSpentSeconds) ??
    exam.timeSpentSeconds;

  const [updated] = await database
    .update(assessmentsTable)
    .set({
      status: 'completed',
      score,
      scaledScore,
      completedAt: new Date(),
      timeSpentSeconds: resolvedTimeSpent,
    })
    // Only an exam still in progress closes. A student's submit and an expiry
    // close racing each other would otherwise both grade it and both write
    // mistakes; the loser is refused here.
    .where(and(eq(assessmentsTable.id, exam.id), eq(assessmentsTable.status, 'in_progress')))
    .returning();
  if (!updated) throw invalidRequest('Exam already completed');

  // On the critical path on purpose: the student goes straight to a results page
  // that reports the mock total, so it must be written before the response
  // rather than behind it like the AI work below. It re-reads the mock because
  // the lookup above ran before this module was marked completed.
  if (mockContext) await mock.sealMockWhenComplete(exam.id);

  // Every wrong answer joins the mistake bank, and every right one clears an
  // open entry — except in a live exam, whose results stay hidden until the
  // teacher releases them. Filling the bank at submit would tell that student
  // which questions they had missed before the teacher had released anything,
  // so those are recorded on release instead.
  if (!(await mistakes.isLiveAssessmentSitting(exam.id))) {
    await mistakes.registerMisstepsForAssessment(exam.id, studentId);
  }

  // Created before responding so the client always has a row to poll.
  const narrativeId = await narrative.addPendingNarrative(exam.id);

  return {
    score,
    total: exam.totalQuestions,
    percentage: toPercentage(score, exam.totalQuestions),
    exam: updated,
    pendingNarrative: narrativeId ? { narrativeId, exam: updated } : null,
  };
}

/** Full review of a finished exam — the only student read that reveals answers. */
export async function fetchResults(examId: string, studentId: string) {
  const exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam) throw missing('Exam not found');
  if (exam.status !== 'completed') throw invalidRequest('Exam not yet completed');

  const [results, set] = await Promise.all([
    // Shared with the teacher's read and the live-exam marking page. This used
    // to be a projection of its own that never joined `passages`, so a review
    // showed "Which choice most logically completes the text?" with no text.
    repo.loadReviewRowsForAssessment(exam.id),
    // An exam assembled across sets has no owning set to describe.
    exam.setId
      ? database
          .select({ title: questionSetsTable.title, subject: questionSetsTable.subject })
          .from(questionSetsTable)
          .where(eq(questionSetsTable.id, exam.setId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  // A module of a mock is reported as part of its mock, not on its own: the
  // headline is the mock's 400-1600 total and the review runs across all four
  // modules. The client used to be told which sibling to fetch through an
  // `?englishExamId=` query parameter it had carried since the player, which
  // silently produced a single-module /800 report whenever it went missing.
  const mockContext = await mock.loadMockContextForAssessment(exam.id);

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
export async function reRunNarrative(examId: string, studentId: string) {
  const exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam) throw missing('Exam not found');
  if (exam.status !== 'completed') throw invalidRequest('Exam not completed');

  const narrativeId = await narrative.clearNarrative(exam.id);
  return { narrativeId, exam };
}

export async function fetchNarrative(examId: string, studentId: string) {
  const exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam) throw missing('Exam not found');

  const row = await narrative.loadNarrative(examId);
  if (!row) throw missing('Narrative not found');
  return row;
}

export async function collectAssessments(studentId: string) {
  // An abandoned timed exam is closed when it next appears in a list, so history
  // never shows a section as "in progress" long after its time ran out.
  const expired = await database
    .select({ id: assessmentsTable.id })
    .from(assessmentsTable)
    .where(
      and(
        eq(assessmentsTable.studentId, studentId),
        eq(assessmentsTable.status, 'in_progress'),
        lt(assessmentsTable.deadlineAt, new Date(Date.now() - DEADLINE_LENIENCY_SECONDS * 1000)),
      ),
    );
  for (const { id } of expired) await closeExpiredAssessment(id, studentId);

  return repo.loadAssessmentsForStudent(studentId);
}

export async function fetchCatalogue() {
  return repo.loadPublishedSets();
}

export async function fetchSetWithQuestions(setId: string) {
  const set = await repo.loadSetById(setId);
  if (!set) throw missing('Question set not found');
  const questionRows = await repo.loadQuestionsForSet(setId);
  return { ...set, questions: repo.withPublicImageLinks(questionRows) };
}

/** Guards a route that only makes sense when the practice exam is this student's. */
export async function ensureOwnedAssessment(examId: string, studentId: string) {
  const exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam) throw missing('Exam not found');
  return exam;
}
