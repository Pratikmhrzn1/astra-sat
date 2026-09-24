import { and, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { chatMessagesTable, chatSessionsTable, assessmentsTable, passagesTable, questionSetsTable, questionsTable } from '../../core/db/schema';
import { invalidRequest, missing, rateLimited } from '../../core/errors';
import { tutorBudget, requestChatReply } from '../ai';
import type { ChatPayload } from './practice.schemas';

/**
 * The doubt-solving tutor, available while reviewing a practice exam.
 *
 * Scope is enforced in three places, because a general-purpose chatbot attached
 * to a school account is a liability: a keyword guard answers obvious off-topic
 * asks with no model call at all, the system prompt constrains the subject, and
 * sessions are tied to a practice exam the student owns.
 */

const OFF_TOPIC_KEYWORDS = ['essay', 'homework', 'physics', 'chemistry', 'history essay', 'college application'];

const OFF_TOPIC_REPLY =
  "I'm here for SAT questions — what can I help you understand about this question?";

/** Rough ceiling on replayed history. Four characters per token is close enough. */
const HISTORY_TOKEN_CAP = 2000;
/** Always replay the last two exchanges, however long they ran. */
const ALWAYS_KEEP_MESSAGES = 4;

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

function minutesPhrase(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * Drops the oldest messages until the replayed history fits the cap, while
 * never cutting into the most recent exchanges — losing those would make the
 * assistant forget what was just said, which is worse than losing older turns.
 */
export function capHistory(
  messages: { role: string; content: string; tokenCount: number }[],
): { role: 'user' | 'assistant'; content: string }[] {
  const kept = [...messages];
  let total = kept.reduce((sum, message) => sum + message.tokenCount, 0);

  while (total > HISTORY_TOKEN_CAP && kept.length > ALWAYS_KEEP_MESSAGES) {
    total -= kept.shift()!.tokenCount;
  }

  return kept.map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));
}

export interface TutorReply {
  sessionId: string | null;
  assistantMessage: string;
}

export async function dispatchMessage(studentId: string, input: ChatPayload): Promise<TutorReply> {
  const { sessionId, userMessage, examId, questionId } = input;

  // Answered without a model call, so obvious off-topic asks cost nothing.
  if (OFF_TOPIC_KEYWORDS.some((keyword) => userMessage.toLowerCase().includes(keyword))) {
    return { sessionId: sessionId ?? null, assistantMessage: OFF_TOPIC_REPLY };
  }

  const budget = tutorBudget.consume(studentId, 1);
  if (!budget.allowed) {
    throw rateLimited(
      `AI request limit reached. Please wait ${minutesPhrase(budget.retryAfterSeconds)} before sending more messages.`,
      { retryAfterSeconds: budget.retryAfterSeconds },
    );
  }

  const session = await resolveSession(studentId, { sessionId, examId, questionId });

  const [systemPrompt, storedMessages] = await Promise.all([
    buildSystemPrompt(session.examId, session.questionId),
    database
      .select({
        role: chatMessagesTable.role,
        content: chatMessagesTable.content,
        tokenCount: chatMessagesTable.tokenCount,
      })
      .from(chatMessagesTable)
      .where(eq(chatMessagesTable.sessionId, session.id))
      .orderBy(chatMessagesTable.createdAt),
  ]);

  const { content: assistantMessage } = await requestChatReply(systemPrompt, [
    ...capHistory(storedMessages),
    { role: 'user', content: userMessage },
  ]);

  await database.insert(chatMessagesTable).values([
    { sessionId: session.id, role: 'user', content: userMessage, tokenCount: estimateTokens(userMessage) },
    {
      sessionId: session.id,
      role: 'assistant',
      content: assistantMessage,
      tokenCount: estimateTokens(assistantMessage),
    },
  ]);

  return { sessionId: session.id, assistantMessage };
}

/**
 * Finds or creates the session for this conversation.
 *
 * There is one session per practice attempt, so a student moving between
 * questions keeps their context instead of restarting; the session's
 * `questionId` follows them, which is what keeps the system prompt aimed at
 * whatever they are looking at now.
 */
