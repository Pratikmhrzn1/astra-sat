import { eq } from 'drizzle-orm';
import { db } from '../../core/db';
import { studentProfiles } from '../../core/db/schema';
import type { UpdateProfileInput } from './student.schemas';

/**
 * The goal a student is working towards: a target total and the sitting they
 * are preparing for.
 *
 * The dashboard used to compare everyone against a hardcoded 1500, so the gap it
 * showed was meaningless for any student who was not aiming there. A row is
 * created on first save rather than at signup, which is what lets the dashboard
 * distinguish "no target set yet" from "target of zero" and prompt instead of
 * inventing a number.
 */

export type StudentProfile = typeof studentProfiles.$inferSelect;

/** Null when the student has not set a goal yet — the caller must prompt, not guess. */
export async function getProfile(studentId: string): Promise<StudentProfile | null> {
  const [profile] = await db
    .select()
    .from(studentProfiles)
    .where(eq(studentProfiles.studentId, studentId))
    .limit(1);
  return profile ?? null;
}

/**
 * Creates or updates the student's goal.
 *
 * An upsert on the unique `student_id` rather than a read-then-write, so two
 * concurrent saves cannot race into a duplicate-key error.
 */
export async function upsertProfile(
  studentId: string,
  input: UpdateProfileInput,
): Promise<StudentProfile> {
  const values = {
    targetScore: input.targetScore ?? null,
    testDate: input.testDate ?? null,
    updatedAt: new Date(),
  };

  const [profile] = await db
    .insert(studentProfiles)
    .values({ studentId, ...values })
    .onConflictDoUpdate({ target: studentProfiles.studentId, set: values })
    .returning();

  return profile;
}
