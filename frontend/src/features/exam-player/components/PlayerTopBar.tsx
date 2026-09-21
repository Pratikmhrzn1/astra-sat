import { cn } from '@/shared/lib/utils';

const OfflineIcon = ({ size }: { size: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
  </svg>
);

const FlagIcon = ({ flagged }: { flagged: boolean }) => (
  <svg viewBox="0 0 24 24" width="15" height="15" fill={flagged ? '#E2562B' : 'none'} stroke={flagged ? '#E2562B' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
  </svg>
);

const outlined = 'border bg-white rounded-full cursor-pointer text-ink';

/**
 * The player's top bar: exit, where you are, the clock, flag and finish.
 * Phones get a compact three-column bar; wider screens the full one.
 */
export function PlayerTopBar({
  isMath, isPractice, index, total, timerEnabled, clock, lowTime, isOnline,
  flagged, onToggleFlag, onExit, finishLabel, onFinish, transitioning,
}: {
  isMath: boolean;
  isPractice: boolean;
  index: number;
  total: number;
  timerEnabled: boolean;
  clock: string;
  lowTime: boolean;
  isOnline: boolean;
  flagged: boolean;
  onToggleFlag: () => void;
  onExit: () => void;
  finishLabel: string;
  onFinish: () => void;
  transitioning: boolean;
}) {
  const clockClass = cn('font-display font-semibold leading-none tracking-[-0.02em] tnum', lowTime ? 'text-danger' : 'text-ink');
  const flagTone = flagged ? 'border-ember bg-ember/[.07]' : 'border-field';

  return (
    <>
      {/* Phones */}
      <div className="sm:hidden h-14 shrink-0 bg-white border-b border-border flex items-center justify-between px-3.5 gap-2">
        <button onClick={onExit} aria-label="Exit test" className={cn(outlined, 'border-field px-3 py-[7px] text-sm font-bold shrink-0 leading-none')}>←</button>
        <div className="text-center flex-1 min-w-0">
          <div className="text-[10px] font-bold tracking-[0.08em] uppercase text-muted">
            {isMath ? 'Math' : 'R&W'}{isPractice && ' · Practice'}
          </div>
          <div className="text-sm font-bold">Q {index + 1} / {total}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {timerEnabled ? (
            <div className={cn(clockClass, 'text-[22px]')}>{clock}</div>
          ) : isPractice ? (
            <span className="text-[11px] font-semibold text-muted tracking-[0.04em]">Untimed</span>
          ) : null}
          {!isOnline && <span className="text-gold"><OfflineIcon size={14} /></span>}
          <button
            onClick={onToggleFlag}
            aria-label={flagged ? 'Remove flag' : 'Flag for review'}
            aria-pressed={flagged}
            className={cn('w-[38px] h-[38px] flex items-center justify-center border rounded-full cursor-pointer p-0', flagTone, flagged ? '' : 'bg-white')}
          >
            <FlagIcon flagged={flagged} />
          </button>
        </div>
      </div>

      {/* Wider screens */}
      <div className="hidden sm:flex h-[62px] shrink-0 bg-white border-b border-border items-center justify-between px-6">
        <div className="flex items-center gap-[18px]">
          <button onClick={onExit} className={cn(outlined, 'border-field flex items-center gap-[7px] px-3.5 py-[7px] text-[13px] font-semibold')}>← Exit</button>
          <div>
            <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-muted">
              {isMath ? 'Math' : 'Reading & Writing'}
              {isPractice && <span className="ml-2 text-blue-sat">· Practice</span>}
            </div>
            <div className="text-[14.5px] font-semibold">Question {index + 1} of {total}</div>
          </div>
        </div>

        {timerEnabled ? (
          <div className="text-center">
            <div className={cn(clockClass, 'text-[30px]')}>{clock}</div>
            <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted">Time left</div>
          </div>
        ) : isPractice ? (
          <div className="text-center">
            <div className="text-[13px] font-semibold text-muted tracking-[0.04em]">Untimed</div>
          </div>
        ) : null}

        <div className="flex items-center gap-2.5">
          {!isOnline && (
            <div className="flex items-center gap-1.5 text-xs text-gold bg-gold/10 px-2.5 py-[5px] rounded-full border border-gold/30">
              <OfflineIcon size={13} />
              Offline
            </div>
          )}
          <button
            onClick={onToggleFlag}
            aria-label={flagged ? 'Remove flag' : 'Flag for review'}
            aria-pressed={flagged}
            className={cn('flex items-center gap-[7px] border rounded-full px-3.5 py-[7px] text-[13px] font-semibold cursor-pointer', flagTone, flagged ? 'text-accent-text' : 'bg-white text-ink')}
          >
            <FlagIcon flagged={flagged} />
            {flagged ? 'Flagged' : 'Flag'}
          </button>
          <button
            onClick={onFinish}
            disabled={transitioning}
            className={cn('border border-ink bg-ink text-white rounded-full px-[18px] py-2 text-[13px] font-semibold', transitioning ? 'cursor-default' : 'cursor-pointer')}
          >{finishLabel}</button>
        </div>
      </div>
    </>
  );
}
