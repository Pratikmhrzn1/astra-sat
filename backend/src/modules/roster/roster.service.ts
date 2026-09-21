import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../core/db';
import { examAnswers, exams, questionSets, questions, users } from '../../core/db/schema';
import { forbidden, notFound } from '../../core/errors';
import { getProfile, overview } from '../analytics';
import { examRepository } from '../exams';
import { publicUserColumns } from '../identity';

/**
 * A teacher's roster: the students assigned to them, and each student's goal,
 * analytics and exam history.
 *
 * **Students are owned.** A teacher may only see students whose `teacherId` is
 * theirs, so every student-scoped read passes through `assertOwnsStudent` — which
 * other modules that act on a teacher's students (messages) reuse.
 */

/**
 * Fails unless this student is assigned to this teacher.
 *
 * The projection is not decoration. `getStudentExamResults` returns this row to
 * the teacher's browser verbatim, so the bare `select()` this used to be shipped
 * the student's `password_hash` to the client on every results page.
 * `publicUserColumns` is the shared definition of what is safe to put on the
 * wire — widen that, never this call site.
 */
export async function assertOwnsStudent(
  teacherId: string,
  studentId: string,
  /**
   * Reads answer 404 — the teacher shouldn't learn whether the id exists. A
   * write names a student the teacher chose, so it answers 403.
   */
  onMissing: 'notFound' | 'forbidden' = 'notFound',
) {
  const [student] = await db
    .select(publicUserColumns)
    .from(users)
    .where(and(eq(users.id, studentId), eq(users.teacherId, teacherId)))
    .limit(1);
  if (!student) {
    throw onMissing === 'forbidden'
      ? forbidden('Student not assigned to you')
      : notFound('Student not found or not assigned to you');
  }
  return student;
}

export async function listStudents(teacherId: string) {
  return db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.teacherId, teacherId), eq(users.role, 'student')));
}

/**
 * One student, with the goal they are working towards.
 *
 * The profile is null until the student sets one, and the teacher view must show
 * that as "no target set" rather than substituting a number — the same rule the
 * student's own dashboard follows.
 */
export async function getStudentDetail(teacherId: string, studentId: string) {
  const student = await assertOwnsStudent(teacherId, studentId);
  return { student, profile: await getProfile(studentId) };
}

/**
 * The same analytics the student sees, for a student on this teacher's roster.
 *
 * Identical numbers by construction — one set of query functions, called with
 * one student id. A teacher and a student disagreeing about a percentage is a
 * support conversation nobody wants.
 */
export async function getStudentAnalytics(teacherId: string, studentId: string) {
  await assertOwnsStudent(teacherId, studentId);
  return overview(studentId);
}

/**
 * Every exam this student has sat, newest first.
 *
 * The join is a `leftJoin` because an exam need not belong to a set: topic
 * practice and mistake reviews are assembled across many sets and own none. An
 * `innerJoin` here silently dropped those rows, so a teacher would have seen an
 * incomplete history the moment set-less exams existed —
 * `getStudentExamResults` below already tolerated a null `setId`, so the two
 * disagreed. Such an exam carries its own `label` instead of a set title.
 */
export async function listStudentExams(teacherId: string, studentId: string) {
  await assertOwnsStudent(teacherId, studentId);

  return db
    .select({
      id: exams.id,
      type: exams.type,
      status: exams.status,
      score: exams.score,
      totalQuestions: exams.totalQuestions,
      startedAt: exams.startedAt,
      completedAt: exams.completedAt,
      setTitle: questionSets.title,
      label: exams.label,
      // Derived for a set-less exam the same way the student's own history does
      // it, so the two views agree. Left null, a topic exam would show no
      // subject badge here while the student saw one.
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
    .leftJoin(questionSets, eq(exams.setId, questionSets.id))
    .where(eq(exams.studentId, studentId))
    .orderBy(desc(exams.startedAt));
}

export async function getStudentExamResults(teacherId: string, studentId: string, examId: string) {
  const student = await assertOwnsStudent(teacherId, studentId);

  const [exam] = await db
    .select()
    .from(exams)
    .where(and(eq(exams.id, examId), eq(exams.studentId, studentId)))
    .limit(1);
  if (!exam) throw notFound('Exam not found');

  const [results, set] = await Promise.all([
    // The same rows the student sees in their own report, so a teacher reading
    // a passage question is not left guessing what it referred to. Keyed by
    // `questionId` rather than `id` because this response always has been —
    // the teacher client reads that name.
    examRepository
      .findReviewRowsForExam(exam.id)
      .then((rows) => rows.map(({ id, ...rest }) => ({ questionId: id, ...rest }))),
    // An exam assembled across sets has no owning set to describe.
    exam.setId
      ? db
          .select({ title: questionSets.title, subject: questionSets.subject })
          .from(questionSets)
          .where(eq(questionSets.id, exam.setId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return { exam, set: set[0] ?? null, student, results };
}
