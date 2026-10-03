import { z } from 'zod';

export const editUserRules = z.object({
  name: z.string().min(2).max(255).optional(),
  password: z.string().min(8).max(128).optional(),
  teacherId: z.string().uuid().nullable().optional(),
});
export type UpdateUserPayload = z.infer<typeof editUserRules>;

/**
 * The Account Creator: an admin makes a teacher or admin directly. Those roles
 * never come through public signup. The account is born active and verified,
 * since the admin vouches for it.
 */
export const createUserRules = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['teacher', 'admin']),
});
export type CreateUserPayload = z.infer<typeof createUserRules>;

export const addAccessCodeRules = z.object({
  code: z.string().min(4).max(50),
  role: z.enum(['student', 'teacher', 'admin']),
  description: z.string().max(500).optional().default(''),
  maxUses: z.number().int().positive().nullable().optional(),
});
export type CreateAccessCodePayload = z.infer<typeof addAccessCodeRules>;

/**
 * A bulk teacher assignment. `teacherId: null` clears it, which is how a student
 * is moved out of a class without deleting anything.
 */
export const assignStudentsRules = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  teacherId: z.string().uuid().nullable(),
});
export type AssignStudentsPayload = z.infer<typeof assignStudentsRules>;

/** `null` clears the expiry, so the account never expires. */
export const setExpiryRules = z.object({
  expiryDate: z.string().datetime({ offset: true }).nullable(),
});
export type SetExpiryPayload = z.infer<typeof setExpiryRules>;

/** `null` removes the cap. */
export const setDailyLimitRules = z.object({
  dailyTestLimit: z.number().int().min(1).max(1000).nullable(),
});
export type SetDailyLimitPayload = z.infer<typeof setDailyLimitRules>;

export const updatePlatformSettingsRules = z
  .object({
    trialDurationDays: z.number().int().min(1).max(3650),
    trialDailyTestLimit: z.number().int().min(1).max(1000),
    studentDurationDays: z.number().int().min(1).max(3650),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Nothing to update');
export type UpdatePlatformSettingsPayload = z.infer<typeof updatePlatformSettingsRules>;
