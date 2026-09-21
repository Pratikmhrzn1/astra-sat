import { pgTable, uuid, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { questions } from './content';
import { examAnswers } from './exams';
import { users } from './identity';

// ─────────────────────────────────────────────────────────────────────────────
// Mistake bank — every question a student has got wrong, once each.
//
// One row per (student, question), not per attempt: missing the same question
// three times bumps `missCount` rather than creating three entries, so the bank
// stays a worklist instead of a log. `resolvedAt` is stamped when the student
// later answers it correctly, which is what lets the bank drain.
//
// Modelled on `student_vocab`, which already does spaced repetition over words;
// this generalises the same idea to every question type.
// ─────────────────────────────────────────────────────────────────────────────
export const mistakes = pgTable(
  'mistakes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    /** The attempt that most recently got it wrong; kept for provenance. */
    examAnswerId: uuid('exam_answer_id').references(() => examAnswers.id, { onDelete: 'set null' }),
    missCount: integer('miss_count').notNull().default(1),
    firstMissedAt: timestamp('first_missed_at').notNull().defaultNow(),
    lastMissedAt: timestamp('last_missed_at').notNull().defaultNow(),
    /** Set when the student later answers this question correctly. */
    resolvedAt: timestamp('resolved_at'),
  },
  (table) => ({
    studentQuestionUnique: unique().on(table.studentId, table.questionId),
  }),
);

export type Mistake = typeof mistakes.$inferSelect;
