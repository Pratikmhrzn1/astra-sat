import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { questionSets, questions, skills } from '../../db/schema';

/**
 * The SAT domain/skill tree, and how many questions sit under each node.
 *
 * This is the taxonomy every other feature tags against. It replaced the
 * `sub_skill` enum, which had five values and covered only Reading and Writing —
 * Math questions could not be tagged at all, which left half the corpus
 * invisible to analytics, topic practice and the AI narrative.
 *
 * A reference table rather than a wider enum because `migrate.ts` runs on every
 * boot, and `ALTER TYPE ... ADD VALUE` cannot be used in the same transaction
 * that then references the new value.
 *
 * Five of the codes here — grammar, inference, command_of_evidence,
 * vocab_in_context, transitions — are deliberately spelled exactly as the old
 * enum values, and the migration backfills `skill_code` from `sub_skill`. That
 * is what let every reader move across without translating any values.
 */

export interface SkillNode {
  code: string;
  label: string;
  subject: 'english' | 'math';
  /** Questions tagged with this exact code. Only present when counts are asked for. */
  questionCount?: number;
  /** Questions tagged with this domain or any skill beneath it. */
  totalQuestionCount?: number;
  skills: SkillNode[];
}

/**
 * Domains, each with its skills beneath it.
 *
 * With `withCounts`, every node also carries how many published questions are
 * available under it — what topic practice needs to grey out a topic nobody has
 * written questions for yet, rather than offering it and failing at assembly.
 */
export async function getSkillTree(withCounts = false): Promise<SkillNode[]> {
  // Subject first so consumers can slice the list into an English group and a
  // Math group without re-sorting; sortOrder is only unique within a subject.
  const rows = await db
    .select()
    .from(skills)
    .orderBy(skills.subject, skills.sortOrder, skills.code);
  const counts = withCounts ? await countPublishedBySkill() : null;

  const domains = rows.filter((row) => row.parentCode === null);

  return domains.map((domain) => {
    const children = rows
      .filter((row) => row.parentCode === domain.code)
      .map((row) => node(row, counts));

    const self = node(domain, counts);
    const total =
      counts === null
        ? undefined
        : (self.questionCount ?? 0) +
          children.reduce((sum, child) => sum + (child.questionCount ?? 0), 0);

    return { ...self, totalQuestionCount: total, skills: children };
  });
}

function node(
  row: typeof skills.$inferSelect,
  counts: Map<string, number> | null,
): SkillNode {
  return {
    code: row.code,
    label: row.label,
    subject: row.subject,
    ...(counts === null
      ? {}
      : { questionCount: counts.get(row.code) ?? 0, totalQuestionCount: counts.get(row.code) ?? 0 }),
    skills: [],
  };
}

/**
 * Questions a student could actually be served, per skill code.
 *
 * Drafts, live-exam sets and retired questions are excluded for the same reason
 * the practice assemblers exclude them: a count that includes questions nobody
 * can be given is worse than no count, because the UI would offer the topic and
 * then fail to build an exam from it.
 */
async function countPublishedBySkill(): Promise<Map<string, number>> {
  const rows = await db
    .select({ skillCode: questions.skillCode, count: sql<number>`count(*)::int` })
    .from(questions)
    .innerJoin(questionSets, eq(questions.setId, questionSets.id))
    .where(
      and(
        eq(questionSets.isDraft, false),
        eq(questionSets.isLiveExam, false),
        isNull(questionSets.archivedAt),
        isNull(questions.retiredAt),
      ),
    )
    .groupBy(questions.skillCode);

  return new Map(
    rows.flatMap(({ skillCode, count }) => (skillCode ? [[skillCode, count] as const] : [])),
  );
}

/** Every valid code, for validating a tag before it is written. */
export async function listSkillCodes(): Promise<Set<string>> {
  const rows = await db.select({ code: skills.code }).from(skills);
  return new Set(rows.map((row) => row.code));
}

/**
 * How much of the corpus is tagged, per subject.
 *
 * Every analytic surface is only as good as this number, so it belongs on the
 * admin dashboard rather than in someone's head. Math sat at 0% for as long as
 * it was untaggable.
 */
export async function getTaggingCoverage(): Promise<
  { subject: 'english' | 'math'; tagged: number; total: number; percentage: number }[]
> {
  const rows = await db
    .select({
      subject: questionSets.subject,
      total: sql<number>`count(*)::int`,
      tagged: sql<number>`count(${questions.skillCode})::int`,
    })
    .from(questions)
    .innerJoin(questionSets, eq(questions.setId, questionSets.id))
    .where(and(eq(questionSets.isDraft, false), isNull(questions.retiredAt)))
    .groupBy(questionSets.subject);

  const bySubject = new Map(rows.map((row) => [row.subject, row]));

  // Both subjects always appear, so a subject with no questions at all reads as
  // 0 of 0 rather than vanishing from the dashboard.
  return (['english', 'math'] as const).map((subject) => {
    const row = bySubject.get(subject);
    const total = row?.total ?? 0;
    const tagged = row?.tagged ?? 0;
    return {
      subject,
      tagged,
      total,
      percentage: total === 0 ? 0 : Math.round((tagged / total) * 100),
    };
  });
}
