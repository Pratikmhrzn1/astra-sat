import { and, desc, eq, sql } from 'drizzle-orm';
import { database } from '../../core/db';
import { assessmentAnswersTable, assessmentsTable, questionSetsTable, questionsTable, accountsTable } from '../../core/db/schema';
import { notPermitted, missing } from '../../core/errors';
import { fetchLearnerProfile, insightsOverview } from '../analytics';
import { examRepository } from '../exams';
import { publicAccountFields } from '../identity';

/**
 * A teacher's roster: the students assigned to them, and each student's goal,
 * analytics and exam history.
 *
 * **Students are owned.** A teacher may only see students whose `teacherId` is
 * theirs, so every student-scoped read passes through `ensureOwnsStudent` — which
 * other modules that act on a teacher's students (messages) reuse.
 */

/**
 * Fails unless this student is assigned to this teacher.
 *
 * The projection is not decoration. `fetchStudentAssessmentResults` returns this row to
 * the teacher's browser verbatim, so the bare `select()` this used to be shipped
 * the student's `password_hash` to the client on every results page.
 * `publicAccountFields` is the shared definition of what is safe to put on the
 * wire — widen that, never this call site.
 */
export async function ensureOwnsStudent(
  teacherId: string,
  studentId: string,
  /**
   * Reads answer 404 — the teacher shouldn't learn whether the id exists. A
   * write names a student the teacher chose, so it answers 403.
   */
  onMissing: 'notFound' | 'forbidden' = 'notFound',
) {
  const [student] = await database
    .select(publicAccountFields)
    .from(accountsTable)
    .where(and(eq(accountsTable.id, studentId), eq(accountsTable.teacherId, teacherId)))
    .limit(1);
  if (!student) {
    throw onMissing === 'forbidden'
      ? notPermitted('Student not assigned to you')
      : missing('Student not found or not assigned to you');
  }
  return student;
}

export async function collectStudents(teacherId: string) {
  return database
    .select({ id: accountsTable.id, email: accountsTable.email, name: accountsTable.name, createdAt: accountsTable.createdAt })
    .from(accountsTable)
    .where(and(eq(accountsTable.teacherId, teacherId), eq(accountsTable.role, 'student')));
}

/**
 * One student, with the goal they are working towards.
 *
 * The profile is null until the student sets one, and the teacher view must show
 * that as "no target set" rather than substituting a number — the same rule the
 * student's own dashboard follows.
 */
export async function fetchStudentDetail(teacherId: string, studentId: string) {
  const student = await ensureOwnsStudent(teacherId, studentId);
  return { student, profile: await fetchLearnerProfile(studentId) };
}

/**
 * The same analytics the student sees, for a student on this teacher's roster.
 *
 * Identical numbers by construction — one set of query functions, called with
 * one student id. A teacher and a student disagreeing about a percentage is a
 * support conversation nobody wants.
 */
export async function fetchStudentAnalytics(teacherId: string, studentId: string) {
  await ensureOwnsStudent(teacherId, studentId);
  return insightsOverview(studentId);
}

/**
 * Every exam this student has sat, newest first.
 *
 * The join is a `leftJoin` because an exam need not belong to a set: topic
 * practice and mistake reviews are assembled across many sets and own none. An
 * `innerJoin` here silently dropped those rows, so a teacher would have seen an
 * incomplete history the moment set-less exams existed —
 * `fetchStudentAssessmentResults` below already tolerated a null `setId`, so the two
 * disagreed. Such an exam carries its own `label` instead of a set title.
 */
export async function collectStudentAssessments(teacherId: string, studentId: string) {
  await ensureOwnsStudent(teacherId, studentId);

  return database
    .select({
      id: assessmentsTable.id,
      type: assessmentsTable.type,
      status: assessmentsTable.status,
      score: assessmentsTable.score,
      totalQuestions: assessmentsTable.totalQuestions,
      startedAt: assessmentsTable.startedAt,
      completedAt: assessmentsTable.completedAt,
      setTitle: questionSetsTable.title,
      label: assessmentsTable.label,
      // Derived for a set-less exam the same way the student's own history does
      // it, so the two views agree. Left null, a topic exam would show no
      // subject badge here while the student saw one.
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
    .leftJoin(questionSetsTable, eq(assessmentsTable.setId, questionSetsTable.id))
    .where(eq(assessmentsTable.studentId, studentId))
    .orderBy(desc(assessmentsTable.startedAt));
}

export async function fetchStudentAssessmentResults(teacherId: string, studentId: string, examId: string) {
  const student = await ensureOwnsStudent(teacherId, studentId);

  const [exam] = await database
    .select()
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.id, examId), eq(assessmentsTable.studentId, studentId)))
    .limit(1);
  if (!exam) throw missing('Exam not found');

  const [results, set] = await Promise.all([
    // The same rows the student sees in their own report, so a teacher reading
    // a passage question is not left guessing what it referred to. Keyed by
    // `questionId` rather than `id` because this response always has been —
    // the teacher client reads that name.
    examRepository
      .loadReviewRowsForAssessment(exam.id)
      .then((rows) => rows.map(({ id, ...rest }) => ({ questionId: id, ...rest }))),
    // An exam assembled across sets has no owning set to describe.
    exam.setId
      ? database
          .select({ title: questionSetsTable.title, subject: questionSetsTable.subject })
          .from(questionSetsTable)
          .where(eq(questionSetsTable.id, exam.setId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return { exam, set: set[0] ?? null, student, results };
}
