import React from 'react';
import { cn } from '@/shared/lib/utils';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('bg-white border border-[#E7E4DE] rounded-2xl shadow-[0_1px_2px_rgba(11,11,14,0.04),0_1px_3px_rgba(11,11,14,0.04)]', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardProps) {
  return (
    <div className={cn('px-6 py-4 border-b border-[#EEEBE5]', className)}>{children}</div>
  );
}

export function CardBody({ children, className }: CardProps) {
  return <div className={cn('px-6 py-5', className)}>{children}</div>;
}

export function CardTitle({ children, className }: CardProps) {
  return <h3 className={cn('text-[17px] leading-snug font-semibold tracking-[-0.016em] text-[#0B0B0E]', className)}>{children}</h3>;
}
