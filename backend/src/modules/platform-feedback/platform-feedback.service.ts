import { desc, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { platformFeedback, users } from '../../core/db/schema';
import { missing } from '../../core/errors';
import type { SubmitFeedbackPayload } from './platform-feedback.schemas';

/**
 * Bug reports and suggestions about the platform itself, submitted from the
 * in-app feedback modal. Any signed-in user can file one; only admins read them.
 */

export async function commitFeedback(userId: string, input: SubmitFeedbackPayload) {
  const [row] = await database
    .insert(platformFeedback)
    .values({ userId, category: input.category, message: input.message })
    .returning({ id: platformFeedback.id });
  return row;
}

export async function collectReports() {
  // LEFT JOIN so a report survives the reporter's account being deleted.
  return database
    .select({
      id: platformFeedback.id,
      category: platformFeedback.category,
      message: platformFeedback.message,
      isRead: platformFeedback.isRead,
      createdAt: platformFeedback.createdAt,
      userId: platformFeedback.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(platformFeedback)
    .leftJoin(users, eq(platformFeedback.userId, users.id))
    .orderBy(desc(platformFeedback.createdAt));
}

export async function flagReportSeen(id: string): Promise<void> {
  const updated = await database
    .update(platformFeedback)
    .set({ isRead: true })
    .where(eq(platformFeedback.id, id))
    .returning({ id: platformFeedback.id });
  if (updated.length === 0) throw missing('Feedback not found');
}

export async function removeFeedback(id: string): Promise<void> {
  const deleted = await database
    .delete(platformFeedback)
    .where(eq(platformFeedback.id, id))
    .returning({ id: platformFeedback.id });
  if (deleted.length === 0) throw missing('Feedback not found');
}
