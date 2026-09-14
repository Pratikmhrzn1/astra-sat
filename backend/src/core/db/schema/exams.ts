import { pgTable, uuid, text, boolean, integer, timestamp, jsonb, numeric } from 'drizzle-orm/pg-core';
import { questionSets, questions } from './content';
import { answerEnum, examStatusEnum, examTypeEnum, mockStatusEnum, narrativeStatusEnum } from './enums';
import { users } from './identity';

export const exams = pgTable('exams', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Nullable: an exam assembled from a single set records it here, but topic
  // practice draws questions from across many sets and belongs to none. The
  // authoritative list of questions in an exam is its `exam_answers` rows, not
  // this column — see `findQuestionsForExam`.
  setId: uuid('set_id').references(() => questionSets.id, { onDelete: 'cascade' }),
  // Display name for an exam that has no owning set to borrow a title from —
  // "Topic: Algebra", "Mistake review". Null for set-backed exams, which show
  // `question_sets.title` instead.
  label: text('label'),
  type: examTypeEnum('type').notNull(),
  status: examStatusEnum('status').notNull().default('in_progress'),
  score: integer('score'),
  // Section score on the SAT 200-800 scale, written at submit time by
  // modules/scoring. Null for an exam graded before scaled scoring existed, and
  // for practice sets too short to scale meaningfully.
  scaledScore: integer('scaled_score'),
  totalQuestions: integer('total_questions').notNull().default(0),
  timeSpentSeconds: integer('time_spent_seconds'),
  // Server-authoritative timing. `timeLimitSeconds` is fixed when the exam is
  // created (null means untimed, e.g. self-study practice); `deadlineAt` is
  // stamped on first open rather than at creation, because a mock's Math Module 1
  // is created when the mock starts but may be sat much later.
  timeLimitSeconds: integer('time_limit_seconds'),
  deadlineAt: timestamp('deadline_at'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const examAnswers = pgTable('exam_answers', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id').notNull().references(() => exams.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  /** Presentation order within this exam. Set from the answer sheet at creation. */
  orderIndex: integer('order_index').notNull().default(0),
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
  englishM2ExamId: uuid('english_m2_exam_id').references(() => exams.id, { onDelete: 'set null' }),
  mathM2ExamId: uuid('math_m2_exam_id').references(() => exams.id, { onDelete: 'set null' }),
  status: mockStatusEnum('status').notNull().default('in_progress'),
  // Composite scores, written when the final module is submitted. `totalScore`
  // is the 400-1600 headline number; the two section scores are 200-800 each and
  // sum to it. Null until the mock completes.
  rwScore: integer('rw_score'),
  mathScore: integer('math_score'),
  totalScore: integer('total_score'),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const mockNarratives = pgTable('mock_narratives', {
  id: uuid('id').primaryKey().defaultRandom(),
  examId: uuid('exam_id').notNull().unique().references(() => exams.id, { onDelete: 'cascade' }),
  content: jsonb('content').$type<Record<string, unknown>>(),
  modelUsed: text('model_used').notNull().default(''),
  latencyMs: integer('latency_ms'),
  costUsd: numeric('cost_usd'),
  status: narrativeStatusEnum('status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Exam = typeof exams.$inferSelect;

export type ExamAnswer = typeof examAnswers.$inferSelect;

export type MockTest = typeof mockTests.$inferSelect;

export type MockNarrative = typeof mockNarratives.$inferSelect;
