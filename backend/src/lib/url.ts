import { env } from '../config/env';

/**
 * Rewrites a stored `/uploads/...` path into an absolute URL.
 *
 * Uploads are stored as server-relative paths, but emails and any client on a
 * different origin need a fully-qualified URL. Apply this to every file or
 * image URL returned by the API; without PUBLIC_BASE_URL set it is a no-op.
 */
export function normalizeFileUrl(url: string | null | undefined): string | null {
  const base = env.http.publicBaseUrl;
  if (!url || !base) return url ?? null;
  const idx = url.indexOf('/uploads/');
  if (idx === -1) return url;
  return `${base}${url.slice(idx)}`;
}
