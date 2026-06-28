import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['student', 'teacher', 'admin']);
export const subjectEnum = pgEnum('subject', ['english', 'math']);
export const examTypeEnum = pgEnum('exam_type', ['individual', 'mock_english', 'mock_math']);
export const examStatusEnum = pgEnum('exam_status', ['in_progress', 'completed', 'abandoned']);
export const mockStatusEnum = pgEnum('mock_status', ['in_progress', 'completed']);
export const answerEnum = pgEnum('answer_choice', ['a', 'b', 'c', 'd']);
export const questionTypeEnum = pgEnum('question_type', ['multiple_choice', 'student_produced_response']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('student'),
  teacherId: uuid('teacher_id').references((): any => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const accessCodes = pgTable('access_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  role: roleEnum('role').notNull(),
  description: text('description').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  isActive: boolean('is_active').notNull().default(true),
  maxUses: integer('max_uses'),
  useCount: integer('use_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const questionSets = pgTable('question_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  subject: subjectEnum('subject').notNull(),
  description: text('description').notNull().default(''),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Passages belong to a question set; multiple questions can share one passage
export const passages = pgTable('passages', {
  id: uuid('id').primaryKey().defaultRandom(),
  setId: uuid('set_id').notNull().references(() => questionSets.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull().default(''),
  passageText: text('passage_text').notNull(),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const questions = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  setId: uuid('set_id').notNull().references(() => questionSets.id, { onDelete: 'cascade' }),
  passageId: uuid('passage_id').references(() => passages.id, { onDelete: 'set null' }),
  questionType: questionTypeEnum('question_type').notNull().default('multiple_choice'),
  questionText: text('question_text').notNull(),
  // nullable: SPR questions have no options
  optionA: text('option_a'),
  optionB: text('option_b'),
  optionC: text('option_c'),
  optionD: text('option_d'),
  correctAnswer: answerEnum('correct_answer'),
  // For SPR: accepted answer text (decimal, fraction, or integer)
  correctAnswerText: text('correct_answer_text'),
  explanation: text('explanation'),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const exams = pgTable('exams', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  setId: uuid('set_id').notNull().references(() => questionSets.id, { onDelete: 'cascade' }),
  type: examTypeEnum('type').notNull(),
  status: examStatusEnum('status').notNull().default('in_progress'),
  score: integer('score'),
  totalQuestions: integer('total_questions').notNull().default(0),
  timeSpentSeconds: integer('time_spent_seconds'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const examAnswers = pgTable('exam_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  selectedAnswer: answerEnum('selected_answer'),
  selectedAnswerText: text('selected_answer_text'),
  isCorrect: boolean('is_correct'),
  answeredAt: timestamp('answered_at'),
});

export const mockTests = pgTable('mock_tests', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  englishExamId: uuid('english_exam_id').references(() => exams.id, { onDelete: 'set null' }),
  mathExamId: uuid('math_exam_id').references(() => exams.id, { onDelete: 'set null' }),
  status: mockStatusEnum('status').notNull().default('in_progress'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  examId: uuid('exam_id').references(() => exams.id, { onDelete: 'set null' }),
  content: text('content').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  readAt: timestamp('read_at'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AccessCode = typeof accessCodes.$inferSelect;
export type QuestionSet = typeof questionSets.$inferSelect;
export type Passage = typeof passages.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Exam = typeof exams.$inferSelect;
export type ExamAnswer = typeof examAnswers.$inferSelect;
export type MockTest = typeof mockTests.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
