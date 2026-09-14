import { z } from 'zod';

export const updateUserSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  password: z.string().min(8).max(128).optional(),
  teacherId: z.string().uuid().nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const createAccessCodeSchema = z.object({
  code: z.string().min(4).max(50),
  role: z.enum(['student', 'teacher', 'admin']),
  description: z.string().max(500).optional().default(''),
  maxUses: z.number().int().positive().nullable().optional(),
});
export type CreateAccessCodeInput = z.infer<typeof createAccessCodeSchema>;

/**
 * A bulk teacher assignment. `teacherId: null` clears it, which is how a student
 * is moved out of a class without deleting anything.
 */
export const assignStudentsSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(500),
  teacherId: z.string().uuid().nullable(),
});
export type AssignStudentsInput = z.infer<typeof assignStudentsSchema>;
