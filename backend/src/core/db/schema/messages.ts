import { pgTable, uuid, text, varchar, boolean, timestamp } from 'drizzle-orm/pg-core';
import { assessmentsTable } from './exams';
import { accountsTable } from './identity';

export const notesTable = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  examId: uuid('exam_id').references(() => assessmentsTable.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  readAt: timestamp('read_at'),
});

export type NoteRow = typeof notesTable.$inferSelect;

export const notificationsTable = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  link: text('link'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type NotificationRow = typeof notificationsTable.$inferSelect;
