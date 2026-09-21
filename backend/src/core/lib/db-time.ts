/**
 * A `timestamp without time zone` value from a raw SQL query, as a Date.
 *
 * Drizzle's typed columns write and read these as UTC. Raw `db.execute` rows,
 * though, come back as bare strings like "2026-09-12 16:57:40.974" — and
 * `new Date()` reads a string with no zone as *local* time, so on any server not
 * running in UTC every such timestamp shifts by the local offset. Always parse
 * raw timestamps through this.
 */
export function parseDbTimestamp(value: Date | string): Date {
  if (value instanceof Date) return value;
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(value);
  return new Date(hasZone ? value : `${value.replace(' ', 'T')}Z`);
}
