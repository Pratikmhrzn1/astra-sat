import type { AccountRow } from '../../core/db/schema';

/**
 * Derived account state. "Expired" is never stored: it is computed from
 * `expiry_date` whenever it is needed, so moving an expiry date (or clearing
 * it) takes effect immediately, with nothing to keep in sync.
 */

export const DAY_MS = 86_400_000;

export type EffectiveStatus = AccountRow['status'] | 'expired';

export function isExpired(user: Pick<AccountRow, 'expiryDate'>, now = Date.now()): boolean {
  return user.expiryDate !== null && user.expiryDate.getTime() <= now;
}

/** What the admin sees: an active account past its expiry date reads as "expired". */
export function effectiveStatus(user: Pick<AccountRow, 'status' | 'expiryDate'>): EffectiveStatus {
  return user.status === 'active' && isExpired(user) ? 'expired' : user.status;
}

export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}
