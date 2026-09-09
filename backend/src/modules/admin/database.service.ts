import { db, pool } from '../../db';
import {
  accessCodes,
  examAnswers,
  exams,
  feedback,
  mockTests,
  questionSets,
  questions,
  users,
} from '../../db/schema';
import { runMigrations } from '../../db/migrate';
import { HttpError } from '../../http/errors';
import type { RestoreInput } from './admin.schemas';

/**
 * Database operations exposed to admins from the Database screen.
 *
 * Everything here is destructive or unbounded by nature — a full export, a
 * replace-everything restore, arbitrary SQL, and the migration runner. They
 * exist because this deployment has no separate ops access to Postgres, and
 * they are gated on the admin role alone. Treat changes to this file as
 * changes to a production console.
 */

/**
 * The tables a backup covers, ordered so that inserting them in sequence never
 * violates a foreign key: parents first, children after.
 *
 * Content the platform can regenerate is excluded — AI feedback, narratives,
 * chat, generated content — which keeps the export to the data that cannot be
 * recovered any other way.
 */
const BACKUP_TABLES = [
  { key: 'users', table: users, sqlName: 'users' },
  { key: 'accessCodes', table: accessCodes, sqlName: 'access_codes' },
  { key: 'questionSets', table: questionSets, sqlName: 'question_sets' },
  { key: 'questions', table: questions, sqlName: 'questions' },
  { key: 'exams', table: exams, sqlName: 'exams' },
  { key: 'examAnswers', table: examAnswers, sqlName: 'exam_answers' },
  { key: 'mockTests', table: mockTests, sqlName: 'mock_tests' },
  { key: 'feedback', table: feedback, sqlName: 'feedback' },
] as const;

export interface Backup {
  version: number;
  exportedAt: string;
  data: Record<string, unknown[]>;
}

export async function createBackup(): Promise<{ backup: Backup; filename: string }> {
  const tables = await Promise.all(BACKUP_TABLES.map(({ table }) => db.select().from(table)));

  const data: Record<string, unknown[]> = {};
  BACKUP_TABLES.forEach(({ key }, index) => {
    data[key] = tables[index];
  });

  return {
    backup: { version: 1, exportedAt: new Date().toISOString(), data },
    filename: `sat-prep-backup-${new Date().toISOString().slice(0, 10)}.json`,
  };
}

/**
 * Replaces the contents of every backed-up table with the payload.
 *
 * This is a true restore, not a merge: the tables are truncated first, so any
 * data written since the backup is gone. It runs in one transaction with
 * constraints deferred — rows arrive in dependency order, but deferring means a
 * mid-restore state that briefly violates foreign keys is tolerated instead of
 * failing. Any error rolls the whole thing back, so a failed restore leaves the
 * database as it was rather than half-empty.
 */
export async function restoreBackup(input: RestoreInput): Promise<{ ok: true; message: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    await client.query(
      `TRUNCATE ${BACKUP_TABLES.map((t) => t.sqlName).reverse().join(', ')} CASCADE`,
    );

    for (const { key, sqlName } of BACKUP_TABLES) {
      await insertRows(client, sqlName, (input.data as Record<string, Record<string, unknown>[]>)[key] ?? []);
    }

    await client.query('COMMIT');
    return { ok: true, message: 'Database restored successfully' };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[admin] Restore failed:', err);
    throw new HttpError(500, 'Restore failed', { meta: { details: String(err) } });
  } finally {
    client.release();
  }
}

/**
 * Inserts rows one statement at a time with parameter placeholders.
 *
 * Column names come from the backup's own keys, so they are quoted and the
 * values are always bound — a backup file is untrusted input like any other
 * upload, and must not be able to inject SQL through a crafted key.
 */
async function insertRows(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  if (rows.length === 0) return;

  const columns = Object.keys(rows[0]);
  if (columns.length === 0) return;
  const columnList = columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(', ');
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');

  for (const row of rows) {
    await client.query(
      `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`,
      columns.map((column) => row[column]),
    );
  }
}

export async function runMigrationsNow(): Promise<{ ok: true; message: string }> {
  try {
    await runMigrations();
    return { ok: true, message: 'Migrations completed successfully' };
  } catch (err) {
    console.error('[admin] Migration failed:', err);
    throw new HttpError(500, 'Migration failed', { meta: { details: String(err) } });
  }
}

export interface SqlResult {
  ok: true;
  statements: number;
  rowsAffected: number;
  rows: Record<string, unknown>[];
}

/**
 * Runs arbitrary SQL as the application's database user.
 *
 * There is no allowlist — this is an escape hatch for an operator who would
 * otherwise have no console. Returned rows are capped so a `SELECT *` on a big
 * table cannot bring the process down trying to serialise it. A failure comes
 * back as a 400 with the driver's message, because the caller is a person
 * debugging their own statement.
 */
export async function runSql(statement: string): Promise<SqlResult> {
  const client = await pool.connect();
  try {
    const result = await client.query(statement);
    const results = Array.isArray(result) ? result : [result];

    return {
      ok: true,
      statements: results.length,
      rowsAffected: results.reduce((sum, item) => sum + (item.rowCount ?? 0), 0),
      rows: results.flatMap((item) => item.rows ?? []).slice(0, 100),
    };
  } catch (err) {
    console.error('[admin] SQL runner error:', err);
    throw new HttpError(400, String(err));
  } finally {
    client.release();
  }
}
