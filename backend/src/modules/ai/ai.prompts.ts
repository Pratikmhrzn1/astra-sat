import type { FeedbackContext } from './ai.types';

/**
 * One prompt builder per feedback type.
 *
 * Each builder receives the same context but passes only what its job needs:
 * grammar diagnosis sees the sentence and the two answers, not the passage or
 * the confidence chip. That is deliberate — narrower prompts are cheaper, and
 * they measurably reduce the model's tendency to comment on things it was not
 * asked about.
 */

export interface Prompt {
  system: string;
  user: string;
}

const CONFIDENCE_LABELS: Record<string, string> = {
  sure: 'I was sure',
  eliminated: 'Eliminated the wrong ones',
  guessed: 'Guessed',
};

function optionMap(ctx: FeedbackContext): Record<string, string | null> {
  return { a: ctx.optionA, b: ctx.optionB, c: ctx.optionC, d: ctx.optionD };
}

function optionText(ctx: FeedbackContext, choice: string | null): string {
  return optionMap(ctx)[choice ?? ''] ?? '';
}

// ── Vocabulary helpers (also used by the confirm route) ──────────────────────

/** Pulls the quoted or italicised word out of a vocab-in-context stem. */
export function extractVocabWord(questionText: string): string {
  const match = questionText.match(/[""''"']([^""''"']{1,40})[""''"']/);
  return match?.[1] ?? '';
}

/** The one sentence of `text` containing `word`, for a tight vocab excerpt. */
export function extractSentenceWithWord(text: string, word: string): string {
  if (!word || !text) return text?.substring(0, 300) ?? '';
  const sentences = text.split(/(?<=[.!?])\s+/);
  const lower = word.toLowerCase();
  return sentences.find((s) => s.toLowerCase().includes(lower))?.trim() ?? text.substring(0, 300);
}

// ── Passage excerpting ────────────────────────────────────────────────────────
// Long passages are trimmed before they reach a model: tokens cost money, and
// burying the relevant lines in 900 words of context measurably degrades the
// answer. Each strategy is tuned to what its feedback type actually needs.

/**
 * For trap explanation: if the question names a paragraph, send that paragraph
 * plus the one before it; otherwise send the whole passage. Line-number
 * references are ignored because stored plain text has no stable line numbers.
 */
function passageForTrap(passageText: string, questionText: string): string {
  if (passageText.split(/\s+/).length <= 300) return passageText;

  const paragraphMatch = questionText.match(/paragraph\s+(\d+)/i);
  if (paragraphMatch) {
    const target = parseInt(paragraphMatch[1], 10);
    const paragraphs = passageText.split(/\n\s*\n/);
    const from = Math.max(0, target - 2);
    const to = Math.min(paragraphs.length - 1, target);
    return paragraphs.slice(from, to + 1).join('\n\n');
  }
  return passageText;
}

/**
 * For command of evidence: anchor on the first substantial word from the
 * question that appears in the passage and send +/-150 words around it, since
 * the supporting line is nearly always near that anchor. With no match, the
 * middle 300 words are a better guess than the opening.
 */
function passageForEvidence(passageText: string, questionText: string): string {
  const words = passageText.split(/\s+/);
  if (words.length <= 400) return passageText;

  const lowerWords = passageText.toLowerCase().split(/\s+/);
  const keywords = questionText.toLowerCase().split(/\W+/).filter((w) => w.length > 4);

  let anchor = -1;
  for (const keyword of keywords) {
    const index = lowerWords.findIndex((w) => w.includes(keyword));
    if (index !== -1) {
      anchor = index;
      break;
    }
  }

  const centre = anchor === -1 ? Math.floor(words.length / 2) : anchor;
  const start = Math.max(0, centre - 150);
  const end = Math.min(words.length, centre + 150);
  return (start > 0 ? '…' : '') + words.slice(start, end).join(' ') + (end < words.length ? '…' : '');
}

// ── Builders ──────────────────────────────────────────────────────────────────

export function buildReasoningCheckpoint(ctx: FeedbackContext): Prompt {
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

  const answerDisplay =
    ctx.questionType === 'student_produced_response'
      ? `Correct answer: ${ctx.correctAnswerText ?? 'N/A'}\nStudent's answer: ${ctx.selectedAnswerText || 'Not answered'}`
      : `Answer choices:\nA) ${ctx.optionA}\nB) ${ctx.optionB}\nC) ${ctx.optionC}\nD) ${ctx.optionD}\n\nCorrect answer: ${ctx.correctAnswer?.toUpperCase()} — ${optionText(ctx, ctx.correctAnswer)}\nStudent's answer: ${ctx.selectedAnswer ? `${ctx.selectedAnswer.toUpperCase()} — ${optionText(ctx, ctx.selectedAnswer)}` : 'Not answered'}`;

  const user = `Question: ${ctx.questionText}

${answerDisplay}

Outcome: ${ctx.isCorrect ? 'CORRECT' : 'WRONG'}
Confidence: ${CONFIDENCE_LABELS[ctx.confidence] ?? ctx.confidence}
Reasoning: ${ctx.reasoning?.trim() || 'Not provided'}`;

  return { system, user };
}

