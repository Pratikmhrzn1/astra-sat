import { z } from 'zod';

/**
 * Ceiling for a client-reported elapsed time, in seconds (24 hours).
 *
 * `timeSpentSeconds` is the one value on the submit path that comes from the
 * browser and is stored as given, so it was accepting negatives and arbitrarily
 * large numbers. No sitting legitimately spans a day — the longest is a live
 * exam at 70 minutes — so anything beyond this is a bug or a tampered payload,
 * and either way should be rejected rather than persisted and displayed.
 *
 * This is a sanity bound, not enforcement: real per-exam limits arrive with the
 * server-authoritative timer, which computes the elapsed time itself.
 */
const MAX_TIME_SPENT_SECONDS = 24 * 60 * 60;

const timeSpentSeconds = z.number().int().min(0).max(MAX_TIME_SPENT_SECONDS).optional();

export const startExamSchema = z.object({
  setId: z.string().uuid('Invalid set ID'),
  type: z.enum(['individual']).default('individual'),
});
export type StartExamInput = z.infer<typeof startExamSchema>;

export const saveAnswersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      selectedAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
      selectedAnswerText: z.string().max(200).nullable().optional(),
    }),
  ),
  timeSpentSeconds,
});
export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;

export const submitExamSchema = z.object({
  timeSpentSeconds,
  /**
   * The player's final answers, saved before grading in the same request.
   *
   * Submit used to carry no answers at all, so it graded whatever the 30-second
   * autosave had last stored: every pick made in the final half-minute was lost,
   * the exam was graded as if those questions were skipped, and the review could
   * not show the student what they had chosen.
   */
  answers: saveAnswersSchema.shape.answers.optional(),
});
export type SubmitExamInput = z.infer<typeof submitExamSchema>;

export const nextModuleSchema = z.object({
  submittedExamId: z.string().uuid(),
});
export type NextModuleInput = z.infer<typeof nextModuleSchema>;
