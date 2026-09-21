import { configureSession } from '@/shared/api/http';
import { useAuthStore } from './store';

/**
 * Connects the persisted auth store to the shared API client: bearer token on
 * every request, the refreshed token written back, and a rejected refresh ending
 * the session. Called once in main.tsx, before the first request can fire.
 */
export function connectSessionToHttp(): void {
  configureSession({
    getAccessToken: () => useAuthStore.getState().accessToken,
    setAccessToken: (token) => useAuthStore.getState().setAccessToken(token),
    onSessionExpired: () => {
      useAuthStore.getState().logout();
      window.location.href = '/sat/login';
    },
  });
}
