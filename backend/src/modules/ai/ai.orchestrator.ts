import { env } from '../../config/env';
import { FixedWindowRateLimiter } from '../../lib/rate-limit';
import { AINotConfiguredError, AIParseError, generateStructuredOutput } from './ai.client';
import {
  buildCommandOfEvidence,
  buildGrammarDiagnosis,
  buildReasoningCheckpoint,
  buildTransitionsCoach,
  buildTrapExplainer,
  buildVocabDrill,
  type Prompt,
} from './ai.prompts';
import type { FeedbackCallResult, FeedbackContext, FeedbackType } from './ai.types';

/**
 * Per-student AI budget. The cost charged is the number of model calls a
 * request is actually about to make, so a confirm answered entirely from cache
 * consumes nothing.
 */
export const aiRateLimiter = new FixedWindowRateLimiter(env.ai.rateLimit.calls, env.ai.rateLimit.windowMs);

const BUILDERS: Record<FeedbackType, (ctx: FeedbackContext) => Prompt> = {
  reasoning_checkpoint: buildReasoningCheckpoint,
  grammar_diagnosis: buildGrammarDiagnosis,
  trap_explainer: buildTrapExplainer,
  command_of_evidence: buildCommandOfEvidence,
  transitions_coach: buildTransitionsCoach,
  vocab_drill: buildVocabDrill,
};

/**
 * Decides which feedback types apply to one answered question.
 *
 * Reasoning checkpoint always runs — it reflects on the student's stated
 * thinking, which is worth doing whether or not they got it right. The
 * diagnostic types only run on wrong answers, since there is no error to
 * explain otherwise. Vocab drill is the exception: reinforcing a word the
 * student just met is useful either way.
 */
export function getApplicableFeedbackTypes(
  ctx: Pick<FeedbackContext, 'subSkill' | 'subject' | 'questionType' | 'isCorrect'>,
): FeedbackType[] {
  const types: FeedbackType[] = ['reasoning_checkpoint'];
  const isEnglish = ctx.subject === 'english';
  const isMultipleChoice = ctx.questionType === 'multiple_choice';
  const wrong = !ctx.isCorrect;

  if (ctx.subSkill === 'grammar' && wrong) types.push('grammar_diagnosis');
  if (isEnglish && isMultipleChoice && wrong) types.push('trap_explainer');
  if (isEnglish && ctx.subSkill === 'command_of_evidence' && isMultipleChoice && wrong) {
    types.push('command_of_evidence');
  }
  if (isEnglish && ctx.subSkill === 'transitions' && wrong) types.push('transitions_coach');
  if (isEnglish && ctx.subSkill === 'vocab_in_context') types.push('vocab_drill');

  return types;
}

/**
 * Runs the given feedback types concurrently.
 *
 * Every call catches its own failure and reports it as a null result, so one
 * type erroring degrades that card to "unavailable" instead of failing the
 * whole request — the student still gets the other four. Cache lookups and
 * writes stay in the caller; this function only talks to the model.
 */
export async function orchestrateConfirmFeedback(
  ctx: FeedbackContext,
  typesToRun: FeedbackType[],
): Promise<FeedbackCallResult[]> {
  return Promise.all(
    typesToRun.map(async (feedbackType): Promise<FeedbackCallResult> => {
      try {
        const { system, user } = BUILDERS[feedbackType](ctx);
        const aiResult = await generateStructuredOutput(system, user, 'feedback');
        return { feedbackType, aiResult, error: null };
      } catch (err) {
        console.error(`[ai] ${feedbackType} failed:`, err);
        if (err instanceof AINotConfiguredError) return { feedbackType, aiResult: null, error: 'not_configured' };
        return {
          feedbackType,
          aiResult: null,
          error: err instanceof AIParseError ? 'parse_failed' : 'call_failed',
        };
      }
    }),
  );
}
