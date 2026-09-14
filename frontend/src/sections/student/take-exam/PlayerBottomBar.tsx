import { cn } from '@/lib/utils';

const pill = 'h-10 sm:h-[42px] px-3.5 sm:px-[22px] rounded-full text-[13px] sm:text-sm font-semibold whitespace-nowrap';

/** What the primary bottom button does next, decided by the page. */
export type BottomAction =
  | { kind: 'next'; answered: boolean; onClick: () => void }
  | { kind: 'finish'; label: string; tone: 'blue' | 'accent'; onClick: () => void; disabled: boolean };

/** Navigator toggle on the left; Back and Next / finish on the right. */
export function PlayerBottomBar({
  index, total, navOpen, onToggleNav, onBack, action,
}: {
  index: number;
  total: number;
  navOpen: boolean;
  onToggleNav: () => void;
  onBack: () => void;
  action: BottomAction;
}) {
  const first = index === 0;

  return (
    <div className="h-16 sm:h-[70px] shrink-0 bg-white border-t border-border flex items-center justify-between px-3 sm:px-6 gap-2">
      <button
        onClick={onToggleNav}
        aria-expanded={navOpen}
        className={cn(
          'flex items-center gap-1.5 border border-field rounded-[10px] px-2.5 sm:px-4 text-xs sm:text-[13.5px] font-semibold cursor-pointer text-ink whitespace-nowrap h-10 sm:h-[42px] shrink-0',
          navOpen ? 'bg-sunken' : 'bg-white',
        )}
      >
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
          <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
        </svg>
        <span className="sm:hidden">Q {index + 1}/{total}</span>
        <span className="hidden sm:inline">Question {index + 1} of {total}</span>
      </button>

      <div className="flex gap-[7px] sm:gap-2.5">
        <button
          onClick={onBack}
          disabled={first}
          className={cn(pill, 'border border-field', first ? 'bg-[#EDEAE4] text-[#B0ACA4] cursor-default' : 'bg-white text-ink cursor-pointer')}
        >
          <span className="sm:hidden">←</span>
          <span className="hidden sm:inline">← Back</span>
        </button>
        {action.kind === 'next' ? (
          <button
            onClick={action.onClick}
            className={cn(pill, 'cursor-pointer', action.answered ? 'bg-accent-text text-white' : 'border border-field bg-white text-stone')}
          >{action.answered ? 'Next →' : 'Skip →'}</button>
        ) : (
          <button
            onClick={action.onClick}
            disabled={action.disabled}
            className={cn(pill, 'text-white', action.tone === 'blue' ? 'bg-blue-sat' : 'bg-accent-text', action.disabled ? 'cursor-default' : 'cursor-pointer')}
          >{action.label}</button>
        )}
      </div>
    </div>
  );
}
