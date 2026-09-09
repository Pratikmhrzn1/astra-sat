import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../db';
import { questionSets, questions } from '../../db/schema';
import { HttpError } from '../../http/errors';
import { generateStructuredOutput, isConfigured } from '../ai';
import { SUB_SKILLS } from '../teacher/teacher.schemas';

/**
 * Batch tagging of English questions by sub-skill.
 *
 * Sub-skill tags drive which feedback types fire and which weaknesses get
 * remediation, so untagged questions are invisible to most of the AI features.
 * This backfills them. Everything it writes is marked `ai_suggested`, leaving a
 * teacher's `human_confirmed` tags untouched and making machine guesses
 * reviewable.
 */

const CLASSIFY_SYSTEM_PROMPT = `You classify SAT Reading and Writing questions by sub-skill. Respond ONLY with a JSON object containing a single "classification" field. No markdown, no explanation, no preamble.

Valid classifications:
- "grammar" — tests mechanics: punctuation, subject-verb agreement, pronoun agreement, parallel structure, verb tense, modifier placement
- "inference" — tests comprehension: main idea, author purpose, tone, conclusions drawn from the passage
- "command_of_evidence" — tests textual support: "which choice best supports", selecting evidence, evaluating claims against the text
- "vocab_in_context" — tests word meaning: "as used in the passage X most nearly means", connotation, nuance
- "transitions" — tests rhetorical choice and flow: transition words (however, therefore), sentence ordering, adding/deleting sentences for cohesion
- "unclear" — genuinely does not fit any single category

Example response: {"classification":"grammar"}`;

/** Concurrency per batch, and the pause between batches, to stay under rate limits. */
const BATCH_SIZE = 20;
const BATCH_DELAY_MS = 500;

type Classifiable = {
  id: string;
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: string | null;
  explanation: string | null;
};

function buildPrompt(question: Classifiable): string {
  let prompt = `Classify this SAT Reading and Writing question:\n\nQuestion: ${question.questionText}`;

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

  // English only: the sub-skill taxonomy describes Reading and Writing.
  const untagged = await db
    .select({
      id: questions.id,
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
    .where(and(eq(questionSets.subject, 'english'), isNull(questions.subSkill)));

  const run: ClassificationRun = { totalFound: untagged.length, tagged: 0, unclear: 0, errors: 0 };
  console.log(`[auto-tag] ${run.totalFound} untagged English questions`);

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

/** Anything the model returns that is not a known sub-skill is left untagged. */
async function classifyOne(question: Classifiable): Promise<'tagged' | 'unclear'> {
  const result = await generateStructuredOutput(CLASSIFY_SYSTEM_PROMPT, buildPrompt(question), 'classify');
  const classification = (result.parsed as { classification?: unknown })?.classification;

  if (typeof classification !== 'string' || !(SUB_SKILLS as readonly string[]).includes(classification)) {
    return 'unclear';
  }

  await db
    .update(questions)
    .set({
      subSkill: classification as (typeof SUB_SKILLS)[number],
      subSkillSource: 'ai_suggested',
    })
    .where(eq(questions.id, question.id));

  return 'tagged';
}
