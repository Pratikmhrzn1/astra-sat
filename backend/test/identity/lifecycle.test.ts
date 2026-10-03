import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { database } from '../../src/core/db';
import { accountsTable } from '../../src/core/db/schema';
import {
  DAY_MS,
  PASSWORD,
  adminSession,
  api,
  asUser,
  createActiveUser,
  daysFromNow,
  loadUser,
  login,
  refresh,
} from '../helpers';

const signup = (role?: 'trial' | 'student', email = `${role ?? 'default'}@example.test`) =>
  api()
    .post('/api/auth/register')
    .send({ email, name: 'New Learner', phone: '9800000000', password: PASSWORD, ...(role ? { role } : {}) });

/** Within a minute of `days` from now — signup and the assertion aren't the same instant. */
function expectDaysAhead(date: Date | null, days: number) {
  expect(date).not.toBeNull();
  expect(Math.abs(date!.getTime() - (Date.now() + days * DAY_MS))).toBeLessThan(60_000);
}

describe('signup roles', () => {
  it('a trial signup gets the trial window and daily limit', async () => {
    expect((await signup('trial')).status).toBe(201);
    const user = await loadUser('trial@example.test');
    expect(user).toMatchObject({ role: 'trial', status: 'pending', dailyTestLimit: 5 });
    expectDaysAhead(user.expiryDate, 14);
  });

  it('a student signup gets the student window and no limit', async () => {
    await signup('student');
    const user = await loadUser('student@example.test');
    expect(user).toMatchObject({ role: 'student', dailyTestLimit: null });
    expectDaysAhead(user.expiryDate, 60);
  });

  it('defaults to student when no role is sent (older clients)', async () => {
    await signup(undefined);
    expect((await loadUser('default@example.test')).role).toBe('student');
  });

  it('cannot sign up as a teacher or admin', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ email: 'sneaky@example.test', name: 'Sneaky', phone: '9800000000', password: PASSWORD, role: 'admin' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await loadUser('sneaky@example.test')).toBeUndefined();
  });
});

describe('trial accounts reach learner routes', () => {
  it('a trial can use student endpoints; a teacher cannot', async () => {
    await createActiveUser({ email: 'trial@example.test', role: 'trial', dailyTestLimit: 5, expiryDate: daysFromNow(14) });
    const trial = await login('trial@example.test');
    const usage = await api().get('/api/student/daily-usage').set(asUser(trial));
    expect(usage.status).toBe(200);
    expect(usage.body).toMatchObject({ limit: 5, used: 0, remaining: 5 });
    expect((await api().get('/api/student/exams').set(asUser(trial))).status).toBe(200);

    await createActiveUser({ email: 'teacher@example.test', role: 'teacher' });
    const teacher = await login('teacher@example.test');
    expect((await api().get('/api/student/daily-usage').set(asUser(teacher))).status).toBe(403);
  });

  it('the session payload carries expiry and limit', async () => {
    const expiry = daysFromNow(10);
    await createActiveUser({ email: 'trial@example.test', role: 'trial', dailyTestLimit: 3, expiryDate: expiry });
    const session = await login('trial@example.test');
    const me = await api().get('/api/auth/me').set(asUser(session));
    expect(me.body).toMatchObject({ role: 'trial', dailyTestLimit: 3, expiryDate: expiry.toISOString() });
  });
});

