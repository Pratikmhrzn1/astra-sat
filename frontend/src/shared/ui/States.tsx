import type { LucideIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { surfaceClass } from './Card';

/**
 * Loading, empty and error states, so every list says the same kind of thing
 * in the same place: what is missing, and what to do about it.
 */

export function EmptyState({
  title, children, action, className, titleClassName,
}: {
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  titleClassName?: string;
}) {
  return (
    <div className={cn(surfaceClass, 'px-6 py-12 text-center', className)}>
      <div className={cn('font-display font-semibold text-[26px] text-subtle mb-1.5', titleClassName)}>{title}</div>
      {children && <p className="text-sm text-muted mx-auto my-0 max-w-[400px] leading-[1.6]">{children}</p>}
      {action && <div className="mt-[18px] flex justify-center">{action}</div>}
    </div>
  );
}

/** A faint icon over a line or two, for lists with nothing in them yet. */
export function IconEmpty({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="text-center pt-16 text-muted text-sm">
      <Icon size={48} className="text-ink/20 mx-auto mb-4 block" />
      {children}
    </div>
  );
}

/** A single line in a card: "Loading…", "No completed tests yet." */
export function NoteCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn(surfaceClass, 'px-6 py-10 text-center text-muted text-sm', className)}>{children}</div>;
}

export function ErrorBanner({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn('bg-danger/[.06] border border-danger/20 rounded-xl px-4 py-2.5 mb-4 text-[13.5px] text-danger', className)}>
      {children}
    </div>
  );
}
