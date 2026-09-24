import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { database } from '../../core/db';
import {
  generatedContentTable,
  learnerTeacherLexiconTable,
  learnerLexiconTable,
  teacherLexiconTable,
} from '../../core/db/schema';
import { missing } from '../../core/errors';

/**
 * Vocabulary spaced repetition (SM-2 style).
 *
 * Two sources feed one review queue: words the student met in a question, and a
 * word bank curated by teachers. They live in different tables — the first is
 * created per student, the second is shared with per-student progress — but the
 * scheduling maths is identical, so it lives in one place below.
 */

/** How many due items one session offers before it becomes a chore. */
const REVIEW_BATCH_SIZE = 20;

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;
const MAX_EASE = 5.0;

export interface ReviewPlan {
  intervalDays: number;
  easeFactor: number;
  nextReviewAt: Date;
}

/**
 * Computes the next review.
 *
 * A correct recall multiplies the interval by the current ease and nudges ease
 * up, so well-known words drift out of the queue quickly. A miss resets the
 * interval to one day and lowers ease, which makes the word come back sooner
 * *and* keeps it coming back more often until it sticks. Ease is clamped so a
 * long streak cannot push a word out of sight for years, and a bad run cannot
 * drive it below daily.
 */
export function nextReviewPlan(
  currentEase: number,
  currentIntervalDays: number,
  isCorrect: boolean,
): ReviewPlan {
  const easeFactor = isCorrect
    ? Math.min(currentEase + 0.1, MAX_EASE)
    : Math.max(MIN_EASE, currentEase - 0.2);
  const intervalDays = isCorrect ? Math.round(currentIntervalDays * currentEase) : 1;

  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays);

  return { intervalDays, easeFactor, nextReviewAt };
}

/**
 * The combined due queue.
 *
 * Question-derived words are ordered by ease first, so the words the student
 * finds hardest come up before ones merely scheduled earlier. Teacher words are
 * included when they are due *or* never started, which is how a newly added
 * word bank reaches students without a backfill.
 */
export async function loadDueItems(studentId: string) {
  const now = new Date();

  const dueVocab = await database
    .select({
      vocabId: learnerLexiconTable.id,
      word: learnerLexiconTable.word,
      passageExcerpt: learnerLexiconTable.passageExcerpt,
      nextReviewAt: learnerLexiconTable.nextReviewAt,
      easeFactor: learnerLexiconTable.easeFactor,
      reviewCount: learnerLexiconTable.reviewCount,
      questionId: learnerLexiconTable.questionId,
    })
    .from(learnerLexiconTable)
    .where(and(eq(learnerLexiconTable.studentId, studentId), lte(learnerLexiconTable.nextReviewAt, now)))
    .orderBy(learnerLexiconTable.easeFactor, learnerLexiconTable.nextReviewAt)
    .limit(REVIEW_BATCH_SIZE);

  const questionItems = dueVocab.length > 0 ? await attachDrills(studentId, dueVocab) : [];

  // LEFT JOIN so words with no progress row (never reviewed) are included.
  const teacherRows = await database
    .select({
      vocabId: teacherLexiconTable.id,
      word: teacherLexiconTable.word,
      definition: teacherLexiconTable.definition,
      passageExcerpt: teacherLexiconTable.exampleSentence,
      nextReviewAt: learnerTeacherLexiconTable.nextReviewAt,
      easeFactor: learnerTeacherLexiconTable.easeFactor,
      reviewCount: learnerTeacherLexiconTable.reviewCount,
    })
    .from(teacherLexiconTable)
    .leftJoin(
      learnerTeacherLexiconTable,
      and(
        eq(learnerTeacherLexiconTable.teacherVocabWordId, teacherLexiconTable.id),
        eq(learnerTeacherLexiconTable.studentId, studentId),
      ),
    )
    .where(
      or(
        isNull(learnerTeacherLexiconTable.id),
        lte(learnerTeacherLexiconTable.nextReviewAt, now),
      ),
    );

  const teacherItems = teacherRows.map((row) => ({
    source: 'teacher' as const,
    vocabId: row.vocabId,
    word: row.word,
    definition: row.definition,
    passageExcerpt: row.passageExcerpt,
    nextReviewAt: row.nextReviewAt ? row.nextReviewAt.toISOString() : null,
    easeFactor: row.easeFactor ? String(row.easeFactor) : String(DEFAULT_EASE),
    reviewCount: row.reviewCount ?? 0,
  }));

  return [...questionItems, ...teacherItems];
}

