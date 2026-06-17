import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

export function getScoreColor(percentage: number): string {
  if (percentage >= 80) return '#1A6B3C';
  if (percentage >= 65) return '#2E7D5A';
  if (percentage >= 50) return '#B8893E';
  return '#C47A1B';
}

export function getScoreBg(percentage: number): string {
  if (percentage >= 80) return 'bg-green-50 border-green-200';
  if (percentage >= 65) return 'bg-[#F0F7F4] border-[#B8D9CC]';
  if (percentage >= 50) return 'bg-amber-50 border-amber-200';
  return 'bg-red-50 border-red-200';
}
