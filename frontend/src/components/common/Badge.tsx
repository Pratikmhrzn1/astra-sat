import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'english' | 'math' | 'success' | 'warning' | 'error' | 'neutral' | 'admin' | 'teacher' | 'student';
  className?: string;
}

export function Badge({ children, variant = 'neutral', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-[0.01em] leading-5',
        {
          'bg-blue-50 text-blue-700 border border-blue-200': variant === 'english' || variant === 'student',
          'bg-amber-50 text-amber-700 border border-amber-200': variant === 'math' || variant === 'warning',
          'bg-green-50 text-green-700 border border-green-200': variant === 'success',
          'bg-red-50 text-red-700 border border-red-200': variant === 'error',
          'bg-sunken text-ink/60 border border-border': variant === 'neutral',
          'bg-purple-50 text-purple-700 border border-purple-200': variant === 'admin',
          'bg-teal-50 text-teal-700 border border-teal-200': variant === 'teacher',
        },
        className
      )}
    >
      {children}
    </span>
  );
}

export function SubjectBadge({ subject }: { subject: 'english' | 'math' }) {
  return (
    <Badge variant={subject}>
      {subject === 'english' ? 'English' : 'Math'}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: 'student' | 'teacher' | 'admin' }) {
  return (
    <Badge variant={role}>
      {role.charAt(0).toUpperCase() + role.slice(1)}
    </Badge>
  );
}
