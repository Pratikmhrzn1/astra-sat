import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toastClass } from '@/shared/ui/toast/ErrorToasts';
import { cn } from '@/shared/lib/utils';

type LiveNotification = { id: string; title: string; message: string; link: string | null };

/**
 * Polls for live-exam notifications (a session started, a result was released)
 * and shows each as a dismissible toast. Rendered once by the student layout.
 */
export function LiveNotifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<LiveNotification[]>([]);

  useEffect(() => {
    let active = true;
    async function checkNotifs() {
      try {
        // Loaded on demand so the student shell's first paint doesn't wait on it.
        const { getNotifications, markNotificationRead } = await import('../api');
        const notifs = await getNotifications();
        if (active && notifs.length > 0) {
          setNotifications(notifs);
          for (const n of notifs) markNotificationRead(n.id).catch(() => null);
        }
      } catch { /* ignore */ }
    }
    checkNotifs();
    const iv = setInterval(checkNotifs, 30000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  if (notifications.length === 0) return null;

  const dismiss = (id: string) => setNotifications((prev) => prev.filter((x) => x.id !== id));

  return (
    <div role="status" aria-live="polite" className="fixed top-[max(12px,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[999] flex flex-col gap-2 max-w-[420px] w-[calc(100%-32px)]">
      {notifications.map((n) => (
        <div key={n.id} className={cn(toastClass, 'rounded-2xl py-3 pr-3 pl-4')}>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm tracking-[-0.01em] m-0">{n.title}</p>
            <p className="text-[13px] text-white/[.72] mt-px mb-0 leading-[1.4]">{n.message}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {n.link && (
              <button onClick={() => { dismiss(n.id); navigate(n.link!); }} className="bg-white text-ink rounded-full h-8 px-3.5 text-[13px] font-semibold cursor-pointer whitespace-nowrap">View</button>
            )}
            <button aria-label="Dismiss" onClick={() => dismiss(n.id)} className="bg-white/[.14] text-white rounded-full w-8 h-8 text-[13px] cursor-pointer">✕</button>
          </div>
        </div>
      ))}
    </div>
  );
}
