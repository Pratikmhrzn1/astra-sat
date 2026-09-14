import type { Question } from '@/api/student';
import { cn } from '@/lib/utils';

/** Jump to any question; answered, unseen and flagged at a glance. */
export function NavigatorPopup({
  questions, answers, flags, index, onJump, finishLabel, onFinish, transitioning,
}: {
  questions: Question[];
  answers: Record<string, string | null>;
  flags: Record<number, boolean>;
  index: number;
  onJump: (i: number) => void;
  finishLabel: string;
  onFinish: () => void;
  transitioning: boolean;
}) {
  const legend = 'flex items-center gap-1';
  const swatch = 'w-2 h-2 rounded-sm inline-block shrink-0';

  return (
    <div
      className={cn(
        'nav-pop fixed left-1/2 -translate-x-1/2 bottom-[78px] sm:bottom-[84px] w-[calc(100vw-28px)] sm:w-[min(560px,90vw)]',
        'bg-white border border-border rounded-2xl shadow-[0_16px_48px_rgba(11,11,14,0.18)] p-3.5 sm:p-5 z-[45] max-h-[60vh] sm:max-h-[70vh] flex flex-col',
      )}
      role="dialog"
      aria-label="Question navigator"
    >
      <div className="flex justify-between items-center mb-2.5 shrink-0">
        <span className="text-[13px] font-bold">Navigator</span>
        <div className="flex gap-2 sm:gap-3.5 text-[10px] text-subtle">
          <span className={legend}><span className={cn(swatch, 'bg-ink')} />Done</span>
          <span className={legend}><span className={cn(swatch, 'bg-white border border-field')} />Unseen</span>
          <span className={legend}><span className={cn(swatch, 'bg-ember')} />Flagged</span>
        </div>
      </div>
      <div className="overflow-y-auto flex-1">
        <div className="grid grid-cols-6 sm:grid-cols-[repeat(auto-fill,minmax(44px,1fr))] gap-1.5 sm:gap-2">
          {questions.map((qq, qi) => {
            const ans = !!answers[qq.id], fl = !!flags[qi], cur = qi === index;
            return (
              <button
                key={qi}
                onClick={() => onJump(qi)}
                className={cn(
                  'h-9 sm:h-11 rounded-lg font-semibold text-xs sm:text-sm cursor-pointer',
                  cur ? 'border-2 border-ember' : 'border border-field',
                  fl ? 'bg-ember text-white' : ans ? 'bg-ink text-white' : 'bg-white text-[#8C8880]',
                )}
              >{qi + 1}</button>
            );
          })}
        </div>
      </div>
      {/* On phones the top bar has no finish button, so it lives here. */}
      <div className="sm:hidden mt-3 pt-3 border-t border-[#F0ECE4] shrink-0">
        <button
          onClick={onFinish}
          disabled={transitioning}
          className={cn('w-full h-[42px] rounded-full bg-ink text-white text-sm font-semibold', transitioning ? 'cursor-default' : 'cursor-pointer')}
        >{finishLabel}</button>
      </div>
    </div>
  );
}
