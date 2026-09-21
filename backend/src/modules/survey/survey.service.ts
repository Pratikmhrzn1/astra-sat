import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../core/db';
import { surveyQuestions, surveyResponses, users } from '../../core/db/schema';
import { badRequest, notFound } from '../../core/errors';
import {
  CHOICE_TYPES,
  SCALE_MAX,
  SCALE_MIN,
  type CreateQuestionInput,
  type ReorderQuestionsInput,
  type SubmitSurveyInput,
  type SurveyQuestionType,
  type UpdateQuestionInput,
} from './survey.schemas';

/**
 * The onboarding survey: admin-authored questions, and the one answer set a
 * student gives before the app opens up to them.
 *
 * Completion is a flag on the user (`survey_completed_at`), not the presence of
 * response rows — adding a question later must not re-gate accounts that
 * already answered.
 */

// ── Question authoring (admin) ───────────────────────────────────────────────

/** Choice questions need options; the other two types must not carry any. */
function assertOptionsValid(type: SurveyQuestionType, options: string[]): void {
  if (CHOICE_TYPES.includes(type)) {
    if (options.length < 2) throw badRequest('A choice question needs at least 2 options');
    const unique = new Set(options.map((o) => o.toLowerCase()));
    if (unique.size !== options.length) throw badRequest('Options must be distinct');
    return;
  }
  if (options.length > 0) throw badRequest(`A ${type} question cannot have options`);
}

/**
 * How many students answered each question, as a correlated subquery.
 *
 * Written with literal table-qualified names: interpolating the drizzle column
 * objects here renders them unqualified ("question_id" = "id"), which inside
 * the subquery resolves "id" to survey_responses.id and silently counts zero.
 */
const RESPONSE_COUNT = sql<number>`(
  SELECT COUNT(*)::int FROM survey_responses WHERE survey_responses.question_id = survey_questions.id
)`;

/**
 * The columns the admin list returns. Create and update return the same shape,
 * so the client can write a saved question straight into its cached list
 * instead of refetching to discover its response count.
 */
const adminQuestionColumns = {
  id: surveyQuestions.id,
  prompt: surveyQuestions.prompt,
  type: surveyQuestions.type,
  options: surveyQuestions.options,
  isRequired: surveyQuestions.isRequired,
  isActive: surveyQuestions.isActive,
  sortOrder: surveyQuestions.sortOrder,
  createdAt: surveyQuestions.createdAt,
} as const;

export async function listQuestions() {
  return db
    .select({ ...adminQuestionColumns, responseCount: RESPONSE_COUNT.as('response_count') })
    .from(surveyQuestions)
    .orderBy(asc(surveyQuestions.sortOrder), asc(surveyQuestions.createdAt));
}

/** Re-reads one question in the admin list's shape, after writing it. */
async function readAdminQuestion(id: string) {
  const [row] = await db
    .select({ ...adminQuestionColumns, responseCount: RESPONSE_COUNT.as('response_count') })
    .from(surveyQuestions)
    .where(eq(surveyQuestions.id, id))
    .limit(1);
  if (!row) throw notFound('Survey question not found');
  return row;
}

export async function createQuestion(adminId: string, input: CreateQuestionInput) {
  assertOptionsValid(input.type, input.options);
  const [row] = await db
    .insert(surveyQuestions)
    .values({
      prompt: input.prompt,
      type: input.type,
      options: input.options,
      isRequired: input.isRequired,
      isActive: input.isActive,
      // New questions land at the end of the list rather than colliding on 0.
      // Computed inside the INSERT rather than by a SELECT first, so two admins
      // adding a question at the same moment cannot both read the same maximum
      // and end up sharing a position.
      sortOrder: sql`(SELECT COALESCE(MAX(sort_order), -1) + 1 FROM survey_questions)`,
      createdBy: adminId,
    })
    .returning({ id: surveyQuestions.id });
  return readAdminQuestion(row.id);
}

