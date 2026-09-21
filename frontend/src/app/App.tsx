import { useProactiveTokenRefresh } from '@/features/auth';
import { AppProviders } from '@/app/providers';
import { AppRouter } from '@/app/router';

/**
 * Composition root: providers, the session-refresh effect, then the routes.
 *
 * The refresh hook runs here rather than inside the router so it is mounted
 * before any page can issue its first query.
 */
export default function App() {
  useProactiveTokenRefresh();

  return (
    <AppProviders>
      <AppRouter />
    </AppProviders>
  );
}
