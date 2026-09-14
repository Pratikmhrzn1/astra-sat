import { cn } from '@/shared/lib/utils';

/** The title block every in-app page opens with. */
export function PageHeader({
  title, subtitle, kicker, className, children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Small uppercase line above the title. */
  kicker?: React.ReactNode;
  className?: string;
  /** Actions aligned to the title's right edge (wraps under it on phones). */
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('mb-4 sm:mb-5', className)}>
      {kicker && <div className="text-xs font-bold tracking-[0.1em] uppercase text-muted mb-1">{kicker}</div>}
      <div className={cn(children && 'flex items-start sm:items-end justify-between gap-3 flex-wrap')}>
        <h1 className="font-display font-semibold text-[32px] sm:text-[44px] m-0 tracking-[-0.02em] leading-[1.1]">{title}</h1>
        {children}
      </div>
      {subtitle && <p className="text-sm sm:text-[15px] text-subtle mt-1.5 mb-0 leading-[1.6]">{subtitle}</p>}
    </div>
  );
}

/** Pill tab / filter: solid ink when selected. */
export const pillClass = (active: boolean, className?: string): string => cn(
  'px-[18px] py-2 rounded-full text-[13.5px] font-semibold cursor-pointer border',
  active ? 'border-ink bg-ink text-white' : 'border-field bg-white text-ink',
  className,
);

/** Small filter chip on a sunken ground. */
export const chipClass = (active: boolean, className?: string): string => cn(
  'px-3.5 py-[5px] text-[12.5px] font-semibold rounded-full cursor-pointer',
  active ? 'bg-ink text-white' : 'border border-border bg-sunken text-stone',
  className,
);
