import { z } from 'zod';

/**
 * A review exam built from open mistakes.
 *
 * Both filters are optional: with neither, the student practises their worst
 * misses across everything, which is the common case from the dashboard.
 */
export const mistakePracticeRules = z.object({
  subject: z.enum(['english', 'math']).optional(),
  skillCode: z.string().min(1).max(64).optional(),
  limit: z.number().int().min(1).max(20).optional().default(10),
});
export type MisstepPracticePayload = z.infer<typeof mistakePracticeRules>;

export const mistakeQueryRules = z.object({
  subject: z.enum(['english', 'math']).optional(),
  skillCode: z.string().min(1).max(64).optional(),
  status: z.enum(['open', 'resolved']).optional(),
});
export type MisstepQuery = z.infer<typeof mistakeQueryRules>;
