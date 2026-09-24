import { eq } from 'drizzle-orm';
import { settings, type SeedCredentials } from '../config/env';
import { database, pgPool } from './index';
import { accountsTable } from './schema';
import { hashSecret } from '../lib/password';
import { applySchema } from './migrate';

/**
 * Creates the bootstrap accounts described by the SEED_* variables in .env.
 *
 * A fresh database has no users and registration needs an access code, so
 * without this there is no way in. Run it with `npm run seed`.
 *
 * Idempotent: an account that already exists has its name, role and password
 * reset to whatever .env currently says, rather than failing on the unique
 * email. That makes this the recovery path for a forgotten local password too.
 *
 * Passwords are hashed here exactly as registration hashes them, so a seeded
 * account logs in through the normal endpoint with no special casing.
 */

type Role = 'admin' | 'student';

async function upsertAccount(account: SeedCredentials, role: Role): Promise<'created' | 'updated'> {
  const passwordHash = await hashSecret(account.password);

  const [existing] = await database
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(eq(accountsTable.email, account.email))
    .limit(1);

  if (existing) {
    await database
      .update(accountsTable)
      .set({ name: account.name, role, passwordHash, updatedAt: new Date() })
      .where(eq(accountsTable.id, existing.id));
    return 'updated';
  }

  await database.insert(accountsTable).values({
    email: account.email,
    name: account.name,
    role,
    passwordHash,
    // Registration requires a phone for students; seeded accounts skip the
    // form, and the column is nullable.
    phone: null,
  });
  return 'created';
}

async function main(): Promise<void> {
  // Safe to run against an empty database — the schema is brought up first.
  await applySchema();

  const targets: { account: SeedCredentials | null; role: Role; label: string }[] = [
    { account: settings.seed.admin, role: 'admin', label: 'admin' },
    { account: settings.seed.student, role: 'student', label: 'student' },
  ];

  let seeded = 0;
  for (const { account, role, label } of targets) {
    if (!account) {
      console.log(`[seed] ${label}: skipped — SEED_${label.toUpperCase()}_EMAIL/PASSWORD not set`);
      continue;
    }
    const outcome = await upsertAccount(account, role);
    // The password is never logged, only the identity it belongs to.
    console.log(`[seed] ${label}: ${outcome} ${account.email} (role: ${role})`);
    seeded++;
  }

  console.log(
    seeded === 0
      ? '[seed] Nothing to do — no SEED_* accounts configured in .env'
      : `[seed] Done — ${seeded} account(s) ready.`,
  );
}

main()
  .then(() => pgPool.end())
  .catch(async (err) => {
    console.error('[seed] Failed:', err);
    await pgPool.end().catch(() => undefined);
    process.exit(1);
  });
