import React from 'react';
import { classes } from '@/shared/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

/** Resting surface for a grouped block of content. */
export const surfaceStyle = 'bg-white border border-border rounded-2xl shadow-stat';

/**
 * A card that is itself the click target: lifts under a pointer. `.lift` in
 * index.css carries the transition so it respects reduced motion.
 */
export const panelStyle = 'lift bg-white border border-border rounded-[13px] cursor-pointer shadow-card hover:shadow-card-hover hover:border-border-strong';

/** Small uppercase label above a figure or a group. */
export const kickerStyle = 'text-[11px] font-bold tracking-[0.08em] uppercase text-muted';

/** Column heading in a card-table. */
export const tableHeadStyle = 'text-[11px] font-bold tracking-[0.07em] uppercase text-muted';

/** A clickable card-table row. */
export const tableRowStyle = 'border-b border-sunken last:border-b-0 cursor-pointer hover:bg-[#FBFAF8]';

/** Page gutters shared by every in-app screen: 48px desktop, 16px phone. */
export const screenStyle = 'screen-fade px-4 pt-5 pb-20 sm:px-12 sm:pt-9 sm:pb-16';

export function Panel({ children, className }: CardProps) {
  return (
    <div className={classes('bg-white border border-border rounded-2xl shadow-sm', className)}>
      {children}
    </div>
  );
}

export function PanelMasthead({ children, className }: CardProps) {
  return (
    <div className={classes('px-6 py-4 border-b border-border-soft', className)}>{children}</div>
  );
}

export function PanelBody({ children, className }: CardProps) {
  return <div className={classes('px-6 py-5', className)}>{children}</div>;
}

export function PanelTitle({ children, className }: CardProps) {
  return <h3 className={classes('text-[17px] leading-snug font-semibold tracking-[-0.016em] text-ink', className)}>{children}</h3>;
}
