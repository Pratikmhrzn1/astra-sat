import crypto from 'crypto';
import { invalidRequest, stateConflict, missing, notAuthenticated, notPermitted, ServiceError } from '../../core/errors';
import { settings } from '../../core/config/env';
import { secretMatches, hashSecret, DUMMY_HASH } from '../../core/lib/password';
import { mintAccessToken, readRefreshToken } from '../../core/lib/jwt';
import { mailEmailVerification, mailPasswordReset } from '../../core/lib/email';
import type { AccountRow } from '../../core/db/schema';
import * as repo from './auth.repository';
import * as tokens from './auth.tokens';
import type {
  ChangePasswordPayload,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResendVerificationPayload,
  ResetPasswordPayload,
  VerifyEmailPayload,
} from './auth.schemas';

/**
 * Sign-up, sign-in and account recovery.
 *
 * A public signup has to pass two gates before it can hold a session: the
 * owner confirms their email address, then an admin approves the account.
 * `assertUsable` enforces both at login AND at every refresh. A deactivated
 * account therefore loses access within one access-token lifetime (15 min),
 * without a database hit on every request.
 *
 * Every emailed token (verification, reset) is 32 random bytes. Only its
 * sha256 is stored, so a database leak yields no working links.
 */

/** Same-address resends inside this window are ignored, so nobody can flood an inbox. */
const RESEND_COOLDOWN_MS = 60_000;

export interface SessionGrant {
  accessToken: string;
  refreshToken: string;
  user: repo.PublicAccount;
}

function newEmailToken(): { raw: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  return { raw, hash: tokens.digestToken(raw) };
}

function logMailFailure(kind: string) {
  return (err: unknown) => console.error(`[auth] ${kind} email failed:`, err);
}

/** The gates every account must pass to get, or keep refreshing, a session. */
export function assertUsable(user: Pick<AccountRow, 'status' | 'emailVerifiedAt'>): void {
  if (user.emailVerifiedAt === null) {
    throw notPermitted('Please verify your email address before signing in.').withCode('EMAIL_NOT_VERIFIED');
  }
  switch (user.status) {
    case 'pending':
      throw notPermitted('Your account is awaiting administrator approval.').withCode('ACCOUNT_PENDING');
    case 'rejected':
      throw notPermitted('This account was not approved.').withCode('ACCOUNT_REJECTED');
    case 'deactivated':
      throw notPermitted('This account has been deactivated.').withCode('ACCOUNT_DEACTIVATED');
    case 'active':
      return;
  }
}

function lockedError(lockedUntil: Date): ServiceError {
  const minutesRemaining = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000));
  return notAuthenticated(
    `Too many failed attempts. Try again in ${minutesRemaining} minute${minutesRemaining === 1 ? '' : 's'}.`,
  )
    .withCode('ACCOUNT_LOCKED')
    .withMeta({ minutesRemaining });
}

/**
 * The lockout state after one more wrong password. Once a lock window has
 * passed, the count starts again from zero. Otherwise a stale count at the
 * threshold would re-lock the account on its very next mistake.
 */
function nextFailureState(user: Pick<AccountRow, 'failedLoginAttempts' | 'lockedUntil'>) {
  const lockExpired = user.lockedUntil !== null && user.lockedUntil.getTime() <= Date.now();
  const failedLoginAttempts = (lockExpired ? 0 : user.failedLoginAttempts) + 1;
  const lockedUntil =
    failedLoginAttempts >= settings.auth.loginMaxFailures ? new Date(Date.now() + settings.auth.loginLockoutMs) : null;
  return { failedLoginAttempts, lockedUntil };
}

async function sendVerification(user: Pick<AccountRow, 'id' | 'email' | 'name'>): Promise<void> {
  const token = newEmailToken();
  await repo.addVerificationToken(user.id, token.hash, new Date(Date.now() + settings.auth.emailVerificationTtlMs));
  void mailEmailVerification(user.email, user.name, token.raw).catch(logMailFailure('Verification'));
}

