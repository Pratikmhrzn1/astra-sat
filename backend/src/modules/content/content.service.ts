import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../core/db';
import { examAnswers, exams, mistakes, passages, questionSets, questions } from '../../core/db/schema';
import { badRequest, conflict, notFound } from '../../core/errors';
import { normalizeFileUrl } from '../../core/lib/url';
import { listSkillCodes } from '../taxonomy';
import type {
  CreatePassageInput,
  CreateQuestionInput,
  CreateSetInput,
  ImportJsonInput,
  UpdatePassageInput,
  UpdateQuestionInput,
  UpdateSetInput,
  UpdateSubSkillInput,
} from './content.schemas';

/**
 * Content authoring: question sets, passages and questions.
 *
 * **Content is shared.** Sets and their questions are a common library any
 * teacher may edit, which is why these functions check existence but not
 * authorship. (Students, by contrast, are owned — see modules/roster.)
 */

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
