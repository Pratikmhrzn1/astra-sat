import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';
import { intakeQuestionTypeChoices } from './enums';
import { accountsTable } from './identity';

/**
 * The onboarding survey every new student answers once, before the app lets
 * them anywhere else. Admins author the questions, so the question set is data
 * rather than code and can change without a deploy.
 *
 * A student is "done" when `users.survey_completed_at` is set — not when a
 * response row exists — so adding a question later does not re-gate accounts
 * that already answered the questions that existed at their signup.
 */
export const intakeQuestionsTable = pgTable('survey_questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  prompt: text('prompt').notNull(),
  type: intakeQuestionTypeChoices('type').notNull().default('single_choice'),
  /** Choice labels, for the two choice types. Empty for short_text and scale. */
  options: jsonb('options').$type<string[]>().notNull().default([]),
  isRequired: boolean('is_required').notNull().default(true),
  /** Inactive questions stay for their existing answers but are never asked again. */
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: uuid('created_by').references(() => accountsTable.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const intakeResponsesTable = pgTable(
  'survey_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
    questionId: uuid('question_id').notNull().references(() => intakeQuestionsTable.id, { onDelete: 'cascade' }),
    /**
     * Shaped by the question's type: a string for short_text and single_choice,
     * a string[] for multi_choice, a number for scale. One jsonb column rather
     * than three nullable ones, because the type already says how to read it.
     */
    answer: jsonb('answer').$type<string | string[] | number>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => ({
    userQuestionUnique: unique().on(table.userId, table.questionId),
  }),
);

export type IntakeQuestionRow = typeof intakeQuestionsTable.$inferSelect;
export type IntakeResponseRow = typeof intakeResponsesTable.$inferSelect;
