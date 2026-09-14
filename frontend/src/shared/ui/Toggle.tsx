import { cn } from '@/shared/lib/utils';

/** An on/off switch. `role="switch"` so assistive tech announces its state. */
export function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={cn('relative w-[46px] h-[27px] rounded-full p-0 shrink-0 cursor-pointer transition-colors duration-200', on ? 'bg-ember' : 'bg-field')}
    >
      <span
        className={cn(
          'absolute top-[3px] w-[21px] h-[21px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-[left] duration-200',
          on ? 'left-[22px]' : 'left-[3px]',
        )}
      />
    </button>
  );
}