export function buildGrammarDiagnosis(ctx: FeedbackContext): Prompt {
  const system = `You are an SAT grammar expert. A student answered a grammar question incorrectly. Identify the specific grammar rule being tested and state the correction in one sentence.

Return ONLY valid JSON, no markdown:
{"grammarRule":"<rule name>","grammarFix":"<one sentence>"}

grammarRule examples: "subject-verb agreement", "dangling modifier", "comma splice", "faulty parallelism", "pronoun-antecedent agreement", "misplaced modifier", "verb tense consistency", "semicolon usage", "parallel structure"`;

  const answerLine =
    ctx.questionType === 'student_produced_response'
      ? `Student's answer: ${ctx.selectedAnswerText || 'Not answered'}\nCorrect answer: ${ctx.correctAnswerText ?? 'N/A'}`
      : `Student's answer: ${ctx.selectedAnswer?.toUpperCase() ?? 'Not answered'}\nCorrect answer: ${ctx.correctAnswer?.toUpperCase() ?? 'N/A'}`;

  return { system, user: `Question: ${ctx.questionText}\n\n${answerLine}` };
}

export function buildTrapExplainer(ctx: FeedbackContext): Prompt {
  const system = `You are an expert SAT Reading and Writing tutor. A student chose an incorrect answer on a multiple-choice question. Identify the specific type of SAT distractor trap they encountered and explain why the correct answer is better.

Return ONLY valid JSON, no markdown:
{"trap":"<short label>","explanation":"<2-3 sentences>"}

trap label examples: "too extreme", "scope shift", "half-right", "opposite direction", "out of scope", "misreads the passage", "detail out of context", "contradicts the passage"
explanation: write directly to the student ("you"). Explain specifically why their choice was a trap and why the correct answer is supported.`;

  const passageBlock = ctx.passageText
    ? `\n\nPassage:\n${passageForTrap(ctx.passageText, ctx.questionText)}`
    : '';

  const user = `Question: ${ctx.questionText}

Options:
A) ${ctx.optionA}
B) ${ctx.optionB}
C) ${ctx.optionC}
D) ${ctx.optionD}

Correct answer: ${ctx.correctAnswer?.toUpperCase()} — ${optionText(ctx, ctx.correctAnswer)}
Student's answer: ${ctx.selectedAnswer?.toUpperCase()} — ${optionText(ctx, ctx.selectedAnswer)}${passageBlock}`;

  return { system, user };
}

export function buildCommandOfEvidence(ctx: FeedbackContext): Prompt {
  const system = `You are an SAT Reading and Writing tutor. A student got a Command of Evidence question wrong. Find the exact line in the passage that proves the correct answer, then explain why the student's choice is unsupported.

Return ONLY valid JSON, no markdown:
{"supportingLine":"<exact quote, ≤40 words>","whyCorrect":"<1 sentence>","whyStudentWrong":"<1 sentence>"}

supportingLine: copy exact words from the passage — do not paraphrase.
whyCorrect: 1 sentence on how that line directly supports the correct answer.
whyStudentWrong: 1 sentence on why the student's choice lacks passage support or contradicts it.`;

  const passageBlock = ctx.passageText
    ? passageForEvidence(ctx.passageText, ctx.questionText)
    : '(no passage)';

  const user = `Passage:
${passageBlock}

Question: ${ctx.questionText}

Options:
A) ${ctx.optionA}
B) ${ctx.optionB}
C) ${ctx.optionC}
D) ${ctx.optionD}

Correct answer: ${ctx.correctAnswer?.toUpperCase()} — ${optionText(ctx, ctx.correctAnswer)}
Student's answer: ${ctx.selectedAnswer?.toUpperCase()} — ${optionText(ctx, ctx.selectedAnswer)}`;

  return { system, user };
}

export function buildTransitionsCoach(ctx: FeedbackContext): Prompt {
  const system = `You are an SAT Writing tutor. A student chose the wrong transition word. Diagnose the logical relationship between the two clauses, then explain why the correct transition fits and why the student's choice breaks the logic.

Return ONLY valid JSON, no markdown:
{"logicalRelationship":"<1 sentence>","whyCorrect":"<1 sentence>","whyStudentWrong":"<1 sentence>"}

logicalRelationship: describe the clause relationship (contrast, cause-effect, continuation, exemplification, concession, etc.).
whyCorrect: 1 sentence on why the correct word matches that relationship.
whyStudentWrong: 1 sentence on why the student's word signals the wrong relationship.`;

  const user = `Question: ${ctx.questionText}

Student's answer: ${ctx.selectedAnswer?.toUpperCase()} — ${optionText(ctx, ctx.selectedAnswer)}
Correct answer: ${ctx.correctAnswer?.toUpperCase()} — ${optionText(ctx, ctx.correctAnswer)}`;

  return { system, user };
}

export function buildVocabDrill(ctx: FeedbackContext): Prompt {
  const system = `You are an SAT vocabulary coach. Create a new multiple-choice question testing whether the student understands how this word is used in its specific context. Do NOT reuse the original question text.

Return ONLY valid JSON, no markdown:
{"word":"<word>","sentenceContext":"<exact sentence>","followUpQuestion":"<new question>","options":["<A text>","<B text>","<C text>","<D text>"],"correctOption":"<A|B|C|D>","explanation":"<1 sentence>"}

followUpQuestion: start with 'In the sentence above, "<word>" is closest in meaning to…'
options: exactly 4 strings. One matches the in-context meaning; the others are plausible but wrong in this sentence.
explanation: 1 sentence on why the correct option fits the sentence specifically (not just the dictionary definition).`;

  const word = extractVocabWord(ctx.questionText);
  const sentence = ctx.passageText ? extractSentenceWithWord(ctx.passageText, word) : ctx.questionText;

  const user = `Word: ${word || '(from question)'}
Sentence from passage: ${sentence}
Original question: ${ctx.questionText}
Correct definition in context: ${optionText(ctx, ctx.correctAnswer)}`;

  return { system, user };
}
