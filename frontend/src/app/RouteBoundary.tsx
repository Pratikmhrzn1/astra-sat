import { Component, Suspense, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Wraps one routed page: a loading state while its code chunk downloads, and a
 * recovery screen if it throws while rendering. Without a boundary any render
 * error unmounted the whole app to a blank white page, navigation included.
 *
 * A crash clears when the path changes. The boundary is deliberately not keyed
 * on the path: the exam player moves between sections by changing its URL and
 * relies on staying mounted across that move.
 */
export function RouteBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <PageErrorBoundary pathname={pathname}>
      <Suspense fallback={<PageLoading />}>{children}</Suspense>
    </PageErrorBoundary>
  );
}

function PageLoading() {
  return (
    <div role="status" aria-live="polite" className="min-h-[40vh] flex items-center justify-center text-ink/50 text-sm">
      Loading…
    </div>
  );
}

/** A deploy replaces hashed chunks; a tab opened before it can no longer fetch them. */
function isStaleChunkError(error: Error) {
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(error.message);
}

class PageErrorBoundary extends Component<{ children: ReactNode; pathname: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { pathname: string }) {
    if (this.state.error && prev.pathname !== this.props.pathname) this.setState({ error: null });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isStaleChunkError(error);
    return (
      <div role="alert" className="min-h-[50vh] flex flex-col items-center justify-center gap-3 p-6 text-center">
        <div className="font-display font-semibold text-[26px] text-ink">
          {stale ? 'A new version is available' : 'Something went wrong on this page'}
        </div>
        <p className="m-0 max-w-[440px] text-[14.5px] leading-[1.6] text-subtle">
          {stale
            ? 'The platform was updated while this tab was open. Reload to continue.'
            : 'Your saved work is safe. Reload the page, or head back to your dashboard.'}
        </p>
        <div className="flex gap-2.5 mt-1.5">
          <button
            onClick={() => window.location.reload()}
            className="h-10 px-5 rounded-full bg-accent-text text-white text-sm font-semibold cursor-pointer"
          >Reload</button>
          {!stale && (
            <button
              onClick={() => window.location.assign(`${import.meta.env.BASE_URL}`)}
              className="h-10 px-5 rounded-full border border-border-strong bg-white text-ink text-sm font-semibold cursor-pointer"
            >Go to dashboard</button>
          )}
        </div>
      </div>
    );
  }
}
