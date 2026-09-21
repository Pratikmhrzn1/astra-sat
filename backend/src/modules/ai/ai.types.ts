/** The six kinds of feedback the confirm step can produce. */
export type FeedbackType =
  | 'reasoning_checkpoint'
  | 'grammar_diagnosis'
  | 'trap_explainer'
  | 'command_of_evidence'
  | 'transitions_coach'
  | 'vocab_drill';

/** Which configured model a call should use. Each is independently optional. */
export type ModelPurpose = 'feedback' | 'narrative' | 'classify';

/** Everything a prompt builder may draw on. Assembled once per confirm. */
export interface FeedbackContext {
  questionText: string;
  questionType: 'multiple_choice' | 'student_produced_response';
  /**
   * The question's skill code, from the `skills` table. Named for what it is
   * now rather than the five-value `sub_skill` enum it replaced — the five
   * legacy values are spelled identically as skill codes, so the branches below
   * kept working unchanged while gaining Math coverage.
   */
  skillCode: string | null;
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

export interface AIResult {
  parsed: unknown;
  modelUsed: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  /** True when the first response needed a re-prompt to produce valid JSON. */
  parseFailed: boolean;
}

export interface FeedbackCallResult {
  feedbackType: FeedbackType;
  aiResult: AIResult | null;
  error: 'parse_failed' | 'call_failed' | 'not_configured' | null;
}
