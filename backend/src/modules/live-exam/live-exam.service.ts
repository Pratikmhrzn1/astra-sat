import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../core/db';
import {
  examAnswers,
  exams,
  liveExamParticipants,
  liveExamQuestionFeedback,
  liveExamSessions,
  notifications,
  questionSets,
  questions,
  users,
} from '../../core/db/schema';
import { badRequest, notFound } from '../../core/errors';
import { createExamForSet } from '../exams/exam-provisioning';
import { recordMistakesOnRelease } from '../student/mistakes.service';

/**
 * Teacher-proctored exams taken together in a classroom.
 *
 * A session hands out a six-character join code; students wait in a lobby until
 * the teacher starts it, then everyone sits the same two sections against a
 * server-anchored clock. Results stay hidden until the teacher releases them,
 * so a class can be reviewed together rather than students racing to compare
 * scores.
 *
 * There are no websockets anywhere here — clients poll. For a room of students
 * changing state a handful of times per session, polling is far less machinery
 * than a socket layer that would need its own reconnection and scaling story.
 */

export const createSessionSchema = z.object({
  title: z.string().min(1),
  englishSetId: z.string().uuid(),
  mathSetId: z.string().uuid(),
});
export type CreateSessionInput = z.infer<typeof createSessionSchema>;

export const saveFeedbackSchema = z.object({
  globalFeedback: z.string().optional(),
  questionFeedbacks: z
    .array(z.object({ questionId: z.string().uuid(), feedback: z.string() }))
    .optional(),
});
export type SaveFeedbackInput = z.infer<typeof saveFeedbackSchema>;

/**
 * Join codes are read aloud and typed by hand, so the alphabet omits the
 * characters people confuse: no O/0, no I/1.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function makeJoinCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}

async function generateUniqueJoinCode(): Promise<string> {
  // A collision at ~1 billion combinations is rare; retrying a few times is
  // cheaper than reasoning about it, and the unique index is the real guard.
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = makeJoinCode();
    const [existing] = await db
      .select({ id: liveExamSessions.id })
      .from(liveExamSessions)
      .where(eq(liveExamSessions.joinCode, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new Error('Could not generate a unique join code');
}

/** Loads a session, failing unless it belongs to this teacher. */
async function findOwnedSession(sessionId: string, teacherId: string) {
  const [session] = await db
    .select()
    .from(liveExamSessions)
    .where(and(eq(liveExamSessions.id, sessionId), eq(liveExamSessions.teacherId, teacherId)))
    .limit(1);
  if (!session) throw notFound('Session not found');
  return session;
}

async function findSessionByCode(joinCode: string) {
  const [session] = await db
    .select()
    .from(liveExamSessions)
    .where(eq(liveExamSessions.joinCode, joinCode.toUpperCase()))
    .limit(1);
  return session ?? null;
}

// ── Teacher ───────────────────────────────────────────────────────────────────

export async function listSessions(teacherId: string) {
  return db
    .select()
    .from(liveExamSessions)
    .where(eq(liveExamSessions.teacherId, teacherId))
    .orderBy(liveExamSessions.createdAt);
}

export async function createSession(teacherId: string, input: CreateSessionInput) {
  const [session] = await db
    .insert(liveExamSessions)
    .values({
      title: input.title,
      teacherId,
      joinCode: await generateUniqueJoinCode(),
      englishSetId: input.englishSetId,
      mathSetId: input.mathSetId,
      status: 'waiting',
    })
    .returning();
  return session;
}

export async function getSessionDetail(sessionId: string, teacherId: string) {
  const session = await findOwnedSession(sessionId, teacherId);

  const participants = await db
    .select({
      id: liveExamParticipants.id,
      studentId: liveExamParticipants.studentId,
      englishExamId: liveExamParticipants.englishExamId,
      mathExamId: liveExamParticipants.mathExamId,
      globalFeedback: liveExamParticipants.globalFeedback,
      resultReleased: liveExamParticipants.resultReleased,
      joinedAt: liveExamParticipants.joinedAt,
      name: users.name,
      email: users.email,
    })
    .from(liveExamParticipants)
    .innerJoin(users, eq(liveExamParticipants.studentId, users.id))
    .where(eq(liveExamParticipants.sessionId, session.id));

  return { ...session, participants };
}

/**
 * Starts the session: provisions both exams for everyone in the lobby, stamps
 * the start time, and flips the status the students are polling for.
 *
 * Exams are created through the shared provisioning helper, so each one gets
 * its answer sheet and question count — without those a live attempt would save
 * nothing and grade zero. The timestamp is what every client's countdown is
 * derived from, so reloading mid-section cannot buy a student extra time.
 */
