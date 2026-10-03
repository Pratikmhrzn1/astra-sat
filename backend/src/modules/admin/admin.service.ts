import { desc, eq, isNull, sql } from 'drizzle-orm';
import { database } from '../../core/db';
import { tutorFeedbackTable, assessmentsTable, questionSetsTable, questionsTable, accountsTable } from '../../core/db/schema';
import { fetchTaggingCoverage } from '../taxonomy';

/** Platform overview for admins: headline counts and AI spend. */

export async function fetchStats() {
  const [students, trials, teachers, admins, examCount, questionCount, setCount] = await Promise.all([
    countRows(database.select({ count: sql<number>`count(*)::int` }).from(accountsTable).where(eq(accountsTable.role, 'student'))),
    countRows(database.select({ count: sql<number>`count(*)::int` }).from(accountsTable).where(eq(accountsTable.role, 'trial'))),
    countRows(database.select({ count: sql<number>`count(*)::int` }).from(accountsTable).where(eq(accountsTable.role, 'teacher'))),
    countRows(database.select({ count: sql<number>`count(*)::int` }).from(accountsTable).where(eq(accountsTable.role, 'admin'))),
    countRows(database.select({ count: sql<number>`count(*)::int` }).from(assessmentsTable)),
    // Live content only: retired question versions and archived sets are kept for
    // history but are not part of the question bank any more.
    countRows(database.select({ count: sql<number>`count(*)::int` }).from(questionsTable).where(isNull(questionsTable.retiredAt))),
    countRows(database.select({ count: sql<number>`count(*)::int` }).from(questionSetsTable).where(isNull(questionSetsTable.archivedAt))),
  ]);

  return {
    students,
    trials,
    teachers,
    admins,
    exams: examCount,
    questions: questionCount,
    questionSets: setCount,
    // Every per-skill analytic is only as good as this number, so it belongs
    // where someone will see it rather than in a query someone has to remember
    // to run. Math sat at 0% for as long as it was untaggable.
    taggingCoverage: await fetchTaggingCoverage(),
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
export async function fetchModelStats() {
  return database
    .select({
      modelUsed: tutorFeedbackTable.modelUsed,
      totalCalls: sql<number>`count(*)::int`,
      avgLatencyMs: sql<number>`round(avg(${tutorFeedbackTable.latencyMs}))::int`,
      avgCostUsd: sql<string>`round(avg(${tutorFeedbackTable.costUsd}::numeric), 6)::text`,
      parseFailureRate: sql<number>`round(avg(CASE WHEN ${tutorFeedbackTable.parseFailed} THEN 1.0 ELSE 0.0 END)::numeric, 4)::float8`,
    })
    .from(tutorFeedbackTable)
    .groupBy(tutorFeedbackTable.modelUsed)
    .orderBy(desc(sql`count(*)`));
}
