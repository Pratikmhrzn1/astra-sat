import { z } from 'zod';

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
  timeSpentSeconds: z.number().int().optional(),
});
export type SaveAnswersInput = z.infer<typeof saveAnswersSchema>;

export const submitExamSchema = z.object({
  timeSpentSeconds: z.number().int().optional(),
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

export const reviewVocabSchema = z.object({ isCorrect: z.boolean() });
export type ReviewVocabInput = z.infer<typeof reviewVocabSchema>;

export const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  userMessage: z.string().min(1).max(2000).trim(),
  examId: z.string().uuid().optional(),
  questionId: z.string().uuid().optional(),
});
export type ChatInput = z.infer<typeof chatSchema>;
