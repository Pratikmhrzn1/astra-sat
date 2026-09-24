import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { database } from '../../core/db';
import { assessmentAnswersTable, assessmentsTable, passagesTable, questionSetsTable, questionsTable } from '../../core/db/schema';
import { toPublicFileUrl } from '../../core/lib/url';

/**
 * Shared reads for the student portal.
 *
 * The question projection lives here because it encodes a rule the whole module
 * depends on: a student fetching questions must never receive `correctAnswer`,
 * `correctAnswerText` or `explanation`. Selecting columns explicitly — rather
 * than returning rows and deleting fields — means a new answer-bearing column
 * cannot leak by default.
 */
export const studentQuestionFields = {
  id: questionsTable.id,
  questionType: questionsTable.questionType,
  questionText: questionsTable.questionText,
  optionA: questionsTable.optionA,
  optionB: questionsTable.optionB,
  optionC: questionsTable.optionC,
  optionD: questionsTable.optionD,
  imageUrl: questionsTable.imageUrl,
  passageId: questionsTable.passageId,
  passageText: passagesTable.passageText,
  passageTitle: passagesTable.title,
  orderIndex: questionsTable.orderIndex,
} as const;

export type StudentQuestionView = {
  [K in keyof typeof studentQuestionFields]: unknown;
} & { id: string; imageUrl: string | null };

/**
 * The same question, once the exam is over and the answers may be shown.
 *
 * This exists because three separate review queries — the student's own report,
 * a teacher reading one of their students', and the live-exam marking page —
 * each hand-rolled their own projection, and all three forgot to join
 * `passages`. A review that omits the passage strands every question that only
 * makes sense beside it ("Which choice most logically completes the text?"),
 * and all three dropped `imageUrl` too. One projection, so they cannot drift
 * apart again.
 *
 * `orderIndex` deliberately comes from the answer sheet rather than from
 * `questions`: an exam assembled across sets (topic practice, mistake review)
 * has questions whose own order indices collide.
 */
export const reviewQuestionFields = {
  ...studentQuestionFields,
  orderIndex: assessmentAnswersTable.orderIndex,
  correctAnswer: questionsTable.correctAnswer,
  correctAnswerText: questionsTable.correctAnswerText,
  explanation: questionsTable.explanation,
  selectedAnswer: assessmentAnswersTable.selectedAnswer,
  selectedAnswerText: assessmentAnswersTable.selectedAnswerText,
  isCorrect: assessmentAnswersTable.isCorrect,
} as const;

/** Applies `toPublicFileUrl` to every question's image before it leaves the API. */
export function withPublicImageLinks<T extends { imageUrl: string | null }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, imageUrl: toPublicFileUrl(row.imageUrl) }));
}

/**
 * Every answered question of a finished exam, with its passage and image.
 *
 * Normalises the image URLs itself rather than leaving that to the caller —
 * the three review paths had already each forgotten one convention, and
 * `toPublicFileUrl` is the other one they were all skipping.
 */
export async function loadReviewRowsForAssessment(examId: string) {
  const rows = await database
    .select(reviewQuestionFields)
    .from(assessmentAnswersTable)
    .innerJoin(questionsTable, eq(assessmentAnswersTable.questionId, questionsTable.id))
    .leftJoin(passagesTable, eq(questionsTable.passageId, passagesTable.id))
    .where(eq(assessmentAnswersTable.examId, examId))
    .orderBy(assessmentAnswersTable.orderIndex);
  return withPublicImageLinks(rows);
}

/** Questions of one set, in presentation order, with passage text joined in. */
/**
 * The questions in an exam, in presentation order, read from its answer sheet.
 *
 * Prefer this over `loadQuestionsForSet`: the answer sheet is materialised when
 * the exam is created and is the authoritative record of what the student was
 * asked, so it stays correct for an exam drawn from several sets (topic
 * practice) and is unaffected by later edits to a set.
 */
export async function loadQuestionsForAssessment(examId: string) {
  return database
    .select(studentQuestionFields)
    .from(assessmentAnswersTable)
    .innerJoin(questionsTable, eq(assessmentAnswersTable.questionId, questionsTable.id))
    .leftJoin(passagesTable, eq(questionsTable.passageId, passagesTable.id))
    .where(eq(assessmentAnswersTable.examId, examId))
    .orderBy(assessmentAnswersTable.orderIndex);
}

