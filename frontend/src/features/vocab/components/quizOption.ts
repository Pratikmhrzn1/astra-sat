import { cn } from '@/shared/lib/utils';

/**
 * The lettered answer-choice recipe for the small vocab quizzes (the vocab
 * review deck and the vocab drill inside AI feedback). One source, so a
 * "correct" choice reads the same in both places.
 */
export type QuizOptionState = 'idle' | 'picked' | 'correct' | 'wrong';

export const quizOptionState = (
  { submitted, picked, correct }: { submitted: boolean; picked: boolean; correct: boolean },
): QuizOptionState => {
  if (submitted) return correct ? 'correct' : picked ? 'wrong' : 'idle';
  return picked ? 'picked' : 'idle';
};

const BORDER: Record<QuizOptionState, string> = {
  idle: 'border border-field',
  picked: 'border-[1.5px] border-teal-sat',
  correct: 'border-[1.5px] border-green-sat',
  wrong: 'border-[1.5px] border-danger',
};

const FILL: Record<QuizOptionState, string> = {
  idle: 'bg-white text-ink',
  picked: 'bg-teal-sat/[.07] text-ink',
  correct: 'bg-green-sat/10 text-green-deep',
  wrong: 'bg-danger/[.08] text-danger-dark',
};

/** The button; `size` 'md' is the review deck, 'sm' the in-feedback drill. */
export const quizOptionClass = (state: QuizOptionState, submitted: boolean, size: 'sm' | 'md' = 'md'): string => cn(
  'group flex items-center text-left transition-all duration-[120ms]',
  size === 'md' ? 'gap-3 px-3.5 py-[11px] rounded-[10px] text-sm' : 'gap-2.5 px-[13px] py-[9px] rounded-[9px] text-[13px]',
  BORDER[state],
  FILL[state],
  submitted ? 'cursor-default' : 'cursor-pointer',
);

/** The letter disc inside it; inherits the option's border tone. */
export const quizLetterClass = (state: QuizOptionState, size: 'sm' | 'md' = 'md'): string => cn(
  'rounded-full flex items-center justify-center font-bold shrink-0',
  size === 'md' ? 'w-6 h-6 text-xs' : 'w-[22px] h-[22px] text-[11px]',
  BORDER[state],
);

/** The result note under a submitted quiz. */
export const quizResultClass = (correct: boolean): string =>
  correct ? 'bg-green-sat/[.08]' : 'bg-danger/[.07]';
export const quizResultLabelClass = (correct: boolean): string =>
  correct ? 'text-green-deep' : 'text-danger-dark';
