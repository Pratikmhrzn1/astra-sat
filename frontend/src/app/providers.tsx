import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Server state lives entirely in React Query — there is no global store for it.
 *
 * `staleTime` of 30s keeps navigation between pages from refetching everything
 * that was just loaded, and a single retry covers a transient network blip
 * without making a genuinely failing request take four attempts to report.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

/** Every cross-cutting provider the app needs, in one place. */
export function AppProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