async function resolveSession(
  studentId: string,
  { sessionId, examId, questionId }: { sessionId?: string; examId?: string; questionId?: string },
) {
  if (sessionId) {
    const [session] = await database
      .select()
      .from(chatSessionsTable)
      .where(and(eq(chatSessionsTable.id, sessionId), eq(chatSessionsTable.studentId, studentId)))
      .limit(1);
    if (!session) throw missing('Session not found');
    return retargetQuestion(session, questionId);
  }

  if (!examId) throw invalidRequest('examId required to start a new chat session');

  const [exam] = await database
    .select({ id: assessmentsTable.id })
    .from(assessmentsTable)
    .where(and(eq(assessmentsTable.id, examId), eq(assessmentsTable.studentId, studentId), eq(assessmentsTable.type, 'individual')))
    .limit(1);
  if (!exam) throw missing('Exam not found or not a practice session');

  const [existing] = await database
    .select()
    .from(chatSessionsTable)
    .where(and(eq(chatSessionsTable.examId, examId), eq(chatSessionsTable.studentId, studentId)))
    .limit(1);
  if (existing) return retargetQuestion(existing, questionId);

  const [created] = await database
    .insert(chatSessionsTable)
    .values({ examId, studentId, questionId: questionId ?? null })
    .returning();
  return created;
}

async function retargetQuestion(session: typeof chatSessionsTable.$inferSelect, questionId?: string) {
  if (!questionId || questionId === session.questionId) return session;
  const [updated] = await database
    .update(chatSessionsTable)
    .set({ questionId })
    .where(eq(chatSessionsTable.id, session.id))
    .returning();
  return updated;
}

/**
 * Builds the system prompt fresh on every call from live question data.
 *
 * It is never stored in the message history: replaying a stored prompt would
 * let anything written into that history redefine the assistant's instructions.
 */
async function buildSystemPrompt(examId: string, questionId: string | null): Promise<string> {
  const [subjectRow] = await database
    .select({ subject: questionSetsTable.subject })
    .from(assessmentsTable)
    .innerJoin(questionSetsTable, eq(assessmentsTable.setId, questionSetsTable.id))
    .where(eq(assessmentsTable.id, examId))
    .limit(1);

  const isMath = subjectRow?.subject === 'math';

  let questionText = '(question context unavailable)';
  let passageBlock = '';

  if (questionId) {
    const [question] = await database
      .select({ questionText: questionsTable.questionText, passageText: passagesTable.passageText })
      .from(questionsTable)
      .leftJoin(passagesTable, eq(questionsTable.passageId, passagesTable.id))
      .where(eq(questionsTable.id, questionId))
      .limit(1);

    if (question) {
      questionText = question.questionText;
      if (question.passageText) {
        const words = question.passageText.split(/\s+/);
        const excerpt = words.length > 200 ? `${words.slice(0, 200).join(' ')}…` : question.passageText;
        passageBlock = ` The passage for this question is: ${excerpt}`;
      }
    }
  }

  return isMath
    ? `You are an SAT Math tutor. You help students understand SAT Math concepts, problem-solving strategies, algebra, geometry, data analysis, and advanced math. You are currently helping a student with this question: ${questionText}.

Answer only questions related to SAT Math — arithmetic, algebra, geometry, trigonometry, data analysis, and test-taking strategy for the Math section. If a student asks about reading, writing, essays, other subjects, or anything unrelated to SAT Math, politely redirect them. Do not write essays, complete assignments, or answer questions from other subjects. Keep answers under 150 words — if more detail is needed, the student should ask a follow-up.`
    : `You are an SAT Reading and Writing tutor. You help students understand SAT concepts, question strategies, grammar rules, and reading techniques. You are currently helping a student with this question: ${questionText}.${passageBlock}

Answer only questions related to SAT Reading and Writing — grammar, vocabulary, reading comprehension, rhetorical analysis, and test-taking strategy for these sections. If a student asks about math, other subjects, or anything unrelated to SAT Reading and Writing, respond with: "I'm focused on SAT Reading and Writing here — for that I'd suggest [the relevant resource]." Do not write essays, complete assignments, or answer questions from other subjects. Keep answers under 150 words — if more detail is needed, the student should ask a follow-up.`;
}

export async function collectMessages(studentId: string, sessionId: string) {
  const [session] = await database
    .select({ id: chatSessionsTable.id })
    .from(chatSessionsTable)
    .where(and(eq(chatSessionsTable.id, sessionId), eq(chatSessionsTable.studentId, studentId)))
    .limit(1);
  if (!session) throw missing('Session not found');

  return database
    .select({
      id: chatMessagesTable.id,
      role: chatMessagesTable.role,
      content: chatMessagesTable.content,
      createdAt: chatMessagesTable.createdAt,
    })
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.sessionId, sessionId))
    .orderBy(chatMessagesTable.createdAt);
}
