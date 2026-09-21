import { and, eq } from 'drizzle-orm';
import { db } from '../../core/db';
import {
  aiFeedback,
  examAnswers,
  generatedContent,
  passages,
  questionSets,
  questions,
  studentVocab,
} from '../../core/db/schema';
import { badRequest, notFound, tooManyRequests } from '../../core/errors';
import {
  aiRateLimiter,
  extractSentenceWithWord,
  extractVocabWord,
  getApplicableFeedbackTypes,
  orchestrateConfirmFeedback,
  type FeedbackContext,
  type FeedbackType,
} from '../ai';
import { examRepository as repo, gradeAnswer, hasAnswer } from '../exams';
import type { ConfirmAnswerInput } from './practice.schemas';

/**
 * Practice mode's per-question "confirm" step.
 *
 * This is where the student states their confidence and reasoning and gets
 * feedback back. The ordering below is deliberate and load-bearing:
 *
 *   grade -> decide applicable types -> read cache -> charge only the calls
 *   that will actually fire -> fan out -> persist -> respond -> trigger
 *   remediation in the background
 *
 * Getting that order wrong makes confirms either slow (AI on the critical path)
 * or expensive (re-running cached calls, charging budget for cache hits).
 */

export interface ConfirmResult {
  isCorrect: boolean;
  feedbacks: Record<string, unknown>;
  vocabTrackingId: string | null;
  /** Present when the answer was wrong on a tagged skill; run after responding. */
  skillTrigger: { subSkill: string; questionText: string; questionId: string } | null;
}

