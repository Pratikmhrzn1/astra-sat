import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import {
  examAnswers,
  exams,
  feedback,
  mistakes,
  passages,
  questionSets,
  questions,
  teacherVocabWords,
  users,
} from '../../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../../http/errors';
import { normalizeFileUrl } from '../../lib/url';
import { publicUserColumns } from '../auth/auth.repository';
import { getProfile } from '../student/profile.service';
import { listSkillCodes } from '../skills/skills.service';
import { overview } from '../analytics/analytics.service';
import type {
  CreatePassageInput,
  CreateQuestionInput,
  CreateSetInput,
  ImportJsonInput,
  SendFeedbackInput,
  UpdatePassageInput,
  UpdateQuestionInput,
  UpdateSetInput,
  UpdateSubSkillInput,
  VocabWordInput,
} from './teacher.schemas';

/**
 * Teacher portal: roster, per-student results, content authoring and the shared
 * vocabulary bank.
 *
 * Two different ownership rules apply here, and mixing them up is the mistake
 * this module is arranged to prevent:
 *
 * - **Students are owned.** A teacher may only see students whose `teacherId`
 *   is theirs, so every student-scoped read passes through `assertOwnsStudent`.
 * - **Content is shared.** Question sets, passages and the vocabulary bank are
 *   a common library any teacher may edit, which is why those functions check
 *   existence but not authorship.
 */

// ── Roster ────────────────────────────────────────────────────────────────────

/**
 * Fails unless this student is assigned to this teacher.
 *
 * The projection is not decoration. `getStudentExamResults` returns this row to
 * the teacher's browser verbatim, so the bare `select()` this used to be shipped
 * the student's `password_hash` to the client on every results page.
 * `publicUserColumns` is the shared definition of what is safe to put on the
 * wire — widen that, never this call site.
 */
async function assertOwnsStudent(
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
    db
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

  return { exam, set: set[0] ?? null, student, results };
}

// ── Feedback to students ──────────────────────────────────────────────────────

export async function sendFeedback(teacherId: string, input: SendFeedbackInput) {
  await assertOwnsStudent(teacherId, input.studentId, 'forbidden');

  const [created] = await db
    .insert(feedback)
    .values({
      teacherId,
      studentId: input.studentId,
      examId: input.examId || null,
      content: input.content,
    })
    .returning();
  return created;
}

export async function listSentFeedback(teacherId: string) {
  return db
    .select({
      id: feedback.id,
      content: feedback.content,
      isRead: feedback.isRead,
      createdAt: feedback.createdAt,
      examId: feedback.examId,
      studentName: users.name,
      studentEmail: users.email,
    })
    .from(feedback)
    .innerJoin(users, eq(feedback.studentId, users.id))
    .where(eq(feedback.teacherId, teacherId))
    .orderBy(desc(feedback.createdAt));
}

// ── Question sets ─────────────────────────────────────────────────────────────

async function assertSetExists(setId: string) {
  const [set] = await db
    .select({ id: questionSets.id })
    .from(questionSets)
    .where(eq(questionSets.id, setId))
    .limit(1);
  if (!set) throw notFound('Question set not found');
  return set;
}

/** Archived sets are hidden everywhere, including here — see `deleteSet`. */
export async function listSets() {
  return db
    .select()
    .from(questionSets)
    .where(isNull(questionSets.archivedAt))
    .orderBy(desc(questionSets.createdAt));
}

/** New sets start as drafts so half-written content is never offered to students. */
export async function createSet(teacherId: string, input: CreateSetInput) {
  const [set] = await db
    .insert(questionSets)
    .values({
      title: input.title,
      subject: input.subject,
      description: input.description,
      difficulty: input.difficulty ?? null,
      createdBy: teacherId,
      isDraft: true,
      isLiveExam: input.isLiveExam ?? false,
    })
    .returning();
  return set;
}

export async function updateSet(setId: string, input: UpdateSetInput) {
  await assertSetExists(setId);
  const [updated] = await db
    .update(questionSets)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(questionSets.id, setId))
    .returning();
  return updated;
}

