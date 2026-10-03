import { desc, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { trailLogTable, accountsTable } from '../../core/db/schema';

/**
 * Who did what, for the actions that cannot be undone.
 *
 * Called from the route layer, after the action succeeds, because that is where
 * the acting user's id is known. For the two actions dangerous enough to matter
 * even when they fail — the SQL console and a restore — the attempt is recorded
 * with its outcome.
 *
 * Best-effort by design: a failed audit write is logged loudly and swallowed. The
 * action it describes has already happened; failing the response would tell the
 * admin it didn't.
 */

export type TrailAction =
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.approved'
  | 'user.rejected'
  | 'user.deactivated'
  | 'user.reactivated'
  | 'user.unlocked'
  | 'user.verification_resent'
  | 'users.assigned_teacher'
  | 'access_code.created'
  | 'access_code.deleted'
  | 'db.backup_downloaded'
  | 'db.restored'
  | 'db.migrations_run'
  | 'db.sql_run'
  | 'scoring.backfill_run'
  | 'question_set.archived'
  | 'question_set.deleted'
  | 'survey.question_deleted';

export interface TrailEntry {
  actorId: string | null;
  action: TrailAction;
  targetType?: string;
  targetId?: string;
  /** Never put secrets here — no passwords, no hashes, no query results. */
  payload?: Record<string, unknown>;
}

export async function logTrail(entry: TrailEntry): Promise<void> {
  const row = {
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    payload: entry.payload ?? null,
  };

  try {
    await database.insert(trailLogTable).values(row);
  } catch (err) {
    // A restore replaces `users`, so the admin who ran it may no longer exist and
    // the actor foreign key fails. Keep the entry, with the id in the payload.
    if ((err as { code?: string }).code === '23503' && entry.actorId) {
      try {
        await database.insert(trailLogTable).values({
          ...row,
          actorId: null,
          payload: { ...(entry.payload ?? {}), actorIdNotInRestoredUsers: entry.actorId },
        });
        return;
      } catch (retryErr) {
        err = retryErr;
      }
    }
    console.error(`[audit] Failed to record ${entry.action}:`, err);
  }
}

/** Newest first, with the actor's name where the account still exists. */
export async function collectTrail(limit = 100) {
  return database
    .select({
      id: trailLogTable.id,
      action: trailLogTable.action,
      targetType: trailLogTable.targetType,
      targetId: trailLogTable.targetId,
      payload: trailLogTable.payload,
      createdAt: trailLogTable.createdAt,
      actorId: trailLogTable.actorId,
      actorName: accountsTable.name,
      actorEmail: accountsTable.email,
    })
    .from(trailLogTable)
    .leftJoin(accountsTable, eq(trailLogTable.actorId, accountsTable.id))
    .orderBy(desc(trailLogTable.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}
