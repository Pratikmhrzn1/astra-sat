import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { db } from '../../db';
import { examAnswers, exams, generatedContent, questions, studentSkillTriggers } from '../../db/schema';
import { generateStructuredOutput, isConfigured } from '../ai';

/**
 * Targeted practice for a skill a student keeps missing.
 *
 * Every third wrong answer in the same skill generates a fresh passage and two
 * questions aimed at it. The content lands as `pending` and is invisible to
 * students until an admin approves it — nothing a model writes reaches a student
 * unreviewed.
 */

/**
 * The skills this feature can actually remediate.
 *
 * It generates a *reading passage* with questions under it, so it only makes
 * sense for Reading and Writing. Now that questions carry skill codes across
 * both subjects, a missed Algebra question reaches the trigger path too, and
 * without this gate it would have asked the model for a reading passage about
 * algebra. Widening this list means writing prompts that suit the skill, not
 * just adding a code.
 */
const REMEDIABLE_SKILLS = [
  'grammar',
  'inference',
  'command_of_evidence',
  'vocab_in_context',
  'transitions',
] as const;

type SubSkill = (typeof REMEDIABLE_SKILLS)[number];

function isRemediable(skillCode: string): skillCode is SubSkill {
  return (REMEDIABLE_SKILLS as readonly string[]).includes(skillCode);
}

/** A miss every third time is a pattern; reacting sooner just adds noise. */
const TRIGGER_EVERY = 3;

/**
 * Counts this student's lifetime wrong answers for one sub-skill.
 *
 * Scoped to practice exams: mock and live attempts are assessments, and letting
 * them feed the counter would generate remediation from a timed test the
 * student had no chance to review.
 */
async function countWrongAnswers(studentId: string, subSkill: SubSkill): Promise<number> {
  const [{ wrongCount }] = await db
    .select({ wrongCount: sql<number>`count(*)::int` })
    .from(examAnswers)
    .innerJoin(exams, eq(examAnswers.examId, exams.id))
    .innerJoin(questions, eq(examAnswers.questionId, questions.id))
    .where(
      and(
        eq(exams.studentId, studentId),
        eq(exams.type, 'individual'),
        eq(questions.skillCode, subSkill),
        eq(examAnswers.isCorrect, false),
      ),
    );
  return wrongCount;
}

/**
 * Claims a threshold for exactly one caller.
 *
 * Two confirms finishing at once would both see the same wrong-count and both
 * generate. The upsert only advances `trigger_count` when the incoming value is
 * higher, so the loser updates no rows and returns false — the claim is decided
 * by Postgres rather than by request timing.
 */
async function claimTrigger(studentId: string, subSkill: string, triggerCount: number): Promise<boolean> {
  const claimed = await db.execute(
    sql`INSERT INTO student_skill_triggers (student_id, sub_skill, trigger_count, last_triggered_at)
        VALUES (${studentId}, ${subSkill}, ${triggerCount}, now())
        ON CONFLICT (student_id, sub_skill)
        DO UPDATE SET
          trigger_count = EXCLUDED.trigger_count,
          last_triggered_at = now()
        WHERE student_skill_triggers.trigger_count < EXCLUDED.trigger_count
        RETURNING id`,
  );
  return claimed.rows.length > 0;
}

/** A couple of the student's other misses, as style reference for the prompt. */
async function findRecentWrongQuestionTexts(
  studentId: string,
  subSkill: SubSkill,
  excludeQuestionId: string,
): Promise<string[]> {
  const rows = await db
    .select({ questionText: questions.questionText })
    .from(examAnswers)
    .innerJoin(exams, eq(examAnswers.examId, exams.id))
    .innerJoin(questions, eq(examAnswers.questionId, questions.id))
    .where(
      and(
        eq(exams.studentId, studentId),
        eq(exams.type, 'individual'),
        eq(questions.skillCode, subSkill),
        eq(examAnswers.isCorrect, false),
        ne(questions.id, excludeQuestionId),
      ),
    )
    .orderBy(desc(examAnswers.answeredAt))
    .limit(2);
  return rows.map((row) => row.questionText);
}

