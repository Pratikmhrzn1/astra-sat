import { cn } from '@/lib/utils';

export type MainView = 'sets' | 'vocab';

/** "Content Manager" title with the Question Sets / Vocab Bank switch. */
export function ContentHeader({ view, onView, actions }: { view: MainView; onView: (v: MainView) => void; actions?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-end justify-between gap-3 flex-wrap mb-7">
        <div>
          <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-1.5">Teacher</div>
          <h1 className="font-display font-semibold text-[32px] sm:text-[44px] m-0 tracking-[-0.02em] text-ink">Content Manager</h1>
        </div>
        {actions && <div className="flex gap-2.5 self-center items-center flex-wrap">{actions}</div>}
      </div>

      <div className="flex gap-2 mb-7">
        {([{ value: 'sets', label: 'Question Sets' }, { value: 'vocab', label: 'Vocab Bank' }] as const).map(({ value, label }) => (
          <button
            key={value}
            onClick={() => onView(value)}
            className={cn(
              'px-[18px] py-2 rounded-full text-[13.5px] font-semibold cursor-pointer transition-all duration-150',
              view === value ? 'bg-ink text-white' : 'border border-border bg-sunken text-subtle',
            )}
          >{label}</button>
        ))}
      </div>
    </>
  );
}