export async function updateQuestion(id: string, input: UpdateQuestionInput) {
  const [existing] = await db.select().from(surveyQuestions).where(eq(surveyQuestions.id, id)).limit(1);
  if (!existing) throw notFound('Survey question not found');

  const type = input.type ?? (existing.type as SurveyQuestionType);
  // Switching to a type that takes no options drops them rather than failing,
  // so an admin can change their mind without clearing the list by hand first.
  const options = input.options ?? (CHOICE_TYPES.includes(type) ? existing.options : []);
  assertOptionsValid(type, options);

  // An answer is stored in the shape its question's type implies, and nothing
  // rewrites the stored answers when the type changes — so a question that has
  // been answered keeps its type. Without this, flipping single_choice to scale
  // leaves strings sitting under a question that everything reads as numbers.
  if (type !== existing.type) {
    const answered = await countResponses(id);
    if (answered > 0) {
      throw badRequest(
        `This question already has ${answered} answer${answered === 1 ? '' : 's'}, so its answer type cannot change. ` +
          'Make it inactive and add a replacement question instead.',
      );
    }
  }

  await db
    .update(surveyQuestions)
    .set({
      prompt: input.prompt ?? existing.prompt,
      type,
      options,
      isRequired: input.isRequired ?? existing.isRequired,
      isActive: input.isActive ?? existing.isActive,
      updatedAt: new Date(),
    })
    .where(eq(surveyQuestions.id, id));
  return readAdminQuestion(id);
}

/** Cascades to the answers given to it — the caller warns before asking. */
export async function deleteQuestion(id: string): Promise<void> {
  const deleted = await db
    .delete(surveyQuestions)
    .where(eq(surveyQuestions.id, id))
    .returning({ id: surveyQuestions.id });
  if (deleted.length === 0) throw notFound('Survey question not found');
}

export async function reorderQuestions({ ids }: ReorderQuestionsInput): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [index, id] of ids.entries()) {
      await tx.update(surveyQuestions).set({ sortOrder: index }).where(eq(surveyQuestions.id, id));
    }
  });
}

// ── Taking the survey (student) ──────────────────────────────────────────────

/** Active questions only, without the admin bookkeeping columns. */
async function activeQuestions() {
  return db
    .select({
      id: surveyQuestions.id,
      prompt: surveyQuestions.prompt,
      type: surveyQuestions.type,
      options: surveyQuestions.options,
      isRequired: surveyQuestions.isRequired,
    })
    .from(surveyQuestions)
    .where(eq(surveyQuestions.isActive, true))
    .orderBy(asc(surveyQuestions.sortOrder), asc(surveyQuestions.createdAt));
}