describe('expiry', () => {
  it('an expired account cannot log in, and clearing the expiry restores it', async () => {
    const user = await createActiveUser({ email: 'old@example.test', expiryDate: daysFromNow(-1) });
    const denied = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('ACCOUNT_EXPIRED');

    const admin = await adminSession();
    const list = await api().get('/api/admin/users').set(asUser(admin));
    expect(list.body.find((u: { id: string }) => u.id === user.id)).toMatchObject({
      status: 'active',
      effectiveStatus: 'expired',
      deletable: true,
    });

    const cleared = await api().put(`/api/admin/users/${user.id}/expiry`).set(asUser(admin)).send({ expiryDate: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body).toMatchObject({ expiryDate: null, effectiveStatus: 'active' });
    expect((await login(user.email)).user.id).toBe(user.id);
  });

  it('a session stops refreshing once the account expires', async () => {
    const user = await createActiveUser({ email: 'soon@example.test', expiryDate: daysFromNow(1) });
    const session = await login(user.email);
    await database.update(accountsTable).set({ expiryDate: new Date(Date.now() - 1000) }).where(eq(accountsTable.id, user.id));

    const res = await refresh(session.cookie);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_EXPIRED');
  });

  it('moves the expiry to a given date', async () => {
    const user = await createActiveUser({ email: 'learner@example.test' });
    const admin = await adminSession();
    const when = daysFromNow(30).toISOString();
    const res = await api().put(`/api/admin/users/${user.id}/expiry`).set(asUser(admin)).send({ expiryDate: when });
    expect(res.status).toBe(200);
    expect((await loadUser(user.email)).expiryDate!.toISOString()).toBe(when);
  });

  it('expiry and daily limit apply to learners only', async () => {
    const teacher = await createActiveUser({ email: 'teacher@example.test', role: 'teacher' });
    const admin = await adminSession();
    const expiry = await api().put(`/api/admin/users/${teacher.id}/expiry`).set(asUser(admin)).send({ expiryDate: null });
    expect(expiry.status).toBe(409);
    expect(expiry.body.code).toBe('NOT_A_LEARNER');
    const limit = await api().put(`/api/admin/users/${teacher.id}/daily-limit`).set(asUser(admin)).send({ dailyTestLimit: 3 });
    expect(limit.body.code).toBe('NOT_A_LEARNER');
  });

  it('sets and clears the daily limit', async () => {
    const user = await createActiveUser({ email: 'learner@example.test', role: 'trial', dailyTestLimit: 5 });
    const admin = await adminSession();
    const set = await api().put(`/api/admin/users/${user.id}/daily-limit`).set(asUser(admin)).send({ dailyTestLimit: 8 });
    expect(set.body.dailyTestLimit).toBe(8);
    const cleared = await api().put(`/api/admin/users/${user.id}/daily-limit`).set(asUser(admin)).send({ dailyTestLimit: null });
    expect(cleared.body.dailyTestLimit).toBeNull();
  });
});

describe('convert trial → student', () => {
  it('counts the student window from the original signup date and lifts the limit', async () => {
    const signedUp = new Date(Date.now() - 100 * DAY_MS);
    const trial = await createActiveUser({
      email: 'trial@example.test',
      role: 'trial',
      dailyTestLimit: 5,
      expiryDate: new Date(signedUp.getTime() + 14 * DAY_MS),
      createdAt: signedUp,
    });
    const admin = await adminSession();

    const res = await api().post(`/api/admin/users/${trial.id}/convert`).set(asUser(admin));
    expect(res.status).toBe(200);
    // Signed up 100 days ago + 60 student days = already 40 days past.
    expect(res.body.inPast).toBe(true);
    expect(res.body.user).toMatchObject({ role: 'student', dailyTestLimit: null });

    const stored = await loadUser(trial.email);
    expect(stored.expiryDate!.getTime()).toBe(signedUp.getTime() + 60 * DAY_MS);
    expect(stored.convertedAt).not.toBeNull();
  });

  it('a recent trial converts into a future expiry', async () => {
    const trial = await createActiveUser({ email: 'trial@example.test', role: 'trial', dailyTestLimit: 5 });
    const admin = await adminSession();
    const res = await api().post(`/api/admin/users/${trial.id}/convert`).set(asUser(admin));
    expect(res.body.inPast).toBe(false);
  });

  it('a real signup converts to exactly signup + student days (no timezone drift)', async () => {
    await signup('trial');
    const signedUp = await loadUser('trial@example.test');
    // Approve so the admin endpoints treat it like any live trial.
    await database.update(accountsTable).set({ status: 'active' }).where(eq(accountsTable.id, signedUp.id));
    const admin = await adminSession();

    await api().post(`/api/admin/users/${signedUp.id}/convert`).set(asUser(admin));
    const converted = await loadUser('trial@example.test');
    // Both dates count from the same signup instant: 60 student days vs 14 trial days.
    expect(converted.expiryDate!.getTime() - signedUp.expiryDate!.getTime()).toBeCloseTo((60 - 14) * DAY_MS, -4);
  });

  it('only converts trials', async () => {
    const student = await createActiveUser({ email: 'student@example.test' });
    const admin = await adminSession();
    const res = await api().post(`/api/admin/users/${student.id}/convert`).set(asUser(admin));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_TRIAL');
  });
});

describe('platform settings', () => {
  it('starts from the env defaults, and edits apply to the next signup', async () => {
    const admin = await adminSession();
    const initial = await api().get('/api/admin/platform-settings').set(asUser(admin));
    expect(initial.body).toMatchObject({ trialDurationDays: 14, trialDailyTestLimit: 5, studentDurationDays: 60 });

    const updated = await api()
      .put('/api/admin/platform-settings')
      .set(asUser(admin))
      .send({ trialDurationDays: 7, trialDailyTestLimit: 2 });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ trialDurationDays: 7, trialDailyTestLimit: 2, studentDurationDays: 60 });

    await signup('trial');
    const user = await loadUser('trial@example.test');
    expect(user.dailyTestLimit).toBe(2);
    expectDaysAhead(user.expiryDate, 7);
  });

  it('rejects an empty or out-of-range update', async () => {
    const admin = await adminSession();
    expect((await api().put('/api/admin/platform-settings').set(asUser(admin)).send({})).status).toBe(422);
    expect((await api().put('/api/admin/platform-settings').set(asUser(admin)).send({ trialDurationDays: 0 })).status).toBe(422);
  });

  it('is admin-only', async () => {
    await createActiveUser({ email: 'student@example.test' });
    const student = await login('student@example.test');
    expect((await api().get('/api/admin/platform-settings').set(asUser(student))).status).toBe(403);
  });
});

describe('deleting users (only after expiry)', () => {
  const remove = (admin: { accessToken: string }, id: string) =>
    api().delete(`/api/admin/users/${id}`).set('Authorization', `Bearer ${admin.accessToken}`);

  it('refuses a learner who has not expired, and one with no expiry', async () => {
    const admin = await adminSession();
    for (const expiryDate of [daysFromNow(5), null]) {
      const user = await createActiveUser({ email: `l-${expiryDate === null}@example.test`, expiryDate });
      const res = await remove(admin, user.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('DELETE_NOT_ALLOWED');
      expect(await loadUser(user.email)).toBeDefined();
    }
  });

  it('refuses teachers and admins, who never expire', async () => {
    const admin = await adminSession();
    const teacher = await createActiveUser({ email: 'teacher@example.test', role: 'teacher' });
    expect((await remove(admin, teacher.id)).body.code).toBe('DELETE_NOT_ALLOWED');
    expect((await remove(admin, admin.user.id)).body.code).toBe('CANNOT_TARGET_SELF');
  });

  it('deletes a learner whose expiry has passed', async () => {
    const admin = await adminSession();
    const user = await createActiveUser({ email: 'gone@example.test', role: 'trial', expiryDate: daysFromNow(-1) });
    expect((await remove(admin, user.id)).status).toBe(200);
    expect(await loadUser(user.email)).toBeUndefined();
  });
});
