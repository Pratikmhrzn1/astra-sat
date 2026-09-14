import React from 'react';
import { cn } from '@/shared/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin w-8 h-8', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/** A spinner inside a page's content area, while its first query loads. */
export function InlineLoader() {
  return (
    <div className="flex justify-center pt-16">
      <Spinner className="w-8 h-8 text-accent-text" />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="w-10 h-10 text-accent-text" />
        <p className="text-muted text-sm">Loading…</p>
      </div>
    </div>
  );
}
