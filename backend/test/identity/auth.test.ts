import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { database } from '../../src/core/db';
import { enrolmentCodesTable, resetTokensTable, verificationTokensTable } from '../../src/core/db/schema';
import { settings } from '../../src/core/config/env';
import { testOutbox } from '../../src/core/lib/email';
import {
  PASSWORD,
  adminSession,
  api,
  createActiveUser,
  loadUser,
  login,
  refresh,
  tokenFromOutbox,
} from '../helpers';

const STUDENT = { email: 'student@example.test', name: 'Sam Student', phone: '9800000000', password: PASSWORD };

const register = (body: Record<string, unknown> = STUDENT) => api().post('/api/auth/register').send(body);
const attemptLogin = (email: string, password = PASSWORD) => api().post('/api/auth/login').send({ email, password });

describe('signup → verify → approve → login', () => {
  it('walks the whole lifecycle, gated at every step', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.body.accessToken).toBeUndefined();

    const created = await loadUser(STUDENT.email);
    expect(created).toMatchObject({ role: 'student', status: 'pending', emailVerifiedAt: null });

    expect((await attemptLogin(STUDENT.email)).body.code).toBe('EMAIL_NOT_VERIFIED');

    const token = tokenFromOutbox(STUDENT.email, '/verify-email');
    expect((await api().post('/api/auth/verify-email').send({ token })).status).toBe(200);

    const pending = await attemptLogin(STUDENT.email);
    expect(pending.status).toBe(403);
    expect(pending.body.code).toBe('ACCOUNT_PENDING');

    const admin = await adminSession();
    const approved = await api()
      .post(`/api/admin/users/${created.id}/approve`)
      .set('Authorization', `Bearer ${admin.accessToken}`);
    expect(approved.status).toBe(200);
    expect(testOutbox.some((m) => m.to === STUDENT.email && /approved/i.test(m.subject))).toBe(true);

    const ok = await attemptLogin(STUDENT.email);
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ email: STUDENT.email, role: 'student' });
  });

  it('rejects a second signup for the same address', async () => {
    await register();
    const again = await register();
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('EMAIL_TAKEN');
  });

  it('ignores access codes: even the old 000000 admin code makes a pending student', async () => {
    expect(await database.select().from(enrolmentCodesTable).where(eq(enrolmentCodesTable.code, '000000'))).toHaveLength(0);

    const res = await register({ ...STUDENT, accessCode: '000000' });
    expect(res.status).toBe(201);
    expect(await loadUser(STUDENT.email)).toMatchObject({ role: 'student', status: 'pending' });
  });

  it('does not let an admin approve an account twice', async () => {
    await register();
    const { id } = await loadUser(STUDENT.email);
    const admin = await adminSession();
    const approve = () => api().post(`/api/admin/users/${id}/approve`).set('Authorization', `Bearer ${admin.accessToken}`);
    expect((await approve()).status).toBe(200);
    const second = await approve();
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('NOT_PENDING');
  });
});

describe('verification links', () => {
  const verify = (token: string) => api().post('/api/auth/verify-email').send({ token });

  it('rejects unknown, reused and expired tokens', async () => {
    expect((await verify('not-a-real-token')).body.code).toBe('INVALID_TOKEN');

    await register();
    const token = tokenFromOutbox(STUDENT.email, '/verify-email');
    expect((await verify(token)).status).toBe(200);
    const reused = await verify(token);
    expect(reused.status).toBe(400);
    expect(reused.body.code).toBe('TOKEN_USED');
  });

  it('rejects an expired token', async () => {
    await register();
    const token = tokenFromOutbox(STUDENT.email, '/verify-email');
    await database.update(verificationTokensTable).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await verify(token)).body.code).toBe('TOKEN_EXPIRED');
  });
});

describe('lockout', () => {
  it('locks after the configured number of failures, in the database, until an admin unlocks', async () => {
    const user = await createActiveUser({ email: 'locky@example.test' });
    const max = settings.auth.loginMaxFailures;

    for (let i = 1; i < max; i++) {
      const res = await attemptLogin(user.email, 'wrong-password');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    }
    const locking = await attemptLogin(user.email, 'wrong-password');
    expect(locking.body.code).toBe('ACCOUNT_LOCKED');

    // Persisted, so it would survive a restart.
    const stored = await loadUser(user.email);
    expect(stored.failedLoginAttempts).toBe(max);
    expect(stored.lockedUntil!.getTime()).toBeGreaterThan(Date.now());

    // The right password doesn't get through while locked.
    const locked = await attemptLogin(user.email);
    expect(locked.status).toBe(401);
    expect(locked.body.code).toBe('ACCOUNT_LOCKED');
    expect(locked.body.minutesRemaining).toBeGreaterThan(0);

    const admin = await adminSession();
    const unlock = await api().post(`/api/admin/users/${user.id}/unlock`).set('Authorization', `Bearer ${admin.accessToken}`);
    expect(unlock.status).toBe(200);
    expect((await attemptLogin(user.email)).status).toBe(200);
  });

  it('resets the failure counter after a successful login', async () => {
    const user = await createActiveUser({ email: 'oops@example.test' });
    await attemptLogin(user.email, 'wrong-password');
    await attemptLogin(user.email);
    expect((await loadUser(user.email)).failedLoginAttempts).toBe(0);
  });
});

