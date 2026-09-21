import { pgTable, uuid, text, boolean, integer, timestamp, numeric } from 'drizzle-orm/pg-core';
import { questions } from './content';
import { users } from './identity';

export const studentVocab = pgTable('student_vocab', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  word: text('word').notNull(),
  passageExcerpt: text('passage_excerpt').notNull(),
  nextReviewAt: timestamp('next_review_at').notNull(),
  intervalDays: integer('interval_days').notNull().default(1),
  easeFactor: numeric('ease_factor').notNull().default('2.5'),
  reviewCount: integer('review_count').notNull().default(0),
  lastCorrect: boolean('last_correct'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const teacherVocabWords = pgTable('teacher_vocab_words', {
  id: uuid('id').primaryKey().defaultRandom(),
  word: text('word').notNull(),
  definition: text('definition').notNull(),
  exampleSentence: text('example_sentence').notNull().default(''),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const studentTeacherVocabProgress = pgTable('student_teacher_vocab_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teacherVocabWordId: uuid('teacher_vocab_word_id').notNull().references(() => teacherVocabWords.id, { onDelete: 'cascade' }),
  nextReviewAt: timestamp('next_review_at').notNull(),
  intervalDays: integer('interval_days').notNull().default(1),
  easeFactor: numeric('ease_factor').notNull().default('2.5'),
  reviewCount: integer('review_count').notNull().default(0),
  lastCorrect: boolean('last_correct'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type StudentVocab = typeof studentVocab.$inferSelect;
