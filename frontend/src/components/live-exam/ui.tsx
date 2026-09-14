import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { surfaceClass } from '@/components/common';

/**
 * Shared surface for the live-exam screens.
 *
 * These four pages were the only ones in the product built from generic Tailwind
 * greys — `bg-gray-50`, `text-blue-600`, `bg-green-600` — while every other page
 * uses the platform's paper-and-vermilion system. Teachers move between them
 * mid-lesson, so the seam was visible exactly when there was least time to
 * absorb it. Every class below uses the platform's tokens, not new ones.
 */

/** Card surface. */
export const liveCardClass = surfaceClass;

/** Display-face heading, sized by the caller. */
export const liveTitleClass = 'font-display font-semibold tracking-[-0.02em] m-0';

/** Small uppercase label above a figure or a group. */
export const liveKickerClass = 'text-[11px] font-bold tracking-[0.08em] uppercase text-muted';

/** Clickable row: lifts under a pointer. */
export const liveRowClass = 'transition-[box-shadow,border-color,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:border-border-strong hover:shadow-md';

/**
 * Page frame shared by every live-exam screen: the same gutters as the rest of
 * the product (48px desktop, 16px phone) and one content width, so moving
 * between the list, the room and a marking sheet never shifts the left edge.
 */
export function LivePage({ children, width = 880 }: { children: React.ReactNode; width?: number }) {
  return (
    <div
      className="screen-fade px-4 pt-5 pb-24 sm:px-12 sm:pt-9 sm:pb-16 max-w-[var(--live-w-sm)] sm:max-w-[var(--live-w)]"
      // The content width is a prop, so it is passed as variables the classes read.
      style={{ '--live-w': `${width + 96}px`, '--live-w-sm': `${width + 32}px` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/** The "← Back" link at the top of a sub-page. */
export function BackLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      // Pulled left by the chevron's own side bearing so its stem sits on the text edge.
      className="inline-flex items-center gap-0.5 bg-transparent pt-1.5 pr-2 pb-1.5 pl-0.5 -mt-1.5 mb-3 -ml-1.5 text-[13px] font-semibold text-subtle cursor-pointer rounded-lg"
    ><ChevronLeft size={16} strokeWidth={2} aria-hidden />{children}</button>
  );
}

const PILL_VARIANTS = {
  primary: 'bg-accent-text text-white border border-transparent',
  secondary: 'bg-white text-ink border border-border',
  quiet: 'bg-transparent text-subtle border border-border',
} as const;

/** The platform's pill button, in its three weights. */
export function PillButton({
  children, onClick, variant = 'primary', disabled, type = 'button', className, ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: keyof typeof PILL_VARIANTS;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        // Flex-centred so an icon and its label share one optical centre line.
        'inline-flex items-center justify-center gap-[7px] h-10 px-5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0',
        disabled ? 'cursor-default opacity-45' : 'cursor-pointer',
        PILL_VARIANTS[variant],
        className,
      )}
    >{children}</button>
  );
}

/**
 * Session state, in the platform's three status colours.
 *
 * Named for what a teacher sees in the room rather than for the database value:
 * a session is not "active", the class is sitting it.
 */
export function StatusPill({ status }: { status: string }) {
  const spec: Record<string, { label: string; tone: string; dot: string }> = {
    waiting: { label: 'Lobby open', tone: 'text-gold-dark bg-gold/[.12]', dot: 'bg-gold-dark' },
    active: { label: 'In progress', tone: 'text-green-dark bg-green-dark/10', dot: 'bg-green-dark' },
    completed: { label: 'Finished', tone: 'text-subtle bg-sunken', dot: 'bg-subtle' },
  };
  const { label, tone, dot } = spec[status] ?? spec.completed;

  return (
    <span className={cn('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-xs font-semibold whitespace-nowrap', tone)}>
      <span aria-hidden className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}

/**
 * The join code, set to be read aloud.
 *
 * This is the one element in the product that has to work across a room: a
 * teacher dictates it while thirty people type it. So it gets one character per
 * cell — which is how you read a code out, character by character — at a size
 * that survives a projector, in the mono face the platform already reserves for
 * data. The server's alphabet omits I, O, 0 and 1 for the same reason, so no
 * character here is ambiguous when spoken.
 *
 * The large plate scales with the viewport so six cells always fit a phone.
 */
export function JoinCodePlate({ code, size = 'large' }: { code: string; size?: 'large' | 'small' }) {
  const large = size === 'large';

  return (
    <div
      role="img"
      className={cn('flex', large ? 'gap-[clamp(5px,1.6vw,8px)]' : 'gap-1')}
      aria-label={`Join code ${code.split('').join(' ')}`}
    >
      {code.split('').map((char, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            'flex items-center justify-center bg-[#FBFAF8] border border-border font-mono font-semibold text-ink leading-none',
            large
              ? 'w-[clamp(36px,11vw,48px)] h-[clamp(46px,14vw,60px)] rounded-[10px] text-[clamp(22px,7vw,30px)]'
              : 'w-[26px] h-8 rounded-md text-base',
          )}
        >{char}</span>
      ))}
    </div>
  );
}

/** Copies text and says so in place, rather than firing a toast the room won't see. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <PillButton
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          // Clipboard access can be refused; the code is on screen either way.
        }
      }}
      className={cn('h-9 px-3.5 text-[13px] min-w-[96px]', copied ? 'text-green-dark' : 'text-ink')}
    >
      <span aria-live="polite">{copied ? 'Copied ✓' : label}</span>
    </PillButton>
  );
}

/** A figure with its label, for the at-a-glance rows. */
export function StatTile({ label, value, sub, valueClassName }: { label: string; value: React.ReactNode; sub?: React.ReactNode; valueClassName?: string }) {
  return (
    <div className={cn(liveCardClass, 'px-[18px] py-3.5 min-w-0')}>
      <div className={cn(liveKickerClass, 'mb-1.5')}>{label}</div>
      <div className={cn(liveTitleClass, 'text-[30px] leading-none tnum text-ink', valueClassName)}>{value}</div>
      {sub && <div className="text-[12.5px] text-subtle mt-1.5">{sub}</div>}
    </div>
  );
}

/** Consistent empty states: say what is missing and what to do about it. */
export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className={cn(liveCardClass, 'px-6 py-11 text-center')}>
      <div className={cn(liveTitleClass, 'text-2xl text-ink/[.72] mb-1.5')}>{title}</div>
      {children && (
        <p className="text-sm text-subtle mx-auto my-0 max-w-[400px] leading-[1.6]">
          {children}
        </p>
      )}
      {action && <div className="mt-[18px] flex justify-center">{action}</div>}
    </div>
  );
}

/** Skeleton rows while a list loads, so the page keeps its shape instead of jumping. */
export function LoadingRows({ rows = 3, height = 68 }: { rows?: number; height?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="rounded-2xl bg-sunken animate-pulse motion-reduce:animate-none"
          style={{ height }}
        />
      ))}
    </div>
  );
}

export function ErrorNote({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex items-center gap-3 flex-wrap bg-danger/[.06] border border-danger/20 rounded-xl px-4 py-2.5 text-[13.5px] text-danger leading-normal">
      <span className="flex-1 min-w-[180px]">{children}</span>
      {action}
    </div>
  );
}

/**
 * Question text arrives as authored HTML (the player renders it). Anywhere it is
 * shown as a one-line summary it has to be flattened, or the tags print.
 */
export function plainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}
