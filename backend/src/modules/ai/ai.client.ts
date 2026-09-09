import OpenAI from 'openai';
import { env } from '../../config/env';
import type { AIResult, ModelPurpose } from './ai.types';

/**
 * The only module that talks to OpenRouter.
 *
 * Routing every model call through here is what makes cost tracking, retries
 * and the "is this feature even configured?" question answerable in one place.
 * Feature code asks for a *purpose* ('feedback', 'narrative', 'classify') and
 * this module resolves it to whatever model that deployment configured.
 */

/** Raised when a model answers with something that is not JSON, twice. */
export class AIParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIParseError';
  }
}

/** Raised when the key or the model for a purpose is not configured. */
export class AINotConfiguredError extends Error {
  constructor(purpose: ModelPurpose) {
    super(`AI purpose "${purpose}" is not configured (needs OPENROUTER_API_KEY and AI_MODEL_${purpose.toUpperCase()})`);
    this.name = 'AINotConfiguredError';
  }
}

// Constructed on first use, not at import: a deployment with AI switched off
// should never need the key to exist.
let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) {
    if (!env.ai.apiKey) throw new Error('OPENROUTER_API_KEY is not set');
    client = new OpenAI({ baseURL: env.ai.baseUrl, apiKey: env.ai.apiKey });
  }
  return client;
}

/** Whether a purpose can run — check before offering the feature to a client. */
export function isConfigured(purpose: ModelPurpose): boolean {
  return env.ai.enabled && Boolean(env.ai.models[purpose]);
}

function resolveModel(purpose: ModelPurpose): string {
  const model = env.ai.models[purpose];
  if (!env.ai.enabled || !model) throw new AINotConfiguredError(purpose);
  return model;
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
}

function tryParseJSON(text: string): unknown | null {
  try {
    return JSON.parse(stripFences(text));
  } catch {
    return null;
  }
}

// `usage: { include: true }` is an OpenRouter extension the SDK's types do not
// model; it is what makes the per-request cost available on the response.
type CompletionBody = OpenAI.ChatCompletionCreateParamsNonStreaming & {
  usage?: { include: boolean };
};

async function createCompletion(body: CompletionBody): Promise<OpenAI.ChatCompletion> {
  return getClient().chat.completions.create({
    ...body,
    usage: { include: true },
  } as OpenAI.ChatCompletionCreateParamsNonStreaming);
}

/**
 * Asks for a JSON object and returns it parsed, with cost and latency attached.
 *
 * Models occasionally wrap JSON in prose or fences. One retry that shows the
 * model its own bad output recovers nearly all of those; a second failure
 * throws rather than persisting something the caller cannot read. The
 * `parseFailed` flag records that the retry was needed, which is how prompt
 * quality gets measured after the fact.
 */
export async function generateStructuredOutput(
  systemPrompt: string,
  userPrompt: string,
  purpose: ModelPurpose,
): Promise<AIResult> {
  const model = resolveModel(purpose);
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const startedAt = Date.now();
  const response = await createCompletion({ model, messages });
  const latencyMs = Date.now() - startedAt;

  const usage = response.usage as (OpenAI.CompletionUsage & { cost?: number | null }) | undefined;
  const rawText = response.choices[0]?.message?.content ?? '';

  const result: Omit<AIResult, 'parsed' | 'parseFailed'> = {
    modelUsed: response.model ?? model,
    latencyMs,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
    costUsd: usage?.cost ?? 0,
  };

  const parsed = tryParseJSON(rawText);
  if (parsed !== null) return { ...result, parsed, parseFailed: false };

  const retry = await createCompletion({
    model,
    messages: [
      ...messages,
      { role: 'assistant', content: rawText },
      { role: 'user', content: 'Your last response was not valid JSON. Return ONLY the JSON object, nothing else.' },
    ],
  });

  const retryParsed = tryParseJSON(retry.choices[0]?.message?.content ?? '');
  if (retryParsed === null) {
    throw new AIParseError('AI response could not be parsed as JSON after retry');
  }
  return { ...result, parsed: retryParsed, parseFailed: true };
}

/**
 * Free-text completion for the tutoring chatbot. The system prompt is supplied
 * fresh on every call so a stored history can never redefine the assistant's
 * instructions.
 */
export async function generateChatResponse(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  purpose: ModelPurpose = 'feedback',
): Promise<{ content: string; modelUsed: string }> {
  const model = resolveModel(purpose);
  const response = await getClient().chat.completions.create({
    model,
    messages: [{ role: 'system', content: systemPrompt }, ...history],
  });
  return {
    content: response.choices[0]?.message?.content?.trim() ?? '',
    modelUsed: response.model ?? model,
  };
}