async function issueSession(user: AccountRow): Promise<SessionGrant> {
  const publicUser = repo.toPublicAccount(user);
  return {
    accessToken: mintAccessToken(publicUser),
    refreshToken: await tokens.grantRefreshToken(user.id),
    user: publicUser,
  };
}

// ── Sign-up and verification ─────────────────────────────────────────────────

/** Creates a pending student and emails the verification link. Issues no session. */
export async function signUp(input: RegisterPayload): Promise<void> {
  const taken = () => stateConflict('An account with this email already exists').withCode('EMAIL_TAKEN');
  if (await repo.emailTaken(input.email)) throw taken();

  let user: AccountRow;
  try {
    user = await repo.addPendingStudent({
      email: input.email,
      name: input.name,
      phone: input.phone,
      passwordHash: await hashSecret(input.password),
    });
  } catch (err) {
    // Two signups for one address racing past the check above.
    if ((err as { code?: string }).code === '23505') throw taken();
    throw err;
  }

  await sendVerification(user);
}

export async function confirmEmail({ token }: VerifyEmailPayload): Promise<void> {
  const row = await repo.loadVerificationToken(tokens.digestToken(token));
  if (!row) throw invalidRequest('This verification link is invalid.').withCode('INVALID_TOKEN');
  if (row.consumedAt) throw invalidRequest('This verification link has already been used.').withCode('TOKEN_USED');
  if (row.expiresAt.getTime() <= Date.now()) {
    throw invalidRequest('This verification link has expired.').withCode('TOKEN_EXPIRED');
  }
  await repo.consumeVerificationToken(row.id, row.userId);
}

/**
 * Always succeeds, whatever the address. A different answer for unknown or
 * already-verified accounts would let anyone probe which emails are registered.
 */
export async function resendVerification({ email }: ResendVerificationPayload): Promise<void> {
  const user = await repo.loadUserByEmail(email);
  if (!user || user.emailVerifiedAt || user.status === 'rejected' || user.status === 'deactivated') return;

  const last = await repo.latestVerificationToken(user.id);
  if (last && Date.now() - last.createdAt.getTime() < RESEND_COOLDOWN_MS) return;

  await sendVerification(user);
}

