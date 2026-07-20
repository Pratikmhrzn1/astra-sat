import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  integer,
  timestamp,
  pgEnum,
  jsonb,
  numeric,
  unique,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['student', 'teacher', 'admin']);
export const subjectEnum = pgEnum('subject', ['english', 'math']);
export const examTypeEnum = pgEnum('exam_type', ['individual', 'mock_english', 'mock_math']);
export const examStatusEnum = pgEnum('exam_status', ['in_progress', 'completed', 'abandoned']);
export const mockStatusEnum = pgEnum('mock_status', ['in_progress', 'completed']);
export const answerEnum = pgEnum('answer_choice', ['a', 'b', 'c', 'd']);
export const questionTypeEnum = pgEnum('question_type', ['multiple_choice', 'student_produced_response']);
export const subSkillEnum = pgEnum('sub_skill', ['grammar', 'inference', 'command_of_evidence', 'vocab_in_context', 'transitions']);
export const subSkillSourceEnum = pgEnum('sub_skill_source', ['ai_suggested', 'human_confirmed']);
export const feedbackTypeEnum = pgEnum('feedback_type', ['reasoning_checkpoint', 'grammar_diagnosis', 'trap_explainer', 'command_of_evidence', 'transitions_coach', 'vocab_drill']);
export const contentTypeEnum = pgEnum('content_type', ['vocab_quiz', 'skill_passage']);
export const qualityFlagEnum = pgEnum('quality_flag', ['pending', 'approved', 'rejected']);
export const narrativeStatusEnum = pgEnum('narrative_status', ['pending', 'complete', 'failed']);
export const chatRoleEnum = pgEnum('chat_role', ['user', 'assistant']);
export const feedbackCategoryEnum = pgEnum('feedback_category', ['bug', 'suggestion', 'other']);
export const fileTypeEnum = pgEnum('file_type', ['audio', 'video', 'image', 'document', 'other', 'note']);

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

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const questionSets = pgTable('question_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  subject: subjectEnum('subject').notNull(),
  description: text('description').notNull().default(''),
  difficulty: text('difficulty'),
  generated: boolean('generated').notNull().default(false),
  isDraft: boolean('is_draft').notNull().default(false),
  isLiveExam: boolean('is_live_exam').notNull().default(false),
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
  generated: boolean('generated').notNull().default(false),
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
  // SAT Reading & Writing sub-skill — drives Phase 2–6 AI features
  subSkill: subSkillEnum('sub_skill'),
  // Tracks origin of subSkill tag: null = teacher set before tracking existed, 'ai_suggested' = batch classifier, 'human_confirmed' = teacher confirmed/overrode
  subSkillSource: subSkillSourceEnum('sub_skill_source'),
  generated: boolean('generated').notNull().default(false),
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

export const generatedContent = pgTable('generated_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentType: contentTypeEnum('content_type').notNull().default('vocab_quiz'),
  sourceQuestionId: uuid('source_question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  qualityFlag: qualityFlagEnum('quality_flag').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  liveSetId: uuid('live_set_id').references(() => questionSets.id, { onDelete: 'set null' }),
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

export const studentSkillTriggers = pgTable('student_skill_triggers', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  subSkill: text('sub_skill').notNull(),
  triggerCount: integer('trigger_count').notNull().default(0),
  lastTriggeredAt: timestamp('last_triggered_at').notNull().defaultNow(),
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
export type AiFeedback = typeof aiFeedback.$inferSelect;
export type MockTest = typeof mockTests.$inferSelect;
export type StudentVocab = typeof studentVocab.$inferSelect;
export type GeneratedContent = typeof generatedContent.$inferSelect;
export type StudentSkillTrigger = typeof studentSkillTriggers.$inferSelect;
export type MockNarrative = typeof mockNarratives.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;

export const platformFeedback = pgTable('platform_feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  category: feedbackCategoryEnum('category').notNull().default('other'),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const libraryItems = pgTable('library_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  fileUrl: text('file_url'),
  fileType: fileTypeEnum('file_type').notNull(),
  fileName: varchar('file_name', { length: 300 }),
  noteContent: text('note_content'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type PlatformFeedback = typeof platformFeedback.$inferSelect;
export type LibraryItem = typeof libraryItems.$inferSelect;

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

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message').notNull(),
  link: text('link'),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type LiveExamSession = typeof liveExamSessions.$inferSelect;
export type LiveExamParticipant = typeof liveExamParticipants.$inferSelect;
export type LiveExamQuestionFeedback = typeof liveExamQuestionFeedback.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
