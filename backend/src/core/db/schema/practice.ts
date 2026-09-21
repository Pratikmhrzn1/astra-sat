import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, numeric } from 'drizzle-orm/pg-core';
import { questions } from './content';
import { chatRoleEnum, feedbackTypeEnum } from './enums';
import { examAnswers, exams } from './exams';
import { users } from './identity';

// AI-generated feedback, one row per (examAnswer, feedbackType).
// Cache check: if a row exists for this pair, return it instead of re-calling the AI.
export const aiFeedback = pgTable('ai_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  examAnswerId: uuid('exam_answer_id').notNull().references(() => examAnswers.id, { onDelete: 'cascade' }),
  feedbackType: feedbackTypeEnum('feedback_type').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  modelUsed: text('model_used').notNull(),
  latencyMs: integer('latency_ms'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  costUsd: numeric('cost_usd'),
  parseFailed: boolean('parse_failed').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const studentSkillTriggers = pgTable('student_skill_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subSkill: text('sub_skill').notNull(),
  triggerCount: integer('trigger_count').notNull().default(0),
  lastTriggeredAt: timestamp('last_triggered_at').notNull().defaultNow(),
});

export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').references(() => questions.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: chatRoleEnum('role').notNull(),
  content: text('content').notNull(),
  tokenCount: integer('token_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type AiFeedback = typeof aiFeedback.$inferSelect;

export type StudentSkillTrigger = typeof studentSkillTriggers.$inferSelect;

export type ChatSession = typeof chatSessions.$inferSelect;

export type ChatMessage = typeof chatMessages.$inferSelect;