export async function publishSet(setId: string) {
  await assertSetExists(setId);
  const [updated] = await db
    .update(questionSets)
    .set({ isDraft: false, updatedAt: new Date() })
    .where(eq(questionSets.id, setId))
    .returning();
  return updated;
}

/**
 * Removes a set — by archiving it whenever anyone has attempted it.
 *
 * A real DELETE cascades `question_sets → exams → exam_answers → ai_feedback`,
 * so one click by any teacher used to erase every graded exam students had taken
 * on the set, and with them their scores, trends and mistake history. Now a set
 * with attempts is archived: hidden from every catalogue, picker and assembler,
 * while the history that points at it stays intact. A set nobody has touched is
 * still deleted outright, so abandoned drafts don't pile up.
 */
export async function deleteSet(setId: string): Promise<{ archived: boolean; title: string }> {
  await assertSetExists(setId);
  const [{ title }] = await db.select({ title: questionSets.title }).from(questionSets).where(eq(questionSets.id, setId)).limit(1);

  const [attempted] = await db
    .select({ id: exams.id })
    .from(exams)
    .where(eq(exams.setId, setId))
    .limit(1);
  const [answered] = attempted
    ? [attempted]
    : await db
        .select({ id: examAnswers.id })
        .from(examAnswers)
        .innerJoin(questions, eq(examAnswers.questionId, questions.id))
        .where(eq(questions.setId, setId))
        .limit(1);

  if (attempted || answered) {
    await db
      .update(questionSets)
      .set({ archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(questionSets.id, setId));
    return { archived: true, title };
  }

  await db.delete(questionSets).where(eq(questionSets.id, setId));
  return { archived: false, title };
}

/**
 * Bulk import of a whole set.
 *
 * Written as one transaction because a partial import is worse than none: a set
 * whose questions half-inserted looks complete in the list but is broken when a
 * student opens it. Passages are inserted first so questions can reference them
 * by the array index the payload uses.
 */
export async function importSetFromJson(teacherId: string, input: ImportJsonInput) {
  // Validated before the transaction opens, so a typo in one tag rejects the
  // whole payload with a clear message instead of rolling back mid-insert.
  const known = await listSkillCodes();
  for (const [index, question] of input.questions.entries()) {
    if (question.skillCode && !known.has(question.skillCode)) {
      throw badRequest(`Unknown skill code on question ${index + 1}: ${question.skillCode}`);
    }
  }

  return db.transaction(async (tx) => {
    const [set] = await tx
      .insert(questionSets)
      .values({
        title: input.title,
        subject: input.subject,
        description: input.description,
        difficulty: input.difficulty ?? null,
        isDraft: input.isDraft,
        createdBy: teacherId,
      })
      .returning();

    const passageIds: string[] = [];
    if (input.passages.length > 0) {
      const inserted = await tx
        .insert(passages)
        .values(
          input.passages.map((passage, index) => ({
            setId: set.id,
            title: passage.title ?? '',
            passageText: passage.passageText,
            orderIndex: passage.orderIndex ?? index,
          })),
        )
        .returning({ id: passages.id });
      passageIds.push(...inserted.map((row) => row.id));
    }

    await tx.insert(questions).values(
      input.questions.map((question, index) => ({
        setId: set.id,
        // An out-of-range passageIndex degrades to a standalone question
        // rather than failing the whole import.
        passageId:
          question.passageIndex != null && passageIds[question.passageIndex]
            ? passageIds[question.passageIndex]
            : null,
        questionType: question.questionType,
        questionText: question.questionText,
        subSkill: question.subSkill ?? null,
        // A tag in an import file was written by a person, so it counts as
        // confirmed and stays out of the AI Review queue.
        skillCode: question.skillCode ?? question.subSkill ?? null,
        difficulty: question.difficulty ?? null,
        subSkillSource: question.skillCode || question.subSkill ? ('human_confirmed' as const) : null,
        optionA: question.optionA ?? null,
        optionB: question.optionB ?? null,
        optionC: question.optionC ?? null,
        optionD: question.optionD ?? null,
        correctAnswer: question.correctAnswer ?? null,
        correctAnswerText: question.correctAnswerText ?? null,
        explanation: question.explanation ?? null,
        orderIndex: question.orderIndex ?? index,
      })),
    );

    return {
      set,
      questionCount: input.questions.length,
      passageCount: input.passages.length,
    };
  });
}

// ── Passages ──────────────────────────────────────────────────────────────────

export async function listPassages(setId: string) {
  await assertSetExists(setId);
  return db.select().from(passages).where(eq(passages.setId, setId)).orderBy(passages.orderIndex);
}

export async function createPassage(setId: string, input: CreatePassageInput) {
  await assertSetExists(setId);
  const [passage] = await db.insert(passages).values({ setId, ...input }).returning();
  return passage;
}

export async function updatePassage(passageId: string, input: UpdatePassageInput) {
  const [existing] = await db
    .select({ id: passages.id })
    .from(passages)
    .where(eq(passages.id, passageId))
    .limit(1);
  if (!existing) throw notFound('Passage not found');

  const [updated] = await db.update(passages).set(input).where(eq(passages.id, passageId)).returning();
  return updated;
}

export async function deletePassage(passageId: string) {
  const [existing] = await db
    .select({ id: passages.id })
    .from(passages)
    .where(eq(passages.id, passageId))
    .limit(1);
  if (!existing) throw notFound('Passage not found');
  // Questions referencing it survive with passage_id set to null.
  await db.delete(passages).where(eq(passages.id, passageId));
}

// ── Questions ─────────────────────────────────────────────────────────────────

async function assertQuestionExists(questionId: string) {
  const [question] = await db
    .select({ id: questions.id, retiredAt: questions.retiredAt })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!question) throw notFound('Question not found');
  // A stale editor tab still holding the old id must not fork a second version.
  if (question.retiredAt) throw conflict('This question has been replaced by a newer version. Reload to edit it.');
  return question;
}

