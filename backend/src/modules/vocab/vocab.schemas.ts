import { z } from 'zod';

export const appraiseLexiconRules = z.object({ isCorrect: z.boolean() });
export type ReviewLexiconPayload = z.infer<typeof appraiseLexiconRules>;

export const vocabWordRules = z.object({
  word: z.string().min(1).max(100),
  definition: z.string().min(1).max(500),
  exampleSentence: z.string().max(500).optional(),
});
export type LexiconWordPayload = z.infer<typeof vocabWordRules>;
