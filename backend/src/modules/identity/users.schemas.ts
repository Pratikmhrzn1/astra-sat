import { z } from 'zod';

export const editUserRules = z.object({
  name: z.string().min(2).max(255).optional(),
  password: z.string().min(8).max(128).optional(),
  teacherId: z.string().uuid().nullable().optional(),
});
export type UpdateUserPayload = z.infer<typeof editUserRules>;

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
