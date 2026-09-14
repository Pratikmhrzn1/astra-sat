import { useEffect, useState } from 'react';

/**
 * Tracks browser connectivity.
 *
 * Used to warn before an action that needs the network and to trigger a resync
 * when it returns. `navigator.onLine` only reports whether an interface is up,
 * not whether the server is reachable, so treat it as a hint rather than proof.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true); const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  return online;
}