/** Whether any exam — finished or in progress — has this question on its answer sheet. */
async function isQuestionAttempted(questionId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: examAnswers.id })
    .from(examAnswers)
    .where(eq(examAnswers.questionId, questionId))
    .limit(1);
  return !!row;
}

export async function listQuestions(setId: string) {
  await assertSetExists(setId);
  const rows = await db
    .select()
    .from(questions)
    // Retired versions stay in the table for the exams that used them, but are
    // not content any more — the editor shows only the live version.
    .where(and(eq(questions.setId, setId), isNull(questions.retiredAt)))
    .orderBy(questions.orderIndex);
  return rows.map((row) => ({ ...row, imageUrl: normalizeFileUrl(row.imageUrl) }));
}

/**
 * Rejects a tag that names a skill the taxonomy does not have.
 *
 * Checked against the table rather than a zod enum, because the taxonomy is data
 * and would otherwise need a code change and a redeploy every time a skill is
 * added. A bad code would otherwise be written and then silently never match
 * anything on the way out.
 */
async function assertKnownSkillCode(skillCode: string | null | undefined): Promise<void> {
  if (!skillCode) return;
  const known = await listSkillCodes();
  if (!known.has(skillCode)) {
    throw badRequest(`Unknown skill code: ${skillCode}`);
  }
}

/**
 * A tag a person typed is authoritative, whichever endpoint they typed it in.
 *
 * `subSkillSource = 'human_confirmed'` is what removes a question from the AI
 * Review queue. `createQuestion` set it and `updateQuestion` did not, so a tag
 * corrected in the ordinary editor stayed marked `ai_suggested` and came back in
 * the queue for someone to review again — against the very correction they had
 * just made.
 */
function provenanceFor(tagged: boolean): 'human_confirmed' | undefined {
  return tagged ? 'human_confirmed' : undefined;
}

export async function createQuestion(setId: string, input: CreateQuestionInput) {
  await assertSetExists(setId);
  await assertKnownSkillCode(input.skillCode);

  const [question] = await db
    .insert(questions)
    .values({
      setId,
      ...input,
      // The old path still works: a caller that sends only the legacy `subSkill`
      // gets the matching skill code too, since the five legacy values are
      // spelled identically as codes. Without this an external script tagging
      // the old way would write a tag that no reader looks at any more.
      skillCode: input.skillCode ?? input.subSkill ?? null,
      subSkillSource: provenanceFor(!!input.skillCode || !!input.subSkill) ?? null,
    })
    .returning();
  return question;
}

