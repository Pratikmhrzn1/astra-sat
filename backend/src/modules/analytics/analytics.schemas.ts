import { z } from 'zod';

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
