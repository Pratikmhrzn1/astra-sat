import type { NarrativeContent } from '@/api/student';
import { cn } from '@/lib/utils';

type Narrative = { status: string; content?: unknown } | undefined;

function Unavailable({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div className="bg-[#FDF2F0] border border-danger/20 rounded-2xl px-[26px] py-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
      <span className="text-[13.5px] text-danger-dark">Analysis unavailable for this attempt.</span>
      <button
        onClick={onRetry}
        disabled={retrying}
        className="px-4 py-[7px] rounded-full text-[13px] font-semibold border border-danger/40 bg-transparent text-danger-dark cursor-pointer disabled:cursor-default disabled:opacity-50"
      >
        {retrying ? 'Retrying…' : 'Retry Analysis'}
      </button>
    </div>
  );
}

/** The AI's read of the attempt: pending, failed, or the pattern diagnosis itself. */
export function NarrativePanel({ narrative, failed, onRetry, retrying }: {
  narrative: Narrative;
  /** The query errored, or polling gave up while it was still pending. */
  failed: boolean;
  onRetry: () => void;
  retrying: boolean;
}) {
  if (failed || narrative?.status === 'failed') return <Unavailable onRetry={onRetry} retrying={retrying} />;

  if (!narrative || narrative.status === 'pending') {
    return (
      <div className="bg-[#F5F3EF] border border-dashed border-field rounded-2xl px-[30px] py-[26px] mb-6 flex items-center gap-3.5">
        <div className="w-[18px] h-[18px] rounded-full border-2 border-ember border-t-transparent animate-[spin_0.9s_linear_infinite] shrink-0" />
        <div>
          <div className="text-sm font-semibold text-ink mb-[3px]">Generating your analysis…</div>
          <div className="text-[12.5px] text-muted">This usually takes under 15 seconds.</div>
        </div>
      </div>
    );
  }

  const nc = narrative.content as NarrativeContent;
  if (!nc) return null;

  return (
    <div className="bg-white border border-border rounded-3xl px-5 py-6 sm:px-8 sm:py-7 mb-6 shadow-panel">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-4 mb-[18px]">
        <div className="flex-1">
          <div className="text-[10.5px] font-bold tracking-[0.1em] uppercase text-accent-text mb-1.5">Pattern diagnosis</div>
          <p className="text-sm sm:text-[15.5px] leading-[1.65] text-ink m-0">{nc.narrative}</p>
        </div>
        {nc.scoreRange && (
          <div className="shrink-0 text-center bg-ink rounded-[14px] px-4 py-2.5 sm:px-[22px] sm:py-3.5 self-start">
            <div className="text-[10px] font-bold tracking-[0.1em] uppercase text-white/45 mb-1">Est. range</div>
            <div className="font-display font-semibold text-2xl text-white leading-none">{nc.scoreRange}</div>
          </div>
        )}
      </div>
      {nc.subSkillBreakdown && nc.subSkillBreakdown.length > 0 && (
        <div>
          <div className="text-[11px] font-bold tracking-[0.08em] uppercase text-muted mb-2.5">SubSkill breakdown</div>
          <div className="flex flex-col gap-[7px]">
            {nc.subSkillBreakdown.map((s) => {
              const pct = s.total > 0 ? Math.round((s.wrong / s.total) * 100) : 0;
              const bar = s.flag ? 'bg-danger' : pct > 40 ? 'bg-gold' : 'bg-green-sat';
              return (
                <div key={s.subSkill} className="flex items-center gap-3">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', bar)} />
                  <span className={cn('text-[13px] min-w-[110px] sm:min-w-[170px] flex-none sm:flex-initial', s.flag ? 'font-bold text-ink' : 'font-medium text-body')}>
                    {s.subSkill.replace(/_/g, ' ')}
                    {s.flag && <span className="ml-1.5 text-[10px] font-bold text-danger tracking-[0.06em] uppercase">pattern</span>}
                  </span>
                  <div className="flex-1 h-1.5 bg-sunken-2 rounded-full overflow-hidden">
                    <div className={cn('h-1.5 rounded-full', bar)} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-subtle font-mono w-14 text-right">{s.wrong}/{s.total}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
