import { z } from 'zod';

export const commitFeedbackRules = z.object({
  category: z.enum(['bug', 'suggestion', 'other']).default('other'),
  message: z.string().min(10).max(2000).trim(),
});
export type SubmitFeedbackPayload = z.infer<typeof commitFeedbackRules>;
