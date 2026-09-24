import { pgTable, uuid, integer, timestamp, date } from 'drizzle-orm/pg-core';
import { accountsTable } from './identity';

// ─────────────────────────────────────────────────────────────────────────────
// Student profile — the goal a student is working towards.
//
// Separate from `users` because it is student-only and expected to grow (study
// intensity, preferred pace). Until this existed the dashboard compared every
// student against a hardcoded target of 1500.
// ─────────────────────────────────────────────────────────────────────────────
export const learnerProfilesTable = pgTable('student_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .unique()
    .references(() => accountsTable.id, { onDelete: 'cascade' }),
  /** Target total on the 400-1600 scale. */
  targetScore: integer('target_score'),
  /** The SAT sitting the student is preparing for. */
  testDate: date('test_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type LearnerProfileRow = typeof learnerProfilesTable.$inferSelect;
