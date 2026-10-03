import { afterAll, beforeEach } from 'vitest';
import { pgPool } from '../src/core/db';
import { testOutbox } from '../src/core/lib/email';

/** Every test starts from empty tables and an empty outbox. */
beforeEach(async () => {
  // Re-checked here as well as in global-setup: this is the line that deletes data.
  const { rows: [{ db }] } = await pgPool.query<{ db: string }>('SELECT current_database() AS db');
  if (!db.endsWith('_test')) throw new Error(`Refusing to truncate non-test database "${db}"`);

  const { rows } = await pgPool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length > 0) {
    await pgPool.query(`TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  }
  testOutbox.length = 0;
});

afterAll(async () => {
  await pgPool.end();
});
