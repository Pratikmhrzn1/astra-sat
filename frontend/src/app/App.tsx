import { useEagerTicketRenew } from '@/features/auth';
import { RootScopes } from '@/app/providers';
import { RootRoutes } from '@/app/router';

/**
 * Composition root: providers, the session-refresh effect, then the routes.
 *
 * The refresh hook runs here rather than inside the router so it is mounted
 * before any page can issue its first query.
 */
export default function Root() {
  useEagerTicketRenew();

  return (
    <RootScopes>
      <RootRoutes />
    </RootScopes>
  );
}
