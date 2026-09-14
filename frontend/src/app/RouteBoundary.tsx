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
    <div role="status" aria-live="polite" style={{ minHeight: '40vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(11,11,14,0.5)', fontSize: 14 }}>
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
      <div role="alert" style={{ minHeight: '50vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, color: '#0B0B0E' }}>
          {stale ? 'A new version is available' : 'Something went wrong on this page'}
        </div>
        <p style={{ margin: 0, maxWidth: 440, fontSize: 14.5, lineHeight: 1.6, color: 'rgba(11,11,14,0.64)' }}>
          {stale
            ? 'The platform was updated while this tab was open. Reload to continue.'
            : 'Your saved work is safe. Reload the page, or head back to your dashboard.'}
        </p>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button
            onClick={() => window.location.reload()}
            style={{ height: 40, padding: '0 20px', borderRadius: 9999, border: 'none', background: '#C4471F', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >Reload</button>
          {!stale && (
            <button
              onClick={() => window.location.assign(`${import.meta.env.BASE_URL}`)}
              style={{ height: 40, padding: '0 20px', borderRadius: 9999, border: '1px solid #D8D4CC', background: '#fff', color: '#0B0B0E', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >Go to dashboard</button>
          )}
        </div>
      </div>
    );
  }
}