function minutesPhrase(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export async function confirmAnswer(
  studentId: string,
  examId: string,
  questionId: string,
  input: ConfirmAnswerInput,
): Promise<ConfirmResult> {
  const exam = await repo.findOwnedExam(examId, studentId);
  if (!exam) throw notFound('Exam not found');
  // Mock and live attempts are assessments — feedback there would amount to
  // telling a student mid-test which answers are wrong.
  if (exam.type !== 'individual') throw badRequest('Confirm is only available in practice mode');

  const [question] = await db
    .select({
      id: questions.id,
      questionType: questions.questionType,
      questionText: questions.questionText,
      optionA: questions.optionA,
      optionB: questions.optionB,
      optionC: questions.optionC,
      optionD: questions.optionD,
      correctAnswer: questions.correctAnswer,
      correctAnswerText: questions.correctAnswerText,
      skillCode: questions.skillCode,
      passageText: passages.passageText,
      subject: questionSets.subject,
    })
    .from(questions)
    .leftJoin(passages, eq(questions.passageId, passages.id))
    .innerJoin(questionSets, eq(questions.setId, questionSets.id))
    // Scoped to this exam's answer sheet, so a question id from elsewhere is
    // rejected. Stronger than scoping by set: the sheet is per-exam, and it is
    // still correct for an exam drawn from several sets.
    .innerJoin(
      examAnswers,
      and(eq(examAnswers.questionId, questions.id), eq(examAnswers.examId, examId)),
    )
    .where(eq(questions.id, questionId))
    .limit(1);
  if (!question) throw notFound('Question not found');

  const [answerRow] = await db
    .select()
    .from(examAnswers)
    .where(and(eq(examAnswers.examId, examId), eq(examAnswers.questionId, questionId)))
    .limit(1);
  if (!answerRow) throw notFound('Answer record not found');

  // Reviewing a finished exam must not rewrite what was submitted, so a
  // completed exam is read-only here and reuses its stored verdict.
  let isCorrect: boolean;
  let selectedAnswer: string | null;
  let selectedAnswerText: string | null;

  if (exam.status === 'completed') {
    isCorrect = answerRow.isCorrect ?? false;
    selectedAnswer = answerRow.selectedAnswer;
    selectedAnswerText = answerRow.selectedAnswerText;
  } else {
    selectedAnswer = input.selectedAnswer ?? null;
    selectedAnswerText = input.selectedAnswerText ?? null;
    isCorrect = gradeAnswer({
      questionType: question.questionType,
      selectedAnswer,
      selectedAnswerText,
      correctAnswer: question.correctAnswer,
      correctAnswerText: question.correctAnswerText,
    });

    await db
      .update(examAnswers)
      .set({
        selectedAnswer: input.selectedAnswer ?? null,
        selectedAnswerText: input.selectedAnswerText ?? null,
        isCorrect,
        answeredAt: hasAnswer(selectedAnswer, selectedAnswerText) ? new Date() : null,
      })
      .where(eq(examAnswers.id, answerRow.id));
  }

  const context: FeedbackContext = {
    questionText: question.questionText,
    questionType: question.questionType,
    skillCode: question.skillCode ?? null,
    subject: question.subject,
    optionA: question.optionA,
    optionB: question.optionB,
    optionC: question.optionC,
    optionD: question.optionD,
    correctAnswer: question.correctAnswer ?? null,
    correctAnswerText: question.correctAnswerText ?? null,
    selectedAnswer,
    selectedAnswerText,
    isCorrect,
    confidence: input.confidence,
    reasoning: input.reasoning ?? null,
    passageText: question.passageText ?? null,
  };

  const applicableTypes = getApplicableFeedbackTypes(context);
  const feedbackByType = await loadCachedFeedback(answerRow.id);

  const uncachedTypes = applicableTypes.filter((type) => !feedbackByType.has(type));
  if (uncachedTypes.length > 0) {
    // Charged per call actually dispatched — a fully cached confirm is free.
    const budget = aiRateLimiter.consume(studentId, uncachedTypes.length);
    if (!budget.allowed) {
      throw tooManyRequests(
        `AI request limit reached. Please wait ${minutesPhrase(budget.retryAfterSeconds)} before confirming more answers.`,
        { retryAfterSeconds: budget.retryAfterSeconds },
      );
    }

    const results = await orchestrateConfirmFeedback(context, uncachedTypes);
    const succeeded = results.filter((result) => result.aiResult !== null);

    if (succeeded.length > 0) {
      await db.insert(aiFeedback).values(
        succeeded.map((result) => ({
          examAnswerId: answerRow.id,
          feedbackType: result.feedbackType,
          content: result.aiResult!.parsed as Record<string, unknown>,
          modelUsed: result.aiResult!.modelUsed,
          latencyMs: result.aiResult!.latencyMs,
          promptTokens: result.aiResult!.promptTokens,
          completionTokens: result.aiResult!.completionTokens,
          costUsd: String(result.aiResult!.costUsd),
          parseFailed: result.aiResult!.parseFailed,
        })),
      );
    }

    for (const result of succeeded) {
      feedbackByType.set(result.feedbackType, result.aiResult!.parsed);
    }
  }

  const vocabTrackingId = await trackVocabulary({
    studentId,
    questionId,
    skillCode: question.skillCode,
    questionText: question.questionText,
    passageText: question.passageText,
    drill: feedbackByType.get('vocab_drill') as Record<string, unknown> | undefined,
  });

  // A type that failed is reported as null rather than omitted, so the client
  // can distinguish "not applicable here" from "we tried and it broke".
  const feedbacks: Record<string, unknown> = {};
  for (const type of applicableTypes) {
    feedbacks[type] = feedbackByType.get(type) ?? null;
  }

  return {
    isCorrect,
    feedbacks,
    vocabTrackingId,
    skillTrigger:
      !isCorrect && question.skillCode
        ? { subSkill: question.skillCode, questionText: question.questionText, questionId }
        : null,
  };
}

/** All cached feedback for one answer, in a single query rather than per type. */
async function loadCachedFeedback(examAnswerId: string): Promise<Map<string, unknown>> {
  const rows = await db
    .select({ feedbackType: aiFeedback.feedbackType, content: aiFeedback.content })
    .from(aiFeedback)
    .where(eq(aiFeedback.examAnswerId, examAnswerId));
  return new Map<string, unknown>(rows.map((row) => [row.feedbackType as FeedbackType, row.content]));
}

/**
 * Files a vocabulary word for spaced repetition the first time a student meets
 * it, and records the generated drill for admin review. Both are keyed so that
 * re-confirming the same question adds nothing new.
 */
async function trackVocabulary(input: {
  studentId: string;
  questionId: string;
  skillCode: string | null;
  questionText: string;
  passageText: string | null;
  drill: Record<string, unknown> | undefined;
}): Promise<string | null> {
  if (!input.drill || input.skillCode !== 'vocab_in_context') return null;

  const [existingContent] = await db
    .select({ id: generatedContent.id })
    .from(generatedContent)
    .where(
      and(
        eq(generatedContent.sourceQuestionId, input.questionId),
        eq(generatedContent.studentId, input.studentId),
        eq(generatedContent.contentType, 'vocab_quiz'),
      ),
    )
    .limit(1);

  if (!existingContent) {
    await db.insert(generatedContent).values({
      contentType: 'vocab_quiz',
      sourceQuestionId: input.questionId,
      studentId: input.studentId,
      content: input.drill,
      qualityFlag: 'pending',
    });
  }

  const word = extractVocabWord(input.questionText);
  if (!word) return null;

  const [existingVocab] = await db
    .select({ id: studentVocab.id })
    .from(studentVocab)
    .where(and(eq(studentVocab.studentId, input.studentId), eq(studentVocab.word, word)))
    .limit(1);
  if (existingVocab) return existingVocab.id;

  // First review is tomorrow; the SM-2 schedule takes over from there.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [created] = await db
    .insert(studentVocab)
    .values({
      studentId: input.studentId,
      questionId: input.questionId,
      word,
      passageExcerpt: extractSentenceWithWord(input.passageText ?? '', word),
      nextReviewAt: tomorrow,
    })
    .returning({ id: studentVocab.id });

  return created.id;
}
