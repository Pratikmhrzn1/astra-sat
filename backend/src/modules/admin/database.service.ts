import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { db, pool } from '../../db';
import * as schema from '../../db/schema';
import {
  accessCodes,
  examAnswers,
  exams,
  feedback,
  libraryItems,
  liveExamParticipants,
  liveExamQuestionFeedback,
  liveExamSessions,
  mistakes,
  mockTests,
  organizations,
  passages,
  platformFeedback,
  questionSets,
  questions,
  studentProfiles,
  studentSkillTriggers,
  studentTeacherVocabProgress,
  studentVocab,
  teacherVocabWords,
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
 * That ordering is load-bearing, and it is the *only* thing keeping the restore
 * valid — see the note in `restoreBackup` about constraint deferral, which does
 * not do what it appears to. Never reorder these without checking the FKs.
 *
 * `organizations` has to be here even though nothing scopes by it yet: the
 * Phase 2 migration backfills `users.organization_id` to a default row whose
 * UUID is generated per database, so a backup that omitted the organisation
 * carried user rows pointing at an id the target database had never seen.
 *
 * Content the platform can regenerate is excluded — see EXCLUDED_TABLES, which
 * has to account for every remaining table so that nothing is left out merely by
 * being forgotten. That is how reading passages, the resource library and all
 * vocabulary went missing from every backup taken before this was written.
 */
const BACKUP_TABLES = [
  { key: 'organizations', table: organizations, sqlName: 'organizations' },
  { key: 'users', table: users, sqlName: 'users' },
  { key: 'accessCodes', table: accessCodes, sqlName: 'access_codes' },
  { key: 'questionSets', table: questionSets, sqlName: 'question_sets' },
  // Before questions: questions.passage_id points here.
  { key: 'passages', table: passages, sqlName: 'passages' },
  { key: 'questions', table: questions, sqlName: 'questions' },
  { key: 'exams', table: exams, sqlName: 'exams' },
  { key: 'examAnswers', table: examAnswers, sqlName: 'exam_answers' },
  { key: 'mockTests', table: mockTests, sqlName: 'mock_tests' },
  { key: 'feedback', table: feedback, sqlName: 'feedback' },
  // Teacher-uploaded resources and notes: files the platform cannot reproduce.
  { key: 'libraryItems', table: libraryItems, sqlName: 'library_items' },
  // Authored vocabulary, and the spaced-repetition progress earned against it.
  { key: 'teacherVocabWords', table: teacherVocabWords, sqlName: 'teacher_vocab_words' },
  { key: 'studentVocab', table: studentVocab, sqlName: 'student_vocab' },
  {
    key: 'studentTeacherVocabProgress',
    table: studentTeacherVocabProgress,
    sqlName: 'student_teacher_vocab_progress',
  },
  // Student learning state: targets, mistakes and remediation triggers.
  { key: 'studentProfiles', table: studentProfiles, sqlName: 'student_profiles' },
  { key: 'studentSkillTriggers', table: studentSkillTriggers, sqlName: 'student_skill_triggers' },
  { key: 'mistakes', table: mistakes, sqlName: 'mistakes' },
  // Live exams are real sittings with teacher feedback attached — assessment
  // records, not transient session state.
  { key: 'liveExamSessions', table: liveExamSessions, sqlName: 'live_exam_sessions' },
  { key: 'liveExamParticipants', table: liveExamParticipants, sqlName: 'live_exam_participants' },
  {
    key: 'liveExamQuestionFeedback',
    table: liveExamQuestionFeedback,
    sqlName: 'live_exam_question_feedback',
  },
  { key: 'platformFeedback', table: platformFeedback, sqlName: 'platform_feedback' },
] as const;

/**
 * Tables deliberately left out of a backup, each with the reason it is safe.
 *
 * Kept as an explicit list rather than an implied remainder so that adding a
 * table forces a decision: the check below fails loudly for anything that
 * appears in neither list.
 */
const EXCLUDED_TABLES: Record<string, string> = {
  // Regenerable AI output — cached, and reproducible from the graded attempt.
  ai_feedback: 'AI output, regenerated on demand',
  mock_narratives: 'AI output, regenerated on demand',
  generated_content: 'AI output, regenerated on demand',
  chat_sessions: 'AI chat, not assessment data',
  chat_messages: 'AI chat, not assessment data',
  // Credentials and short-lived session state. Restoring these would carry live
  // tokens across databases, which is a security problem rather than a recovery.
  refresh_tokens: 'session tokens, must not outlive their database',
  password_reset_tokens: 'short-lived credentials, must not be restored',
  // Reference data owned by the migration runner, which reseeds it on boot.
  skills: 'seeded by runMigrations() before any restore runs',
  // Transient UI state; losing it costs a user nothing.
  notifications: 'transient UI state',
};

/**
 * Fails loudly when a table belongs to neither list.
 *
 * The backup set was a hand-maintained list with no cross-check, so tables added
 * later were simply never exported and nobody found out until a restore came up
 * short. This runs at module load: getting it wrong breaks boot, which is the
 * cheapest moment to find out.
 */
function assertEveryTableClassified(): void {
  const covered = new Set<string>(BACKUP_TABLES.map((t) => t.sqlName));
  const missing = Object.values(schema)
    .filter((value) => is(value, PgTable))
    .map((table) => getTableName(table))
    .filter((name) => !covered.has(name) && !(name in EXCLUDED_TABLES));

  if (missing.length > 0) {
    throw new Error(
      `[admin] Table(s) neither backed up nor explicitly excluded: ${missing.sort().join(', ')}. ` +
        'Add each to BACKUP_TABLES (in foreign-key order) or to EXCLUDED_TABLES with a reason.',
    );
  }
}
assertEveryTableClassified();

/**
 * Drizzle property name → SQL column name, per backup table.
 *
 * `createBackup` exports rows through Drizzle, so every key in a backup file is
 * a *property* name (`passwordHash`). The column it has to be written back to is
 * snake_case (`password_hash`), and a quoted identifier in Postgres is
 * case-sensitive — so inserting a backup's keys verbatim failed on every
 * multi-word column with `42703: column "passwordHash" does not exist`. That
 * made the pair useless: no file this service exported could be restored by it.
 *
 * Built once at module load from the schema itself rather than hand-written, so
 * it cannot drift from the tables as columns are added or renamed.
 */
const COLUMN_NAMES: Record<string, Record<string, string>> = Object.fromEntries(
  BACKUP_TABLES.map(({ key, table }) => [
    key,
    Object.fromEntries(
      Object.entries(getTableColumns(table)).map(([property, column]) => [property, column.name]),
    ),
  ]),
);

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
 * data written since the backup is gone. Any error rolls the whole thing back,
 * so a failed restore leaves the database as it was rather than half-empty.
 *
 * `SET CONSTRAINTS ALL DEFERRED` below is kept for the case where a constraint
 * is ever declared DEFERRABLE, but it is **not** what makes this work: Postgres
 * foreign keys are NOT DEFERRABLE unless declared otherwise, and none here are,
 * so the statement is currently a no-op. What actually keeps the restore valid
 * is `BACKUP_TABLES` being in dependency order, plus the `users` sort below for
 * the one self-reference. Do not rely on deferral to cover a new FK.
 */
export async function restoreBackup(input: RestoreInput): Promise<{ ok: true; message: string }> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SET CONSTRAINTS ALL DEFERRED');
    await client.query(
      `TRUNCATE ${BACKUP_TABLES.map((t) => t.sqlName).reverse().join(', ')} CASCADE`,
    );

    const skipped: string[] = [];
    for (const { key, sqlName } of BACKUP_TABLES) {
      const rows = (input.data as Record<string, Record<string, unknown>[]>)[key] ?? [];
      const unknown = await insertRows(client, sqlName, orderForInsert(key, rows), COLUMN_NAMES[key]);
      skipped.push(...unknown.map((column) => `${key}.${column}`));
    }

    await client.query('COMMIT');
    return {
      ok: true,
      message: skipped.length
        ? `Database restored successfully. Ignored ${skipped.length} field(s) not in the current schema: ${skipped.join(', ')}`
        : 'Database restored successfully',
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    console.error('[admin] Restore failed:', err);
    throw new HttpError(500, 'Restore failed', { meta: { details: String(err) } });
  } finally {
    client.release();
  }
}

