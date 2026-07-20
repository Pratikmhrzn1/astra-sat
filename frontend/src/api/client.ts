import axios from 'axios';
import { useAuthStore } from '../store/auth';

const API_BASE = import.meta.env.VITE_API_URL || '';

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // send the httpOnly refresh-token cookie on every request
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token!);
  });
  failedQueue = [];
}

function decodeTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

async function doRefresh(): Promise<string> {
  const response = await axios.post(
    `${API_BASE}/api/auth/refresh`,
    {},
    { withCredentials: true },
  );
  return response.data.accessToken as string;
}

// Called on tab-focus before any API calls fire. Refreshes the token silently if
// it's expired or within 60 seconds of expiry, so React Query's refetchOnWindowFocus
// burst doesn't hit the backend with a wave of 401s.
export async function proactiveRefresh(): Promise<void> {
  if (isRefreshing) return;
  const { accessToken, setAccessToken } = useAuthStore.getState();
  if (!accessToken) return;
  const exp = decodeTokenExp(accessToken);
  if (exp === null || Date.now() / 1000 < exp - 60) return;

  isRefreshing = true;
  try {
    const newToken = await doRefresh();
    setAccessToken(newToken);
    processQueue(null, newToken);
  } catch {
    // Proactive refresh failed silently. Drain any requests that piled up
    // so they fall through to the normal 401 → refresh flow on retry.
    processQueue(new Error('proactive-refresh-failed'), null);
  } finally {
    isRefreshing = false;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newToken = await doRefresh();
        useAuthStore.getState().setAccessToken(newToken);
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Only force-logout when the refresh endpoint explicitly rejects the session
        // (401). Network errors or 5xx should not log the user out.
        if (axios.isAxiosError(refreshError) && refreshError.response?.status === 401) {
          useAuthStore.getState().logout();
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export function getApiError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.message || 'An error occurred';
  }
  return 'An unexpected error occurred';
}
