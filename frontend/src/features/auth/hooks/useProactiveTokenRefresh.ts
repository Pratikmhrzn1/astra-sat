import { useEffect } from 'react';
import { proactiveRefresh } from '@/shared/api/client';

/**
 * Refreshes the access token when the tab regains focus, and once on mount.
 *
 * React Query refetches on window focus, so returning to a tab fires a burst of
 * requests at once. Without this, a token that expired while the tab was hidden
 * would make every one of them 401 and queue behind a single refresh. Doing it
 * first turns that cascade into one quiet request.
 *
 * Mount also matters: the page can be loaded with an already-expired token
 * restored from localStorage.
 */
export function useProactiveTokenRefresh(): void {
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void proactiveRefresh();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    void proactiveRefresh();

    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
}
