import { eq, sql } from 'drizzle-orm';
import { db } from '../../core/db';
import { skillAccuracy } from '../analytics';
import { examAnswers, exams, mockNarratives, questionSets, questions } from '../../core/db/schema';
import { generateStructuredOutput, isConfigured } from '../ai';

/**
 * Post-test diagnostic narratives.
 *
 * These take several seconds to generate, so they never sit on the request
 * path. Submit inserts a `pending` row and responds; this module fills the row
 * in afterwards and the client polls for it. The row is created *before* the
 * response so the UI always has something to poll — a narrative that is missing
 * entirely is indistinguishable from one that failed.
 */

export interface NarrativeExam {
  /** Needed to scope the skill breakdown; every caller passes a full exam row. */
  studentId: string;
  type: string;
  score: number | null;
  totalQuestions: number;
  timeSpentSeconds: number | null;
  /** Null for an exam assembled across sets, such as topic practice. */
  setId: string | null;
}

/** Narratives are optional: with no model configured, none are ever created. */
export function narrativesEnabled(): boolean {
  return isConfigured('narrative');
}

export async function createPendingNarrative(examId: string): Promise<string | null> {
  if (!narrativesEnabled()) return null;
  const [row] = await db.insert(mockNarratives).values({ examId }).returning({ id: mockNarratives.id });
  return row.id;
}

/** Resets an existing narrative to `pending`, or creates one. Used by retry. */
export async function resetNarrative(examId: string): Promise<string> {
  const [existing] = await db
    .select({ id: mockNarratives.id })
    .from(mockNarratives)
    .where(eq(mockNarratives.examId, examId))
    .limit(1);

  if (!existing) {
    const [row] = await db.insert(mockNarratives).values({ examId }).returning({ id: mockNarratives.id });
    return row.id;
  }

  await db
    .update(mockNarratives)
    .set({ status: 'pending', content: {}, modelUsed: '', latencyMs: null, costUsd: null })
    .where(eq(mockNarratives.id, existing.id));
  return existing.id;
}

export async function findNarrative(examId: string) {
  const [row] = await db.select().from(mockNarratives).where(eq(mockNarratives.examId, examId)).limit(1);
  return row ?? null;
}

/**
 * Per-skill right/wrong counts for one exam — the substance the model reasons over.
 *
 * Delegates to `modules/analytics` rather than running its own query, so the
 * narrative and the progress view can never disagree about how well a student
 * did in a domain. It also inherits the analytics rules for free: tagged
 * questions only, and released exams only.
 */
async function loadSubSkillBreakdown(examId: string, studentId: string) {
  const rows = await skillAccuracy([studentId], { examId });

  return rows.map((row) => ({
    // The key stays `subSkill`: it is the name the prompt below and the model's
    // JSON response contract both use. The value is a skill label.
    subSkill: row.skillLabel ?? row.domainLabel,
    total: row.attempted,
    wrong: row.attempted - row.correct,
    // Three misses in one skill is the point where it reads as a pattern
    // rather than noise — the same threshold that triggers skill passages.
    flag: row.attempted - row.correct >= 3,
  }));
}

async function resolveSectionLabel(exam: NarrativeExam): Promise<string> {
  if (exam.type === 'mock_english') return 'English (Reading & Writing)';
  if (exam.type === 'mock_math') return 'Math';

  // An exam drawn from across sets has no single subject to look up; the
  // generic label is correct for it.
  if (!exam.setId) return 'Practice';

  const [set] = await db
    .select({ subject: questionSets.subject })
    .from(questionSets)
    .where(eq(questionSets.id, exam.setId))
    .limit(1);
  return set?.subject === 'math' ? 'Math' : 'English (Reading & Writing)';
}

/**
 * Generates the narrative and writes it to its row. Never throws: it runs
 * detached from any request, so a failure is recorded as `failed` status —
 * which is what the retry endpoint looks for — and logged.
 */
export async function generateNarrative(
  examId: string,
  narrativeId: string,
  exam: NarrativeExam,
): Promise<void> {
  try {
    const breakdown = await loadSubSkillBreakdown(examId, exam.studentId);
    const section = await resolveSectionLabel(exam);

    const correct = exam.score ?? 0;
    const wrong = exam.totalQuestions - correct;
    const minutes = exam.timeSpentSeconds ? Math.round(exam.timeSpentSeconds / 60) : null;

    const systemPrompt = `You are a candid SAT diagnostic coach. A student just completed a ${section} section mock test. Analyze their performance data and return a JSON diagnostic.

Return ONLY valid JSON, no markdown:
{
  "scoreRange": "<estimated range e.g. '620–660', or null if you cannot reliably estimate>",
  "primaryGap": "<the single subSkill with the most missed questions>",
  "narrative": "<3–4 sentences. Lead with the honest pattern — no opening compliment. Cite actual numbers from the test (e.g. 'you missed 5 of 8 inference questions'). End with one specific, actionable next step.>",
  "subSkillBreakdown": [{ "subSkill": "...", "wrong": <n>, "total": <n>, "flag": <boolean> }]
}

scoreRange: base on actual wrong-per-subSkill ratios. Set to null if your estimate would be unreliable — a wrong number is worse than no number.
narrative: plain language, no encouragement filler, reference exact numbers, one concrete next step at the end.
subSkillBreakdown: include every subSkill that appeared; flag = true when wrong >= 3.`;

    const userPrompt = `Section: ${section}
Score: ${correct} correct, ${wrong} wrong of ${exam.totalQuestions} total${minutes !== null ? `\nTime: ${minutes} minutes` : ''}

SubSkill breakdown:
${breakdown.map((b) => `- ${b.subSkill}: ${b.wrong} wrong of ${b.total}${b.flag ? ' [PATTERN]' : ''}`).join('\n')}`;

    const result = await generateStructuredOutput(systemPrompt, userPrompt, 'narrative');

    await db
      .update(mockNarratives)
      .set({
        content: result.parsed as Record<string, unknown>,
        modelUsed: result.modelUsed,
        latencyMs: result.latencyMs,
        costUsd: String(result.costUsd),
        status: 'complete',
      })
      .where(eq(mockNarratives.id, narrativeId));
  } catch (err) {
    console.error(`[narrative] Generation failed for exam ${examId}:`, err);
    await db
      .update(mockNarratives)
      .set({ status: 'failed' })
      .where(eq(mockNarratives.id, narrativeId))
      .catch((updateErr) => console.error('[narrative] Could not mark failed:', updateErr));
  }
}

/** Fire-and-forget wrapper — the caller has already responded to the student. */
export function generateNarrativeInBackground(examId: string, narrativeId: string, exam: NarrativeExam): void {
  void generateNarrative(examId, narrativeId, exam).catch((err) =>
    console.error('[narrative] Unhandled background error:', err),
  );
}

/** Re-reads the exam a narrative belongs to, for the retry path. */
export async function findExamForNarrative(examId: string): Promise<NarrativeExam | null> {
  const [exam] = await db
    .select({
      studentId: exams.studentId,
      type: exams.type,
      score: exams.score,
      totalQuestions: exams.totalQuestions,
      timeSpentSeconds: exams.timeSpentSeconds,
      setId: exams.setId,
    })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);
  return exam ?? null;
}
