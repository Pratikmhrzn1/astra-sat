import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function classes(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function renderDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function renderDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
