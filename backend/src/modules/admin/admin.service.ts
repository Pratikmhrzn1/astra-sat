import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db';
import { accessCodes, aiFeedback, exams, questionSets, questions, users } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../http/errors';
import { hashPassword } from '../../lib/password';
import type { CreateAccessCodeInput, UpdateUserInput } from './admin.schemas';

/** Platform administration: people, registration codes, and AI spend. */

export async function getStats() {
  const [students, teachers, admins, examCount, questionCount, setCount] = await Promise.all([
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'student'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'teacher'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'admin'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(exams)),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(questions)),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(questionSets)),
  ]);

  return {
    students,
    teachers,
    admins,
    exams: examCount,
    questions: questionCount,
    questionSets: setCount,
  };
}

async function countRows(query: Promise<{ count: number }[]>): Promise<number> {
  const [row] = await query;
  return row?.count ?? 0;
}

export async function listUsers() {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      teacherId: users.teacherId,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(users.role, desc(users.createdAt));
}

/**
 * Updates a user. Only the three fields an admin is meant to change are
 * applied, and a supplied password is hashed here — never stored as given.
 * Role and email are deliberately not editable: changing either would silently
 * re-authorise or re-identify an existing account.
 */
export async function updateUser(userId: string, input: UpdateUserInput) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  if (!existing) throw notFound('User not found');

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.teacherId !== undefined) updates.teacherId = input.teacherId;
  if (input.password !== undefined) updates.passwordHash = await hashPassword(input.password);

  const [updated] = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      teacherId: users.teacherId,
    });

  return updated;
}

/**
 * Deletes a user and, by cascade, their exams, answers and feedback.
 *
 * Self-deletion is refused: an admin removing their own account could leave the
 * platform with no administrator at all.
 */
export async function deleteUser(userId: string, actingAdminId: string): Promise<void> {
  if (userId === actingAdminId) throw badRequest('Cannot delete your own account');

  const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
  if (deleted.length === 0) throw notFound('User not found');
}

// ── Access codes ──────────────────────────────────────────────────────────────

export async function listAccessCodes() {
  return db
    .select({
      id: accessCodes.id,
      code: accessCodes.code,
      role: accessCodes.role,
      description: accessCodes.description,
      isActive: accessCodes.isActive,
      maxUses: accessCodes.maxUses,
      useCount: accessCodes.useCount,
      createdAt: accessCodes.createdAt,
      createdBy: accessCodes.createdBy,
    })
    .from(accessCodes)
    .orderBy(desc(accessCodes.createdAt));
}

/**
 * Creates a registration code. The code decides what role its holder gets on
 * signup, so `maxUses` is the main control on how far one can spread.
 */
export async function createAccessCode(createdBy: string, input: CreateAccessCodeInput) {
  const [existing] = await db
    .select({ id: accessCodes.id })
    .from(accessCodes)
    .where(eq(accessCodes.code, input.code))
    .limit(1);
  if (existing) throw conflict('An access code with this value already exists');

  const [created] = await db
    .insert(accessCodes)
    .values({
      code: input.code,
      role: input.role,
      description: input.description,
      createdBy,
      maxUses: input.maxUses ?? null,
    })
    .returning();
  return created;
}

export async function deleteAccessCode(codeId: string): Promise<void> {
  const deleted = await db
    .delete(accessCodes)
    .where(eq(accessCodes.id, codeId))
    .returning({ id: accessCodes.id });
  if (deleted.length === 0) throw notFound('Access code not found');
}

// ── AI spend ──────────────────────────────────────────────────────────────────

/**
 * Per-model cost, latency and reliability, aggregated from the rows every AI
 * call writes. `parseFailureRate` is the share of calls that needed a re-prompt
 * to return valid JSON — a rising value means a model or prompt is degrading.
 */
export async function getModelStats() {
  return db
    .select({
      modelUsed: aiFeedback.modelUsed,
      totalCalls: sql<number>`count(*)::int`,
      avgLatencyMs: sql<number>`round(avg(${aiFeedback.latencyMs}))::int`,
      avgCostUsd: sql<string>`round(avg(${aiFeedback.costUsd}::numeric), 6)::text`,
      parseFailureRate: sql<number>`round(avg(CASE WHEN ${aiFeedback.parseFailed} THEN 1.0 ELSE 0.0 END)::numeric, 4)::float8`,
    })
    .from(aiFeedback)
    .groupBy(aiFeedback.modelUsed)
    .orderBy(desc(sql`count(*)`));
}