/**
 * Orders rows within a table so self-references resolve.
 *
 * `users.teacher_id` points at another user, and rows are inserted one at a time
 * against a non-deferrable FK, so a student inserted before their teacher fails.
 * Export order is whatever the database returned, so putting the unparented rows
 * (teachers, admins) first is what makes it deterministic rather than lucky.
 */
function orderForInsert(key: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (key !== 'users') return rows;
  return [...rows].sort(
    (a, b) => Number(Boolean(a.teacherId)) - Number(Boolean(b.teacherId)),
  );
}

/**
 * Inserts rows one statement at a time with parameter placeholders.
 *
 * A backup's keys are Drizzle property names, so each one is translated through
 * `columnNames` before it reaches SQL. Only keys the current schema knows about
 * are written: a key that no longer exists is skipped and returned to the caller
 * rather than aborting, so a backup taken before a column was dropped still
 * restores — losing a field the database has no home for either way. Names are
 * still quoted and values still bound, because a backup file is untrusted input
 * like any other upload and must not be able to inject SQL through a crafted key.
 */
async function insertRows(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  tableName: string,
  rows: Record<string, unknown>[],
  columnNames: Record<string, string>,
): Promise<string[]> {
  if (rows.length === 0) return [];

  // Union across every row, not just the first: a hand-edited backup can omit a
  // key on some rows, and those must still line up with the column list.
  const properties = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const known = properties.filter((property) => columnNames[property]);
  const unknown = properties.filter((property) => !columnNames[property]);
  if (known.length === 0) return unknown;

  const columnList = known.map((p) => `"${columnNames[p].replace(/"/g, '""')}"`).join(', ');
  const placeholders = known.map((_, index) => `$${index + 1}`).join(', ');

  for (const row of rows) {
    await client.query(
      `INSERT INTO ${tableName} (${columnList}) VALUES (${placeholders})`,
      known.map((property) => row[property] ?? null),
    );
  }

  return unknown;
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
