import { and, eq } from 'drizzle-orm';
import { db } from '../../core/db';
import { chatMessages, chatSessions, exams, passages, questionSets, questions } from '../../core/db/schema';
import { badRequest, notFound, tooManyRequests } from '../../core/errors';
import { aiRateLimiter, generateChatResponse } from '../ai';
import type { ChatInput } from './student.schemas';

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
export function trimHistory(
  messages: { role: string; content: string; tokenCount: number }[],
): { role: 'user' | 'assistant'; content: string }[] {
  const kept = [...messages];
  let total = kept.reduce((sum, message) => sum + message.tokenCount, 0);

  while (total > HISTORY_TOKEN_CAP && kept.length > ALWAYS_KEEP_MESSAGES) {
    total -= kept.shift()!.tokenCount;
  }

  return kept.map((message) => ({ role: message.role as 'user' | 'assistant', content: message.content }));
}

export interface ChatReply {
  sessionId: string | null;
  assistantMessage: string;
}

export async function sendMessage(studentId: string, input: ChatInput): Promise<ChatReply> {
  const { sessionId, userMessage, examId, questionId } = input;

  // Answered without a model call, so obvious off-topic asks cost nothing.
  if (OFF_TOPIC_KEYWORDS.some((keyword) => userMessage.toLowerCase().includes(keyword))) {
    return { sessionId: sessionId ?? null, assistantMessage: OFF_TOPIC_REPLY };
  }

  const budget = aiRateLimiter.consume(studentId, 1);
  if (!budget.allowed) {
    throw tooManyRequests(
      `AI request limit reached. Please wait ${minutesPhrase(budget.retryAfterSeconds)} before sending more messages.`,
      { retryAfterSeconds: budget.retryAfterSeconds },
    );
  }

  const session = await resolveSession(studentId, { sessionId, examId, questionId });

  const [systemPrompt, storedMessages] = await Promise.all([
    buildSystemPrompt(session.examId, session.questionId),
    db
      .select({
        role: chatMessages.role,
        content: chatMessages.content,
        tokenCount: chatMessages.tokenCount,
      })
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, session.id))
      .orderBy(chatMessages.createdAt),
  ]);

  const { content: assistantMessage } = await generateChatResponse(systemPrompt, [
    ...trimHistory(storedMessages),
    { role: 'user', content: userMessage },
  ]);

  await db.insert(chatMessages).values([
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
    const [session] = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.studentId, studentId)))
      .limit(1);
    if (!session) throw notFound('Session not found');
    return retargetQuestion(session, questionId);
  }

  if (!examId) throw badRequest('examId required to start a new chat session');

  const [exam] = await db
    .select({ id: exams.id })
    .from(exams)
    .where(and(eq(exams.id, examId), eq(exams.studentId, studentId), eq(exams.type, 'individual')))
    .limit(1);
  if (!exam) throw notFound('Exam not found or not a practice session');

  const [existing] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.examId, examId), eq(chatSessions.studentId, studentId)))
    .limit(1);
  if (existing) return retargetQuestion(existing, questionId);

  const [created] = await db
    .insert(chatSessions)
    .values({ examId, studentId, questionId: questionId ?? null })
    .returning();
  return created;
}

async function retargetQuestion(session: typeof chatSessions.$inferSelect, questionId?: string) {
  if (!questionId || questionId === session.questionId) return session;
  const [updated] = await db
    .update(chatSessions)
    .set({ questionId })
    .where(eq(chatSessions.id, session.id))
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
  const [subjectRow] = await db
    .select({ subject: questionSets.subject })
    .from(exams)
    .innerJoin(questionSets, eq(exams.setId, questionSets.id))
    .where(eq(exams.id, examId))
    .limit(1);

  const isMath = subjectRow?.subject === 'math';

  let questionText = '(question context unavailable)';
  let passageBlock = '';

  if (questionId) {
    const [question] = await db
      .select({ questionText: questions.questionText, passageText: passages.passageText })
      .from(questions)
      .leftJoin(passages, eq(questions.passageId, passages.id))
      .where(eq(questions.id, questionId))
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

export async function listMessages(studentId: string, sessionId: string) {
  const [session] = await db
    .select({ id: chatSessions.id })
    .from(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.studentId, studentId)))
    .limit(1);
  if (!session) throw notFound('Session not found');

  return db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
      createdAt: chatMessages.createdAt,
    })
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt);
}
