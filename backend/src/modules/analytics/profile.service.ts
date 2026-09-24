import { eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { learnerProfilesTable } from '../../core/db/schema';
import type { UpdateLearnerProfilePayload } from './analytics.schemas';

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

export type LearnerProfile = typeof learnerProfilesTable.$inferSelect;

/** Null when the student has not set a goal yet — the caller must prompt, not guess. */
export async function fetchLearnerProfile(studentId: string): Promise<LearnerProfile | null> {
  const [profile] = await database
    .select()
    .from(learnerProfilesTable)
    .where(eq(learnerProfilesTable.studentId, studentId))
    .limit(1);
  return profile ?? null;
}

/**
 * Creates or updates the student's goal.
 *
 * An upsert on the unique `student_id` rather than a read-then-write, so two
 * concurrent saves cannot race into a duplicate-key error.
 */
export async function saveLearnerProfile(
  studentId: string,
  input: UpdateLearnerProfilePayload,
): Promise<LearnerProfile> {
  const values = {
    targetScore: input.targetScore ?? null,
    testDate: input.testDate ?? null,
    updatedAt: new Date(),
  };

  const [profile] = await database
    .insert(learnerProfilesTable)
    .values({ studentId, ...values })
    .onConflictDoUpdate({ target: learnerProfilesTable.studentId, set: values })
    .returning();

  return profile;
}
