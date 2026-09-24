import { and, eq, gt } from 'drizzle-orm';
import { database, type DbTransaction } from '../../core/db';
import { enrolmentCodesTable, resetTokensTable, refreshTokensTable, accountsTable } from '../../core/db/schema';

/**
 * All database access for authentication. Keeping queries here means the
 * service reads as policy ("is this code still usable?") rather than SQL, and
 * the column list returned to clients is defined in exactly one place.
 */

/** The user shape safe to return to a client — never includes `passwordHash`. */
export const publicAccountFields = {
  id: accountsTable.id,
  email: accountsTable.email,
  name: accountsTable.name,
  role: accountsTable.role,
} as const;

export interface PublicAccount {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher' | 'admin';
  /**
   * Whether the onboarding survey is behind them. Carried on every auth payload
   * so the client can gate on it without a second request at startup.
   */
  surveyCompleted: boolean;
}

export async function loadUserByEmail(email: string) {
  const [user] = await database.select().from(accountsTable).where(eq(accountsTable.email, email)).limit(1);
  return user ?? null;
}

export async function loadUserById(id: string) {
  const [user] = await database.select().from(accountsTable).where(eq(accountsTable.id, id)).limit(1);
  return user ?? null;
}

export async function loadProfileById(id: string) {
  const [profile] = await database
    .select({
      ...publicAccountFields,
      teacherId: accountsTable.teacherId,
      createdAt: accountsTable.createdAt,
      surveyCompletedAt: accountsTable.surveyCompletedAt,
    })
    .from(accountsTable)
    .where(eq(accountsTable.id, id))
    .limit(1);
  if (!profile) return null;
  const { surveyCompletedAt, ...rest } = profile;
  return { ...rest, surveyCompleted: surveyCompletedAt !== null };
}

export async function emailTaken(email: string): Promise<boolean> {
  const [row] = await database.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.email, email)).limit(1);
  return row !== undefined;
}

export async function addUser(input: {
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string;
  role: 'student' | 'teacher' | 'admin';
}): Promise<PublicAccount> {
  const [user] = await database.insert(accountsTable).values(input).returning(publicAccountFields);
  // A brand-new account has answered nothing, by definition.
  return { ...user, surveyCompleted: false };
}

export async function editPasswordHash(userId: string, passwordHash: string): Promise<void> {
  await database.update(accountsTable).set({ passwordHash }).where(eq(accountsTable.id, userId));
}

export async function editName(userId: string, name: string): Promise<PublicAccount | null> {
  const [updated] = await database
    .update(accountsTable)
    .set({ name })
    .where(eq(accountsTable.id, userId))
    .returning({ ...publicAccountFields, surveyCompletedAt: accountsTable.surveyCompletedAt });
  if (!updated) return null;
  const { surveyCompletedAt, ...rest } = updated;
  return { ...rest, surveyCompleted: surveyCompletedAt !== null };
}

// ── Access codes ──────────────────────────────────────────────────────────────

export async function loadActiveAccessCode(code: string) {
  const [row] = await database
    .select()
    .from(enrolmentCodesTable)
    .where(and(eq(enrolmentCodesTable.code, code), eq(enrolmentCodesTable.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function bumpAccessCodeUse(id: string, currentCount: number): Promise<void> {
  await database.update(enrolmentCodesTable).set({ useCount: currentCount + 1 }).where(eq(enrolmentCodesTable.id, id));
}

// ── Refresh tokens (stored as sha256 hashes, never raw) ───────────────────────

export async function persistRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  tx: DbTransaction | typeof database = database,
): Promise<void> {
  await tx.insert(refreshTokensTable).values({ userId, tokenHash, expiresAt });
}

/**
 * Deletes a stored refresh token, reporting whether this call is the one that
 * removed it. Rotation relies on that answer: a `false` means another concurrent
 * request already consumed this token, so the caller lost the race.
 */
export async function removeRefreshToken(
  tokenHash: string,
  tx: DbTransaction | typeof database = database,
): Promise<boolean> {
  const deleted = await tx
    .delete(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, tokenHash))
    .returning({ id: refreshTokensTable.id });
  return deleted.length > 0;
}

// ── Password reset tokens ─────────────────────────────────────────────────────

export async function addPasswordResetToken(userId: string, token: string, expiresAt: Date): Promise<void> {
  await database.insert(resetTokensTable).values({ userId, token, expiresAt });
}

export async function loadUnexpiredResetToken(token: string) {
  const [row] = await database
    .select()
    .from(resetTokensTable)
    .where(and(eq(resetTokensTable.token, token), gt(resetTokensTable.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function consumeResetToken(id: string, usedAt: Date): Promise<void> {
  await database.update(resetTokensTable).set({ usedAt }).where(eq(resetTokensTable.id, id));
}
