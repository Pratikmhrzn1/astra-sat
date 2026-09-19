import { desc, eq } from 'drizzle-orm';
import { db } from '../../core/db';
import { auditLog, users } from '../../core/db/schema';

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

export type AuditAction =
  | 'user.updated'
  | 'user.deleted'
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

export interface AuditEntry {
  actorId: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  /** Never put secrets here — no passwords, no hashes, no query results. */
  payload?: Record<string, unknown>;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  const row = {
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    payload: entry.payload ?? null,
  };

  try {
    await db.insert(auditLog).values(row);
  } catch (err) {
    // A restore replaces `users`, so the admin who ran it may no longer exist and
    // the actor foreign key fails. Keep the entry, with the id in the payload.
    if ((err as { code?: string }).code === '23503' && entry.actorId) {
      try {
        await db.insert(auditLog).values({
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
export async function listAudit(limit = 100) {
  return db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      payload: auditLog.payload,
      createdAt: auditLog.createdAt,
      actorId: auditLog.actorId,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorId, users.id))
    .orderBy(desc(auditLog.createdAt))
    .limit(Math.min(Math.max(limit, 1), 500));
}
