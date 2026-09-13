import { sql, type SQL } from 'drizzle-orm';
import { db } from '../../db';
import { getProfile } from '../student/profile.service';

/**
 * The numbers behind "why am I losing points?" and "am I improving?".
 *
 * Every function takes a **list** of student ids rather than one, even where
 * only one is passed today. The Phase 3 consultancy dashboard needs exactly
 * these aggregates over a batch, and a function written for one student has to
 * be rewritten or looped to serve that — so the shape is right from the start.
 *
 * Two rules run through all of it:
 *
 *  - **Only what the student has actually seen.** Completed exams only, and a
 *    live-exam attempt only once the teacher has released it. An analytic that
 *    reveals a live result before release would leak the thing the whole release
 *    mechanism exists to control.
 *  - **No number without enough behind it.** A domain with a handful of attempts
 *    produces a percentage that swings twenty points on one question, so the
 *    caller is told the attempt count and decides.
 */

/**
 * `student_id IN (…)` as an explicit list.
 *
 * Not `= ANY($1)`: the driver binds a JS array as one scalar parameter, and
 * Postgres rejects it with "malformed array literal". Each id is still bound
 * separately, so this is parameterised, not interpolated.
 */
function studentIdList(studentIds: string[]): SQL {
  return sql.join(studentIds.map((id) => sql`${id}`), sql`, `);
}

/** Below this many attempts, an accuracy percentage is noise and is not shown. */
export const MIN_ATTEMPTS_FOR_ACCURACY = 5;

/** Below this many mocks, a readiness estimate is a guess rather than a trend. */
const MIN_MOCKS_FOR_CONFIDENCE = 2;

/**
 * Exams that may feed an analytic.
 *
 * Inlined into each query rather than materialised, so Postgres can use it as a
 * join predicate. The NOT EXISTS is what holds back an unreleased live exam.
 */
const VISIBLE_EXAM = sql`
  e.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM live_exam_participants lep
     WHERE (lep.english_exam_id = e.id OR lep.math_exam_id = e.id)
       AND lep.result_released = false
  )
`;

export interface SkillAccuracyRow {
  domainCode: string;
  domainLabel: string;
  skillCode: string | null;
  skillLabel: string | null;
  subject: 'english' | 'math';
  attempted: number;
  correct: number;
  /** 0-100, rounded. Meaningless below MIN_ATTEMPTS_FOR_ACCURACY — check `attempted`. */
  accuracy: number;
}

/**
 * Right/wrong counts per skill, rolled up under their domain.
 *
 * Untagged questions are dropped rather than bucketed as "untagged": a domain
 * list is a list of things to practise, and there is nothing actionable about
 * being told you are weak at questions nobody has categorised. The admin
 * dashboard's tagging-coverage stat is where that gap belongs.
 */
export async function skillAccuracy(
  studentIds: string[],
  options: { subject?: 'english' | 'math'; since?: Date; examId?: string } = {},
): Promise<SkillAccuracyRow[]> {
  if (studentIds.length === 0) return [];

  const result = await db.execute(sql`
    SELECT
      COALESCE(sk.parent_code, sk.code)                        AS "domainCode",
      COALESCE(parent.label, sk.label)                         AS "domainLabel",
      CASE WHEN sk.parent_code IS NULL THEN NULL ELSE sk.code  END AS "skillCode",
      CASE WHEN sk.parent_code IS NULL THEN NULL ELSE sk.label END AS "skillLabel",
      qs.subject                                               AS "subject",
      count(*)::int                                            AS "attempted",
      count(*) FILTER (WHERE ea.is_correct)::int               AS "correct",
      round(100.0 * count(*) FILTER (WHERE ea.is_correct) / count(*))::int AS "accuracy"
      FROM exam_answers ea
      JOIN exams e          ON e.id = ea.exam_id
      JOIN questions q      ON q.id = ea.question_id
      JOIN question_sets qs ON qs.id = q.set_id
      JOIN skills sk        ON sk.code = q.skill_code
      LEFT JOIN skills parent ON parent.code = sk.parent_code
     WHERE e.student_id IN (${studentIdList(studentIds)})
       AND ${VISIBLE_EXAM}
       ${options.subject ? sql`AND qs.subject = ${options.subject}` : sql``}
       ${options.since ? sql`AND e.completed_at >= ${options.since}` : sql``}
       ${options.examId ? sql`AND e.id = ${options.examId}` : sql``}
     GROUP BY 1, 2, 3, 4, 5
     ORDER BY "accuracy" ASC, "attempted" DESC
  `);

  return result.rows as unknown as SkillAccuracyRow[];
}

