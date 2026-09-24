import { pgTable, uuid, text, varchar, boolean, integer, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { answerChoices, contentKindChoices, qualityFlagChoices, itemDifficultyChoices, questionTypeChoices, subSkillChoices, subSkillSourceChoices, subjectChoices } from './enums';
import { accountsTable } from './identity';
import { competenciesTable } from './taxonomy';

export const questionSetsTable = pgTable('question_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: varchar('title', { length: 255 }).notNull(),
  subject: subjectChoices('subject').notNull(),
  description: text('description').notNull().default(''),
  difficulty: text('difficulty'),
  generated: boolean('generated').notNull().default(false),
  isDraft: boolean('is_draft').notNull().default(false),
  isLiveExam: boolean('is_live_exam').notNull().default(false),
  createdBy: uuid('created_by').references(() => accountsTable.id, { onDelete: 'set null' }),
  // Soft delete. Deleting a set cascades through exams -> exam_answers ->
  // ai_feedback, so one teacher DELETE can wipe graded attempt history. A set
  // with attempts against it is archived instead; catalogues and mock set
  // selection must exclude archived sets.
  archivedAt: timestamp('archived_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Passages belong to a question set; multiple questions can share one passage
export const passagesTable = pgTable('passages', {
  id: uuid('id').primaryKey().defaultRandom(),
  setId: uuid('set_id').notNull().references(() => questionSetsTable.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 255 }).notNull().default(''),
  passageText: text('passage_text').notNull(),
  generated: boolean('generated').notNull().default(false),
  orderIndex: integer('order_index').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const questionsTable = pgTable('questions', {
  id: uuid('id').primaryKey().defaultRandom(),
  setId: uuid('set_id').notNull().references(() => questionSetsTable.id, { onDelete: 'cascade' }),
  passageId: uuid('passage_id').references(() => passagesTable.id, { onDelete: 'set null' }),
  questionType: questionTypeChoices('question_type').notNull().default('multiple_choice'),
  questionText: text('question_text').notNull(),
  // nullable: SPR questions have no options
  optionA: text('option_a'),
  optionB: text('option_b'),
  optionC: text('option_c'),
  optionD: text('option_d'),
  correctAnswer: answerChoices('correct_answer'),
  // For SPR: accepted answer text (decimal, fraction, or integer)
  correctAnswerText: text('correct_answer_text'),
  explanation: text('explanation'),
  // LEGACY. A five-value enum covering only Reading & Writing, so Math questions
  // could never be tagged. Superseded by `skillCode` below, which points at the
  // real SAT domain/skill tree. Still read by the AI feedback orchestrator and
  // backfilled into `skillCode`; remove once every reader has migrated.
  subSkill: subSkillChoices('sub_skill'),
  // The SAT domain or skill this question tests, e.g. 'algebra' or 'transitions'.
  // See the `skills` table: a domain is a row with no parent, a skill is a child
  // of one. Tagging at domain level is enough for topic practice and analytics.
  skillCode: text('skill_code').references((): any => competenciesTable.code, { onDelete: 'set null' }),
  // Per-question difficulty. `question_sets.difficulty` is a property of the whole
  // set and drives adaptive module selection; this one drives topic practice.
  difficulty: itemDifficultyChoices('difficulty'),
  // Tracks origin of subSkill tag: null = teacher set before tracking existed, 'ai_suggested' = batch classifier, 'human_confirmed' = teacher confirmed/overrode
  subSkillSource: subSkillSourceChoices('sub_skill_source'),
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

export const generatedContentTable = pgTable('generated_content', {
  id: uuid('id').primaryKey().defaultRandom(),
  contentType: contentKindChoices('content_type').notNull().default('vocab_quiz'),
  sourceQuestionId: uuid('source_question_id').notNull().references(() => questionsTable.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => accountsTable.id, { onDelete: 'cascade' }),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  qualityFlag: qualityFlagChoices('quality_flag').notNull().default('pending'),
  rejectionReason: text('rejection_reason'),
  liveSetId: uuid('live_set_id').references(() => questionSetsTable.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type QuestionSetRow = typeof questionSetsTable.$inferSelect;

export type PassageRow = typeof passagesTable.$inferSelect;

export type QuestionRow = typeof questionsTable.$inferSelect;

export type GeneratedContentRow = typeof generatedContentTable.$inferSelect;
