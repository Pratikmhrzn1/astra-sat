import { forwardRef } from 'react';
import type { Question } from '@/api/student';
import { cn } from '@/lib/utils';

const LETTER = ['A', 'B', 'C', 'D'];
const OPT_KEYS = ['a', 'b', 'c', 'd'];

/**
 * The scrolling content area: the passage (beside the question on wide screens,
 * above it on phones), the question, and its answer input.
 */
export const QuestionPane = forwardRef<HTMLDivElement, {
  q: Question;
  index: number;
  selected: string | null | undefined;
  eliminated: Record<string, boolean>;
  largeFont: boolean;
  onSelect: (value: string) => void;
  onToggleElim: (key: string) => void;
}>(({ q, index, selected, eliminated, largeFont, onSelect, onToggleElim }, ref) => {
  const isSPR = q.questionType === 'student_produced_response';
  const optTexts = [q.optionA, q.optionB, q.optionC, q.optionD];
  const hasPassage = !!q.passageText;

  return (
    <div ref={ref} className="scrollarea flex-1 overflow-y-auto bg-paper">
      <div
        className={cn(
          'mx-auto px-4 pt-5 pb-[60px] sm:px-10 sm:pt-10',
          hasPassage ? 'max-w-full sm:max-w-[1100px] sm:grid sm:grid-cols-2 sm:gap-12' : 'max-w-[760px]',
        )}
      >
        {/* Passage */}
        {hasPassage && (
          <div className="pb-5 mb-6 border-b border-[#EAE7E1] sm:pb-0 sm:mb-0 sm:border-b-0 sm:pr-10 sm:border-r">
            {q.passageTitle && <div className="text-[11px] font-bold tracking-[0.1em] uppercase text-muted mb-2.5">{q.passageTitle}</div>}
            <p className="font-serif text-[17px] sm:text-[19px] leading-[1.65] text-ink m-0 whitespace-pre-wrap" dangerouslySetInnerHTML={{ __html: q.passageText! }} />
          </div>
        )}

        {/* Question */}
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-[26px] h-[26px] rounded-[7px] bg-ink text-white inline-flex items-center justify-center text-[13px] font-bold">{index + 1}</span>
            {isSPR && <span className="text-[11px] font-bold tracking-[0.07em] uppercase px-2 py-[3px] rounded-md bg-ember/[.08] text-accent-text">Grid-in</span>}
          </div>
          <p
            className={cn('leading-[1.55] font-medium text-ink mt-0 mb-[22px]', largeFont ? 'text-xl' : 'text-[16.5px]')}
            dangerouslySetInnerHTML={{ __html: q.questionText }}
          />
          {q.imageUrl && (
            <div className="mb-[22px]">
              <img src={q.imageUrl} alt="Question diagram" className="max-w-full max-h-[400px] rounded-[10px] border border-border object-contain block" />
            </div>
          )}

          {/* SPR input */}
          {isSPR && (
            <div>
              <input
                type="text"
                value={selected ?? ''}
                onChange={(e) => onSelect(e.target.value)}
                placeholder="Enter your answer…"
                className={cn(
                  'w-full max-w-[280px] h-[52px] px-4 rounded-xl text-lg font-mono bg-white text-ink outline-none',
                  selected ? 'border-[1.5px] border-ember' : 'border border-field',
                )}
              />
              <p className="text-xs text-muted mt-2">Accepted formats: whole number, decimal (1.5), or fraction (3/4)</p>
            </div>
          )}

          {/* MC options */}
          {!isSPR && (
            <div>
              {OPT_KEYS.map((key, oi) => {
                if (!optTexts[oi]) return null;
                const isSelected = selected === key;
                const isElim = !!eliminated[key];
                return (
                  <div key={key} className="flex gap-2.5 mb-3">
                    <button
                      onClick={() => onSelect(key)}
                      data-press="soft"
                      aria-pressed={isSelected}
                      className={cn(
                        'flex-1 flex items-center gap-3.5 text-left px-[18px] py-[15px] rounded-xl cursor-pointer',
                        'transition-[background-color,border-color,opacity,transform] duration-150 ease-in-out',
                        isSelected ? 'bg-ember/[.06] border-[1.5px] border-ember' : 'bg-white border border-field',
                        isElim && 'opacity-40',
                      )}
                    >
                      <span
                        className={cn(
                          'w-7 h-7 shrink-0 rounded-full border-[1.5px] flex items-center justify-center text-[13px] font-bold',
                          isSelected ? 'border-ember bg-accent-text text-white' : 'border-field bg-transparent text-stone',
                        )}
                      >{LETTER[oi]}</span>
                      <span className={cn('text-ink leading-normal', largeFont ? 'text-lg' : 'text-[15px]', isElim && 'line-through')}>{optTexts[oi]}</span>
                    </button>
                    <button
                      title="Cross out"
                      aria-label={`Cross out ${LETTER[oi]}`}
                      aria-pressed={isElim}
                      onClick={() => onToggleElim(key)}
                      className={cn(
                        'w-11 shrink-0 rounded-[10px] border border-border cursor-pointer text-[11px] font-bold tracking-[0.02em] line-through',
                        isElim ? 'bg-ink/[.04] text-accent-text' : 'bg-white text-stone',
                      )}
                    >ABC</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
QuestionPane.displayName = 'QuestionPane';
