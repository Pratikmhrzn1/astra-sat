import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { database, type DbTransaction } from '../../core/db';
import {
  resetTokensTable,
  refreshTokensTable,
  accountsTable,
  verificationTokensTable,
  type AccountRow,
} from '../../core/db/schema';

type Executor = DbTransaction | typeof database;

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
  status: AccountRow['status'];
  emailVerified: boolean;
  /**
   * Whether the onboarding survey is behind them. Carried on every auth payload
   * so the client can gate on it without a second request at startup.
   */
  surveyCompleted: boolean;
}

export function toPublicAccount(user: AccountRow): PublicAccount {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    emailVerified: user.emailVerifiedAt !== null,
    surveyCompleted: user.surveyCompletedAt !== null,
  };
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
      status: accountsTable.status,
      emailVerifiedAt: accountsTable.emailVerifiedAt,
      surveyCompletedAt: accountsTable.surveyCompletedAt,
    })
    .from(accountsTable)
    .where(eq(accountsTable.id, id))
    .limit(1);
  if (!profile) return null;
  const { surveyCompletedAt, emailVerifiedAt, ...rest } = profile;
  return { ...rest, emailVerified: emailVerifiedAt !== null, surveyCompleted: surveyCompletedAt !== null };
}

export async function emailTaken(email: string): Promise<boolean> {
  const [row] = await database.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.email, email)).limit(1);
  return row !== undefined;
}

/** A public signup: always a pending, unverified student. */
export async function addPendingStudent(input: {
  email: string;
  name: string;
  phone: string;
  passwordHash: string;
}): Promise<AccountRow> {
  const [user] = await database
    .insert(accountsTable)
    .values({ ...input, role: 'student', status: 'pending' })
    .returning();
  return user;
}

export async function editPasswordHash(userId: string, passwordHash: string, tx: Executor = database): Promise<void> {
  await tx.update(accountsTable).set({ passwordHash, updatedAt: new Date() }).where(eq(accountsTable.id, userId));
}

// ── Failed-login lockout ──────────────────────────────────────────────────────

export async function recordLoginFailure(
  userId: string,
  state: { failedLoginAttempts: number; lockedUntil: Date | null },
): Promise<void> {
  await database.update(accountsTable).set(state).where(eq(accountsTable.id, userId));
}

export async function clearLoginFailures(userId: string): Promise<void> {
  await database
    .update(accountsTable)
    .set({ failedLoginAttempts: 0, lockedUntil: null })
    .where(eq(accountsTable.id, userId));
}

export async function editName(userId: string, name: string): Promise<PublicAccount | null> {
  const [updated] = await database
    .update(accountsTable)
    .set({ name, updatedAt: new Date() })
    .where(eq(accountsTable.id, userId))
    .returning();
  return updated ? toPublicAccount(updated) : null;
}

// ── Email verification tokens (stored as sha256 hashes, never raw) ────────────

export async function addVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  // `createdAt` is stamped here rather than left to the column's NOW() default:
  // the resend cooldown compares it with Date.now(), and NOW() writes the DB
  // server's local wall-clock time into this zone-less column, which Drizzle
  // then reads back as UTC.
  await database.insert(verificationTokensTable).values({ userId, tokenHash, expiresAt, createdAt: new Date() });
}

export async function loadVerificationToken(tokenHash: string) {
  const [row] = await database
    .select()
    .from(verificationTokensTable)
    .where(eq(verificationTokensTable.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

export async function latestVerificationToken(userId: string) {
  const [row] = await database
    .select({ createdAt: verificationTokensTable.createdAt })
    .from(verificationTokensTable)
    .where(eq(verificationTokensTable.userId, userId))
    .orderBy(desc(verificationTokensTable.createdAt))
    .limit(1);
  return row ?? null;
}

/** Consumes the token and stamps the account verified, together. */
export async function consumeVerificationToken(tokenId: string, userId: string): Promise<void> {
  const now = new Date();
  await database.transaction(async (tx) => {
    await tx.update(verificationTokensTable).set({ consumedAt: now }).where(eq(verificationTokensTable.id, tokenId));
    await tx
      .update(accountsTable)
      .set({ emailVerifiedAt: now, updatedAt: now })
      .where(and(eq(accountsTable.id, userId), isNull(accountsTable.emailVerifiedAt)));
  });
}

// ── Refresh tokens (stored as sha256 hashes, never raw) ───────────────────────

export async function persistRefreshToken(
  userId: string,
  tokenHash: string,
  expiresAt: Date,
  tx: Executor = database,
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
  tx: Executor = database,
): Promise<boolean> {
  const deleted = await tx
    .delete(refreshTokensTable)
    .where(eq(refreshTokensTable.tokenHash, tokenHash))
    .returning({ id: refreshTokensTable.id });
  return deleted.length > 0;
}

/**
 * Signs a user out everywhere, optionally sparing the session making the
 * request (a password change keeps the tab that made it signed in).
 */
export async function revokeRefreshTokens(userId: string, exceptHash?: string, tx: Executor = database): Promise<void> {
  await tx
    .delete(refreshTokensTable)
    .where(
      exceptHash
        ? and(eq(refreshTokensTable.userId, userId), ne(refreshTokensTable.tokenHash, exceptHash))
        : eq(refreshTokensTable.userId, userId),
    );
}

// ── Password reset tokens (the `token` column holds a sha256 hash) ────────────

/** Replaces any outstanding reset link: only the newest one ever works. */
export async function replacePasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.delete(resetTokensTable).where(eq(resetTokensTable.userId, userId));
    await tx.insert(resetTokensTable).values({ userId, token: tokenHash, expiresAt });
  });
}

export async function loadResetToken(tokenHash: string) {
  const [row] = await database.select().from(resetTokensTable).where(eq(resetTokensTable.token, tokenHash)).limit(1);
  return row ?? null;
}

/** Marks the link used, sets the password, and signs the user out everywhere, together. */
export async function completeReset(tokenId: string, userId: string, passwordHash: string): Promise<void> {
  await database.transaction(async (tx) => {
    await tx.update(resetTokensTable).set({ usedAt: new Date() }).where(eq(resetTokensTable.id, tokenId));
    await editPasswordHash(userId, passwordHash, tx);
    await revokeRefreshTokens(userId, undefined, tx);
  });
}

/** Changes the password and drops every other session, together. */
export async function changePasswordKeepingSession(userId: string, passwordHash: string, keepHash?: string): Promise<void> {
  await database.transaction(async (tx) => {
    await editPasswordHash(userId, passwordHash, tx);
    await revokeRefreshTokens(userId, keepHash, tx);
  });
}
