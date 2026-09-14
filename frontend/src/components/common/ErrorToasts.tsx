import { create } from 'zustand';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

/**
 * Dark translucent toast surface, shared with the live-exam notifications.
 * `.toast` (index.css) carries the entrance and the reduced-transparency fallback.
 */
export const toastClass = 'toast material bg-[rgba(22,22,26,0.86)] text-white flex items-center gap-3 shadow-toast';

/**
 * App-wide error toasts.
 *
 * Fed by the MutationCache fallback in `app/providers.tsx`: a mutation that has
 * no `onError` of its own (deletes, mark-as-read, confirms…) used to fail with
 * no sign at all, so the student or teacher assumed it had worked.
 */
interface Toast {
  id: number;
  message: string;
}

interface ToastState {
  toasts: Toast[];
  push: (message: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;
const MAX_VISIBLE = 3;
const LIFETIME_MS = 6000;

export const useErrorToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (message) =>
    set((s) => {
      // The same failure fired twice in a row (double click, retry) shows once.
      if (s.toasts.some((t) => t.message === message)) return s;
      return { toasts: [...s.toasts, { id: nextId++, message }].slice(-MAX_VISIBLE) };
    }),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function showErrorToast(message: string) {
  useErrorToasts.getState().push(message);
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useErrorToasts((s) => s.dismiss);
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  return (
    <div
      role="alert"
      className={cn(toastClass, 'pointer-events-auto rounded-[14px] py-2.5 pr-2.5 pl-4 max-w-[min(460px,calc(100vw-32px))] text-sm')}
    >
      <span className="w-2 h-2 rounded-full bg-[#E5584A] shrink-0" />
      <span className="flex-1 leading-[1.4]">{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss"
        className="bg-white/[.12] text-white w-7 h-7 rounded-full cursor-pointer text-base leading-none shrink-0"
      >×</button>
    </div>
  );
}

export function ErrorToasts() {
  const toasts = useErrorToasts((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="assertive"
      className="fixed top-4 inset-x-0 z-[1000] flex flex-col items-center gap-2 pointer-events-none px-4"
    >
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