export async function startSession(sessionId: string, teacherId: string) {
  const session = await findOwnedSession(sessionId, teacherId);
  if (session.status !== 'waiting') throw badRequest('Already started');
  if (!session.englishSetId || !session.mathSetId) {
    throw badRequest('Session is missing its English or Math question set');
  }

  const participants = await db
    .select()
    .from(liveExamParticipants)
    .where(eq(liveExamParticipants.sessionId, session.id));

  // Fixed before provisioning, so every participant's deadlines come from the
  // same instant the session is recorded as starting.
  const startedAt = new Date();
  for (const participant of participants) {
    await provisionParticipantExams(participant, { ...session, startedAt });
  }

  await db
    .update(liveExamSessions)
    .set({ status: 'active', startedAt })
    .where(eq(liveExamSessions.id, session.id));

  return { ok: true, startedAt };
}

/**
 * Gives one participant their two exams, once.
 *
 * Extracted because it is needed at two moments, not one: when the teacher
 * starts the session, and when a student joins a session that is *already*
 * running. Without the second, a student who opened the link a minute late got a
 * participant row with no exams — the lobby will not launch without an exam id
 * and only polls while the session is `waiting`, so they sat looking at a
 * waiting screen that could never resolve while their class sat the paper.
 *
 * Idempotent: a participant who already has exams keeps them, so a rejoin or a
 * double start cannot hand someone a second blank attempt.
 */
async function provisionParticipantExams(
  participant: typeof liveExamParticipants.$inferSelect,
  session: {
    id: string;
    englishSetId: string | null;
    mathSetId: string | null;
    startedAt: Date | null;
    englishDurationSeconds: number;
    mathDurationSeconds: number;
  },
): Promise<{ englishExamId: string | null; mathExamId: string | null }> {
  if (participant.englishExamId && participant.mathExamId) {
    return { englishExamId: participant.englishExamId, mathExamId: participant.mathExamId };
  }
  if (!session.englishSetId || !session.mathSetId) {
    return { englishExamId: null, mathExamId: null };
  }

  // Both sections are timed from the session start, as the lobby always has.
  const deadline = (seconds: number) =>
    session.startedAt ? new Date(session.startedAt.getTime() + seconds * 1000) : null;

  const [englishExam, mathExam] = await Promise.all([
    createExamForSet({
      studentId: participant.studentId,
      setId: session.englishSetId,
      type: 'mock_english',
      deadlineAt: deadline(session.englishDurationSeconds),
    }),
    createExamForSet({
      studentId: participant.studentId,
      setId: session.mathSetId,
      type: 'mock_math',
      deadlineAt: deadline(session.mathDurationSeconds),
    }),
  ]);

  await db
    .update(liveExamParticipants)
    .set({ englishExamId: englishExam.id, mathExamId: mathExam.id })
    .where(eq(liveExamParticipants.id, participant.id));

  return { englishExamId: englishExam.id, mathExamId: mathExam.id };
}

async function findParticipantInSession(participantId: string, sessionId: string) {
  const [participant] = await db
    .select()
    .from(liveExamParticipants)
    .where(
      and(eq(liveExamParticipants.id, participantId), eq(liveExamParticipants.sessionId, sessionId)),
    )
    .limit(1);
  if (!participant) throw notFound('Participant not found');
  return participant;
}

export async function getParticipantResult(
  sessionId: string,
  participantId: string,
  teacherId: string,
) {
  const session = await findOwnedSession(sessionId, teacherId);

  const [participant] = await db
    .select({
      id: liveExamParticipants.id,
      studentId: liveExamParticipants.studentId,
      englishExamId: liveExamParticipants.englishExamId,
      mathExamId: liveExamParticipants.mathExamId,
      globalFeedback: liveExamParticipants.globalFeedback,
      resultReleased: liveExamParticipants.resultReleased,
      name: users.name,
    })
    .from(liveExamParticipants)
    .innerJoin(users, eq(liveExamParticipants.studentId, users.id))
    .where(
      and(eq(liveExamParticipants.id, participantId), eq(liveExamParticipants.sessionId, session.id)),
    )
    .limit(1);
  if (!participant) throw notFound('Participant not found');

  const [questionFeedbacks, english, math] = await Promise.all([
    db
      .select()
      .from(liveExamQuestionFeedback)
      .where(eq(liveExamQuestionFeedback.participantId, participant.id)),
    loadSectionForMarking(participant.englishExamId),
    loadSectionForMarking(participant.mathExamId),
  ]);

  return { ...participant, questionFeedbacks, english, math };
}

/**
 * One section's paper, for the teacher marking it.
 *
 * Deliberately served from here rather than from the teacher module's
 * `getStudentExamResults`, because the two authorise on different things.
 * That one requires the student to be assigned to the teacher via
 * `users.teacher_id` — but a live exam is joined with a code by whoever is in
 * the room, and assignment has nothing to do with it. The marking page used to
 * call it and got a 404 for any student not on that teacher's roster, which is
 * most of them.
 *
 * The authority that belongs here is session ownership, which the caller has
 * already established: this teacher owns the session, this participant sat it,
 * so this teacher may read the paper.
 */
