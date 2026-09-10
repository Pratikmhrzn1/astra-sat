import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  examAnswers,
  exams,
  feedback,
  passages,
  questionSets,
  questions,
  teacherVocabWords,
  users,
} from '../../db/schema';
import { forbidden, notFound } from '../../http/errors';
import { normalizeFileUrl } from '../../lib/url';
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

/** Fails unless this student is assigned to this teacher. */
async function assertOwnsStudent(teacherId: string, studentId: string) {
  const [student] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, studentId), eq(users.teacherId, teacherId)))
    .limit(1);
  if (!student) throw notFound('Student not found or not assigned to you');
  return student;
}

export async function listStudents(teacherId: string) {
  return db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.teacherId, teacherId), eq(users.role, 'student')));
}

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
      subject: questionSets.subject,
    })
    .from(exams)
    .innerJoin(questionSets, eq(exams.setId, questionSets.id))
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
  const [student] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, input.studentId), eq(users.teacherId, teacherId)))
    .limit(1);
  // 403 rather than 404: the teacher named a real student, just not theirs.
  if (!student) throw forbidden('Student not assigned to you');

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

export async function listSets() {
  return db.select().from(questionSets).orderBy(desc(questionSets.createdAt));
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
 * Deletes a set. Passages, questions and — through them — every answer row and
 * cached feedback cascade with it, so this also erases the record of any attempt
 * students made at this set.
 */
export async function deleteSet(setId: string) {
  await assertSetExists(setId);
  await db.delete(questionSets).where(eq(questionSets.id, setId));
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
  return db.transaction(async (tx) => {
    const [set] = await tx
      .insert(questionSets)
      .values({
        title: input.title,
        subject: input.subject,
        description: input.description,
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
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!question) throw notFound('Question not found');
  return question;
}

export async function listQuestions(setId: string) {
  await assertSetExists(setId);
  const rows = await db
    .select()
    .from(questions)
    .where(eq(questions.setId, setId))
    .orderBy(questions.orderIndex);
  return rows.map((row) => ({ ...row, imageUrl: normalizeFileUrl(row.imageUrl) }));
}

export async function createQuestion(setId: string, input: CreateQuestionInput) {
  await assertSetExists(setId);
  const [question] = await db
    .insert(questions)
    .values({
      setId,
      ...input,
      // A tag a teacher typed is authoritative; the AI classifier will not
      // overwrite anything marked human_confirmed.
      subSkillSource: input.subSkill ? 'human_confirmed' : null,
    })
    .returning();
  return question;
}

export async function updateQuestion(questionId: string, input: UpdateQuestionInput) {
  await assertQuestionExists(questionId);
  const [updated] = await db
    .update(questions)
    .set(input)
    .where(eq(questions.id, questionId))
    .returning();
  return updated;
}

/** Used by the review UI to confirm or correct an AI-suggested tag. */
export async function updateQuestionSubSkill(questionId: string, input: UpdateSubSkillInput) {
  await assertQuestionExists(questionId);
  const [updated] = await db
    .update(questions)
    .set({ subSkill: input.subSkill ?? null, subSkillSource: input.subSkillSource })
    .where(eq(questions.id, questionId))
    .returning();
  return updated;
}

export async function deleteQuestion(questionId: string) {
  await assertQuestionExists(questionId);
  await db.delete(questions).where(eq(questions.id, questionId));
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
