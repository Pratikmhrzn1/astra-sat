import { and, eq, gte, sql } from 'drizzle-orm';
import { database } from '../../core/db';
import { accountsTable, assessmentsTable, mockRunsTable } from '../../core/db/schema';
import { rateLimited } from '../../core/errors';

/**
 * The per-account daily test limit (trial accounts; null means unlimited).
 *
 * What counts is a test *start*: a practice, topic or mistake-review exam
 * (`type = 'individual'`), or a whole mock (one `mock_tests` row, however many
 * modules it goes on to create). Live exams are run by a teacher and never
 * count. The day runs midnight to midnight in Nepal time.
 *
 * `exams.created_at` and `mock_tests.started_at` are zone-less columns filled
 * by the database's NOW(), i.e. the DB session's local wall-clock time. So the
 * start of the Nepal day is converted to that same local time inside SQL,
 * which keeps the comparison right whatever timezone the database runs in.
 */

const NEPAL_TZ = 'Asia/Kathmandu';
/** Nepal is UTC+05:45 all year round (no daylight saving). */
const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60_000;
const DAY_MS = 86_400_000;

const nepalDayStart = sql`(date_trunc('day', now() AT TIME ZONE ${sql.raw(`'${NEPAL_TZ}'`)}) AT TIME ZONE ${sql.raw(`'${NEPAL_TZ}'`)})::timestamp`;

/** The next Nepal midnight, when today's count resets. */
export function nextNepalMidnight(now = Date.now()): Date {
  const nepalDayStartUtc = Math.floor((now + NEPAL_OFFSET_MS) / DAY_MS) * DAY_MS - NEPAL_OFFSET_MS;
  return new Date(nepalDayStartUtc + DAY_MS);
}

async function countStartsToday(studentId: string): Promise<number> {
  const [[practice], [mocks]] = await Promise.all([
    database
      .select({ n: sql<number>`count(*)::int` })
      .from(assessmentsTable)
      .where(
        and(
          eq(assessmentsTable.studentId, studentId),
          eq(assessmentsTable.type, 'individual'),
          gte(assessmentsTable.createdAt, nepalDayStart),
        ),
      ),
    database
      .select({ n: sql<number>`count(*)::int` })
      .from(mockRunsTable)
      .where(and(eq(mockRunsTable.studentId, studentId), gte(mockRunsTable.startedAt, nepalDayStart))),
  ]);
  return practice.n + mocks.n;
}

export interface DailyUsage {
  /** Null means unlimited. */
  limit: number | null;
  used: number;
  /** Null when unlimited. */
  remaining: number | null;
  resetsAt: string;
}

export async function fetchDailyUsage(studentId: string): Promise<DailyUsage> {
  const [user] = await database
    .select({ limit: accountsTable.dailyTestLimit })
    .from(accountsTable)
    .where(eq(accountsTable.id, studentId))
    .limit(1);
  const limit = user?.limit ?? null;
  const used = await countStartsToday(studentId);
  return {
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    resetsAt: nextNepalMidnight().toISOString(),
  };
}

/** Call before creating a practice exam or a mock. Throws 429 DAILY_LIMIT_REACHED at the cap. */
export async function assertDailyTestAllowance(studentId: string): Promise<void> {
  const usage = await fetchDailyUsage(studentId);
  if (usage.limit === null || usage.used < usage.limit) return;
  throw rateLimited(`You've used all ${usage.limit} tests for today. Your limit resets at midnight.`, {
    limit: usage.limit,
    used: usage.used,
    resetsAt: usage.resetsAt,
  }).withCode('DAILY_LIMIT_REACHED');
}
