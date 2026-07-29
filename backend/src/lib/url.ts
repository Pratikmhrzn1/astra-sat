export function normalizeFileUrl(url: string | null | undefined): string | null {
  const base = process.env.PUBLIC_BASE_URL;
  if (!url || !base) return url ?? null;
  const idx = url.indexOf('/uploads/');
  if (idx === -1) return url;
  return `${base}${url.slice(idx)}`;
}
