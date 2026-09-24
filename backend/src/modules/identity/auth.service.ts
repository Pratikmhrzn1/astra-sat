import crypto from 'crypto';
import { invalidRequest, stateConflict, missing, rateLimited, notAuthenticated } from '../../core/errors';
import { LockoutRegistry } from '../../core/lib/rate-limit';
import { secretMatches, hashSecret } from '../../core/lib/password';
import { mintAccessToken, readRefreshToken } from '../../core/lib/jwt';
import { mailPasswordReset, mailWelcome } from '../../core/lib/email';
import * as repo from './auth.repository';
import * as tokens from './auth.tokens';
import type {
  ChangePasswordPayload,
  ForgotPasswordPayload,
  LoginPayload,
  RegisterPayload,
  ResetPasswordPayload,
} from './auth.schemas';

/**
 * Locks an account after 10 consecutive failures for 15 minutes. Keyed by email
 * rather than IP: the attack this defends against is password-guessing a known
 * account, and an attacker rotating IPs would otherwise reset the counter.
 */
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginLockout = new LockoutRegistry(LOGIN_MAX_FAILURES, LOGIN_LOCKOUT_MS);

/**
 * A valid-shaped bcrypt hash that matches nothing. Comparing against it when no
 * user exists keeps the response time of "unknown email" and "wrong password"
 * indistinguishable, so login cannot be used to enumerate accounts.
 */
const DUMMY_HASH = '$2b$12$invalidhashplaceholderXXXXXXXXXXXXXXXXXXXXXX';

function minutesPhrase(seconds: number): string {
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

export interface SessionGrant {
  accessToken: string;
  refreshToken: string;
  user: repo.PublicAccount;
}

export async function signUp(input: RegisterPayload): Promise<SessionGrant> {
  const { email, name, phone, password, accessCode } = input;

  // The access code decides the role, so it is checked before anything else.
  const code = await repo.loadActiveAccessCode(accessCode);
  if (!code) throw invalidRequest('Invalid or inactive access code');
  if (code.maxUses !== null && code.useCount >= code.maxUses) {
    throw invalidRequest('Access code has reached its usage limit');
  }

  if (await repo.emailTaken(email)) {
    throw stateConflict('An account with this email already exists');
  }
  if (code.role === 'student' && !phone?.trim()) {
    throw invalidRequest('Phone number is required for student accounts');
  }

  const user = await repo.addUser({
    email,
    name,
    phone: phone?.trim() ?? null,
    passwordHash: await hashSecret(password),
    role: code.role,
  });
  await repo.bumpAccessCodeUse(code.id, code.useCount);

  // Non-blocking: a mail outage must not fail an otherwise complete signup.
  void mailWelcome(user.email, user.name, password).catch((err) =>
    console.error('[auth] Welcome email failed:', err),
  );

  return {
    accessToken: mintAccessToken(user),
    refreshToken: await tokens.grantRefreshToken(user.id),
    user,
  };
}

export async function signIn({ email, password }: LoginPayload): Promise<SessionGrant> {
  // Checked before bcrypt so a locked account costs no CPU to reject.
  const lockedFor = loginLockout.lockedFor(email);
  if (lockedFor > 0) {
    throw rateLimited(
      `Too many failed login attempts. Please try again in ${minutesPhrase(lockedFor)}.`,
      { retryAfterSeconds: lockedFor },
    );
  }

  const user = await repo.loadUserByEmail(email);
  const passwordValid = await secretMatches(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordValid) {
    const { attemptsRemaining, locked } = loginLockout.recordFailure(email);
    if (locked) {
      throw rateLimited('Too many failed login attempts. Account locked for 15 minutes.', {
        retryAfterSeconds: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
      });
    }
    throw notAuthenticated('Invalid email or password').withMeta({ attemptsRemaining });
  }

  loginLockout.reset(email);

  const publicUser: repo.PublicAccount = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    surveyCompleted: user.surveyCompletedAt !== null,
  };

  return {
    accessToken: mintAccessToken(publicUser),
    refreshToken: await tokens.grantRefreshToken(user.id),
    user: publicUser,
  };
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

  // Reloaded so the new access token carries the current role/name/email.
  const user = await repo.loadUserById(userId);
  if (!user) throw notAuthenticated('User not found');

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

export async function fetchAccountProfile(userId: string) {
  const profile = await repo.loadProfileById(userId);
  if (!profile) throw missing('User not found');
  return profile;
}

export async function replacePassword(userId: string, input: ChangePasswordPayload): Promise<void> {
  const user = await repo.loadUserById(userId);
  if (!user) throw missing('User not found');

  const valid = await secretMatches(input.currentPassword, user.passwordHash);
  if (!valid) throw invalidRequest('Current password is incorrect');

  await repo.editPasswordHash(user.id, await hashSecret(input.newPassword));
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
  if (!user) return;

  const token = crypto.randomBytes(32).toString('hex');
  await repo.addPasswordResetToken(user.id, token, new Date(Date.now() + 60 * 60 * 1000));

  void mailPasswordReset(user.email, user.name, token).catch((err) =>
    console.error('[auth] Password reset email failed:', err),
  );
}

export async function completePasswordReset({ token, password }: ResetPasswordPayload): Promise<void> {
  const row = await repo.loadUnexpiredResetToken(token);
  if (!row) throw invalidRequest('Reset link is invalid or has expired');
  if (row.usedAt) throw invalidRequest('Reset link has already been used');

  await repo.editPasswordHash(row.userId, await hashSecret(password));
  await repo.consumeResetToken(row.id, new Date());
}
