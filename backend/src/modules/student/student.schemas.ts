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

export const confirmAnswerSchema = z.object({
  selectedAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
  selectedAnswerText: z.string().max(200).nullable().optional(),
  confidence: z.enum(['sure', 'eliminated', 'guessed']),
  reasoning: z.string().max(1000).optional(),
});
export type ConfirmAnswerInput = z.infer<typeof confirmAnswerSchema>;

export const nextModuleSchema = z.object({
  submittedExamId: z.string().uuid(),
});
export type NextModuleInput = z.infer<typeof nextModuleSchema>;

/**
 * The student's goal. Both fields are nullable so a student can clear one
 * without clearing the other.
 *
 * The target is bounded to the reportable SAT range and to multiples of 10,
 * because that is how scores are reported — a target of 1447 could never be
 * met exactly, so the gap shown against it would never reach zero.
 */
export const updateProfileSchema = z.object({
  targetScore: z
    .number()
    .int()
    .min(400)
    .max(1600)
    .multipleOf(10, 'Target must be a multiple of 10')
    .nullable()
    .optional(),
  testDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Test date must be YYYY-MM-DD')
    .nullable()
    .optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * A review exam built from open mistakes.
 *
 * Both filters are optional: with neither, the student practises their worst
 * misses across everything, which is the common case from the dashboard.
 */
export const mistakePracticeSchema = z.object({
  subject: z.enum(['english', 'math']).optional(),
  skillCode: z.string().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(20).optional().default(10),
});
export type MistakePracticeInput = z.infer<typeof mistakePracticeSchema>;

export const mistakeQuerySchema = z.object({
  subject: z.enum(['english', 'math']).optional(),
  skillCode: z.string().min(1).max(64).optional(),
  status: z.enum(['open', 'resolved']).optional(),
});
export type MistakeQuery = z.infer<typeof mistakeQuerySchema>;

/**
 * Practice by topic. `skillCode` is validated against the `skills` table in the
 * service rather than as a zod enum — the taxonomy is data, not code.
 *
 * The count is capped at 20 because this is a practice set, not a section: the
 * real thing is 27 questions and carries a mock's weight and timing.
 */
export const topicExamSchema = z.object({
  subject: z.enum(['english', 'math']),
  skillCode: z.string().min(1).max(64),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  count: z.number().int().min(5).max(20).optional().default(10),
});
export type TopicExamInput = z.infer<typeof topicExamSchema>;

export const reviewVocabSchema = z.object({ isCorrect: z.boolean() });
export type ReviewVocabInput = z.infer<typeof reviewVocabSchema>;

export const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  userMessage: z.string().min(1).max(2000).trim(),
  examId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
});
export type ChatInput = z.infer<typeof chatSchema>;
