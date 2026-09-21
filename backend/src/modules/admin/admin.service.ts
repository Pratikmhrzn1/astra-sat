import { desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../core/db';
import { aiFeedback, exams, questionSets, questions, users } from '../../core/db/schema';
import { getTaggingCoverage } from '../taxonomy';

/** Platform overview for admins: headline counts and AI spend. */

export async function getStats() {
  const [students, teachers, admins, examCount, questionCount, setCount] = await Promise.all([
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'student'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'teacher'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'admin'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(exams)),
    // Live content only: retired question versions and archived sets are kept for
    // history but are not part of the question bank any more.
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(questions).where(isNull(questions.retiredAt))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(questionSets).where(isNull(questionSets.archivedAt))),
  ]);

  return {
    students,
    teachers,
    admins,
    exams: examCount,
    questions: questionCount,
    questionSets: setCount,
    // Every per-skill analytic is only as good as this number, so it belongs
    // where someone will see it rather than in a query someone has to remember
    // to run. Math sat at 0% for as long as it was untaggable.
    taggingCoverage: await getTaggingCoverage(),
  };
}

async function countRows(query: Promise<{ count: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.count ?? 0;
}

// ── AI spend ──────────────────────────────────────────────────────────────────

/**
 * Per-model cost, latency and reliability, aggregated from the rows every AI
 * call writes. `parseFailureRate` is the share of calls that needed a re-prompt
 * to return valid JSON — a rising value means a model or prompt is degrading.
 */
export async function getModelStats() {
  return db
    .select({
      modelUsed: aiFeedback.modelUsed,
      totalCalls: sql<number>`count(*)::int`,
      avgLatencyMs: sql<number>`round(avg(${aiFeedback.latencyMs}))::int`,
      avgCostUsd: sql<string>`round(avg(${aiFeedback.costUsd}::numeric), 6)::text`,
      parseFailureRate: sql<number>`round(avg(CASE WHEN ${aiFeedback.parseFailed} THEN 1.0 ELSE 0.0 END)::numeric, 4)::float8`,
    })
    .from(aiFeedback)
    .groupBy(aiFeedback.modelUsed)
    .orderBy(desc(sql`count(*)`));
}
