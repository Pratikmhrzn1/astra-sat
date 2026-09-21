import { and, desc, eq } from 'drizzle-orm';
import { db } from '../../core/db';
import { generatedContent, passages, questionSets, questions } from '../../core/db/schema';
import { notFound, unprocessable } from '../../core/errors';
import type { FlagContentInput, ListContentQuery } from './content.schemas';

/**
 * The quality gate for AI-generated content.
 *
 * Nothing a model writes reaches a student unreviewed. Generated vocabulary
 * drills and skill passages land as `pending`; an admin approves or rejects
 * them here, and only approval promotes a passage into the live question
 * tables students can actually be served.
 */

/** Shape a generated skill passage must have before it can be promoted. */
interface SkillPassageContent {
  passage: { title?: string; text: string; topic?: string };
  questions: Array<{
    questionText: string;
    options: { A: string; B: string; C: string; D: string };
    correctAnswer: string;
    explanation?: string;
    subSkill?: string;
  }>;
  generationMeta?: { targetSubSkill?: string; difficultyLevel?: string };
}

export async function listGeneratedContent(query: ListContentQuery) {
  const conditions = [];
  if (query.type) conditions.push(eq(generatedContent.contentType, query.type));
  if (query.flag) conditions.push(eq(generatedContent.qualityFlag, query.flag));

  return db
    .select({
      id: generatedContent.id,
      contentType: generatedContent.contentType,
      qualityFlag: generatedContent.qualityFlag,
      createdAt: generatedContent.createdAt,
      content: generatedContent.content,
      studentId: generatedContent.studentId,
      sourceQuestionId: generatedContent.sourceQuestionId,
      // The question that prompted it, so a reviewer can judge relevance.
      questionText: questions.questionText,
      optionA: questions.optionA,
      optionB: questions.optionB,
      optionC: questions.optionC,
      optionD: questions.optionD,
      correctAnswer: questions.correctAnswer,
    })
    .from(generatedContent)
    .innerJoin(questions, eq(generatedContent.sourceQuestionId, questions.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(generatedContent.createdAt));
}

export async function flagContent(contentId: string, input: FlagContentInput) {
  const [row] = await db
    .select()
    .from(generatedContent)
    .where(eq(generatedContent.id, contentId))
    .limit(1);
  if (!row) throw notFound('Generated content not found');

  // Approving twice would promote the same passage twice, so the second
  // approval is a no-op that returns the row as it stands.
  if (row.qualityFlag === 'approved' && input.qualityFlag === 'approved') {
    return row;
  }

  if (input.qualityFlag === 'rejected') {
    const [updated] = await db
      .update(generatedContent)
      .set({
        qualityFlag: 'rejected',
        ...(input.rejectionReason ? { rejectionReason: input.rejectionReason } : {}),
      })
      .where(eq(generatedContent.id, contentId))
      .returning();
    return updated;
  }

  if (row.contentType === 'skill_passage') {
    return promoteSkillPassage(contentId, row.content as unknown as SkillPassageContent);
  }

  // Vocabulary drills need no promotion — approval just makes them servable.
  const [updated] = await db
    .update(generatedContent)
    .set({ qualityFlag: 'approved' })
    .where(eq(generatedContent.id, contentId))
    .returning();
  return updated;
}

/**
 * Checks generated content before anything is written.
 *
 * Validation runs first and separately so a malformed passage is rejected
 * outright rather than leaving a half-built set behind. Everything the model
 * produced is treated as untrusted.
 */
function assertPromotable(content: SkillPassageContent): void {
  if (!content?.passage?.text) {
    throw unprocessable('Generated content is missing its passage text');
  }
  if (!Array.isArray(content.questions) || content.questions.length === 0) {
    throw unprocessable('Generated content has no questions');
  }

  const validAnswers = new Set(['a', 'b', 'c', 'd', 'A', 'B', 'C', 'D']);
  for (const question of content.questions) {
    if (!question.correctAnswer || !validAnswers.has(question.correctAnswer)) {
      throw unprocessable(
        `Generated content has invalid correctAnswer: ${question.correctAnswer ?? 'null'}`,
      );
    }
    if (
      !question.questionText ||
      !question.options?.A ||
      !question.options?.B ||
      !question.options?.C ||
      !question.options?.D
    ) {
      throw unprocessable('Generated content is missing required question fields');
    }
  }
}

/**
 * Promotes an approved passage into the live tables.
 *
 * All the writes — set, passage, questions, and the flag on the source row —
 * happen in one transaction, so a failure cannot leave a passage with no
 * questions, or content marked approved that was never actually published.
 *
 * Generated passages accumulate into one set per sub-skill rather than a new
 * set each time. The lookup requires `generated = true` so a teacher's own set
 * that happens to share the title is never written into.
 */
async function promoteSkillPassage(contentId: string, content: SkillPassageContent) {
  assertPromotable(content);

  const subSkill = content.generationMeta?.targetSubSkill ?? 'unknown';
  const readableSkill = subSkill.replace(/_/g, ' ');
  const setTitle = `AI Practice: ${readableSkill}`;

  return db.transaction(async (tx) => {
    const [existingSet] = await tx
      .select({ id: questionSets.id })
      .from(questionSets)
      .where(and(eq(questionSets.title, setTitle), eq(questionSets.generated, true)))
      .limit(1);

    const setId =
      existingSet?.id ??
      (
        await tx
          .insert(questionSets)
          .values({
            title: setTitle,
            subject: 'english',
            description: `AI-generated practice passages for ${readableSkill} (Digital SAT module 2)`,
            generated: true,
          })
          .returning({ id: questionSets.id })
      )[0].id;

    const [passage] = await tx
      .insert(passages)
      .values({
        setId,
        title: content.passage.title ?? '',
        passageText: content.passage.text,
        generated: true,
        orderIndex: 0,
      })
      .returning({ id: passages.id });

    await tx.insert(questions).values(
      content.questions.map((question, index) => ({
        setId,
        passageId: passage.id,
        questionType: 'multiple_choice' as const,
        questionText: question.questionText,
        optionA: question.options.A,
        optionB: question.options.B,
        optionC: question.options.C,
        optionD: question.options.D,
        correctAnswer: question.correctAnswer.toLowerCase() as 'a' | 'b' | 'c' | 'd',
        explanation: question.explanation ?? '',
        // Generated remediation always targets one of the five Reading and
        // Writing skills, whose codes are spelled the same in both columns.
        subSkill: subSkill as 'grammar' | 'inference' | 'command_of_evidence' | 'vocab_in_context' | 'transitions',
        skillCode: subSkill,
        subSkillSource: 'ai_suggested' as const,
        generated: true,
        orderIndex: index,
      })),
    );

    // live_set_id is how the student-facing lookup finds this passage.
    const [updated] = await tx
      .update(generatedContent)
      .set({ qualityFlag: 'approved', liveSetId: setId })
      .where(eq(generatedContent.id, contentId))
      .returning();

    return { ...updated, liveSetId: setId };
  });
}