export async function getSurveyForStudent(userId: string) {
  const [user] = await db
    .select({ surveyCompletedAt: users.surveyCompletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw notFound('User not found');
  return { completed: user.surveyCompletedAt !== null, questions: await activeQuestions() };
}

/** Rejects an answer whose shape or value does not fit the question it answers. */
function normalizeAnswer(
  question: { prompt: string; type: SurveyQuestionType; options: string[] },
  answer: string | string[] | number,
): string | string[] | number {
  if (question.type === 'short_text') {
    if (typeof answer !== 'string') throw badRequest(`"${question.prompt}" expects a written answer`);
    return answer;
  }
  if (question.type === 'scale') {
    const value = typeof answer === 'number' ? answer : Number(answer);
    if (!Number.isInteger(value) || value < SCALE_MIN || value > SCALE_MAX) {
      throw badRequest(`"${question.prompt}" expects a rating from ${SCALE_MIN} to ${SCALE_MAX}`);
    }
    return value;
  }
  // Deduped before the count check: a payload that repeats a choice is the same
  // selection said twice, and storing it twice would double-count that option in
  // the admin's summary.
  const picked = [...new Set(Array.isArray(answer) ? answer : [answer])];
  if (picked.some((choice) => typeof choice !== 'string' || !question.options.includes(choice))) {
    throw badRequest(`"${question.prompt}" was answered with an option that does not exist`);
  }
  if (question.type === 'single_choice') {
    if (picked.length !== 1) throw badRequest(`"${question.prompt}" takes exactly one answer`);
    return picked[0] as string;
  }
  return picked as string[];
}

function isBlank(answer: string | string[] | number): boolean {
  if (typeof answer === 'string') return answer.trim().length === 0;
  if (Array.isArray(answer)) return answer.length === 0;
  return false;
}

/**
 * Records the answers and marks the account done.
 *
 * Idempotent: re-submitting overwrites the previous answers rather than failing,
 * so a retried request after a dropped response cannot lock a student out.
 */
export async function submitSurvey(userId: string, input: SubmitSurveyInput) {
  const questions = await activeQuestions();
  const byId = new Map(questions.map((q) => [q.id, q]));

  const answered = new Map<string, string | string[] | number>();
  for (const entry of input.answers) {
    const question = byId.get(entry.questionId);
    // A question deactivated between loading the form and submitting it is
    // dropped rather than rejected — the student cannot fix that.
    if (!question) continue;
    if (isBlank(entry.answer)) continue;
    answered.set(
      question.id,
      normalizeAnswer(
        { prompt: question.prompt, type: question.type as SurveyQuestionType, options: question.options },
        entry.answer,
      ),
    );
  }

  const missing = questions.filter((q) => q.isRequired && !answered.has(q.id));
  if (missing.length > 0) {
    throw badRequest(`Please answer: ${missing.map((q) => q.prompt).join(', ')}`);
  }

  await db.transaction(async (tx) => {
    for (const [questionId, answer] of answered) {
      await tx
        .insert(surveyResponses)
        .values({ userId, questionId, answer })
        .onConflictDoUpdate({
          target: [surveyResponses.userId, surveyResponses.questionId],
          set: { answer, createdAt: new Date() },
        });
    }
    await tx.update(users).set({ surveyCompletedAt: new Date() }).where(eq(users.id, userId));
  });

  return { ok: true as const, answered: answered.size };
}

// ── Reading the answers (admin) ──────────────────────────────────────────────

/**
 * Puts a stored answer back into the shape its question's type implies.
 *
 * This is not belt-and-braces. `answer` is jsonb, and the value comes back
 * through two parsers: node-postgres parses the column, then drizzle's jsonb
 * mapping sees a string and parses it *again*. An answer that is itself valid
 * JSON therefore changes type on the way out — the option "1400" is read back
 * as the number 1400, "true" as a boolean — while the row in Postgres is a
 * perfectly correct JSON string the whole time. Anything that groups answers by
 * their option text then fails to match them.
 *
 * Coercing by the question's type fixes it at the one boundary where the type
 * is known, and repairs rows already stored rather than needing a migration.
 */
function readAnswer(type: SurveyQuestionType, raw: unknown): string | string[] | number {
  if (type === 'multi_choice') {
    return (Array.isArray(raw) ? raw : [raw]).map((choice) => String(choice));
  }
  if (type === 'scale') return Number(raw);
  if (Array.isArray(raw)) return raw.map((choice) => String(choice)).join(', ');
  return String(raw);
}

export interface SurveyRespondent {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  submittedAt: string;
  answers: {
    questionId: string;
    prompt: string;
    /** Carried so a reader can render the answer without re-joining the questions. */
    type: SurveyQuestionType;
    answer: string | string[] | number;
  }[];
}

/** One row per respondent, newest first, each carrying their answers in ask order. */
export async function listResponses(): Promise<SurveyRespondent[]> {
  const rows = await db
    .select({
      userId: surveyResponses.userId,
      userName: users.name,
      userEmail: users.email,
      createdAt: surveyResponses.createdAt,
      questionId: surveyResponses.questionId,
      prompt: surveyQuestions.prompt,
      type: surveyQuestions.type,
      sortOrder: surveyQuestions.sortOrder,
      answer: surveyResponses.answer,
    })
    .from(surveyResponses)
    .leftJoin(users, eq(surveyResponses.userId, users.id))
    .leftJoin(surveyQuestions, eq(surveyResponses.questionId, surveyQuestions.id))
    .orderBy(desc(surveyResponses.createdAt));

  // Rows come newest answer first, which puts the newest respondent first; each
  // respondent's own answers are then put back into ask order below, since the
  // row order inside a group is when they answered, not what they were asked.
  const byUser = new Map<string, SurveyRespondent & { order: number[] }>();
  for (const row of rows) {
    let respondent = byUser.get(row.userId);
    if (!respondent) {
      respondent = {
        userId: row.userId,
        userName: row.userName,
        userEmail: row.userEmail,
        submittedAt: row.createdAt.toISOString(),
        answers: [],
        order: [],
      };
      byUser.set(row.userId, respondent);
    }
    const type = (row.type ?? 'short_text') as SurveyQuestionType;
    respondent.order.push(row.sortOrder ?? 0);
    respondent.answers.push({
      questionId: row.questionId,
      prompt: row.prompt ?? 'Deleted question',
      type,
      answer: readAnswer(type, row.answer),
    });
  }

  return [...byUser.values()].map(({ order, answers, ...respondent }) => ({
    ...respondent,
    answers: answers
      .map((answer, i) => ({ answer, sortOrder: order[i] }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((entry) => entry.answer),
  }));
}

/** Used by the delete confirmation: how many students answered this question. */
export async function countResponses(questionId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(surveyResponses)
    .where(eq(surveyResponses.questionId, questionId));
  return Number(row?.count ?? 0);
}
