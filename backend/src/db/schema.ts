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
  date,
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
export const questionDifficultyEnum = pgEnum('question_difficulty', ['easy', 'medium', 'hard']);
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
  phone: varchar('phone', { length: 30 }),
  passwordHash: text('password_hash').notNull(),
  role: roleEnum('role').notNull().default('student'),
  teacherId: uuid('teacher_id').references((): any => users.id, { onDelete: 'set null' }),
  // Multi-tenancy insurance. Every user is backfilled to a single default
  // organization so that adding a second tenant later is an additive migration
  // rather than a rewrite. NOTHING scopes queries by this yet — do not start
  // filtering on it until the whole data layer does, or isolation will be
  // half-applied, which is worse than not having it.
  organizationId: uuid('organization_id').references((): any => organizations.id, { onDelete: 'set null' }),
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
  // Soft delete. Deleting a set cascades through exams -> exam_answers ->
  // ai_feedback, so one teacher DELETE can wipe graded attempt history. A set
  // with attempts against it is archived instead; catalogues and mock set
  // selection must exclude archived sets.
  archivedAt: timestamp('archived_at'),
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
  // LEGACY. A five-value enum covering only Reading & Writing, so Math questions
  // could never be tagged. Superseded by `skillCode` below, which points at the
  // real SAT domain/skill tree. Still read by the AI feedback orchestrator and
  // backfilled into `skillCode`; remove once every reader has migrated.
  subSkill: subSkillEnum('sub_skill'),
  // The SAT domain or skill this question tests, e.g. 'algebra' or 'transitions'.
  // See the `skills` table: a domain is a row with no parent, a skill is a child
  // of one. Tagging at domain level is enough for topic practice and analytics.
  skillCode: text('skill_code').references((): any => skills.code, { onDelete: 'set null' }),
  // Per-question difficulty. `question_sets.difficulty` is a property of the whole
  // set and drives adaptive module selection; this one drives topic practice.
  difficulty: questionDifficultyEnum('difficulty'),
  // Tracks origin of subSkill tag: null = teacher set before tracking existed, 'ai_suggested' = batch classifier, 'human_confirmed' = teacher confirmed/overrode
  subSkillSource: subSkillSourceEnum('sub_skill_source'),
  imageUrl: text('image_url'),
  generated: boolean('generated').notNull().default(false),
  orderIndex: integer('order_index').notNull().default(0),
  // Copy-on-write versioning. Editing a question that a completed exam already
  // references inserts a replacement row and retires this one, so a past
  // attempt's results page keeps meaning what it meant when it was sat.
  // Assemblers must filter `retired_at IS NULL`; `exam_answers` deliberately
  // keeps pointing at the retired row.
  retiredAt: timestamp('retired_at'),
  supersedesId: uuid('supersedes_id'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

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

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Organizations — multi-tenancy insurance, not multi-tenancy.
//
// The platform serves one consultancy. Retrofitting a tenant boundary across
// every table and query later is a rewrite; carrying a nullable reference from
// now on makes it an additive migration instead. One default row exists and
// every user points at it. No query filters by organization yet, deliberately.
// ─────────────────────────────────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// The SAT domain/skill tree.
//
// Two levels, in one self-referencing table: a *domain* is a row with no parent
// (the eight official ones, four per section), a *skill* is a child of a domain.
// Questions tag against either level, so domain-level tagging is enough to make
// topic practice and weakness analytics work while finer skills get added.
//
// This replaces the old `sub_skill` enum, which had five values and covered only
// Reading & Writing — Math questions could not be tagged at all. A reference
// table rather than a wider enum because `migrate.ts` runs on every boot and
// `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction that then
// references the new value.
// ─────────────────────────────────────────────────────────────────────────────
export const skills = pgTable('skills', {
  /** Stable identifier used by questions, e.g. 'algebra', 'transitions'. */
  code: varchar('code', { length: 64 }).primaryKey(),
  label: text('label').notNull(),
  subject: subjectEnum('subject').notNull(),
  /** Null for a domain; the owning domain's code for a skill. */
  parentCode: varchar('parent_code', { length: 64 }).references((): any => skills.code, {
    onDelete: 'set null',
  }),
  sortOrder: integer('sort_order').notNull().default(0),
});

// ─────────────────────────────────────────────────────────────────────────────
// Student profile — the goal a student is working towards.
//
// Separate from `users` because it is student-only and expected to grow (study
// intensity, preferred pace). Until this existed the dashboard compared every
// student against a hardcoded target of 1500.
// ─────────────────────────────────────────────────────────────────────────────
export const studentProfiles = pgTable('student_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** Target total on the 400-1600 scale. */
  targetScore: integer('target_score'),
  /** The SAT sitting the student is preparing for. */
  testDate: date('test_date'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

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

// ─────────────────────────────────────────────────────────────────────────────
// Audit log — who did the irreversible thing.
//
// This deployment hands admins a production console: role changes, access-code
// changes, a full database restore and an unrestricted SQL runner. None of that
// left a trace, so there was no way to answer "who ran this, and when".
//
// `actorId` is ON DELETE SET NULL rather than CASCADE on purpose: deleting a
// user must not delete the record of what they did. The payload is jsonb so each
// action can record whatever context it has without a migration per action.
// ─────────────────────────────────────────────────────────────────────────────
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  /** Verb, e.g. 'user.role_changed', 'db.restore', 'db.sql'. */
  action: text('action').notNull(),
  /** What it acted on, e.g. 'user', 'question_set'. Null for global actions. */
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Organization = typeof organizations.$inferSelect;
export type Skill = typeof skills.$inferSelect;
export type StudentProfile = typeof studentProfiles.$inferSelect;
export type Mistake = typeof mistakes.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
