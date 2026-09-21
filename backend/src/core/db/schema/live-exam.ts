import { pgTable, uuid, text, varchar, boolean, integer, timestamp, unique } from 'drizzle-orm/pg-core';
import { questionSets, questions } from './content';
import { exams } from './exams';
import { users } from './identity';

// ── Live Exam System ─────────────────────────────────────────────────────────

export const liveExamSessions = pgTable('live_exam_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  teacherId: uuid('teacher_id').references(() => users.id, { onDelete: 'set null' }),
  joinCode: varchar('join_code', { length: 10 }).notNull().unique(),
  englishSetId: uuid('english_set_id').references(() => questionSets.id, { onDelete: 'set null' }),
  mathSetId: uuid('math_set_id').references(() => questionSets.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).notNull().default('waiting'),
  startedAt: timestamp('started_at'),
  englishDurationSeconds: integer('english_duration_seconds').notNull().default(3840),
  mathDurationSeconds: integer('math_duration_seconds').notNull().default(4200),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const liveExamParticipants = pgTable('live_exam_participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => liveExamSessions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  englishExamId: uuid('english_exam_id').references(() => exams.id, { onDelete: 'set null' }),
  mathExamId: uuid('math_exam_id').references(() => exams.id, { onDelete: 'set null' }),
  globalFeedback: text('global_feedback'),
  resultReleased: boolean('result_released').notNull().default(false),
  joinedAt: timestamp('joined_at').notNull().defaultNow(),
}, (t) => ({
  uniqParticipant: unique().on(t.sessionId, t.studentId),
}));

export const liveExamQuestionFeedback = pgTable('live_exam_question_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  participantId: uuid('participant_id').notNull().references(() => liveExamParticipants.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  feedback: text('feedback').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  uniqFeedback: unique().on(t.participantId, t.questionId),
}));

export type LiveExamSession = typeof liveExamSessions.$inferSelect;

export type LiveExamParticipant = typeof liveExamParticipants.$inferSelect;

export type LiveExamQuestionFeedback = typeof liveExamQuestionFeedback.$inferSelect;