async function generateSkillPassage(
  studentId: string,
  subSkill: string,
  exampleQuestions: string[],
  sourceQuestionId: string,
): Promise<void> {
  try {
    const label = subSkill.replace(/_/g, ' ');
    const examples = exampleQuestions
      .slice(0, 3)
      .map((text, i) => `Example ${i + 1}: "${text}"`)
      .join('\n');

    const systemPrompt = `You are generating a Digital SAT practice passage and questions for a student who struggles with ${label} questions.

Return ONLY valid JSON, no markdown fences:
{
  "passage": {
    "title": "short descriptive title",
    "text": "150-250 words, wholly original prose — fiction, essay, or analytical writing on any topic",
    "topic": "e.g. ecology, history, literary criticism"
  },
  "questions": [
    {
      "questionText": "full question text",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correctAnswer": "A",
      "explanation": "1-2 sentences explaining why the correct answer is right",
      "subSkill": "${subSkill}"
    }
  ],
  "generationMeta": {
    "targetSubSkill": "${subSkill}",
    "difficultyLevel": "module_2"
  }
}

Rules:
- passage.text must be 150-250 words — count carefully.
- Generate EXACTLY 2 questions in the questions array — no more, no less.
- questions[n].subSkill must be exactly "${subSkill}".
- DO NOT reference or mimic College Board passages. DO NOT copy academic paper abstracts verbatim. The passage must be fictional or clearly original creative/analytical writing.
- correctAnswer must be exactly "A", "B", "C", or "D".
- Target difficulty: Digital SAT module 2 (harder questions, subtler distractors).`;

    const userPrompt = `SubSkill to target: ${label}

Example questions this student got wrong (style reference only — do not copy or echo these questions):
${examples}

Generate a wholly original passage and exactly 2 questions testing ${label}.`;

    const result = await generateStructuredOutput(systemPrompt, userPrompt, 'narrative');

    await db.insert(generatedContent).values({
      contentType: 'skill_passage',
      sourceQuestionId,
      studentId,
      content: result.parsed as Record<string, unknown>,
      // Human review is mandatory — see the admin approval flow.
      qualityFlag: 'pending',
    });
  } catch (err) {
    console.error(`[skill-passage] Generation failed for ${subSkill}:`, err);
  }
}

/**
 * Called after a wrong practice answer, once the response has already been sent.
 * Decides whether this miss crosses a threshold and, if it claims one, kicks off
 * generation.
 */
export async function checkAndTriggerSkillPassage(
  studentId: string,
  subSkill: string,
  currentQuestionText: string,
  currentQuestionId: string,
): Promise<void> {
  if (!isConfigured('narrative')) return;
  if (!isRemediable(subSkill)) return;

  const wrongCount = await countWrongAnswers(studentId, subSkill);
  if (wrongCount === 0 || wrongCount % TRIGGER_EVERY !== 0) return;

  const claimed = await claimTrigger(studentId, subSkill, wrongCount / TRIGGER_EVERY);
  if (!claimed) return;

  const examples = [
    currentQuestionText,
    ...(await findRecentWrongQuestionTexts(studentId, subSkill, currentQuestionId)),
  ];

  void generateSkillPassage(studentId, subSkill, examples, currentQuestionId).catch((err) =>
    console.error('[skill-passage] Background generation failed:', err),
  );
}

/**
 * Approved skill passages this student can actually take.
 *
 * Filtered to sub-skills the student has personally triggered and to content
 * generated for them, so one student's remediation never surfaces in another's
 * dashboard. One entry per sub-skill — the first approved passage wins.
 */
export async function findAvailableSkillPassages(studentId: string) {
  const triggers = await db
    .select({ subSkill: studentSkillTriggers.subSkill })
    .from(studentSkillTriggers)
    .where(eq(studentSkillTriggers.studentId, studentId));

  if (triggers.length === 0) return [];
  const triggered = new Set(triggers.map((t) => t.subSkill));

  const approved = await db
    .select({
      id: generatedContent.id,
      content: generatedContent.content,
      liveSetId: generatedContent.liveSetId,
    })
    .from(generatedContent)
    .where(
      and(
        eq(generatedContent.contentType, 'skill_passage'),
        eq(generatedContent.qualityFlag, 'approved'),
        eq(generatedContent.studentId, studentId),
        sql`${generatedContent.liveSetId} IS NOT NULL`,
      ),
    );

  const seen = new Set<string>();
  const available: { subSkill: string; setId: string; generatedContentId: string }[] = [];

  for (const row of approved) {
    const meta = row.content as { generationMeta?: { targetSubSkill?: string } };
    const subSkill = meta?.generationMeta?.targetSubSkill;
    if (!subSkill || !triggered.has(subSkill) || seen.has(subSkill)) continue;
    seen.add(subSkill);
    available.push({ subSkill, setId: row.liveSetId!, generatedContentId: row.id });
  }

  return available;
}
