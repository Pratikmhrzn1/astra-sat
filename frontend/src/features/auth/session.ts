import { installSession } from '@/shared/api/http';
import { useSessionVault } from './store';

/**
 * Connects the persisted auth store to the shared API client: bearer token on
 * every request, the refreshed token written back, and a rejected refresh ending
 * the session. Called once in main.tsx, before the first request can fire.
 */
export function bindSessionToTransport(): void {
  installSession({
    getAccessToken: () => useSessionVault.getState().accessToken,
    setAccessToken: (token) => useSessionVault.getState().setAccessToken(token),
    onSessionExpired: () => {
      useSessionVault.getState().logout();
      window.location.href = '/sat/login';
    },
  });
}
