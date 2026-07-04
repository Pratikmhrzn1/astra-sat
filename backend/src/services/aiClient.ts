import OpenAI from 'openai';

// Single AI client configured for OpenRouter (OpenAI-compatible).
// All AI feature code must call generateStructuredFeedback — never call OpenRouter directly.
const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY ?? '',
});

export class AIParseError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'AIParseError';
  }
}

export interface AIFeedbackResult {
  parsed: unknown;
  modelUsed: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  parseFailed: boolean;
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

/**
 * Low-level call wrapper. modelEnvKey is an env var name whose value is the
 * actual model string (e.g. "AI_MODEL_FEEDBACK" → "anthropic/claude-haiku-4.5").
 * Handles retry, cost tracking, and throws AIParseError on double failure.
 * Never call OpenRouter from feature code — always go through this function.
 */
export async function generateStructuredFeedback(
  systemPrompt: string,
  userPrompt: string,
  modelEnvKey: string,
): Promise<AIFeedbackResult> {
  const model = process.env[modelEnvKey];
  if (!model) throw new Error(`Missing env var: ${modelEnvKey}`);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  const start = Date.now();

  // Pass usage: { include: true } so OpenRouter returns per-request cost.
  const firstResponse = await (client.chat.completions.create as (
    body: object,
  ) => Promise<OpenAI.ChatCompletion>)({ model, messages, usage: { include: true } });

  const latencyMs = Date.now() - start;
  const usage = firstResponse.usage as (OpenAI.CompletionUsage & { cost?: number | null }) | undefined;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const costUsd = usage?.cost ?? 0;
  const modelUsed = firstResponse.model ?? model;
  const rawText = firstResponse.choices[0]?.message?.content ?? '';

  let parsed = tryParseJSON(rawText);
  let parseFailed = false;

  if (parsed === null) {
    parseFailed = true;
    const retryMessages: OpenAI.ChatCompletionMessageParam[] = [
      ...messages,
      { role: 'assistant', content: rawText },
      {
        role: 'user',
        content: 'Your last response was not valid JSON. Return ONLY the JSON object, nothing else.',
      },
    ];
    const retryResponse = await (client.chat.completions.create as (
      body: object,
    ) => Promise<OpenAI.ChatCompletion>)({ model, messages: retryMessages, usage: { include: true } });
    const retryText = retryResponse.choices[0]?.message?.content ?? '';
    parsed = tryParseJSON(retryText);
    if (parsed === null) {
      throw new AIParseError('AI response could not be parsed as JSON after retry');
    }
  }

  return { parsed, modelUsed, latencyMs, promptTokens, completionTokens, costUsd, parseFailed };
}

// ── Confirm-step feedback orchestration ───────────────────────────────────────
// Each feedbackType gets its own isolated prompt — minimum context for the job.
// All applicable types fire in parallel via Promise.all; each catches its own
// errors so one failure never blocks the others.

export type FeedbackType = 'reasoning_checkpoint' | 'grammar_diagnosis' | 'trap_explainer' | 'command_of_evidence' | 'transitions_coach' | 'vocab_drill';

export interface FeedbackContext {
  questionText: string;
  questionType: 'multiple_choice' | 'student_produced_response';
  subSkill: string | null;
  subject: 'english' | 'math';
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: string | null;
  correctAnswerText: string | null;
  selectedAnswer: string | null;
  selectedAnswerText: string | null;
  isCorrect: boolean;
  confidence: string;
  reasoning: string | null;
  passageText: string | null;
}

export interface FeedbackCallResult {
  feedbackType: FeedbackType;
  aiResult: AIFeedbackResult | null;
  error: string | null;
}

/** Determines which feedbackTypes apply for a given answer context. */
export function getApplicableFeedbackTypes(
  ctx: Pick<FeedbackContext, 'subSkill' | 'subject' | 'questionType' | 'isCorrect'>,
): FeedbackType[] {
  const types: FeedbackType[] = ['reasoning_checkpoint'];
  if (ctx.subSkill === 'grammar' && !ctx.isCorrect) types.push('grammar_diagnosis');
  if (ctx.subject === 'english' && ctx.questionType === 'multiple_choice' && !ctx.isCorrect) types.push('trap_explainer');
  if (ctx.subject === 'english' && ctx.subSkill === 'command_of_evidence' && ctx.questionType === 'multiple_choice' && !ctx.isCorrect) types.push('command_of_evidence');
  if (ctx.subject === 'english' && ctx.subSkill === 'transitions' && !ctx.isCorrect) types.push('transitions_coach');
  // vocab_drill fires regardless of correctness — reinforcement is useful either way
  if (ctx.subject === 'english' && ctx.subSkill === 'vocab_in_context') types.push('vocab_drill');
  return types;
}

// ── Vocab helpers (also used by the confirm route for passageExcerpt extraction) ──

/** Extracts the quoted/italicised vocab word from a SAT vocab question stem. */
export function extractVocabWord(questionText: string): string {
  const m = questionText.match(/[""''"']([^""''"']{1,40})[""''"']/);
  return m?.[1] ?? '';
}

/** Returns the single sentence from text that contains the given word. */
export function extractSentenceWithWord(text: string, word: string): string {
  if (!word || !text) return text?.substring(0, 300) ?? '';
  const sentences = text.split(/(?<=[.!?])\s+/);
  const lower = word.toLowerCase();
  return sentences.find((s) => s.toLowerCase().includes(lower))?.trim() ?? text.substring(0, 300);
}

// ── Prompt builders (module-private, one per type) ────────────────────────────

const CONFIDENCE_LABELS: Record<string, string> = {
  sure: 'I was sure',
  eliminated: 'Eliminated the wrong ones',
  guessed: 'Guessed',
};

function buildReasoningCheckpointPrompts(ctx: FeedbackContext): { system: string; user: string } {
  const system = `You are an expert SAT tutor. A student just confirmed their answer in a practice session.

Classify the quality of their reasoning and explain briefly.

Return ONLY valid JSON, no markdown, no text outside the JSON:
{"classification":"<value>","explanation":"<1-2 sentences>"}

Valid classification values:
- "correct_logic_correct_answer": Correct answer and reasoning shows real understanding
- "correct_logic_wrong_answer": Sound reasoning but wrong answer — likely a misread or careless error, not a comprehension gap
- "wrong_logic_correct_answer": Correct answer but weak or guessed reasoning — lucky or surface-level matching
- "wrong_logic_wrong_answer": Wrong answer and reasoning reveals a real comprehension or skill gap

Write the explanation directly to the student ("you") in 1-2 plain sentences. Be specific to the reasoning they gave.`;

  const optMap: Record<string, string | null> = { a: ctx.optionA, b: ctx.optionB, c: ctx.optionC, d: ctx.optionD };
  const answerDisplay =
    ctx.questionType === 'student_produced_response'
      ? `Correct answer: ${ctx.correctAnswerText ?? 'N/A'}\nStudent's answer: ${ctx.selectedAnswerText || 'Not answered'}`
      : `Answer choices:\nA) ${ctx.optionA}\nB) ${ctx.optionB}\nC) ${ctx.optionC}\nD) ${ctx.optionD}\n\nCorrect answer: ${ctx.correctAnswer?.toUpperCase()} — ${optMap[ctx.correctAnswer ?? ''] ?? ''}\nStudent's answer: ${ctx.selectedAnswer ? `${ctx.selectedAnswer.toUpperCase()} — ${optMap[ctx.selectedAnswer] ?? ''}` : 'Not answered'}`;

  const user = `Question: ${ctx.questionText}

${answerDisplay}

Outcome: ${ctx.isCorrect ? 'CORRECT' : 'WRONG'}
Confidence: ${CONFIDENCE_LABELS[ctx.confidence] ?? ctx.confidence}
Reasoning: ${ctx.reasoning?.trim() || 'Not provided'}`;

  return { system, user };
}

function buildGrammarDiagnosisPrompts(ctx: FeedbackContext): { system: string; user: string } {
  // Minimal context: only the question sentence and correct vs. selected answer.
  // No options list, no passage, no chip/reasoning — none of that affects grammar rule ID.
  const system = `You are an SAT grammar expert. A student answered a grammar question incorrectly. Identify the specific grammar rule being tested and state the correction in one sentence.

Return ONLY valid JSON, no markdown:
{"grammarRule":"<rule name>","grammarFix":"<one sentence>"}

grammarRule examples: "subject-verb agreement", "dangling modifier", "comma splice", "faulty parallelism", "pronoun-antecedent agreement", "misplaced modifier", "verb tense consistency", "semicolon usage", "parallel structure"`;

  const answerLine =
    ctx.questionType === 'student_produced_response'
      ? `Student's answer: ${ctx.selectedAnswerText || 'Not answered'}\nCorrect answer: ${ctx.correctAnswerText ?? 'N/A'}`
      : `Student's answer: ${ctx.selectedAnswer?.toUpperCase() ?? 'Not answered'}\nCorrect answer: ${ctx.correctAnswer?.toUpperCase() ?? 'N/A'}`;

  const user = `Question: ${ctx.questionText}

${answerLine}`;

  return { system, user };
}

// Passage excerpt helper — only for trap_explainer.
// If the passage is long and the question contains a paragraph reference, extract
// the relevant paragraph(s) ± context. Otherwise pass the full passage.
// (Line numbers in question text can't reliably map to stored plain text, so only
// paragraph references are extracted; everything else falls back to full passage.)
function getPassageForTrap(passageText: string, questionText: string): string {
  const wordCount = passageText.split(/\s+/).length;
  if (wordCount <= 300) return passageText;

  const paraMatch = questionText.match(/paragraph\s+(\d+)/i);
  if (paraMatch) {
    const paraNum = parseInt(paraMatch[1]);
    const paragraphs = passageText.split(/\n\s*\n/);
    const from = Math.max(0, paraNum - 2);
    const to = Math.min(paragraphs.length - 1, paraNum);
    return paragraphs.slice(from, to + 1).join('\n\n');
  }

  // No extractable reference — pass full passage per spec
  return passageText;
}

function buildTrapExplainerPrompts(ctx: FeedbackContext): { system: string; user: string } {
  // This is the only type that needs the passage. Options are also included so
  // the model can reason about why each alternative is or isn't a trap.
  const system = `You are an expert SAT Reading and Writing tutor. A student chose an incorrect answer on a multiple-choice question. Identify the specific type of SAT distractor trap they encountered and explain why the correct answer is better.

Return ONLY valid JSON, no markdown:
{"trap":"<short label>","explanation":"<2-3 sentences>"}

trap label examples: "too extreme", "scope shift", "half-right", "opposite direction", "out of scope", "misreads the passage", "detail out of context", "contradicts the passage"
explanation: write directly to the student ("you"). Explain specifically why their choice was a trap and why the correct answer is supported.`;

  const optMap: Record<string, string | null> = { a: ctx.optionA, b: ctx.optionB, c: ctx.optionC, d: ctx.optionD };
  const passageBlock = ctx.passageText
    ? `\n\nPassage:\n${getPassageForTrap(ctx.passageText, ctx.questionText)}`
    : '';

  const user = `Question: ${ctx.questionText}

Options:
A) ${ctx.optionA}
B) ${ctx.optionB}
C) ${ctx.optionC}
D) ${ctx.optionD}

Correct answer: ${ctx.correctAnswer?.toUpperCase()} — ${optMap[ctx.correctAnswer ?? ''] ?? ''}
Student's answer: ${ctx.selectedAnswer?.toUpperCase()} — ${optMap[ctx.selectedAnswer ?? ''] ?? ''}${passageBlock}`;

  return { system, user };
}

// Passage excerpt helper — command_of_evidence only.
// Finds the anchor word from the question text, then returns 150 words on either
// side. Falls back to the mid-passage 300 words if no keyword matches.
// Passages ≤400 words are passed whole.
function getPassageForCoE(passageText: string, questionText: string): string {
  const words = passageText.split(/\s+/);
  if (words.length <= 400) return passageText;

  const passageLower = passageText.toLowerCase().split(/\s+/);
  const kwds = questionText.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
  let anchor = -1;
  for (const kw of kwds) {
    const idx = passageLower.findIndex((w) => w.includes(kw));
    if (idx !== -1) { anchor = idx; break; }
  }

  if (anchor === -1) {
    const mid = Math.floor(words.length / 2);
    const s = Math.max(0, mid - 150);
    const e = Math.min(words.length, mid + 150);
    return (s > 0 ? '…' : '') + words.slice(s, e).join(' ') + (e < words.length ? '…' : '');
  }

  const s = Math.max(0, anchor - 150);
  const e = Math.min(words.length, anchor + 150);
  return (s > 0 ? '…' : '') + words.slice(s, e).join(' ') + (e < words.length ? '…' : '');
}

function buildCommandOfEvidencePrompts(ctx: FeedbackContext): { system: string; user: string } {
  const system = `You are an SAT Reading and Writing tutor. A student got a Command of Evidence question wrong. Find the exact line in the passage that proves the correct answer, then explain why the student's choice is unsupported.

Return ONLY valid JSON, no markdown:
{"supportingLine":"<exact quote, ≤40 words>","whyCorrect":"<1 sentence>","whyStudentWrong":"<1 sentence>"}

supportingLine: copy exact words from the passage — do not paraphrase.
whyCorrect: 1 sentence on how that line directly supports the correct answer.
whyStudentWrong: 1 sentence on why the student's choice lacks passage support or contradicts it.`;

  const optMap: Record<string, string | null> = { a: ctx.optionA, b: ctx.optionB, c: ctx.optionC, d: ctx.optionD };
  const passageBlock = ctx.passageText ? getPassageForCoE(ctx.passageText, ctx.questionText) : '(no passage)';

  const user = `Passage:
${passageBlock}

Question: ${ctx.questionText}

Options:
A) ${ctx.optionA}
B) ${ctx.optionB}
C) ${ctx.optionC}
D) ${ctx.optionD}

Correct answer: ${ctx.correctAnswer?.toUpperCase()} — ${optMap[ctx.correctAnswer ?? ''] ?? ''}
Student's answer: ${ctx.selectedAnswer?.toUpperCase()} — ${optMap[ctx.selectedAnswer ?? ''] ?? ''}`;

  return { system, user };
}

function buildTransitionsCoachPrompts(ctx: FeedbackContext): { system: string; user: string } {
  // Minimal context: only the question sentence + the two answer words.
  // No options list, no passage, no confidence chip.
  const optMap: Record<string, string | null> = { a: ctx.optionA, b: ctx.optionB, c: ctx.optionC, d: ctx.optionD };

  const system = `You are an SAT Writing tutor. A student chose the wrong transition word. Diagnose the logical relationship between the two clauses, then explain why the correct transition fits and why the student's choice breaks the logic.

Return ONLY valid JSON, no markdown:
{"logicalRelationship":"<1 sentence>","whyCorrect":"<1 sentence>","whyStudentWrong":"<1 sentence>"}

logicalRelationship: describe the clause relationship (contrast, cause-effect, continuation, exemplification, concession, etc.).
whyCorrect: 1 sentence on why the correct word matches that relationship.
whyStudentWrong: 1 sentence on why the student's word signals the wrong relationship.`;

  const user = `Question: ${ctx.questionText}

Student's answer: ${ctx.selectedAnswer?.toUpperCase()} — ${optMap[ctx.selectedAnswer ?? ''] ?? ''}
Correct answer: ${ctx.correctAnswer?.toUpperCase()} — ${optMap[ctx.correctAnswer ?? ''] ?? ''}`;

  return { system, user };
}

function buildVocabDrillPrompts(ctx: FeedbackContext): { system: string; user: string } {
  // Minimal context: the sentence containing the word + the word + correct definition.
  // No full passage, no options list, no chip.
  const optMap: Record<string, string | null> = { a: ctx.optionA, b: ctx.optionB, c: ctx.optionC, d: ctx.optionD };
  const correctText = optMap[ctx.correctAnswer ?? ''] ?? '';
  const word = extractVocabWord(ctx.questionText);
  const sentence = ctx.passageText
    ? extractSentenceWithWord(ctx.passageText, word)
    : ctx.questionText;

  const system = `You are an SAT vocabulary coach. Create a new multiple-choice question testing whether the student understands how this word is used in its specific context. Do NOT reuse the original question text.

Return ONLY valid JSON, no markdown:
{"word":"<word>","sentenceContext":"<exact sentence>","followUpQuestion":"<new question>","options":["<A text>","<B text>","<C text>","<D text>"],"correctOption":"<A|B|C|D>","explanation":"<1 sentence>"}

followUpQuestion: start with 'In the sentence above, "<word>" is closest in meaning to…'
options: exactly 4 strings. One matches the in-context meaning; the others are plausible but wrong in this sentence.
explanation: 1 sentence on why the correct option fits the sentence specifically (not just the dictionary definition).`;

  const user = `Word: ${word || '(from question)'}
Sentence from passage: ${sentence}
Original question: ${ctx.questionText}
Correct definition in context: ${correctText}`;

  return { system, user };
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

/**
 * Fire AI calls for the given feedbackTypes in parallel via Promise.all.
 * Each call catches its own errors — a single failure never blocks the others.
 * Only call this for types that are NOT already cached; cache checking/writing
 * stays in the route layer.
 */
export async function orchestrateConfirmFeedback(
  ctx: FeedbackContext,
  typesToRun: FeedbackType[],
): Promise<FeedbackCallResult[]> {
  const promises = typesToRun.map(async (feedbackType): Promise<FeedbackCallResult> => {
    try {
      let prompts: { system: string; user: string };
      if (feedbackType === 'reasoning_checkpoint') {
        prompts = buildReasoningCheckpointPrompts(ctx);
      } else if (feedbackType === 'grammar_diagnosis') {
        prompts = buildGrammarDiagnosisPrompts(ctx);
      } else if (feedbackType === 'trap_explainer') {
        prompts = buildTrapExplainerPrompts(ctx);
      } else if (feedbackType === 'command_of_evidence') {
        prompts = buildCommandOfEvidencePrompts(ctx);
      } else if (feedbackType === 'transitions_coach') {
        prompts = buildTransitionsCoachPrompts(ctx);
      } else {
        prompts = buildVocabDrillPrompts(ctx);
      }
      const aiResult = await generateStructuredFeedback(prompts.system, prompts.user, 'AI_MODEL_FEEDBACK');
      return { feedbackType, aiResult, error: null };
    } catch (err) {
      console.error(`[confirm-feedback] ${feedbackType} failed:`, err);
      return { feedbackType, aiResult: null, error: err instanceof AIParseError ? 'parse_failed' : 'call_failed' };
    }
  });

  return Promise.all(promises);
}