/** Weakest domains first, with the skills beneath each folded in. */
export async function domainAccuracy(
  studentIds: string[],
  options: { subject?: 'english' | 'math'; since?: Date } = {},
): Promise<
  { domainCode: string; domainLabel: string; subject: 'english' | 'math'; attempted: number; correct: number; accuracy: number }[]
> {
  const rows = await skillAccuracy(studentIds, options);
  const byDomain = new Map<string, { domainCode: string; domainLabel: string; subject: 'english' | 'math'; attempted: number; correct: number }>();

  for (const row of rows) {
    const existing = byDomain.get(row.domainCode) ?? {
      domainCode: row.domainCode, domainLabel: row.domainLabel, subject: row.subject, attempted: 0, correct: 0,
    };
    existing.attempted += row.attempted;
    existing.correct += row.correct;
    byDomain.set(row.domainCode, existing);
  }

  return [...byDomain.values()]
    .map((d) => ({ ...d, accuracy: Math.round((100 * d.correct) / d.attempted) }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

export interface TrendPoint {
  at: string;
  kind: 'mock' | 'practice';
  label: string;
  /** 400-1600 for a mock, null for a practice exam. */
  total: number | null;
  /** 200-800. For a mock these are its two sections; for practice, the one it was. */
  rw: number | null;
  math: number | null;
}

/**
 * Every scored sitting in date order, oldest first.
 *
 * Mocks and single sections share one series because a student's progress is one
 * story — but they stay distinguishable, since a full mock is worth more than a
 * twenty-question practice set and a chart that hid the difference would
 * overstate a good afternoon.
 */
export async function scoreTrend(studentId: string): Promise<TrendPoint[]> {
  const result = await db.execute(sql`
    SELECT mt.completed_at AS at, 'mock' AS kind, 'Full mock' AS label,
           mt.total_score AS total, mt.rw_score AS rw, mt.math_score AS math
      FROM mock_tests mt
     WHERE mt.student_id = ${studentId}
       AND mt.status = 'completed'
       AND mt.total_score IS NOT NULL
    UNION ALL
    SELECT e.completed_at AS at, 'practice' AS kind,
           COALESCE(qs.title, e.label, 'Practice') AS label,
           NULL AS total,
           CASE WHEN subj.subject = 'english' THEN e.scaled_score END AS rw,
           CASE WHEN subj.subject = 'math'    THEN e.scaled_score END AS math
      FROM exams e
      LEFT JOIN question_sets qs ON qs.id = e.set_id
      -- A set-less exam (topic practice, mistake review) has no set to name its
      -- subject, and without one both columns above are NULL and the point
      -- silently drops out of the trend. Its first question's set gives the
      -- subject, the same rule listExamsForStudent uses.
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          qs.subject,
          (SELECT fqs.subject
             FROM exam_answers ea
             JOIN questions q ON q.id = ea.question_id
             JOIN question_sets fqs ON fqs.id = q.set_id
            WHERE ea.exam_id = e.id
            ORDER BY ea.order_index
            LIMIT 1)
        ) AS subject
      ) subj
     WHERE e.student_id = ${studentId}
       AND e.scaled_score IS NOT NULL
       AND ${VISIBLE_EXAM}
       -- A mock's modules are half a section each; the mock row above carries them.
       AND NOT EXISTS (
         SELECT 1 FROM mock_tests m
          WHERE e.id IN (m.english_exam_id, m.english_m2_exam_id, m.math_exam_id, m.math_m2_exam_id)
       )
     ORDER BY at ASC
  `);

  return (result.rows as unknown as (Omit<TrendPoint, 'at'> & { at: Date | string })[]).map((row) => ({
    ...row,
    at: new Date(row.at).toISOString(),
  }));
}

export interface Readiness {
  latestTotal: number | null;
  /** Mean of the last three mock totals — steadier than the single latest. */
  rollingAverage: number | null;
  mocksTaken: number;
  targetScore: number | null;
  /** Positive means still to gain. Null without both a target and a score. */
  gap: number | null;
  testDate: string | null;
  daysToTest: number | null;
  /** How much weight to put on the above. Arithmetic, not a model. */
  confidence: 'none' | 'low' | 'fair';
  /**
   * The one estimated score every surface shows — Dashboard hero, Progress,
   * the teacher's view — so they can never disagree.
   *
   * The latest scored mock when there is one, since only a mock measures both
   * sections under test conditions. Otherwise the latest scaled practice score
   * in each section, with a total only when both exist. Never invented: a
   * section with no scaled score stays null. `source` says which, and the UI
   * must label a practice-based estimate as such.
   */
  estimate: {
    total: number | null;
    rw: number | null;
    math: number | null;
    source: 'mock' | 'practice' | null;
  };
}

/**
 * Where a student stands against their own goal.
 *
 * Deliberately arithmetic: latest score, a rolling average, the gap, the days
 * left. No projection and no predicted score — the data behind one is a handful
 * of mocks per student, and a confident wrong number about someone's university
 * chances is worse than no number.
 */
export async function readiness(studentId: string, trend?: TrendPoint[]): Promise<Readiness> {
  const [profile, mockRows, points] = await Promise.all([
    getProfile(studentId),
    db.execute<{ total: number }>(sql`
      SELECT total_score AS total
        FROM mock_tests
       WHERE student_id = ${studentId}
         AND status = 'completed'
         AND total_score IS NOT NULL
       ORDER BY completed_at DESC
    `),
    trend ?? scoreTrend(studentId),
  ]);

  const totals = (mockRows.rows as { total: number }[]).map((r) => Number(r.total));
  const latestTotal = totals[0] ?? null;
  const recent = totals.slice(0, 3);
  const rollingAverage = recent.length
    ? Math.round(recent.reduce((sum, v) => sum + v, 0) / recent.length)
    : null;

  const estimate = estimateFrom(points);
  const targetScore = profile?.targetScore ?? null;
  const daysToTest = profile?.testDate
    ? Math.round((new Date(`${profile.testDate}T00:00:00`).getTime() - startOfToday()) / 86_400_000)
    : null;

  return {
    latestTotal,
    rollingAverage,
    mocksTaken: totals.length,
    targetScore,
    gap: targetScore !== null && estimate.total !== null ? targetScore - estimate.total : null,
    testDate: profile?.testDate ?? null,
    daysToTest,
    confidence: totals.length === 0 ? 'none' : totals.length < MIN_MOCKS_FOR_CONFIDENCE ? 'low' : 'fair',
    estimate,
  };
}

/** See `Readiness.estimate`. `points` is scoreTrend's output, oldest first. */
function estimateFrom(points: TrendPoint[]): Readiness['estimate'] {
  const newestFirst = [...points].reverse();
  const mock = newestFirst.find((p) => p.kind === 'mock' && p.total !== null);
  if (mock) return { total: mock.total, rw: mock.rw, math: mock.math, source: 'mock' };

  const rw = newestFirst.find((p) => p.kind === 'practice' && p.rw !== null)?.rw ?? null;
  const math = newestFirst.find((p) => p.kind === 'practice' && p.math !== null)?.math ?? null;
  return {
    total: rw !== null && math !== null ? rw + math : null,
    rw,
    math,
    source: rw !== null || math !== null ? 'practice' : null,
  };
}

function startOfToday(): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

/** Everything the progress view needs, in one round trip. */
export async function overview(studentId: string) {
  const trend = await scoreTrend(studentId);
  const [domains, skills, ready] = await Promise.all([
    domainAccuracy([studentId]),
    skillAccuracy([studentId]),
    readiness(studentId, trend),
  ]);

  return { domains, skills, trend, readiness: ready, minAttempts: MIN_ATTEMPTS_FOR_ACCURACY };
}