/**
 * Attaches each word's generated drill in one query rather than per word.
 *
 * A word with no usable drill is dropped: the review UI has nothing to show
 * without one. Rejected drills are excluded, so an admin rejecting bad content
 * immediately removes it from every student's queue.
 */
async function attachDrills(
  studentId: string,
  dueVocab: {
    vocabId: string;
    word: string;
    passageExcerpt: string;
    nextReviewAt: Date;
    easeFactor: string;
    reviewCount: number;
    questionId: string;
  }[],
) {
  const drills = await database
    .select({
      id: generatedContentTable.id,
      content: generatedContentTable.content,
      sourceQuestionId: generatedContentTable.sourceQuestionId,
      createdAt: generatedContentTable.createdAt,
    })
    .from(generatedContentTable)
    .where(
      and(
        inArray(
          generatedContentTable.sourceQuestionId,
          dueVocab.map((v) => v.questionId),
        ),
        eq(generatedContentTable.studentId, studentId),
        eq(generatedContentTable.contentType, 'vocab_quiz'),
        sql`${generatedContentTable.qualityFlag} != 'rejected'`,
      ),
    )
    .orderBy(desc(generatedContentTable.createdAt));

  // Rows arrive newest-first, so the first hit per question is the latest drill.
  const latestByQuestion = new Map<string, { id: string; content: unknown }>();
  for (const drill of drills) {
    if (!latestByQuestion.has(drill.sourceQuestionId)) {
      latestByQuestion.set(drill.sourceQuestionId, { id: drill.id, content: drill.content });
    }
  }

  return dueVocab.flatMap((vocab) => {
    const drill = latestByQuestion.get(vocab.questionId);
    if (!drill) return [];
    return [
      {
        source: 'question' as const,
        ...vocab,
        generatedContentId: drill.id,
        content: drill.content,
      },
    ];
  });
}

export async function appraiseQuestionWord(studentId: string, vocabId: string, isCorrect: boolean) {
  const [vocab] = await database
    .select()
    .from(learnerLexiconTable)
    .where(and(eq(learnerLexiconTable.id, vocabId), eq(learnerLexiconTable.studentId, studentId)))
    .limit(1);
  if (!vocab) throw missing('Vocab item not found');

  const schedule = nextReviewPlan(parseFloat(String(vocab.easeFactor)), vocab.intervalDays, isCorrect);

  await database
    .update(learnerLexiconTable)
    .set({
      intervalDays: schedule.intervalDays,
      easeFactor: String(schedule.easeFactor),
      nextReviewAt: schedule.nextReviewAt,
      reviewCount: vocab.reviewCount + 1,
      lastCorrect: isCorrect,
    })
    .where(eq(learnerLexiconTable.id, vocabId));

  return { ok: true, nextReviewAt: schedule.nextReviewAt, intervalDays: schedule.intervalDays };
}

/** Teacher-bank review. Progress is created on first review, updated after. */
export async function appraiseTeacherWord(studentId: string, wordId: string, isCorrect: boolean) {
  const [word] = await database
    .select({ id: teacherLexiconTable.id })
    .from(teacherLexiconTable)
    .where(eq(teacherLexiconTable.id, wordId))
    .limit(1);
  if (!word) throw missing('Word not found');

  const [progress] = await database
    .select()
    .from(learnerTeacherLexiconTable)
    .where(
      and(
        eq(learnerTeacherLexiconTable.studentId, studentId),
        eq(learnerTeacherLexiconTable.teacherVocabWordId, wordId),
      ),
    )
    .limit(1);

  const schedule = nextReviewPlan(
    progress ? parseFloat(String(progress.easeFactor)) : DEFAULT_EASE,
    progress ? progress.intervalDays : 1,
    isCorrect,
  );

  if (progress) {
    await database
      .update(learnerTeacherLexiconTable)
      .set({
        intervalDays: schedule.intervalDays,
        easeFactor: String(schedule.easeFactor),
        nextReviewAt: schedule.nextReviewAt,
        reviewCount: progress.reviewCount + 1,
        lastCorrect: isCorrect,
      })
      .where(eq(learnerTeacherLexiconTable.id, progress.id));
  } else {
    await database.insert(learnerTeacherLexiconTable).values({
      studentId,
      teacherVocabWordId: wordId,
      nextReviewAt: schedule.nextReviewAt,
      intervalDays: schedule.intervalDays,
      easeFactor: String(schedule.easeFactor),
      reviewCount: 1,
      lastCorrect: isCorrect,
    });
  }

  return { ok: true, nextReviewAt: schedule.nextReviewAt, intervalDays: schedule.intervalDays };
}