export async function updateQuestion(questionId: string, input: UpdateQuestionInput) {
  await assertQuestionExists(questionId);
  await assertKnownSkillCode(input.skillCode);

  // Only stamped when this edit actually carries a tag, so an unrelated edit —
  // fixing a typo in the question text — does not silently mark someone else's
  // AI suggestion as human-confirmed.
  const taggedHere = input.skillCode !== undefined || input.subSkill !== undefined;
  const subSkillSource = provenanceFor(taggedHere && (!!input.skillCode || !!input.subSkill));

  const changes = { ...input, ...(subSkillSource ? { subSkillSource } : {}) };

  // Untouched by any exam: edit in place, as before.
  if (!(await isQuestionAttempted(questionId))) {
    const [updated] = await db.update(questions).set(changes).where(eq(questions.id, questionId)).returning();
    return updated;
  }

  // Copy-on-write. Past answers keep pointing at the exact wording, options and
  // key the student saw, so fixing a typo — or a wrong answer key — never
  // silently rewrites a graded exam, its score or its AI feedback. The new row
  // takes over the question's place in the set; in-progress exams finish on the
  // version they started with.
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(questions).where(eq(questions.id, questionId)).limit(1);
    const { id: _oldId, createdAt: _createdAt, retiredAt: _retiredAt, supersedesId: _supersedesId, ...content } = current;

    const [created] = await tx
      .insert(questions)
      .values({ ...content, ...changes, supersedesId: questionId })
      .returning();

    await tx.update(questions).set({ retiredAt: new Date() }).where(eq(questions.id, questionId));

    // A mistake is about the question, not a particular wording of it, so the
    // student's mistake bank follows the question to its current version. The
    // new row has no mistakes yet, so the (student, question) unique key holds.
    await tx.update(mistakes).set({ questionId: created.id }).where(eq(mistakes.questionId, questionId));

    return created;
  });
}

/** Used by the review UI to confirm or correct an AI-suggested tag. */
export async function updateQuestionSubSkill(questionId: string, input: UpdateSubSkillInput) {
  await assertQuestionExists(questionId);
  await assertKnownSkillCode(input.skillCode);

  const [updated] = await db
    .update(questions)
    .set({ skillCode: input.skillCode ?? null, subSkillSource: input.subSkillSource })
    .where(eq(questions.id, questionId))
    .returning();
  return updated;
}

/**
 * Removes a question from its set — by retiring it once anyone has answered it.
 *
 * A DELETE cascades to `exam_answers`, which would pull the question out of every
 * graded exam that contained it and change those exams' question counts after the
 * fact. Retiring hides it from all new content instead.
 */
export async function deleteQuestion(questionId: string): Promise<{ retired: boolean }> {
  await assertQuestionExists(questionId);
  if (await isQuestionAttempted(questionId)) {
    await db.update(questions).set({ retiredAt: new Date() }).where(eq(questions.id, questionId));
    return { retired: true };
  }
  await db.delete(questions).where(eq(questions.id, questionId));
  return { retired: false };
}

// ── Vocabulary bank ───────────────────────────────────────────────────────────

export async function listVocabWords() {
  return db.select().from(teacherVocabWords).orderBy(desc(teacherVocabWords.createdAt));
}

export async function createVocabWord(input: VocabWordInput) {
  const [word] = await db
    .insert(teacherVocabWords)
    .values({
      word: input.word.trim(),
      definition: input.definition.trim(),
      exampleSentence: (input.exampleSentence ?? '').trim(),
    })
    .returning();
  return word;
}

export async function deleteVocabWord(wordId: string) {
  const [existing] = await db
    .select({ id: teacherVocabWords.id })
    .from(teacherVocabWords)
    .where(eq(teacherVocabWords.id, wordId))
    .limit(1);
  if (!existing) throw notFound('Word not found');
  // Cascades to every student's progress on this word.
  await db.delete(teacherVocabWords).where(eq(teacherVocabWords.id, wordId));
}
