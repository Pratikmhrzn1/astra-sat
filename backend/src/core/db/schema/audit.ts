import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { users } from './identity';

// ─────────────────────────────────────────────────────────────────────────────
// Audit log — who did the irreversible thing.
//
// This deployment hands admins a production console: role changes, access-code
// changes, a full database restore and an unrestricted SQL runner. None of that
// left a trace, so there was no way to answer "who ran this, and when".
//
// `actorId` is ON DELETE SET NULL rather than CASCADE on purpose: deleting a
// user must not delete the record of what they did. The payload is jsonb so each
// action can record whatever context it has without a migration per action.
// ─────────────────────────────────────────────────────────────────────────────
export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  /** Verb, e.g. 'user.role_changed', 'db.restore', 'db.sql'. */
  action: text('action').notNull(),
  /** What it acted on, e.g. 'user', 'question_set'. Null for global actions. */
  targetType: text('target_type'),
  targetId: uuid('target_id'),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type AuditLogEntry = typeof auditLog.$inferSelect;
