import { create } from 'zustand';
import { useEffect } from 'react';

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
      className="toast"
      style={{ pointerEvents: 'auto', color: '#fff', borderRadius: 14, padding: '10px 10px 10px 16px', display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.22)', maxWidth: 'min(460px, calc(100vw - 32px))', fontSize: 14 }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 9999, background: '#E5584A', flexShrink: 0 }} />
      <span style={{ flex: 1, lineHeight: 1.4 }}>{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        aria-label="Dismiss"
        style={{ border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', width: 28, height: 28, borderRadius: 9999, cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, fontFamily: 'inherit' }}
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
      style={{ position: 'fixed', top: 16, left: 0, right: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', padding: '0 16px' }}
    >
      {toasts.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
}
