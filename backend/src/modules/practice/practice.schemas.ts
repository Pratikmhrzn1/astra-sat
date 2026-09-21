import { z } from 'zod';

export const confirmAnswerSchema = z.object({
  selectedAnswer: z.enum(['a', 'b', 'c', 'd']).nullable().optional(),
  selectedAnswerText: z.string().max(200).nullable().optional(),
  confidence: z.enum(['sure', 'eliminated', 'guessed']),
  reasoning: z.string().max(1000).optional(),
});
export type ConfirmAnswerInput = z.infer<typeof confirmAnswerSchema>;

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

export const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  userMessage: z.string().min(1).max(2000).trim(),
  examId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
});
export type ChatInput = z.infer<typeof chatSchema>;
