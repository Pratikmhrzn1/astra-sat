import React from 'react';
import { cn } from '@/shared/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/** Resting surface for a grouped block of content. */
export const surfaceClass = 'bg-white border border-border rounded-2xl shadow-stat';

/**
 * A card that is itself the click target: lifts under a pointer. `.lift` in
 * index.css carries the transition so it respects reduced motion.
 */
export const cardClass = 'lift bg-white border border-border rounded-[13px] cursor-pointer shadow-card hover:shadow-card-hover hover:border-border-strong';

/** Small uppercase label above a figure or a group. */
export const kickerClass = 'text-[11px] font-bold tracking-[0.08em] uppercase text-muted';

/** Column heading in a card-table. */
export const tableHeadClass = 'text-[11px] font-bold tracking-[0.07em] uppercase text-muted';

/** A clickable card-table row. */
export const tableRowClass = 'border-b border-sunken last:border-b-0 cursor-pointer hover:bg-[#FBFAF8]';

/** Page gutters shared by every in-app screen: 48px desktop, 16px phone. */
export const pageClass = 'screen-fade px-4 pt-5 pb-20 sm:px-12 sm:pt-9 sm:pb-16';

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white border border-border rounded-2xl shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-border-soft', className)}>{children}</div>
  );
}

export function CardBody({ children, className }: CardProps) {
  return <div className={cn('px-6 py-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: CardProps) {
  return <h3 className={cn('text-[17px] leading-snug font-semibold tracking-[-0.016em] text-ink', className)}>{children}</h3>;
}
