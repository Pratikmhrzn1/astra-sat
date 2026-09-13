import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { accessCodes, aiFeedback, exams, questionSets, questions, users } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../http/errors';
import { hashPassword } from '../../lib/password';
import { getTaggingCoverage } from '../skills/skills.service';
import type { AssignStudentsInput, CreateAccessCodeInput, UpdateUserInput } from './admin.schemas';

/** Platform administration: people, registration codes, and AI spend. */

export async function getStats() {
  const [students, teachers, admins, examCount, questionCount, setCount] = await Promise.all([
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'student'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'teacher'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.role, 'admin'))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(exams)),
    // Live content only: retired question versions and archived sets are kept for
    // history but are not part of the question bank any more.
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(questions).where(isNull(questions.retiredAt))),
    countRows(db.select({ count: sql<number>`count(*)::int` }).from(questionSets).where(isNull(questionSets.archivedAt))),
  ]);

  return {
    students,
    teachers,
    admins,
    exams: examCount,
    questions: questionCount,
    questionSets: setCount,
    // Every per-skill analytic is only as good as this number, so it belongs
    // where someone will see it rather than in a query someone has to remember
    // to run. Math sat at 0% for as long as it was untaggable.
    taggingCoverage: await getTaggingCoverage(),
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
 * Assigns many students to a teacher at once, or clears their assignment.
 *
 * `users.teacher_id` is what every teacher-scoped read filters on — the roster,
 * per-student results, feedback — so a student with none is invisible to every
 * teacher. Nothing sets it at signup, and setting it one student at a time is
 * the only way it could be done before, which is how a whole cohort ends up
 * unassigned and a teacher's dashboard ends up empty.
 *
 * Both sides are validated rather than trusted: every id must name a student,
 * and the target must be a teacher. Silently assigning a class to a deleted user,
 * or filing an admin under a teacher, would be invisible until someone noticed
 * the roster was wrong.
 */
export async function assignStudentsToTeacher(input: AssignStudentsInput) {
  if (input.teacherId) {
    const [teacher] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.teacherId), eq(users.role, 'teacher')))
      .limit(1);
    if (!teacher) throw badRequest('That teacher does not exist');
  }

  const targets = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, input.studentIds), eq(users.role, 'student')));

  if (targets.length !== input.studentIds.length) {
    throw badRequest('Every selected user must be a student');
  }

  const updated = await db
    .update(users)
    .set({ teacherId: input.teacherId, updatedAt: new Date() })
    .where(inArray(users.id, input.studentIds))
    .returning({ id: users.id });

  return { ok: true as const, assigned: updated.length };
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
