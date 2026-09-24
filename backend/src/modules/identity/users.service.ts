import { and, desc, eq, inArray } from 'drizzle-orm';
import { database } from '../../core/db';
import { enrolmentCodesTable, accountsTable } from '../../core/db/schema';
import { invalidRequest, stateConflict, missing } from '../../core/errors';
import { hashSecret } from '../../core/lib/password';
import type { AssignStudentsPayload, CreateAccessCodePayload, UpdateUserPayload } from './users.schemas';

/** Administering accounts: users, teacher assignment, and registration codes. */

export async function collectUsers() {
  return database
    .select({
      id: accountsTable.id,
      email: accountsTable.email,
      name: accountsTable.name,
      role: accountsTable.role,
      teacherId: accountsTable.teacherId,
      createdAt: accountsTable.createdAt,
    })
    .from(accountsTable)
    .orderBy(accountsTable.role, desc(accountsTable.createdAt));
}

/**
 * Updates a user. Only the three fields an admin is meant to change are
 * applied, and a supplied password is hashed here — never stored as given.
 * Role and email are deliberately not editable: changing either would silently
 * re-authorise or re-identify an existing account.
 */
export async function editUser(userId: string, input: UpdateUserPayload) {
  const [existing] = await database.select({ id: accountsTable.id }).from(accountsTable).where(eq(accountsTable.id, userId)).limit(1);
  if (!existing) throw missing('User not found');

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.teacherId !== undefined) updates.teacherId = input.teacherId;
  if (input.password !== undefined) updates.passwordHash = await hashSecret(input.password);

  const [updated] = await database
    .update(accountsTable)
    .set(updates)
    .where(eq(accountsTable.id, userId))
    .returning({
      id: accountsTable.id,
      email: accountsTable.email,
      name: accountsTable.name,
      role: accountsTable.role,
      teacherId: accountsTable.teacherId,
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
export async function linkLearnersToTeacher(input: AssignStudentsPayload) {
  if (input.teacherId) {
    const [teacher] = await database
      .select({ id: accountsTable.id })
      .from(accountsTable)
      .where(and(eq(accountsTable.id, input.teacherId), eq(accountsTable.role, 'teacher')))
      .limit(1);
    if (!teacher) throw invalidRequest('That teacher does not exist');
  }

  const targets = await database
    .select({ id: accountsTable.id })
    .from(accountsTable)
    .where(and(inArray(accountsTable.id, input.studentIds), eq(accountsTable.role, 'student')));

  if (targets.length !== input.studentIds.length) {
    throw invalidRequest('Every selected user must be a student');
  }

  const updated = await database
    .update(accountsTable)
    .set({ teacherId: input.teacherId, updatedAt: new Date() })
    .where(inArray(accountsTable.id, input.studentIds))
    .returning({ id: accountsTable.id });

  return { ok: true as const, assigned: updated.length };
}

/**
 * Deletes a user and, by cascade, their exams, answers and feedback.
 *
 * Self-deletion is refused: an admin removing their own account could leave the
 * platform with no administrator at all.
 */
export async function removeUser(userId: string, actingAdminId: string): Promise<void> {
  if (userId === actingAdminId) throw invalidRequest('Cannot delete your own account');

  const deleted = await database.delete(accountsTable).where(eq(accountsTable.id, userId)).returning({ id: accountsTable.id });
  if (deleted.length === 0) throw missing('User not found');
}

// ── Access codes ──────────────────────────────────────────────────────────────

export async function collectAccessCodes() {
  return database
    .select({
      id: enrolmentCodesTable.id,
      code: enrolmentCodesTable.code,
      role: enrolmentCodesTable.role,
      description: enrolmentCodesTable.description,
      isActive: enrolmentCodesTable.isActive,
      maxUses: enrolmentCodesTable.maxUses,
      useCount: enrolmentCodesTable.useCount,
      createdAt: enrolmentCodesTable.createdAt,
      createdBy: enrolmentCodesTable.createdBy,
    })
    .from(enrolmentCodesTable)
    .orderBy(desc(enrolmentCodesTable.createdAt));
}

/**
 * Creates a registration code. The code decides what role its holder gets on
 * signup, so `maxUses` is the main control on how far one can spread.
 */
export async function addAccessCode(createdBy: string, input: CreateAccessCodePayload) {
  const [existing] = await database
    .select({ id: enrolmentCodesTable.id })
    .from(enrolmentCodesTable)
    .where(eq(enrolmentCodesTable.code, input.code))
    .limit(1);
  if (existing) throw stateConflict('An access code with this value already exists');

  const [created] = await database
    .insert(enrolmentCodesTable)
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

export async function removeAccessCode(codeId: string): Promise<void> {
  const deleted = await database
    .delete(enrolmentCodesTable)
    .where(eq(enrolmentCodesTable.id, codeId))
    .returning({ id: enrolmentCodesTable.id });
  if (deleted.length === 0) throw missing('Access code not found');
}
