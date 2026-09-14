import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../core/db';
import { examAnswers, exams, passages, questionSets, questions } from '../../core/db/schema';
import { normalizeFileUrl } from '../../core/lib/url';

/**
 * Shared reads for the student portal.
 *
 * The question projection lives here because it encodes a rule the whole module
 * depends on: a student fetching questions must never receive `correctAnswer`,
 * `correctAnswerText` or `explanation`. Selecting columns explicitly — rather
 * than returning rows and deleting fields — means a new answer-bearing column
 * cannot leak by default.
 */
export const studentQuestionColumns = {
  id: questions.id,
  questionType: questions.questionType,
  questionText: questions.questionText,
  optionA: questions.optionA,
  optionB: questions.optionB,
  optionC: questions.optionC,
  optionD: questions.optionD,
  imageUrl: questions.imageUrl,
  passageId: questions.passageId,
  passageText: passages.passageText,
  passageTitle: passages.title,
  orderIndex: questions.orderIndex,
} as const;

export type StudentQuestion = {
  [K in keyof typeof studentQuestionColumns]: unknown;
} & { id: string; imageUrl: string | null };

/** Applies `normalizeFileUrl` to every question's image before it leaves the API. */
export function withPublicImageUrls<T extends { imageUrl: string | null }>(rows: T[]): T[] {
  return rows.map((row) => ({ ...row, imageUrl: normalizeFileUrl(row.imageUrl) }));
}

/** Questions of one set, in presentation order, with passage text joined in. */
/**
 * The questions in an exam, in presentation order, read from its answer sheet.
 *
 * Prefer this over `findQuestionsForSet`: the answer sheet is materialised when
 * the exam is created and is the authoritative record of what the student was
 * asked, so it stays correct for an exam drawn from several sets (topic
 * practice) and is unaffected by later edits to a set.
 */
export async function findQuestionsForExam(examId: string) {
  return db
    .select(studentQuestionColumns)
    .from(examAnswers)
    .innerJoin(questions, eq(examAnswers.questionId, questions.id))
    .leftJoin(passages, eq(questions.passageId, passages.id))
    .where(eq(examAnswers.examId, examId))
    .orderBy(examAnswers.orderIndex);
}

export async function findQuestionsForSet(setId: string) {
  return db
    .select(studentQuestionColumns)
    .from(questions)
    .leftJoin(passages, eq(questions.passageId, passages.id))
    .where(and(eq(questions.setId, setId), isNull(questions.retiredAt)))
    .orderBy(questions.orderIndex);
}

/**
 * Practice sets offered in the catalogue.
 *
 * Drafts and live-exam sets are excluded, and so is anything explicitly graded
 * `low` or `hard` — those difficulty tiers exist to be selected by the adaptive
 * mock engine, not browsed. Sets with no difficulty predate that split and
 * remain visible.
 */
export async function findPublishedSets() {
  return db
    .select({
      id: questionSets.id,
      title: questionSets.title,
      subject: questionSets.subject,
      description: questionSets.description,
      createdAt: questionSets.createdAt,
      questionCount: sql<number>`(SELECT COUNT(*) FROM questions WHERE questions.set_id = question_sets.id AND questions.retired_at IS NULL)::int`,
    })
    .from(questionSets)
    .where(
      and(
        eq(questionSets.isDraft, false),
        eq(questionSets.isLiveExam, false),
        isNull(questionSets.archivedAt),
        or(eq(questionSets.difficulty, 'medium'), isNull(questionSets.difficulty)),
      ),
    )
    .orderBy(desc(questionSets.createdAt));
}

/** A set a student can start. Archived sets are gone as far as new exams are concerned. */
export async function findSetById(setId: string) {
  const [set] = await db
    .select()
    .from(questionSets)
    .where(and(eq(questionSets.id, setId), isNull(questionSets.archivedAt)))
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
export async function findOwnedExam(examId: string, studentId: string) {
  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, examId), eq(exams.studentId, studentId)))
    .limit(1);
  return exam ?? null;
}

export async function listExamsForStudent(studentId: string) {
  return db
    .select({
      id: exams.id,
      setId: exams.setId,
      type: exams.type,
      status: exams.status,
      score: exams.score,
      // The History page's best score and both trend lines read this. Leaving it
      // out of the projection is invisible to the type-checker — the frontend
      // mirrors these shapes by hand — and shows up only as an empty page.
      scaledScore: exams.scaledScore,
      totalQuestions: exams.totalQuestions,
      startedAt: exams.startedAt,
      completedAt: exams.completedAt,
      setTitle: questionSets.title,
      /** Set-less exams carry their own name: "Topic: Algebra", "Mistake review". */
      label: exams.label,
      // Derived rather than left null for a set-less exam, because a null subject
      // is not merely missing here — it is wrong in every consumer. The History
      // page filters both trend lines on it, so a Math topic-practice exam would
      // silently drop out of the Math trend, and the dashboard's `subject ===
      // 'math'` checks would label it "R&W". The answer sheet is the
      // authoritative question list for any exam, so the first question's set
      // gives the subject; a topic exam is single-subject by construction.
      subject: sql<'english' | 'math'>`COALESCE(
        ${questionSets.subject},
        (SELECT qs.subject
           FROM ${examAnswers} ea
           JOIN ${questions} q ON q.id = ea.question_id
           JOIN ${questionSets} qs ON qs.id = q.set_id
          WHERE ea.exam_id = ${exams.id}
          ORDER BY ea.order_index
          LIMIT 1)
      )`,
    })
    .from(exams)
    // leftJoin, not inner: an exam assembled across sets — topic practice, a
    // mistake review — belongs to no set and would otherwise vanish from the
    // student's own history entirely.
    .leftJoin(questionSets, eq(exams.setId, questionSets.id))
    .where(eq(exams.studentId, studentId))
    .orderBy(desc(exams.startedAt));
}

// Exam provisioning lives in modules/exams so live exams create their answer
// sheets the same way practice and mock exams do.
