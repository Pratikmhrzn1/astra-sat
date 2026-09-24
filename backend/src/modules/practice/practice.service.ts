import { and, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import {
  tutorFeedbackTable,
  assessmentAnswersTable,
  generatedContentTable,
  passagesTable,
  questionSetsTable,
  questionsTable,
  learnerLexiconTable,
} from '../../core/db/schema';
import { invalidRequest, missing, rateLimited } from '../../core/errors';
import {
  tutorBudget,
  pickSentenceWithWord,
  pickVocabWord,
  selectFeedbackKinds,
  runConfirmFeedback,
  type FeedbackInput,
  type FeedbackKind,
} from '../ai';
import { examRepository as repo, markAnswer, isAnswered } from '../exams';
import type { ConfirmAnswerPayload } from './practice.schemas';

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

export interface ConfirmOutcome {
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

export async function acknowledgeAnswer(
  studentId: string,
  examId: string,
  questionId: string,
  input: ConfirmAnswerPayload,
): Promise<ConfirmOutcome> {
  const exam = await repo.loadOwnedAssessment(examId, studentId);
  if (!exam) throw missing('Exam not found');
  // Mock and live attempts are assessments — feedback there would amount to
  // telling a student mid-test which answers are wrong.
  if (exam.type !== 'individual') throw invalidRequest('Confirm is only available in practice mode');

  const [question] = await database
    .select({
      id: questionsTable.id,
      questionType: questionsTable.questionType,
      questionText: questionsTable.questionText,
      optionA: questionsTable.optionA,
      optionB: questionsTable.optionB,
      optionC: questionsTable.optionC,
      optionD: questionsTable.optionD,
      correctAnswer: questionsTable.correctAnswer,
      correctAnswerText: questionsTable.correctAnswerText,
      skillCode: questionsTable.skillCode,
      passageText: passagesTable.passageText,
      subject: questionSetsTable.subject,
    })
    .from(questionsTable)
    .leftJoin(passagesTable, eq(questionsTable.passageId, passagesTable.id))
    .innerJoin(questionSetsTable, eq(questionsTable.setId, questionSetsTable.id))
    // Scoped to this exam's answer sheet, so a question id from elsewhere is
    // rejected. Stronger than scoping by set: the sheet is per-exam, and it is
    // still correct for an exam drawn from several sets.
    .innerJoin(
      assessmentAnswersTable,
      and(eq(assessmentAnswersTable.questionId, questionsTable.id), eq(assessmentAnswersTable.examId, examId)),
    )
    .where(eq(questionsTable.id, questionId))
    .limit(1);
  if (!question) throw missing('Question not found');

  const [answerRow] = await database
    .select()
    .from(assessmentAnswersTable)
    .where(and(eq(assessmentAnswersTable.examId, examId), eq(assessmentAnswersTable.questionId, questionId)))
    .limit(1);
  if (!answerRow) throw missing('Answer record not found');

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
    isCorrect = markAnswer({
      questionType: question.questionType,
      selectedAnswer,
      selectedAnswerText,
      correctAnswer: question.correctAnswer,
      correctAnswerText: question.correctAnswerText,
    });

    await database
      .update(assessmentAnswersTable)
      .set({
        selectedAnswer: input.selectedAnswer ?? null,
        selectedAnswerText: input.selectedAnswerText ?? null,
        isCorrect,
        answeredAt: isAnswered(selectedAnswer, selectedAnswerText) ? new Date() : null,
      })
      .where(eq(assessmentAnswersTable.id, answerRow.id));
  }

  const context: FeedbackInput = {
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

  const applicableTypes = selectFeedbackKinds(context);
  const feedbackByType = await loadCachedFeedback(answerRow.id);

  const uncachedTypes = applicableTypes.filter((type) => !feedbackByType.has(type));
  if (uncachedTypes.length > 0) {
    // Charged per call actually dispatched — a fully cached confirm is free.
    const budget = tutorBudget.consume(studentId, uncachedTypes.length);
    if (!budget.allowed) {
      throw rateLimited(
        `AI request limit reached. Please wait ${minutesPhrase(budget.retryAfterSeconds)} before confirming more answers.`,
        { retryAfterSeconds: budget.retryAfterSeconds },
      );
    }

    const results = await runConfirmFeedback(context, uncachedTypes);
    const succeeded = results.filter((result) => result.aiResult !== null);

    if (succeeded.length > 0) {
      await database.insert(tutorFeedbackTable).values(
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
  const rows = await database
    .select({ feedbackType: tutorFeedbackTable.feedbackType, content: tutorFeedbackTable.content })
    .from(tutorFeedbackTable)
    .where(eq(tutorFeedbackTable.examAnswerId, examAnswerId));
  return new Map<string, unknown>(rows.map((row) => [row.feedbackType as FeedbackKind, row.content]));
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

  const [existingContent] = await database
    .select({ id: generatedContentTable.id })
    .from(generatedContentTable)
    .where(
      and(
        eq(generatedContentTable.sourceQuestionId, input.questionId),
        eq(generatedContentTable.studentId, input.studentId),
        eq(generatedContentTable.contentType, 'vocab_quiz'),
      ),
    )
    .limit(1);

  if (!existingContent) {
    await database.insert(generatedContentTable).values({
      contentType: 'vocab_quiz',
      sourceQuestionId: input.questionId,
      studentId: input.studentId,
      content: input.drill,
      qualityFlag: 'pending',
    });
  }

  const word = pickVocabWord(input.questionText);
  if (!word) return null;

  const [existingVocab] = await database
    .select({ id: learnerLexiconTable.id })
    .from(learnerLexiconTable)
    .where(and(eq(learnerLexiconTable.studentId, input.studentId), eq(learnerLexiconTable.word, word)))
    .limit(1);
  if (existingVocab) return existingVocab.id;

  // First review is tomorrow; the SM-2 schedule takes over from there.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [created] = await database
    .insert(learnerLexiconTable)
    .values({
      studentId: input.studentId,
      questionId: input.questionId,
      word,
      passageExcerpt: pickSentenceWithWord(input.passageText ?? '', word),
      nextReviewAt: tomorrow,
    })
    .returning({ id: learnerLexiconTable.id });

  return created.id;
}
