import { z } from 'zod';

export const reviewVocabSchema = z.object({ isCorrect: z.boolean() });
export type ReviewVocabInput = z.infer<typeof reviewVocabSchema>;

export const vocabWordSchema = z.object({
  word: z.string().min(1).max(100),
  definition: z.string().min(1).max(500),
  exampleSentence: z.string().max(500).optional(),
});
export type VocabWordInput = z.infer<typeof vocabWordSchema>;
