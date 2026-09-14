import { surfaceClass } from '@/components/common';
import { cn } from '@/lib/utils';

/**
 * The shared intro blocks of the two exam launch pages (Mock SAT and section
 * practice): a row of headline figures and the "Before you begin" checklist.
 */

export function ExamKicker({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text">{children}</div>;
}

export function ExamTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h1 className={cn('font-display font-semibold text-4xl sm:text-[56px] mb-0 tracking-[-0.02em]', className)}>
      {children}
    </h1>
  );
}

export function ExamBlurb({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('max-w-[640px] text-sm sm:text-base leading-[1.65] text-ink/60', className)}>
      {children}
    </p>
  );
}

/** Headline figures: value over an uppercase label. */
export function MetaStats({ stats }: { stats: [value: string, label: string][] }) {
  return (
    <div className="flex gap-2.5 sm:gap-3.5 mb-5 sm:mb-7 flex-wrap">
      {stats.map(([value, label]) => (
        <div
          key={label}
          className={cn(surfaceClass, 'rounded-[14px] px-4 py-3.5 sm:px-[26px] sm:py-[18px] min-w-[88px] sm:min-w-[130px] flex-1 sm:flex-none')}
        >
          <div className="font-display font-semibold text-[28px] sm:text-[38px] leading-none text-ink">{value}</div>
          <div className="text-[9.5px] sm:text-[11px] font-bold tracking-[0.08em] uppercase text-muted mt-[5px]">{label}</div>
        </div>
      ))}
    </div>
  );
}

export function RulesCard({ rules }: { rules: string[] }) {
  return (
    <div className={cn(surfaceClass, 'px-[18px] py-4 sm:px-6 sm:py-[22px] self-start')}>
      <h3 className="text-[15px] mt-0 mb-3">Before you begin</h3>
      {rules.map((rule) => (
        <div key={rule} className="flex gap-2.5 items-start py-2 border-b border-sunken-2 last:border-b-0">
          <span className="text-accent-text text-sm leading-5 shrink-0">✓</span>
          <span className="text-[13px] text-body leading-normal">{rule}</span>
        </div>
      ))}
    </div>
  );
}