/** The admin-side resend. Skips the cooldown, and says why when there's nothing to send. */
export async function resendVerificationFor(userId: string): Promise<void> {
  const user = await repo.loadUserById(userId);
  if (!user) throw missing('User not found');
  if (user.emailVerifiedAt) throw stateConflict('This email address is already verified').withCode('ALREADY_VERIFIED');
  await sendVerification(user);
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function signIn({ email, password }: LoginPayload): Promise<SessionGrant> {
  const user = await repo.loadUserByEmail(email);

  // Unknown email and locked account both still pay for a bcrypt compare, so
  // the response time doesn't reveal which case it was.
  if (!user) {
    await secretMatches(password, DUMMY_HASH);
    throw notAuthenticated('Invalid email or password').withCode('INVALID_CREDENTIALS');
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await secretMatches(password, DUMMY_HASH);
    throw lockedError(user.lockedUntil);
  }

  if (!(await secretMatches(password, user.passwordHash))) {
    const next = nextFailureState(user);
    await repo.recordLoginFailure(user.id, next);
    if (next.lockedUntil) throw lockedError(next.lockedUntil);
    throw notAuthenticated('Invalid email or password')
      .withCode('INVALID_CREDENTIALS')
      .withMeta({ attemptsRemaining: settings.auth.loginMaxFailures - next.failedLoginAttempts });
  }

  // Checked only after the password, so these messages never confirm that an
  // address exists to someone who doesn't know its password.
  assertUsable(user);

  if (user.failedLoginAttempts !== 0 || user.lockedUntil !== null) await repo.clearLoginFailures(user.id);
  return issueSession(user);
}

/**
 * Exchanges a refresh token for a new pair.
 *
 * The signature is verified before any database work so a tampered or expired
 * token is rejected cheaply. On losing the rotation race we wait briefly and
 * re-read the grace map: the winning tab publishes there, and without this a
 * second browser tab would log the user out.
 */
export async function renewSession(rawToken: string | undefined): Promise<tokens.RotationOutcome> {
  if (!rawToken) throw notAuthenticated('No refresh token');

  let userId: string;
  try {
    userId = readRefreshToken(rawToken).sub;
  } catch {
    throw notAuthenticated('Invalid or expired refresh token');
  }

  const oldHash = tokens.digestToken(rawToken);

  const cached = tokens.lookupGraceEntry(oldHash);
  if (cached) return cached;

  // Reloaded so the new access token carries the current role/name/email, and
  // so a deactivated account stops being able to refresh.
  const user = await repo.loadUserById(userId);
  if (!user) throw notAuthenticated('User not found');
  assertUsable(user);

  const rotated = await tokens.cycleRefreshToken(oldHash, user);
  if (rotated) return rotated;

  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  const afterRace = tokens.lookupGraceEntry(oldHash);
  if (afterRace) return afterRace;

  throw notAuthenticated('Invalid refresh token');
}

export async function signOut(rawToken: string | undefined): Promise<void> {
  if (rawToken) await tokens.voidRefreshToken(rawToken);
}

// ── Profile and passwords ────────────────────────────────────────────────────

export async function fetchAccountProfile(userId: string) {
  const profile = await repo.loadProfileById(userId);
  if (!profile) throw missing('User not found');
  return profile;
}

/** Changes the password and signs out every other session. The one making the change stays. */
export async function replacePassword(
  userId: string,
  input: ChangePasswordPayload,
  currentRefreshToken: string | undefined,
): Promise<void> {
  const user = await repo.loadUserById(userId);
  if (!user) throw missing('User not found');

  const valid = await secretMatches(input.currentPassword, user.passwordHash);
  if (!valid) throw invalidRequest('Current password is incorrect').withCode('INVALID_CURRENT_PASSWORD');

  await repo.changePasswordKeepingSession(
    user.id,
    await hashSecret(input.newPassword),
    currentRefreshToken ? tokens.digestToken(currentRefreshToken) : undefined,
  );
}

export async function editProfile(userId: string, name: string): Promise<repo.PublicAccount> {
  const updated = await repo.editName(userId, name);
  if (!updated) throw missing('User not found');
  return updated;
}

/**
 * Always succeeds, whether or not the email is registered — a different
 * response for unknown addresses would turn this into an account-enumeration
 * oracle. Failure is only ever visible in the logs.
 */
export async function beginPasswordReset({ email }: ForgotPasswordPayload): Promise<void> {
  const user = await repo.loadUserByEmail(email);
  if (!user || user.status === 'deactivated') return;

  const token = newEmailToken();
  await repo.replacePasswordResetToken(user.id, token.hash, new Date(Date.now() + settings.auth.passwordResetTtlMs));
  void mailPasswordReset(user.email, user.name, token.raw).catch(logMailFailure('Password reset'));
}

/** Sets the new password and signs the account out everywhere. */
export async function completePasswordReset({ token, password }: ResetPasswordPayload): Promise<void> {
  const row = await repo.loadResetToken(tokens.digestToken(token));
  if (!row) throw invalidRequest('This reset link is invalid or has expired.').withCode('INVALID_TOKEN');
  if (row.usedAt) throw invalidRequest('This reset link has already been used.').withCode('TOKEN_USED');
  if (row.expiresAt.getTime() <= Date.now()) {
    throw invalidRequest('This reset link has expired.').withCode('TOKEN_EXPIRED');
  }

  await repo.completeReset(row.id, row.userId, await hashSecret(password));
}
