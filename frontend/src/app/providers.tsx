import type { ReactNode } from 'react';
import axios from 'axios';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getApiError } from '@/shared/api/client';
import { ErrorToasts, showErrorToast } from '@/shared/ui/ErrorToasts';

/**
 * Server state lives entirely in React Query — there is no global store for it.
 *
 * `staleTime` of 30s keeps navigation between pages from refetching everything
 * that was just loaded, and a single retry covers a transient network blip
 * without making a genuinely failing request take four attempts to report.
 *
 * Mutations: one that handles its own errors keeps doing so; one that doesn't
 * gets an error toast, so an action never fails invisibly. A 401 is left to the
 * API client, which refreshes the session or sends the user to log in.
 *
 * Queries: most pages render only a loading and a data state, so a failed first
 * load used to look like an empty page or an endless spinner. That case now
 * toasts too. A background refetch failing over data already on screen stays
 * quiet, and a query whose page shows its own error sets `meta.handlesError`.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (query.state.data !== undefined || query.meta?.handlesError) return;
      if (axios.isAxiosError(error) && error.response?.status === 401) return;
      showErrorToast(`Couldn't load this page: ${getApiError(error)}`);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return;
      if (axios.isAxiosError(error) && error.response?.status === 401) return;
      showErrorToast(getApiError(error));
    },
  }),
});

/** Every cross-cutting provider the app needs, in one place. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ErrorToasts />
    </QueryClientProvider>
  );
}
