import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, numeric } from 'drizzle-orm/pg-core';
import { questionsTable } from './content';
import { chatRoleChoices, feedbackKindChoices } from './enums';
import { assessmentAnswersTable, assessmentsTable } from './exams';
import { accountsTable } from './identity';

// AI-generated feedback, one row per (examAnswer, feedbackType).
// Cache check: if a row exists for this pair, return it instead of re-calling the AI.
export const tutorFeedbackTable = pgTable('ai_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  examAnswerId: uuid('exam_answer_id').notNull().references(() => assessmentAnswersTable.id, { onDelete: 'cascade' }),
  feedbackType: feedbackKindChoices('feedback_type').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  modelUsed: text('model_used').notNull(),
  latencyMs: integer('latency_ms'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  costUsd: numeric('cost_usd'),
  parseFailed: boolean('parse_failed').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const competencyTriggersTable = pgTable('student_skill_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  subSkill: text('sub_skill').notNull(),
  triggerCount: integer('trigger_count').notNull().default(0),
  lastTriggeredAt: timestamp('last_triggered_at').notNull().defaultNow(),
});

export const chatSessionsTable = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id').notNull().references(() => assessmentsTable.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').references(() => questionsTable.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const chatMessagesTable = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => chatSessionsTable.id, { onDelete: 'cascade' }),
  role: chatRoleChoices('role').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type TutorFeedbackRow = typeof tutorFeedbackTable.$inferSelect;

export type CompetencyTriggerRow = typeof competencyTriggersTable.$inferSelect;

export type ChatSessionRow = typeof chatSessionsTable.$inferSelect;

export type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
