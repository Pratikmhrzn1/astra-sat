import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { questionSets, questions } from '../../db/schema';
import { HttpError } from '../../http/errors';
import { generateStructuredOutput, isConfigured } from '../ai';

/**
 * Batch tagging of untagged questions against the SAT skill tree.
 *
 * Tags drive which feedback types fire, which weaknesses get remediation, and
 * every per-skill analytic, so an untagged question is invisible to most of the
 * platform. This backfills them. Everything it writes is marked `ai_suggested`,
 * leaving a teacher's `human_confirmed` tags untouched and making machine
 * guesses reviewable.
 *
 * **Both subjects.** This used to filter `subject = 'english'` at the query
 * level, because the old five-value `sub_skill` enum had no way to express a
 * Math tag — so Math sat permanently at 0% tagged. Math is classified at domain
 * level (the four official domains) rather than to individual skills: the
 * domains are what topic practice and analytics group by, and asking a model to
 * pick between fine-grained Math skills invites confident nonsense.
 */

/** Reading and Writing: the five skills, which are leaves of the tree. */
const ENGLISH_SKILLS = [
  'grammar',
  'inference',
  'command_of_evidence',
  'vocab_in_context',
  'transitions',
] as const;

/** Math: the four official domains, which are top-level nodes. */
const MATH_DOMAINS = [
  'algebra',
  'advanced_math',
  'problem_solving_data_analysis',
  'geometry_trigonometry',
] as const;

const ENGLISH_PROMPT = `You classify SAT Reading and Writing questions by skill. Respond ONLY with a JSON object containing a single "classification" field. No markdown, no explanation, no preamble.

Valid classifications:
- "grammar" — tests mechanics: punctuation, subject-verb agreement, pronoun agreement, parallel structure, verb tense, modifier placement
- "inference" — tests comprehension: main idea, author purpose, tone, conclusions drawn from the passage
- "command_of_evidence" — tests textual support: "which choice best supports", selecting evidence, evaluating claims against the text
- "vocab_in_context" — tests word meaning: "as used in the passage X most nearly means", connotation, nuance
- "transitions" — tests rhetorical choice and flow: transition words (however, therefore), sentence ordering, adding/deleting sentences for cohesion
- "unclear" — genuinely does not fit any single category

Example response: {"classification":"grammar"}`;

const MATH_PROMPT = `You classify SAT Math questions by domain. Respond ONLY with a JSON object containing a single "classification" field. No markdown, no explanation, no preamble.

Valid classifications:
- "algebra" — linear equations and inequalities in one or two variables, systems of linear equations, linear functions
- "advanced_math" — quadratics, polynomials, exponentials, radicals, rational expressions, nonlinear systems, function notation and transformations
- "problem_solving_data_analysis" — ratios, rates, proportions, percentages, units, probability, statistics, reading data from tables and graphs
- "geometry_trigonometry" — lines and angles, triangles, circles, area and volume, right-triangle trigonometry
- "unclear" — genuinely does not fit any single domain

Example response: {"classification":"algebra"}`;

const VALID_CODES: Record<'english' | 'math', readonly string[]> = {
  english: ENGLISH_SKILLS,
  math: MATH_DOMAINS,
};

/** Concurrency per batch, and the pause between batches, to stay under rate limits. */
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 500;

type Classifiable = {
  id: string;
  subject: 'english' | 'math';
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: string | null;
  explanation: string | null;
};

function buildPrompt(question: Classifiable): string {
  const label = question.subject === 'math' ? 'Math' : 'Reading and Writing';
  let prompt = `Classify this SAT ${label} question:\n\nQuestion: ${question.questionText}`;

  if (question.optionA) {
    prompt += `\n\nOptions:\nA) ${question.optionA}\nB) ${question.optionB}\nC) ${question.optionC}\nD) ${question.optionD}`;
    if (question.correctAnswer) prompt += `\n\nCorrect answer: ${question.correctAnswer.toUpperCase()}`;
  }
  // The explanation is often the clearest signal of what a question tests.
  if (question.explanation) prompt += `\n\nExplanation: ${question.explanation}`;

  return prompt;
}

export interface ClassificationRun {
  totalFound: number;
  tagged: number;
  unclear: number;
  errors: number;
}

export async function autoTagSubSkills(): Promise<ClassificationRun> {
  if (!isConfigured('classify')) {
    throw new HttpError(503, 'Classification model not configured (needs OPENROUTER_API_KEY and AI_MODEL_CLASSIFY)');
  }

  // Both subjects. The `subject = 'english'` filter that used to be here is
  // what kept Math permanently untagged.
  const untagged = await db
    .select({
      id: questions.id,
      subject: questionSets.subject,
      questionText: questions.questionText,
      optionA: questions.optionA,
      optionB: questions.optionB,
      optionC: questions.optionC,
      optionD: questions.optionD,
      correctAnswer: questions.correctAnswer,
      explanation: questions.explanation,
    })
    .from(questions)
    .innerJoin(questionSets, eq(questions.setId, questionSets.id))
    // Keyed on skill_code, not sub_skill: a Math question always had a null
    // sub_skill and would have been re-classified on every run forever.
    .where(and(isNull(questions.skillCode), isNull(questions.retiredAt)));

  const run: ClassificationRun = { totalFound: untagged.length, tagged: 0, unclear: 0, errors: 0 };
  console.log(`[auto-tag] ${run.totalFound} untagged questions`);

  for (let offset = 0; offset < untagged.length; offset += BATCH_SIZE) {
    const batch = untagged.slice(offset, offset + BATCH_SIZE);

    // allSettled, not all: one bad question must not abandon the run.
    const results = await Promise.allSettled(batch.map(classifyOne));

    for (const result of results) {
      if (result.status === 'rejected') {
        run.errors++;
        console.error('[auto-tag] Question failed:', result.reason);
      } else if (result.value === 'tagged') {
        run.tagged++;
      } else {
        run.unclear++;
      }
    }

    if (offset + BATCH_SIZE < untagged.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  console.log(`[auto-tag] Done — tagged ${run.tagged}, unclear ${run.unclear}, errors ${run.errors}`);
  return run;
}

/**
 * Anything the model returns that is not a code valid for that subject is left
 * untagged — including a real code from the *other* subject, which is the most
 * likely way a confused answer would slip through.
 */
async function classifyOne(question: Classifiable): Promise<'tagged' | 'unclear'> {
  const prompt = question.subject === 'math' ? MATH_PROMPT : ENGLISH_PROMPT;
  const result = await generateStructuredOutput(prompt, buildPrompt(question), 'classify');
  const classification = (result.parsed as { classification?: unknown })?.classification;

  if (typeof classification !== 'string' || !VALID_CODES[question.subject].includes(classification)) {
    return 'unclear';
  }

  await db
    .update(questions)
    .set({ skillCode: classification, subSkillSource: 'ai_suggested' })
    .where(eq(questions.id, question.id));

  return 'tagged';
}
