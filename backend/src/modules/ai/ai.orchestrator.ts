import { env } from '../../core/config/env';
import { FixedWindowRateLimiter } from '../../core/lib/rate-limit';
import { ModelNotConfiguredError, ModelParseError, requestStructuredOutput } from './ai.client';
import {
  composeCommandOfEvidence,
  composeGrammarDiagnosis,
  composeReasoningCheckpoint,
  composeTransitionsCoach,
  composeTrapExplainer,
  composeVocabDrill,
  type PromptSpec,
} from './ai.prompts';
import type { FeedbackOutcome, FeedbackInput, FeedbackKind } from './ai.types';

/**
 * Per-student AI budget. The cost charged is the number of model calls a
 * request is actually about to make, so a confirm answered entirely from cache
 * consumes nothing.
 */
export const tutorBudget = new FixedWindowRateLimiter(env.ai.rateLimit.calls, env.ai.rateLimit.windowMs);

const BUILDERS: Record<FeedbackKind, (ctx: FeedbackInput) => PromptSpec> = {
  reasoning_checkpoint: composeReasoningCheckpoint,
  grammar_diagnosis: composeGrammarDiagnosis,
  trap_explainer: composeTrapExplainer,
  command_of_evidence: composeCommandOfEvidence,
  transitions_coach: composeTransitionsCoach,
  vocab_drill: composeVocabDrill,
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
export function selectFeedbackKinds(
  ctx: Pick<FeedbackInput, 'skillCode' | 'subject' | 'questionType' | 'isCorrect'>,
): FeedbackKind[] {
  const types: FeedbackKind[] = ['reasoning_checkpoint'];
  const isEnglish = ctx.subject === 'english';
  const isMultipleChoice = ctx.questionType === 'multiple_choice';
  const wrong = !ctx.isCorrect;

  if (ctx.skillCode === 'grammar' && wrong) types.push('grammar_diagnosis');
  if (isEnglish && isMultipleChoice && wrong) types.push('trap_explainer');
  if (isEnglish && ctx.skillCode === 'command_of_evidence' && isMultipleChoice && wrong) {
    types.push('command_of_evidence');
  }
  if (isEnglish && ctx.skillCode === 'transitions' && wrong) types.push('transitions_coach');
  if (isEnglish && ctx.skillCode === 'vocab_in_context') types.push('vocab_drill');

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
export async function runConfirmFeedback(
  ctx: FeedbackInput,
  typesToRun: FeedbackKind[],
): Promise<FeedbackOutcome[]> {
  return Promise.all(
    typesToRun.map(async (feedbackType): Promise<FeedbackOutcome> => {
      try {
        const { system, user } = BUILDERS[feedbackType](ctx);
        const aiResult = await requestStructuredOutput(system, user, 'feedback');
        return { feedbackType, aiResult, error: null };
      } catch (err) {
        console.error(`[ai] ${feedbackType} failed:`, err);
        if (err instanceof ModelNotConfiguredError) return { feedbackType, aiResult: null, error: 'not_configured' };
        return {
          feedbackType,
          aiResult: null,
          error: err instanceof ModelParseError ? 'parse_failed' : 'call_failed',
        };
      }
    }),
  );
}
