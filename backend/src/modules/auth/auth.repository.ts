import { and, eq, gt } from 'drizzle-orm';
import { db, type Transaction } from '../../core/db';
import { accessCodes, passwordResetTokens, refreshTokens, users } from '../../core/db/schema';

/**
 * All database access for authentication. Keeping queries here means the
 * service reads as policy ("is this code still usable?") rather than SQL, and
 * the column list returned to clients is defined in exactly one place.
 */

/** The user shape safe to return to a client — never includes `passwordHash`. */
export const publicUserColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  role: users.role,
} as const;

export interface PublicUser {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
}

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function findProfileById(id: string) {
  const [profile] = await db
    .select({
      ...publicUserColumns,
      teacherId: users.teacherId,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return profile ?? null;
}

export async function emailExists(email: string): Promise<boolean> {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  return row !== undefined;
}

export async function createUser(input: {
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string;
  role: 'student' | 'teacher' | 'admin';
}): Promise<PublicUser> {
  const [user] = await db.insert(users).values(input).returning(publicUserColumns);
  return user;
}

export async function updatePasswordHash(userId: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function updateName(userId: string, name: string): Promise<PublicUser | null> {
  const [updated] = await db.update(users).set({ name }).where(eq(users.id, userId)).returning(publicUserColumns);
  return updated ?? null;
}

// ── Access codes ──────────────────────────────────────────────────────────────

export async function findActiveAccessCode(code: string) {
  const [row] = await db
    .select()
    .from(accessCodes)
    .where(and(eq(accessCodes.code, code), eq(accessCodes.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function incrementAccessCodeUse(id: string, currentCount: number): Promise<void> {
  await db.update(accessCodes).set({ useCount: currentCount + 1 }).where(eq(accessCodes.id, id));
}

// ── Refresh tokens (stored as sha256 hashes, never raw) ───────────────────────

export async function storeRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  tx: Transaction | typeof db = db,
): Promise<void> {
  await tx.insert(refreshTokens).values({ userId, tokenHash, expiresAt });
}

/**
 * Deletes a stored refresh token, reporting whether this call is the one that
 * removed it. Rotation relies on that answer: a `false` means another concurrent
 * request already consumed this token, so the caller lost the race.
 */
export async function deleteRefreshToken(
  tokenHash: string,
  tx: Transaction | typeof db = db,
): Promise<boolean> {
  const deleted = await tx
    .delete(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .returning({ id: refreshTokens.id });
  return deleted.length > 0;
}

// ── Password reset tokens ─────────────────────────────────────────────────────

export async function createPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
  await db.insert(passwordResetTokens).values({ userId, token, expiresAt });
}

export async function findUnexpiredResetToken(token: string) {
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.token, token), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function markResetTokenUsed(id: string, usedAt: Date): Promise<void> {
  await db.update(passwordResetTokens).set({ usedAt }).where(eq(passwordResetTokens.id, id));
}
