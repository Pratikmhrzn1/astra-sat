import { z } from 'zod';

/**
 * A backup payload. Rows are `z.any()` on purpose: this validates the envelope
 * shape, and the database itself enforces the columns on insert.
 *
 * Only the original eight keys are required. Everything added to the backup set
 * later is optional, because a file exported before that table was covered
 * simply has no such key and must still restore — an old backup is exactly when
 * a restore matters most. `restoreBackup` treats a missing key as zero rows.
 */
const backupRows = z.array(z.any());
export const restoreSchema = z.object({
  version: z.number(),
  data: z.object({
    users: backupRows,
    accessCodes: backupRows,
    questionSets: backupRows,
    questions: backupRows,
    exams: backupRows,
    examAnswers: backupRows,
    mockTests: backupRows,
    feedback: backupRows,

    organizations: backupRows.optional(),
    passages: backupRows.optional(),
    libraryItems: backupRows.optional(),
    teacherVocabWords: backupRows.optional(),
    studentVocab: backupRows.optional(),
    studentTeacherVocabProgress: backupRows.optional(),
    studentProfiles: backupRows.optional(),
    studentSkillTriggers: backupRows.optional(),
    mistakes: backupRows.optional(),
    liveExamSessions: backupRows.optional(),
    liveExamParticipants: backupRows.optional(),
    liveExamQuestionFeedback: backupRows.optional(),
    platformFeedback: backupRows.optional(),
    surveyQuestions: backupRows.optional(),
    surveyResponses: backupRows.optional(),
    auditLog: backupRows.optional(),
  }),
});
export type RestoreInput = z.infer<typeof restoreSchema>;

export const runSqlSchema = z.object({ sql: z.string().min(1).max(50000) });
export type RunSqlInput = z.infer<typeof runSqlSchema>;