export async function loadQuestionsForSet(setId: string) {
  return database
    .select(studentQuestionFields)
    .from(questionsTable)
    .leftJoin(passagesTable, eq(questionsTable.passageId, passagesTable.id))
    .where(and(eq(questionsTable.setId, setId), isNull(questionsTable.retiredAt)))
    .orderBy(questionsTable.orderIndex);
}

/**
 * Practice sets offered in the catalogue.
 *
 * Drafts and live-exam sets are excluded, and so is anything explicitly graded
 * `low` or `hard` — those difficulty tiers exist to be selected by the adaptive
 * mock engine, not browsed. Sets with no difficulty predate that split and
 * remain visible.
 */
export async function loadPublishedSets() {
  return database
    .select({
      id: questionSetsTable.id,
      title: questionSetsTable.title,
      subject: questionSetsTable.subject,
      description: questionSetsTable.description,
      createdAt: questionSetsTable.createdAt,
      questionCount: sql<number>`(SELECT COUNT(*) FROM questions WHERE questions.set_id = question_sets.id AND questions.retired_at IS NULL)::int`,
    })
    .from(questionSetsTable)
    .where(
      and(
        eq(questionSetsTable.isDraft, false),
        eq(questionSetsTable.isLiveExam, false),
        isNull(questionSetsTable.archivedAt),
        or(eq(questionSetsTable.difficulty, 'medium'), isNull(questionSetsTable.difficulty)),
      ),
    )
    .orderBy(desc(questionSetsTable.createdAt));
}

/** A set a student can start. Archived sets are gone as far as new exams are concerned. */
export async function loadSetById(setId: string) {
  const [set] = await database
    .select()
    .from(questionSetsTable)
    .where(and(eq(questionSetsTable.id, setId), isNull(questionSetsTable.archivedAt)))
    .limit(1);
  return set ?? null;
}

/**
 * Loads an exam only if it belongs to this student.
 *
 * Every student-facing exam read goes through here. Scoping ownership in one
 * query is what stops an id in the URL from becoming a way to read — or submit —
 * somebody else's attempt.
 */
export async function loadOwnedAssessment(examId: string, studentId: string) {
  const [exam] = await database
    .select()
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.id, examId), eq(assessmentsTable.studentId, studentId)))
    .limit(1);
  return exam ?? null;
}

export async function loadAssessmentsForStudent(studentId: string) {
  return database
    .select({
      id: assessmentsTable.id,
      setId: assessmentsTable.setId,
      type: assessmentsTable.type,
      status: assessmentsTable.status,
      score: assessmentsTable.score,
      // The History page's best score and both trend lines read this. Leaving it
      // out of the projection is invisible to the type-checker — the frontend
      // mirrors these shapes by hand — and shows up only as an empty page.
      scaledScore: assessmentsTable.scaledScore,
      totalQuestions: assessmentsTable.totalQuestions,
      startedAt: assessmentsTable.startedAt,
      completedAt: assessmentsTable.completedAt,
      setTitle: questionSetsTable.title,
      /** Set-less exams carry their own name: "Topic: Algebra", "Mistake review". */
      label: assessmentsTable.label,
      // Derived rather than left null for a set-less exam, because a null subject
      // is not merely missing here — it is wrong in every consumer. The History
      // page filters both trend lines on it, so a Math topic-practice exam would
      // silently drop out of the Math trend, and the dashboard's `subject ===
      // 'math'` checks would label it "R&W". The answer sheet is the
      // authoritative question list for any exam, so the first question's set
      // gives the subject; a topic exam is single-subject by construction.
      subject: sql<'english' | 'math'>`COALESCE(
        ${questionSetsTable.subject},
        (SELECT qs.subject
           FROM ${assessmentAnswersTable} ea
           JOIN ${questionsTable} q ON q.id = ea.question_id
           JOIN ${questionSetsTable} qs ON qs.id = q.set_id
          WHERE ea.exam_id = ${assessmentsTable.id}
          ORDER BY ea.order_index
          LIMIT 1)
      )`,
    })
    .from(assessmentsTable)
    // leftJoin, not inner: an exam assembled across sets — topic practice, a
    // mistake review — belongs to no set and would otherwise vanish from the
    // student's own history entirely.
    .leftJoin(questionSetsTable, eq(assessmentsTable.setId, questionSetsTable.id))
    .where(eq(assessmentsTable.studentId, studentId))
    .orderBy(desc(assessmentsTable.startedAt));
}

// Exam provisioning lives in modules/exams so live exams create their answer
// sheets the same way practice and mock exams do.
