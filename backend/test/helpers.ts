import request from 'supertest';
import { eq } from 'drizzle-orm';
import { apiRoutes } from '../src/api.router';
import { buildApp } from '../src/core/http/app';
import { database } from '../src/core/db';
import { accountsTable } from '../src/core/db/schema';
import { hashSecret } from '../src/core/lib/password';
import { testOutbox } from '../src/core/lib/email';

/** The real app, minus migrations and `listen` (see core/http/app.ts). */
export const app = buildApp(apiRoutes);
export const api = () => request(app);

export const PASSWORD = 'correct-horse-battery';

type Role = 'student' | 'teacher' | 'admin';

/** Inserts an account that can sign in straight away, the way `npm run seed` does. */
export async function createActiveUser(opts: { email: string; role?: Role; name?: string; password?: string }) {
  const now = new Date();
  const [row] = await database
    .insert(accountsTable)
    .values({
      email: opts.email,
      name: opts.name ?? 'Test User',
      role: opts.role ?? 'student',
      passwordHash: await hashSecret(opts.password ?? PASSWORD),
      status: 'active',
      emailVerifiedAt: now,
      approvedAt: now,
    })
    .returning();
  return row;
}

export async function loadUser(email: string) {
  const [row] = await database.select().from(accountsTable).where(eq(accountsTable.email, email));
  return row;
}

/** A signed-in session: the bearer token plus the refresh cookie as a `Cookie` header value. */
export interface Session {
  accessToken: string;
  cookie: string;
  user: { id: string; email: string; role: Role };
}

export async function login(email: string, password = PASSWORD): Promise<Session> {
  const res = await api().post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { accessToken: res.body.accessToken, cookie: refreshCookie(res.headers['set-cookie']), user: res.body.user };
}

export async function adminSession(email = 'admin@example.test'): Promise<Session> {
  await createActiveUser({ email, role: 'admin', name: 'Admin' });
  return login(email);
}

/** Pulls `rt=...` out of a Set-Cookie header so it can be replayed. */
export function refreshCookie(setCookie: string | string[] | undefined): string {
  const all = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const rt = all.find((c) => c.startsWith('rt='));
  if (!rt) throw new Error('response did not set a refresh cookie');
  return rt.split(';')[0];
}

export const refresh = (cookie: string) => api().post('/api/auth/refresh').set('Cookie', cookie);

/** The token from the newest email to `to` whose link contains `path` (e.g. "/verify-email"). */
export function tokenFromOutbox(to: string, path: string): string {
  const mail = [...testOutbox].reverse().find((m) => m.to === to && m.text.includes(path));
  if (!mail) throw new Error(`no ${path} email sent to ${to}`);
  const match = mail.text.match(/token=([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`no token in ${path} email to ${to}`);
  return match[1];
}
