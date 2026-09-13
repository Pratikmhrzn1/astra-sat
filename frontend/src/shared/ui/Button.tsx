import React from 'react';
import { cn } from '@/shared/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children?: React.ReactNode;
}

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
      className={cn(
        'inline-flex items-center justify-center gap-2 font-semibold rounded-full select-none whitespace-nowrap tracking-[-0.01em]',
        'transition-[background-color,color,border-color,box-shadow,opacity,transform] duration-150 ease-out active:scale-[0.97]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        {
          'bg-[#C4471F] hover:bg-[#AE3E1B] text-white shadow-[0_1px_2px_rgba(196,71,31,0.25)] focus-visible:ring-[#C4471F]/50': variant === 'primary',
          'bg-white hover:bg-[#F5F3EF] text-[#0B0B0E] border border-[#E7E4DE] focus-visible:ring-[#0B0B0E]/20': variant === 'secondary',
          'bg-[#C0392B] hover:bg-[#A93226] text-white focus-visible:ring-[#C0392B]/50': variant === 'danger',
          'text-[rgba(11,11,14,0.62)] hover:text-[#0B0B0E] hover:bg-[rgba(11,11,14,0.05)] focus-visible:ring-[#0B0B0E]/20': variant === 'ghost',
          'h-8 px-3.5 text-[13px]': size === 'sm',
          'h-10 px-[18px] text-sm': size === 'md',
          'h-12 px-6 text-[15px]': size === 'lg',
        },
        className
      )}
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
