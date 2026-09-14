import { surfaceClass } from '@/components/common';
import { cn } from '@/lib/utils';

/** A titled group of settings rows. */
export function SettingsGroup({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-[26px]', className)}>
      <h3 className="text-[13px] font-bold tracking-[0.07em] uppercase text-muted mt-0 mb-2.5">{title}</h3>
      <div className={cn(surfaceClass, 'overflow-hidden')}>{children}</div>
    </div>
  );
}

/**
 * One setting: label and description, control on the right. `stack` puts the
 * control under the text on phones, full width, for inputs and buttons that
 * would otherwise crush the description.
 */
export function SettingsRow({ title, desc, control, stack }: { title: string; desc?: string; control: React.ReactNode; stack?: boolean }) {
  return (
    <div
      className={cn(
        'flex px-5 py-[15px] border-b border-sunken last:border-b-0',
        stack ? 'flex-col items-start gap-2.5 sm:flex-row sm:items-center sm:gap-5' : 'flex-row items-center gap-5',
      )}
    >
      <div className="flex-1">
        <div className="text-[14.5px] font-semibold">{title}</div>
        {desc && <div className="text-[13px] text-subtle mt-0.5">{desc}</div>}
      </div>
      <div className={cn(stack && 'w-full sm:w-auto')}>{control}</div>
    </div>
  );
}

export const settingsLabelClass = 'block text-[13px] font-semibold text-subtle mb-[7px]';
export const settingsInputClass = 'h-[38px] px-3 border border-field rounded-[10px] text-sm bg-white';
