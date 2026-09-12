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
 * A backup payload. Rows are `z.any()` on purpose: this validates the envelope
 * shape, and the database itself enforces the columns on insert.
 */
export const restoreSchema = z.object({
  version: z.number(),
  data: z.object({
    // Optional: added to backups after the Phase 2 migration, so a file exported
    // before it has no such key and must still restore. Users then land with a
    // null organization_id, which is what that column already tolerates.
    organizations: z.array(z.any()).optional(),
    users: z.array(z.any()),
    accessCodes: z.array(z.any()),
    questionSets: z.array(z.any()),
    questions: z.array(z.any()),
    exams: z.array(z.any()),
    examAnswers: z.array(z.any()),
    mockTests: z.array(z.any()),
    feedback: z.array(z.any()),
  }),
});
export type RestoreInput = z.infer<typeof restoreSchema>;

export const runSqlSchema = z.object({ sql: z.string().min(1).max(50000) });
export type RunSqlInput = z.infer<typeof runSqlSchema>;

export const flagContentSchema = z.object({
  qualityFlag: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().optional(),
});
export type FlagContentInput = z.infer<typeof flagContentSchema>;

export const listContentQuerySchema = z.object({
  type: z.enum(['vocab_quiz', 'skill_passage']).optional(),
  flag: z.enum(['pending', 'approved', 'rejected']).optional(),
});
export type ListContentQuery = z.infer<typeof listContentQuerySchema>;
