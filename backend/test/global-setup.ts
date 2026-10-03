/**
 * Runs once before any test file: refuses to touch a database that isn't a
 * test database, then brings its schema up to date with the same migration
 * the server runs on boot.
 */
export default async function globalSetup(): Promise<void> {
  const dbName = new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, '');
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${dbName}": every table is emptied between tests, ` +
        'so the database name must end in "_test". Set TEST_DATABASE_URL.',
    );
  }

  const { applySchema } = await import('../src/core/db/migrate');
  const { pgPool } = await import('../src/core/db');
  try {
    // A non-UTC session zone, as on the dev machines. Under UTC, timestamp
    // columns whose Drizzle type disagrees with migrate.ts read back correctly
    // by accident, so CI would never catch that class of bug.
    await pgPool.query(`ALTER DATABASE "${dbName}" SET timezone TO 'Asia/Kathmandu'`);
    await applySchema();
  } finally {
    await pgPool.end();
  }
}