describe('account status', () => {
  it('a deactivated account can neither refresh nor log in, and reactivation restores it', async () => {
    const user = await createActiveUser({ email: 'leaver@example.test' });
    const session = await login(user.email);
    const admin = await adminSession();
    const as = (path: string) => api().post(`/api/admin/users/${user.id}/${path}`).set('Authorization', `Bearer ${admin.accessToken}`);

    expect((await as('deactivate')).status).toBe(200);
    const refreshed = await refresh(session.cookie);
    expect([401, 403]).toContain(refreshed.status);
    expect((await attemptLogin(user.email)).body.code).toBe('ACCOUNT_DEACTIVATED');

    expect((await as('reactivate')).status).toBe(200);
    expect((await attemptLogin(user.email)).status).toBe(200);
  });

  it('a rejected signup cannot log in', async () => {
    await register();
    await api().post('/api/auth/verify-email').send({ token: tokenFromOutbox(STUDENT.email, '/verify-email') });
    const { id } = await loadUser(STUDENT.email);
    const admin = await adminSession();
    expect((await api().post(`/api/admin/users/${id}/reject`).set('Authorization', `Bearer ${admin.accessToken}`)).status).toBe(200);
    expect((await attemptLogin(STUDENT.email)).body.code).toBe('ACCOUNT_REJECTED');
  });

  it('an admin cannot deactivate themselves', async () => {
    const admin = await adminSession();
    const res = await api().post(`/api/admin/users/${admin.user.id}/deactivate`).set('Authorization', `Bearer ${admin.accessToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CANNOT_TARGET_SELF');
  });
});

describe('passwords', () => {
  it('reset signs out every session, burns the link, and swaps the password', async () => {
    const user = await createActiveUser({ email: 'forgetful@example.test' });
    const a = await login(user.email);
    const b = await login(user.email);

    expect((await api().post('/api/auth/forgot-password').send({ email: user.email })).status).toBe(200);
    const token = tokenFromOutbox(user.email, '/reset-password');
    const newPassword = 'a-brand-new-password';
    expect((await api().post('/api/auth/reset-password').send({ token, password: newPassword })).status).toBe(200);

    expect((await refresh(a.cookie)).status).toBe(401);
    expect((await refresh(b.cookie)).status).toBe(401);
    expect((await attemptLogin(user.email)).status).toBe(401);
    expect((await attemptLogin(user.email, newPassword)).status).toBe(200);

    const reused = await api().post('/api/auth/reset-password').send({ token, password: 'yet-another-password' });
    expect(reused.body.code).toBe('TOKEN_USED');
  });

  it('rejects an expired reset link', async () => {
    const user = await createActiveUser({ email: 'slow@example.test' });
    await api().post('/api/auth/forgot-password').send({ email: user.email });
    const token = tokenFromOutbox(user.email, '/reset-password');
    await database.update(resetTokensTable).set({ expiresAt: new Date(Date.now() - 1000) });
    const res = await api().post('/api/auth/reset-password').send({ token, password: 'whatever-password' });
    expect(res.body).toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('answers forgot-password identically for unknown addresses and sends nothing', async () => {
    const res = await api().post('/api/auth/forgot-password').send({ email: 'nobody@example.test' });
    expect(res.status).toBe(200);
    expect(() => tokenFromOutbox('nobody@example.test', '/reset-password')).toThrow();
  });

  it('change-password keeps the current session and signs out the others', async () => {
    const user = await createActiveUser({ email: 'changer@example.test' });
    const current = await login(user.email);
    const other = await login(user.email);

    const res = await api()
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${current.accessToken}`)
      .set('Cookie', current.cookie)
      .send({ currentPassword: PASSWORD, newPassword: 'changed-password-1' });
    expect(res.status).toBe(200);

    expect((await refresh(current.cookie)).status).toBe(200);
    expect((await refresh(other.cookie)).status).toBe(401);
  });
});

describe('Account Creator', () => {
  it.each(['teacher', 'admin'] as const)('makes an active, verified %s who can log in at once', async (role) => {
    const admin = await adminSession();
    const email = `new-${role}@example.test`;
    const res = await api()
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ email, name: `New ${role}`, password: PASSWORD, role });
    expect(res.status).toBe(201);
    expect(await loadUser(email)).toMatchObject({ role, status: 'active' });
    expect((await loadUser(email)).emailVerifiedAt).not.toBeNull();
    expect((await login(email)).user.role).toBe(role);
  });

  it('is admin-only', async () => {
    await createActiveUser({ email: 'teach@example.test', role: 'teacher' });
    const teacher = await login('teach@example.test');
    const res = await api()
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${teacher.accessToken}`)
      .send({ email: 'x@example.test', name: 'Nope', password: PASSWORD, role: 'admin' });
    expect(res.status).toBe(403);
  });
});
