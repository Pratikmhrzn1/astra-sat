import { and, eq, isNull, or } from 'drizzle-orm';
import { db } from '../../core/db';
import { exams, mockTests } from '../../core/db/schema';
import { finalizeMockIfComplete, findMockContextForExam } from '../student/mock.service';
import { toSectionScore } from '../scoring';

/**
 * Fills in scaled scores for exams and mocks completed before scoring existed.
 *
 * Every score in the database until now was a raw count of correct answers; the
 * 200-800 number was computed in the browser and never stored, so no trend,
 * target gap or average could be derived from history. This walks the existing
 * rows once and writes what `submitExam` would have written at the time.
 *
 * Two rules make it safe to run repeatedly:
 *
 *   - only rows whose score column is still NULL are touched, so a rerun is a
 *     no-op and a hand-corrected score is never overwritten;
 *   - the numbers come from the same `modules/scoring` functions the live path
 *     uses, never from SQL arithmetic, so the formula cannot drift between the
 *     backfilled history and everything written afterwards.
 *
 * It also runs once on every boot (see `http/server.ts`), after the port opens,
 * so an environment whose history predates scoring repairs itself on deploy
 * instead of waiting for someone to find the admin button.
 *
 * It runs synchronously on the request thread, like the auto-tag job next to it.
 * That is acceptable at the current corpus size (hundreds of exams, one query
 * each) and keeps the result honest — the admin sees the counts rather than a
 * job id. Revisit if this ever has to walk tens of thousands of rows.
 */

export interface BackfillRun {
  examsFound: number;
  examsScored: number;
  /** Completed but too short for a section score to mean anything. */
  examsTooShort: number;
  /** Mock modules, which are half a section and never scored on their own. */
  examsSkippedAsMockModule: number;
  mocksFound: number;
  mocksScored: number;
  /** Mocks not yet finishable — a module is still open or was never issued. */
  mocksIncomplete: number;
}

export async function backfillScores(): Promise<BackfillRun> {
  const run: BackfillRun = {
    examsFound: 0,
    examsScored: 0,
    examsTooShort: 0,
    examsSkippedAsMockModule: 0,
    mocksFound: 0,
    mocksScored: 0,
    mocksIncomplete: 0,
  };

  const pending = await db
    .select({ id: exams.id, score: exams.score, totalQuestions: exams.totalQuestions })
    .from(exams)
    .where(and(eq(exams.status, 'completed'), isNull(exams.scaledScore)));

  run.examsFound = pending.length;
  console.log(`[scoring-backfill] ${run.examsFound} completed exams without a scaled score`);

  for (const exam of pending) {
    // Mock membership, not exam.type: live exams share the mock_* types but are
    // whole sections in their own right and do get a scaled score.
    if (await findMockContextForExam(exam.id)) {
      run.examsSkippedAsMockModule++;
      continue;
    }

    const scaledScore = toSectionScore(exam.score ?? 0, exam.totalQuestions, 'none');
    if (scaledScore === null) {
      run.examsTooShort++;
      continue;
    }

    await db.update(exams).set({ scaledScore }).where(eq(exams.id, exam.id));
    run.examsScored++;
  }

  // Includes mocks wrongly marked `completed` by the old startNextModule, which
  // closed a mock when Math Module 2 was issued rather than submitted. Those
  // only score here if all four modules really were finished.
  const unscored = await db
    .select({ id: mockTests.id, englishExamId: mockTests.englishExamId, completedAt: mockTests.completedAt })
    .from(mockTests)
    .where(or(isNull(mockTests.totalScore), isNull(mockTests.rwScore), isNull(mockTests.mathScore)));

  run.mocksFound = unscored.length;
  console.log(`[scoring-backfill] ${run.mocksFound} mocks without a total score`);

  for (const mock of unscored) {
    if (!mock.englishExamId) {
      run.mocksIncomplete++;
      continue;
    }

    // finalizeMockIfComplete only writes to an in_progress mock, by design — it
    // must not rescore a closed one on the live path. Reopening here is what
    // lets a mock the old code closed prematurely be scored properly now.
    //
    // The side effect is deliberate: a mock that was closed when Math Module 2
    // was merely issued, and never finished, stays `in_progress` after this and
    // is counted as incomplete. That is the truth about it — it was never sat to
    // the end — and leaving it marked completed with no score would be worse.
    await db
      .update(mockTests)
      .set({ status: 'in_progress' })
      .where(and(eq(mockTests.id, mock.id), eq(mockTests.status, 'completed')));

    await finalizeMockIfComplete(mock.englishExamId);

    const [after] = await db
      .select({ totalScore: mockTests.totalScore, status: mockTests.status })
      .from(mockTests)
      .where(eq(mockTests.id, mock.id))
      .limit(1);

    // finalizeMockIfComplete stamps completedAt with now(). For history that is
    // wrong — it would re-date a mock sat weeks ago to today on every run, and
    // reorder the student's history and trend lines — so keep the original date.
    if (after?.status === 'completed' && mock.completedAt) {
      await db.update(mockTests).set({ completedAt: mock.completedAt }).where(eq(mockTests.id, mock.id));
    }

    if (after?.status === 'completed' && after.totalScore !== null) run.mocksScored++;
    else if (after?.status !== 'completed') run.mocksIncomplete++;
  }

  console.log(
    `[scoring-backfill] Done — exams ${run.examsScored}/${run.examsFound}, mocks ${run.mocksScored}/${run.mocksFound}`,
  );
  return run;
}
