import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db';
import {
  liveExamSessions,
  liveExamParticipants,
  liveExamQuestionFeedback,
  notifications,
  questionSets,
  exams,
  users,
} from '../db/schema';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { eq, and } from 'drizzle-orm';
export const liveExamRouter = Router();

function makeJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Teacher routes ───────────────────────────────────────────────────────────

const createSessionSchema = z.object({
  title: z.string().min(1),
  englishSetId: z.string().uuid(),
  mathSetId: z.string().uuid(),
});

// List sessions for teacher
liveExamRouter.get('/teacher/live-exams', requireAuth, async (req, res) => {
  if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  try {
    const sessions = await db
      .select()
      .from(liveExamSessions)
      .where(eq(liveExamSessions.teacherId, req.user!.sub))
      .orderBy(liveExamSessions.createdAt);
    return res.json(sessions);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Create session
liveExamRouter.post(
  '/teacher/live-exams',
  requireAuth,
  validateBody(createSessionSchema),
  async (req, res) => {
    if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    try {
      let joinCode = makeJoinCode();
      // Ensure uniqueness
      while (true) {
        const existing = await db
          .select({ id: liveExamSessions.id })
          .from(liveExamSessions)
          .where(eq(liveExamSessions.joinCode, joinCode))
          .limit(1);
        if (existing.length === 0) break;
        joinCode = makeJoinCode();
      }
      const { title, englishSetId, mathSetId } = req.body;
      const [session] = await db
        .insert(liveExamSessions)
        .values({
          title,
          teacherId: req.user!.sub,
          joinCode,
          englishSetId,
          mathSetId,
          status: 'waiting',
        })
        .returning();
      return res.status(201).json(session);
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

// Get session detail with participants
liveExamRouter.get('/teacher/live-exams/:sessionId', requireAuth, async (req, res) => {
  if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  try {
    const [session] = await db
      .select()
      .from(liveExamSessions)
      .where(
        and(
          eq(liveExamSessions.id, req.params.sessionId),
          eq(liveExamSessions.teacherId, req.user!.sub)
        )
      )
      .limit(1);
    if (!session) return res.status(404).json({ error: 'Session not found' });

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

    return res.json({ ...session, participants });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Start session — creates exams for all participants and flips status
liveExamRouter.post('/teacher/live-exams/:sessionId/start', requireAuth, async (req, res) => {
  if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  try {
    const [session] = await db
      .select()
      .from(liveExamSessions)
      .where(
        and(
          eq(liveExamSessions.id, req.params.sessionId),
          eq(liveExamSessions.teacherId, req.user!.sub)
        )
      )
      .limit(1);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'waiting') return res.status(400).json({ error: 'Already started' });

    const startedAt = new Date();

    // Create English + Math exams for each participant
    const participants = await db
      .select()
      .from(liveExamParticipants)
      .where(eq(liveExamParticipants.sessionId, session.id));

    for (const p of participants) {
      const [engExam] = await db
        .insert(exams)
        .values({ studentId: p.studentId, setId: session.englishSetId!, type: 'mock_english' })
        .returning();
      const [mathExam] = await db
        .insert(exams)
        .values({ studentId: p.studentId, setId: session.mathSetId!, type: 'mock_math' })
        .returning();
      await db
        .update(liveExamParticipants)
        .set({ englishExamId: engExam.id, mathExamId: mathExam.id })
        .where(eq(liveExamParticipants.id, p.id));
    }

    await db
      .update(liveExamSessions)
      .set({ status: 'active', startedAt })
      .where(eq(liveExamSessions.id, session.id));

    return res.json({ ok: true, startedAt });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get individual student result for teacher
liveExamRouter.get(
  '/teacher/live-exams/:sessionId/participants/:participantId',
  requireAuth,
  async (req, res) => {
    if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    try {
      const [session] = await db
        .select()
        .from(liveExamSessions)
        .where(
          and(
            eq(liveExamSessions.id, req.params.sessionId),
            eq(liveExamSessions.teacherId, req.user!.sub)
          )
        )
        .limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });

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
          and(
            eq(liveExamParticipants.id, req.params.participantId),
            eq(liveExamParticipants.sessionId, session.id)
          )
        )
        .limit(1);
      if (!participant) return res.status(404).json({ error: 'Participant not found' });

      const questionFeedbacks = await db
        .select()
        .from(liveExamQuestionFeedback)
        .where(eq(liveExamQuestionFeedback.participantId, participant.id));

      return res.json({ ...participant, questionFeedbacks });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

const saveFeedbackSchema = z.object({
  globalFeedback: z.string().optional(),
  questionFeedbacks: z
    .array(z.object({ questionId: z.string().uuid(), feedback: z.string() }))
    .optional(),
});

// Save feedback for a participant
liveExamRouter.post(
  '/teacher/live-exams/:sessionId/participants/:participantId/feedback',
  requireAuth,
  validateBody(saveFeedbackSchema),
  async (req, res) => {
    if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    try {
      const [session] = await db
        .select()
        .from(liveExamSessions)
        .where(
          and(
            eq(liveExamSessions.id, req.params.sessionId),
            eq(liveExamSessions.teacherId, req.user!.sub)
          )
        )
        .limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const [participant] = await db
        .select({ id: liveExamParticipants.id })
        .from(liveExamParticipants)
        .where(
          and(
            eq(liveExamParticipants.id, req.params.participantId),
            eq(liveExamParticipants.sessionId, session.id)
          )
        )
        .limit(1);
      if (!participant) return res.status(404).json({ error: 'Participant not found' });

      const { globalFeedback, questionFeedbacks } = req.body;

      if (globalFeedback !== undefined) {
        await db
          .update(liveExamParticipants)
          .set({ globalFeedback })
          .where(eq(liveExamParticipants.id, participant.id));
      }

      if (questionFeedbacks && questionFeedbacks.length > 0) {
        for (const qf of questionFeedbacks) {
          await db
            .insert(liveExamQuestionFeedback)
            .values({ participantId: participant.id, questionId: qf.questionId, feedback: qf.feedback })
            .onConflictDoUpdate({
              target: [liveExamQuestionFeedback.participantId, liveExamQuestionFeedback.questionId],
              set: { feedback: qf.feedback },
            });
        }
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

// Release results for one participant
liveExamRouter.post(
  '/teacher/live-exams/:sessionId/participants/:participantId/release',
  requireAuth,
  async (req, res) => {
    if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    try {
      const [session] = await db
        .select()
        .from(liveExamSessions)
        .where(
          and(
            eq(liveExamSessions.id, req.params.sessionId),
            eq(liveExamSessions.teacherId, req.user!.sub)
          )
        )
        .limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const [participant] = await db
        .select({ id: liveExamParticipants.id, studentId: liveExamParticipants.studentId })
        .from(liveExamParticipants)
        .where(
          and(
            eq(liveExamParticipants.id, req.params.participantId),
            eq(liveExamParticipants.sessionId, session.id)
          )
        )
        .limit(1);
      if (!participant) return res.status(404).json({ error: 'Participant not found' });

      await db
        .update(liveExamParticipants)
        .set({ resultReleased: true })
        .where(eq(liveExamParticipants.id, participant.id));

      await db.insert(notifications).values({
        userId: participant.studentId,
        type: 'live_exam_result',
        title: 'Your Live Exam results are ready',
        message: `Your results from "${session.title}" have been released by your teacher.`,
        link: '/student/results?tab=live',
      });

      return res.json({ ok: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

// Release results for ALL participants
liveExamRouter.post(
  '/teacher/live-exams/:sessionId/release-all',
  requireAuth,
  async (req, res) => {
    if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
    try {
      const [session] = await db
        .select()
        .from(liveExamSessions)
        .where(
          and(
            eq(liveExamSessions.id, req.params.sessionId),
            eq(liveExamSessions.teacherId, req.user!.sub)
          )
        )
        .limit(1);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const participants = await db
        .select({ id: liveExamParticipants.id, studentId: liveExamParticipants.studentId, resultReleased: liveExamParticipants.resultReleased })
        .from(liveExamParticipants)
        .where(eq(liveExamParticipants.sessionId, session.id));

      const unreleased = participants.filter((p) => !p.resultReleased);
      for (const p of unreleased) {
        await db
          .update(liveExamParticipants)
          .set({ resultReleased: true })
          .where(eq(liveExamParticipants.id, p.id));
        await db.insert(notifications).values({
          userId: p.studentId,
          type: 'live_exam_result',
          title: 'Your Live Exam results are ready',
          message: `Your results from "${session.title}" have been released by your teacher.`,
          link: '/student/results?tab=live',
        });
      }

      await db
        .update(liveExamSessions)
        .set({ status: 'completed' })
        .where(eq(liveExamSessions.id, session.id));

      return res.json({ ok: true, released: unreleased.length });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

// ── Public / student routes ──────────────────────────────────────────────────

// Check session status by join code (public — used in lobby before auth check)
liveExamRouter.get('/live/:joinCode/status', async (req, res) => {
  try {
    const [session] = await db
      .select({
        id: liveExamSessions.id,
        title: liveExamSessions.title,
        status: liveExamSessions.status,
        startedAt: liveExamSessions.startedAt,
        englishDurationSeconds: liveExamSessions.englishDurationSeconds,
        mathDurationSeconds: liveExamSessions.mathDurationSeconds,
      })
      .from(liveExamSessions)
      .where(eq(liveExamSessions.joinCode, req.params.joinCode.toUpperCase()))
      .limit(1);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    return res.json(session);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Join lobby (requires auth)
liveExamRouter.post('/live/:joinCode/join', requireAuth, async (req, res) => {
  if (req.user!.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
  try {
    const [session] = await db
      .select()
      .from(liveExamSessions)
      .where(eq(liveExamSessions.joinCode, req.params.joinCode.toUpperCase()))
      .limit(1);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'completed') return res.status(400).json({ error: 'Session already ended' });

    // Upsert participant
    const existing = await db
      .select()
      .from(liveExamParticipants)
      .where(
        and(
          eq(liveExamParticipants.sessionId, session.id),
          eq(liveExamParticipants.studentId, req.user!.sub)
        )
      )
      .limit(1);

    let participant = existing[0];
    if (!participant) {
      const [p] = await db
        .insert(liveExamParticipants)
        .values({ sessionId: session.id, studentId: req.user!.sub })
        .returning();
      participant = p;
    }

    return res.json({
      sessionId: session.id,
      participantId: participant.id,
      status: session.status,
      startedAt: session.startedAt,
      englishExamId: participant.englishExamId,
      mathExamId: participant.mathExamId,
      englishDurationSeconds: session.englishDurationSeconds,
      mathDurationSeconds: session.mathDurationSeconds,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Poll session state (student lobby polling)
liveExamRouter.get('/live/:joinCode/poll', requireAuth, async (req, res) => {
  if (req.user!.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
  try {
    const [session] = await db
      .select({
        id: liveExamSessions.id,
        status: liveExamSessions.status,
        startedAt: liveExamSessions.startedAt,
        englishDurationSeconds: liveExamSessions.englishDurationSeconds,
        mathDurationSeconds: liveExamSessions.mathDurationSeconds,
      })
      .from(liveExamSessions)
      .where(eq(liveExamSessions.joinCode, req.params.joinCode.toUpperCase()))
      .limit(1);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const [participant] = await db
      .select({
        englishExamId: liveExamParticipants.englishExamId,
        mathExamId: liveExamParticipants.mathExamId,
      })
      .from(liveExamParticipants)
      .where(
        and(
          eq(liveExamParticipants.sessionId, session.id),
          eq(liveExamParticipants.studentId, req.user!.sub)
        )
      )
      .limit(1);

    return res.json({
      status: session.status,
      startedAt: session.startedAt,
      englishExamId: participant?.englishExamId ?? null,
      mathExamId: participant?.mathExamId ?? null,
      englishDurationSeconds: session.englishDurationSeconds,
      mathDurationSeconds: session.mathDurationSeconds,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Student: get their own live exam results (after release)
liveExamRouter.get('/student/live-exam-results', requireAuth, async (req, res) => {
  if (req.user!.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
  try {
    const results = await db
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
          eq(liveExamParticipants.studentId, req.user!.sub),
          eq(liveExamParticipants.resultReleased, true)
        )
      )
      .orderBy(liveExamSessions.startedAt);

    return res.json(results);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Student: get notifications
liveExamRouter.get('/student/notifications', requireAuth, async (req, res) => {
  if (req.user!.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
  try {
    const notifs = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.userId, req.user!.sub), eq(notifications.isRead, false)))
      .orderBy(notifications.createdAt);
    return res.json(notifs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Student: mark notification read
liveExamRouter.post('/student/notifications/:id/read', requireAuth, async (req, res) => {
  if (req.user!.role !== 'student') return res.status(403).json({ error: 'Forbidden' });
  try {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.userId, req.user!.sub)));
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Get live exam question sets for teacher session creation
liveExamRouter.get('/teacher/live-exam-sets', requireAuth, async (req, res) => {
  if (req.user!.role !== 'teacher') return res.status(403).json({ error: 'Forbidden' });
  try {
    const sets = await db
      .select({
        id: questionSets.id,
        title: questionSets.title,
        subject: questionSets.subject,
        isDraft: questionSets.isDraft,
      })
      .from(questionSets)
      .where(eq(questionSets.isLiveExam, true));
    return res.json(sets);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});
