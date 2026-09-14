import crypto from 'crypto';
import { badRequest, conflict, notFound, tooManyRequests, unauthorized } from '../../core/errors';
import { LockoutTracker } from '../../core/lib/rate-limit';
import { comparePassword, hashPassword } from '../../core/lib/password';
import { signAccessToken, verifyRefreshToken } from '../../core/lib/jwt';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../../core/lib/email';
import * as repo from './auth.repository';
import * as tokens from './auth.tokens';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from './auth.schemas';

/**
 * Locks an account after 10 consecutive failures for 15 minutes. Keyed by email
 * rather than IP: the attack this defends against is password-guessing a known
 * account, and an attacker rotating IPs would otherwise reset the counter.
 */
const LOGIN_MAX_FAILURES = 10;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginLockout = new LockoutTracker(LOGIN_MAX_FAILURES, LOGIN_LOCKOUT_MS);

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

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: repo.PublicUser;
}

export async function register(input: RegisterInput): Promise<AuthResult> {
  const { email, name, phone, password, accessCode } = input;

  // The access code decides the role, so it is checked before anything else.
  const code = await repo.findActiveAccessCode(accessCode);
  if (!code) throw badRequest('Invalid or inactive access code');
  if (code.maxUses !== null && code.useCount >= code.maxUses) {
    throw badRequest('Access code has reached its usage limit');
  }

  if (await repo.emailExists(email)) {
    throw conflict('An account with this email already exists');
  }
  if (code.role === 'student' && !phone?.trim()) {
    throw badRequest('Phone number is required for student accounts');
  }

  const user = await repo.createUser({
    email,
    name,
    phone: phone?.trim() ?? null,
    passwordHash: await hashPassword(password),
    role: code.role,
  });
  await repo.incrementAccessCodeUse(code.id, code.useCount);

  // Non-blocking: a mail outage must not fail an otherwise complete signup.
  void sendWelcomeEmail(user.email, user.name, password).catch((err) =>
    console.error('[auth] Welcome email failed:', err),
  );

  return {
    accessToken: signAccessToken(user),
    refreshToken: await tokens.issueRefreshToken(user.id),
    user,
  };
}

export async function login({ email, password }: LoginInput): Promise<AuthResult> {
  // Checked before bcrypt so a locked account costs no CPU to reject.
  const lockedFor = loginLockout.lockedFor(email);
  if (lockedFor > 0) {
    throw tooManyRequests(
      `Too many failed login attempts. Please try again in ${minutesPhrase(lockedFor)}.`,
      { retryAfterSeconds: lockedFor },
    );
  }

  const user = await repo.findUserByEmail(email);
  const passwordValid = await comparePassword(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordValid) {
    const { attemptsRemaining, locked } = loginLockout.recordFailure(email);
    if (locked) {
      throw tooManyRequests('Too many failed login attempts. Account locked for 15 minutes.', {
        retryAfterSeconds: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
      });
    }
    throw unauthorized('Invalid email or password').withMeta({ attemptsRemaining });
  }

  loginLockout.reset(email);

  const publicUser: repo.PublicUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };

  return {
    accessToken: signAccessToken(publicUser),
    refreshToken: await tokens.issueRefreshToken(user.id),
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
export async function refresh(rawToken: string | undefined): Promise<tokens.RotationResult> {
  if (!rawToken) throw unauthorized('No refresh token');

  let userId: string;
  try {
    userId = verifyRefreshToken(rawToken).sub;
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }

  const oldHash = tokens.hashToken(rawToken);

  const cached = tokens.readGraceEntry(oldHash);
  if (cached) return cached;

  // Reloaded so the new access token carries the current role/name/email.
  const user = await repo.findUserById(userId);
  if (!user) throw unauthorized('User not found');

  const rotated = await tokens.rotateRefreshToken(oldHash, user);
  if (rotated) return rotated;

  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  const afterRace = tokens.readGraceEntry(oldHash);
  if (afterRace) return afterRace;

  throw unauthorized('Invalid refresh token');
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (rawToken) await tokens.revokeRefreshToken(rawToken);
}

export async function getProfile(userId: string) {
  const profile = await repo.findProfileById(userId);
  if (!profile) throw notFound('User not found');
  return profile;
}

export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const user = await repo.findUserById(userId);
  if (!user) throw notFound('User not found');

  const valid = await comparePassword(input.currentPassword, user.passwordHash);
  if (!valid) throw badRequest('Current password is incorrect');

  await repo.updatePasswordHash(user.id, await hashPassword(input.newPassword));
}

export async function updateProfile(userId: string, name: string): Promise<repo.PublicUser> {
  const updated = await repo.updateName(userId, name);
  if (!updated) throw notFound('User not found');
  return updated;
}

/**
 * Always succeeds, whether or not the email is registered — a different
 * response for unknown addresses would turn this into an account-enumeration
 * oracle. Failure is only ever visible in the logs.
 */
export async function requestPasswordReset({ email }: ForgotPasswordInput): Promise<void> {
  const user = await repo.findUserByEmail(email);
  if (!user) return;

  const token = crypto.randomBytes(32).toString('hex');
  await repo.createPasswordResetToken(user.id, token, new Date(Date.now() + 60 * 60 * 1000));

  void sendPasswordResetEmail(user.email, user.name, token).catch((err) =>
    console.error('[auth] Password reset email failed:', err),
  );
}

export async function resetPassword({ token, password }: ResetPasswordInput): Promise<void> {
  const row = await repo.findUnexpiredResetToken(token);
  if (!row) throw badRequest('Reset link is invalid or has expired');
  if (row.usedAt) throw badRequest('Reset link has already been used');

  await repo.updatePasswordHash(row.userId, await hashPassword(password));
  await repo.markResetTokenUsed(row.id, new Date());
}
