import { Check } from 'lucide-react';
import { SCALE_MAX, SCALE_MIN, type SurveyAnswer, type SurveyQuestion } from '@/features/survey/api';
import { inputClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

/**
 * The one place a survey question is rendered as something to answer.
 *
 * Shared by the student's onboarding page and the admin editor's live preview,
 * so "what the student will see" is the same code as what they see — an admin
 * previewing a question cannot be shown a stale imitation of it.
 */

export function isAnswered(answer: SurveyAnswer | undefined): boolean {
  if (answer === undefined) return false;
  if (typeof answer === 'string') return answer.trim().length > 0;
  if (Array.isArray(answer)) return answer.length > 0;
  return true;
}

/**
 * The answer-choice recipe, matching the exam player's `QuestionPane` so a
 * choice looks and presses the same wherever a student meets one.
 *
 * Two things are deliberate. The border is 1.5px in both states and only its
 * colour changes: the player's 1px→1.5px swap nudges the label half a pixel
 * under the pointer at the exact moment of the click, and a stack of choices
 * makes that visible. And there is no `transition-*` utility — the global
 * `button` rule in index.css already transitions colour, background, border,
 * shadow and opacity at `--dur-quick` and transform at `--dur-press`, which is
 * exactly right here; naming a subset would drop transform from the transition
 * and make the press release snap.
 */
export const choiceClass = (selected: boolean, className?: string) =>
  cn(
    'w-full flex items-center gap-3 text-left px-4 py-3 rounded-xl text-[14.5px] text-ink cursor-pointer',
    'border-[1.5px]',
    selected ? 'bg-ember/[.06] border-ember' : 'bg-white border-border hover:border-field',
    className,
  );

/**
 * The mark beside a choice: round for "pick one", square for "pick any", which
 * is the only thing that tells the two apart before anything is selected.
 *
 * The tick is always in the DOM and animates in on opacity, scale and blur —
 * toggling visibility would make the state arrive with no transition at all.
 */
export function ChoiceIndicator({ multi, selected }: { multi: boolean; selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'w-[22px] h-[22px] shrink-0 flex items-center justify-center border-[1.5px]',
        multi ? 'rounded-[7px]' : 'rounded-full',
        'transition-[background-color,border-color] duration-quick ease-ui',
        selected ? 'border-ember bg-accent-text text-white' : 'border-field bg-transparent text-transparent',
      )}
    >
      <Check
        size={13}
        strokeWidth={3}
        className={cn(
          'transition-[opacity,transform,filter] duration-quick ease-[cubic-bezier(0.2,0,0,1)]',
          selected ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-[0.25] blur-[4px]',
        )}
      />
    </span>
  );
}

export function QuestionField({
  question,
  value,
  onChange,
  /** Set on the field the "answer this one" jump landed on. */
  highlighted = false,
}: {
  question: SurveyQuestion;
  value: SurveyAnswer | undefined;
  onChange: (next: SurveyAnswer) => void;
  highlighted?: boolean;
}) {
  if (question.type === 'short_text') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder="Your answer"
        aria-label={question.prompt}
        aria-required={question.isRequired}
        className={inputClass(false, cn('resize-y min-h-[84px]', highlighted && 'border-ember'))}
      />
    );
  }

  if (question.type === 'scale') {
    const selected = typeof value === 'number' ? value : null;
    return (
      <div>
        <div role="radiogroup" aria-label={question.prompt} aria-required={question.isRequired} className="flex gap-2">
          {Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => SCALE_MIN + i).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected === n}
              onClick={() => onChange(n)}
              className={cn(
                'flex-1 h-12 rounded-xl text-[15px] font-semibold text-ink cursor-pointer border-[1.5px]',
                selected === n ? 'bg-ember/[.06] border-ember' : 'bg-white border-border hover:border-field',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {/*
          A bare row of digits says nothing about which end is which. The two
          captions sit under the first and last button, aligned to the ends
          rather than centred on them, so they read as the scale's poles.
        */}
        <div className="flex justify-between mt-1.5 px-1 text-[11.5px] text-muted">
          <span>Lowest</span>
          <span>Highest</span>
        </div>
      </div>
    );
  }

  if (question.type === 'multi_choice') {
    const picked = Array.isArray(value) ? value : [];
    return (
      <div role="group" aria-label={`${question.prompt} — choose any that apply`} className="flex flex-col gap-2">
        {question.options.map((option) => {
          const selected = picked.includes(option);
          return (
            <button
              key={option}
              type="button"
              role="checkbox"
              aria-checked={selected}
              data-press="soft"
              onClick={() => onChange(selected ? picked.filter((o) => o !== option) : [...picked, option])}
              className={choiceClass(selected)}
            >
              <ChoiceIndicator multi selected={selected} />
              {option}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div role="radiogroup" aria-label={question.prompt} aria-required={question.isRequired} className="flex flex-col gap-2">
      {question.options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          data-press="soft"
          onClick={() => onChange(option)}
          className={choiceClass(value === option)}
        >
          <ChoiceIndicator multi={false} selected={value === option} />
          {option}
        </button>
      ))}
    </div>
  );
}