async function loadSectionForMarking(examId: string | null) {
  if (!examId) return null;

  const [exam] = await db.select().from(exams).where(eq(exams.id, examId)).limit(1);
  if (!exam) return null;

  const results = await db
    .select({
      questionId: questions.id,
      questionText: questions.questionText,
      optionA: questions.optionA,
      optionB: questions.optionB,
      optionC: questions.optionC,
      optionD: questions.optionD,
      correctAnswer: questions.correctAnswer,
      correctAnswerText: questions.correctAnswerText,
      explanation: questions.explanation,
      selectedAnswer: examAnswers.selectedAnswer,
      selectedAnswerText: examAnswers.selectedAnswerText,
      isCorrect: examAnswers.isCorrect,
      orderIndex: examAnswers.orderIndex,
    })
    .from(examAnswers)
    .innerJoin(questions, eq(examAnswers.questionId, questions.id))
    .where(eq(examAnswers.examId, exam.id))
    .orderBy(examAnswers.orderIndex);

  return { exam, results };
}

/**
 * Saves a teacher's notes on one participant. Per-question notes upsert on
 * `(participant, question)` so revising a comment replaces it rather than
 * stacking duplicates.
 */
export async function saveParticipantFeedback(
  sessionId: string,
  participantId: string,
  teacherId: string,
  input: SaveFeedbackInput,
) {
  const session = await findOwnedSession(sessionId, teacherId);
  const participant = await findParticipantInSession(participantId, session.id);

  if (input.globalFeedback !== undefined) {
    await db
      .update(liveExamParticipants)
      .set({ globalFeedback: input.globalFeedback })
      .where(eq(liveExamParticipants.id, participant.id));
  }

  if (input.questionFeedbacks?.length) {
    await db
      .insert(liveExamQuestionFeedback)
      .values(
        input.questionFeedbacks.map((entry) => ({
          participantId: participant.id,
          questionId: entry.questionId,
          feedback: entry.feedback,
        })),
      )
      .onConflictDoUpdate({
        target: [liveExamQuestionFeedback.participantId, liveExamQuestionFeedback.questionId],
        // `excluded` is the row this insert tried to add — i.e. the new comment.
        set: { feedback: sql`excluded.feedback` },
      });
  }
}

async function notifyResultsReleased(studentId: string, sessionTitle: string) {
  await db.insert(notifications).values({
    userId: studentId,
    type: 'live_exam_result',
    title: 'Your Live Exam results are ready',
    message: `Your results from "${sessionTitle}" have been released by your teacher.`,
    link: '/student/results?tab=live',
  });
}

/**
 * Releases one participant's results.
 *
 * Skips a participant who is already released, like `releaseAllResults` does:
 * re-releasing would send a second notification, and would bump every miss in
 * their mistake bank a second time.
 */
export async function releaseParticipantResult(
  sessionId: string,
  participantId: string,
  teacherId: string,
) {
  const session = await findOwnedSession(sessionId, teacherId);
  const participant = await findParticipantInSession(participantId, session.id);
  if (participant.resultReleased) return { ok: true, alreadyReleased: true };

  await db
    .update(liveExamParticipants)
    .set({ resultReleased: true })
    .where(eq(liveExamParticipants.id, participant.id));

  // Only now: until this moment the student was not supposed to know which
  // questions they got wrong.
  await recordMistakesOnRelease(participant.studentId, [
    participant.englishExamId,
    participant.mathExamId,
  ]);

  await notifyResultsReleased(participant.studentId, session.title);
  return { ok: true };
}

/**
 * Releases everyone still unreleased and closes the session. Already-released
 * participants are skipped so re-running this does not send them a second
 * notification.
 */
export async function releaseAllResults(sessionId: string, teacherId: string) {
  const session = await findOwnedSession(sessionId, teacherId);

  const participants = await db
    .select({
      id: liveExamParticipants.id,
      studentId: liveExamParticipants.studentId,
      englishExamId: liveExamParticipants.englishExamId,
      mathExamId: liveExamParticipants.mathExamId,
      resultReleased: liveExamParticipants.resultReleased,
    })
    .from(liveExamParticipants)
    .where(eq(liveExamParticipants.sessionId, session.id));

  const unreleased = participants.filter((participant) => !participant.resultReleased);

  for (const participant of unreleased) {
    await db
      .update(liveExamParticipants)
      .set({ resultReleased: true })
      .where(eq(liveExamParticipants.id, participant.id));
    await recordMistakesOnRelease(participant.studentId, [
      participant.englishExamId,
      participant.mathExamId,
    ]);
    await notifyResultsReleased(participant.studentId, session.title);
  }

  await db
    .update(liveExamSessions)
    .set({ status: 'completed' })
    .where(eq(liveExamSessions.id, session.id));

  return { ok: true, released: unreleased.length };
}

