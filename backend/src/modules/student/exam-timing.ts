import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { exams } from '../../db/schema';
import { parseDbTimestamp } from '../../lib/db-time';

/**
 * Server-authoritative exam time.
 *
 * Until now every clock was the browser's: a mock module ran a `20 * 60`
 * countdown seeded on each page load, so a reload restarted it, and the server
 * wrote whatever `timeSpentSeconds` the client reported. Nothing stopped a
 * student extending a module, and nothing closed one they walked away from.
 *
 * Three kinds of exam:
 *
 *  - **Mock modules** get the real test's limits — 32 minutes for Reading and
 *    Writing, 35 for Math. The deadline is stamped when the module is first
 *    *opened*, not when it is created: Math Module 1 is created when the mock
 *    starts but taken an hour later.
 *  - **Live-exam sections** keep the session's durations, measured from the
 *    moment the teacher started the session — the same rule the lobby already
 *    used, now enforced here rather than trusted to the client.
 *  - **Practice** is untimed on the server. Its optional countdown is a
 *    convenience, and those scores count as self-study.
 *
 * There is no scheduler. An exam past its deadline is closed the next time it
 * is read, listed, saved to or needed for the next module (`closeIfExpired` in
 * exams.service).
 */

export const MOCK_MODULE_LIMIT_SECONDS = { english: 32 * 60, math: 35 * 60 } as const;

/** Writes arriving this long after the deadline still count — a slow network is not cheating. */
export const DEADLINE_GRACE_SECONDS = 30;

type ExamRow = typeof exams.$inferSelect;

export function mockModuleLimitFor(type: ExamRow['type']): number | null {
  if (type === 'mock_english') return MOCK_MODULE_LIMIT_SECONDS.english;
  if (type === 'mock_math') return MOCK_MODULE_LIMIT_SECONDS.math;
  return null;
}

async function liveSectionDeadline(exam: ExamRow): Promise<Date | null | undefined> {
  const result = await db.execute<{ started_at: Date | string | null; duration: number }>(sql`
    SELECT s.started_at,
           CASE WHEN p.english_exam_id = ${exam.id} THEN s.english_duration_seconds
                ELSE s.math_duration_seconds END AS duration
      FROM live_exam_participants p
      JOIN live_exam_sessions s ON s.id = p.session_id
     WHERE p.english_exam_id = ${exam.id} OR p.math_exam_id = ${exam.id}
     LIMIT 1
  `);
  const row = result.rows[0] as { started_at: Date | string | null; duration: number } | undefined;
  if (!row) return undefined; // not a live exam
  if (!row.started_at) return null; // session not started
  return new Date(parseDbTimestamp(row.started_at).getTime() + Number(row.duration) * 1000);
}

async function isMockModule(examId: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 FROM mock_tests
     WHERE ${examId} IN (english_exam_id, english_m2_exam_id, math_exam_id, math_m2_exam_id)
     LIMIT 1
  `);
  return result.rows.length > 0;
}

/**
 * The exam's deadline, or null if it is untimed or not yet started.
 *
 * Persists what it works out, once: a live section's deadline is fixed by the
 * session, and a mock module's is stamped on first open. The stamp is a
 * conditional UPDATE, so two tabs opening the same module at once agree on one
 * deadline. Pass `open: false` for any read that is not the student actually
 * sitting down to the exam — the player pre-fetches the next section, and that
 * must not start its clock.
 */
export async function resolveDeadline(exam: ExamRow, { open }: { open: boolean }): Promise<Date | null> {
  if (exam.deadlineAt) return exam.deadlineAt;
  if (exam.status !== 'in_progress') return null;

  const live = await liveSectionDeadline(exam);
  if (live !== undefined) {
    if (live) await db.update(exams).set({ deadlineAt: live }).where(and(eq(exams.id, exam.id), isNull(exams.deadlineAt)));
    return live;
  }

  let limit = exam.timeLimitSeconds;
  // Mock modules created before limits were stored.
  if (limit === null && mockModuleLimitFor(exam.type) !== null && (await isMockModule(exam.id))) {
    limit = mockModuleLimitFor(exam.type);
    await db.update(exams).set({ timeLimitSeconds: limit }).where(eq(exams.id, exam.id));
  }
  if (limit === null || !open) return null;

  await db
    .update(exams)
    .set({ deadlineAt: new Date(Date.now() + limit * 1000) })
    .where(and(eq(exams.id, exam.id), isNull(exams.deadlineAt)));
  const [row] = await db.select({ deadlineAt: exams.deadlineAt }).from(exams).where(eq(exams.id, exam.id)).limit(1);
  return row?.deadlineAt ?? null;
}

export function isPastGrace(deadline: Date | null, now = Date.now()): boolean {
  return !!deadline && now > deadline.getTime() + DEADLINE_GRACE_SECONDS * 1000;
}

/**
 * Seconds spent on a module timed by its own limit, computed from the deadline
 * rather than taken from the client. Null where the server has no basis for one
 * (untimed practice, and live sections, whose clock started with the session).
 */
export function serverTimeSpent(exam: ExamRow, deadline: Date | null, now = Date.now()): number | null {
  if (!deadline || exam.timeLimitSeconds === null) return null;
  const openedAt = deadline.getTime() - exam.timeLimitSeconds * 1000;
  const endedAt = Math.min(now, deadline.getTime());
  return Math.max(0, Math.min(exam.timeLimitSeconds, Math.round((endedAt - openedAt) / 1000)));
}
