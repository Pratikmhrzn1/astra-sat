import React from 'react';
import { cn } from '@/shared/lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'quiet';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children?: React.ReactNode;
}

const BASE = cn(
  'inline-flex items-center justify-center gap-2 font-semibold rounded-full select-none whitespace-nowrap tracking-[-0.01em] cursor-pointer',
  'transition-[background-color,color,border-color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.97]',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
);

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent-text hover:bg-[#AE3E1B] text-white shadow-[0_1px_2px_rgba(196,71,31,0.25)] focus-visible:ring-accent-text/50',
  secondary: 'bg-white hover:bg-[#F5F3EF] text-ink border border-border focus-visible:ring-ink/20',
  danger: 'bg-danger hover:bg-[#A93226] text-white focus-visible:ring-danger/50',
  ghost: 'text-ink/[.62] hover:text-ink hover:bg-ink/5 focus-visible:ring-ink/20',
  /** Outlined but recessive: a secondary action beside a primary one, e.g. "Open paper". */
  quiet: 'bg-transparent text-subtle border border-border hover:bg-ink/5 focus-visible:ring-ink/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-10 px-[18px] text-sm',
  lg: 'h-12 px-6 text-[15px]',
};

/**
 * The pill-button recipe, exported apart from the component so a `<Link>` or a
 * one-off `<button>` with its own handlers can wear the same look.
 */
export const buttonClass = ({
  variant = 'primary',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string =>
  cn(BASE, VARIANTS[variant], SIZES[size], className);

/**
 * Square icon-only row action (edit, delete) that tints on hover.
 *
 * A disabled one drops to 35% and keeps its resting colours: without this it
 * still tinted under the pointer and read as pressable, which is the only
 * feedback a list's first "move up" button ever gives.
 */
export const iconButtonClass = (tone: 'edit' | 'danger' = 'edit', className?: string): string => cn(
  'p-[7px] rounded-lg bg-transparent cursor-pointer text-muted',
  tone === 'danger' ? 'hover:bg-danger/[.08] hover:text-danger' : 'hover:bg-blue-sat/[.08] hover:text-blue-sat',
  'disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted',
  className,
);

/** Accent pill with an icon: the page-level "create" action. */
export const accentActionClass = 'flex items-center gap-2 h-[42px] px-[18px] bg-accent-text text-white rounded-full text-sm font-semibold cursor-pointer shadow-[0_2px_10px_rgba(226,86,43,0.26)] shrink-0';

/**
 * The platform's pill button. Pressing scales it on pointer-down (see the
 * global `button:active` rule), so feedback arrives before the click commits.
 */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, className })}
    >
      {loading && (
        <svg className="animate-spin -ml-0.5 h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden>
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