/** Sets flagged as live-exam material, offered when creating a session. */
export async function listLiveExamSets() {
  return db
    .select({
      id: questionSets.id,
      title: questionSets.title,
      subject: questionSets.subject,
      isDraft: questionSets.isDraft,
    })
    .from(questionSets)
    .where(and(eq(questionSets.isLiveExam, true), isNull(questionSets.archivedAt)));
}

// ── Student ───────────────────────────────────────────────────────────────────

/** Public lobby check: enough to render the waiting room, and nothing more. */
export async function getSessionStatus(joinCode: string) {
  const session = await findSessionByCode(joinCode);
  if (!session) throw notFound('Session not found');

  return {
    id: session.id,
    title: session.title,
    status: session.status,
    startedAt: session.startedAt,
    englishDurationSeconds: session.englishDurationSeconds,
    mathDurationSeconds: session.mathDurationSeconds,
  };
}

/** Joining is idempotent — a student reloading the lobby rejoins their seat. */
export async function joinSession(joinCode: string, studentId: string) {
  const session = await findSessionByCode(joinCode);
  if (!session) throw notFound('Session not found');
  if (session.status === 'completed') throw badRequest('Session already ended');

  const [existing] = await db
    .select()
    .from(liveExamParticipants)
    .where(
      and(
        eq(liveExamParticipants.sessionId, session.id),
        eq(liveExamParticipants.studentId, studentId),
      ),
    )
    .limit(1);

  const participant =
    existing ??
    (
      await db
        .insert(liveExamParticipants)
        .values({ sessionId: session.id, studentId })
        .returning()
    )[0];

  // A session that is already running provisions on the spot, so arriving late
  // costs the student the time they missed and nothing else.
  const exams =
    session.status === 'active'
      ? await provisionParticipantExams(participant, session)
      : { englishExamId: participant.englishExamId, mathExamId: participant.mathExamId };

  return {
    sessionId: session.id,
    participantId: participant.id,
    status: session.status,
    startedAt: session.startedAt,
    englishExamId: exams.englishExamId,
    mathExamId: exams.mathExamId,
    englishDurationSeconds: session.englishDurationSeconds,
    mathDurationSeconds: session.mathDurationSeconds,
  };
}

/**
 * What the lobby polls. Returns the session state plus this student's exam ids,
 * which stay null until the teacher starts — that transition is the signal the
 * client is waiting for.
 */
export async function pollSession(joinCode: string, studentId: string) {
  const session = await findSessionByCode(joinCode);
  if (!session) throw notFound('Session not found');

  const [participant] = await db
    .select()
    .from(liveExamParticipants)
    .where(
      and(
        eq(liveExamParticipants.sessionId, session.id),
        eq(liveExamParticipants.studentId, studentId),
      ),
    )
    .limit(1);

  // Provisioning here too, not just on join: a participant can exist without
  // exams if they were added between the teacher pressing start and this poll.
  const exams =
    participant && session.status === 'active'
      ? await provisionParticipantExams(participant, session)
      : { englishExamId: participant?.englishExamId ?? null, mathExamId: participant?.mathExamId ?? null };

  return {
    status: session.status,
    startedAt: session.startedAt,
    englishExamId: exams.englishExamId,
    mathExamId: exams.mathExamId,
    englishDurationSeconds: session.englishDurationSeconds,
    mathDurationSeconds: session.mathDurationSeconds,
  };
}

export async function listStudentResults(studentId: string) {
  return db
    .select({
      sessionId: liveExamSessions.id,
      sessionTitle: liveExamSessions.title,
      sessionStatus: liveExamSessions.status,
      startedAt: liveExamSessions.startedAt,
      participantId: liveExamParticipants.id,
      englishExamId: liveExamParticipants.englishExamId,
      mathExamId: liveExamParticipants.mathExamId,
      globalFeedback: liveExamParticipants.globalFeedback,
      resultReleased: liveExamParticipants.resultReleased,
      joinedAt: liveExamParticipants.joinedAt,
    })
    .from(liveExamParticipants)
    .innerJoin(liveExamSessions, eq(liveExamParticipants.sessionId, liveExamSessions.id))
    .where(
      and(
        eq(liveExamParticipants.studentId, studentId),
        eq(liveExamParticipants.resultReleased, true),
      ),
    )
    .orderBy(liveExamSessions.startedAt);
}

export async function listUnreadNotifications(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)))
    .orderBy(notifications.createdAt);
}

export async function markNotificationRead(notificationId: string, userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ isRead: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
}
