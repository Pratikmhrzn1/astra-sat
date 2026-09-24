import { desc, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { reportsTable, accountsTable } from '../../core/db/schema';
import { missing } from '../../core/errors';
import type { SubmitFeedbackPayload } from './platform-feedback.schemas';

/**
 * Bug reports and suggestions about the platform itself, submitted from the
 * in-app feedback modal. Any signed-in user can file one; only admins read them.
 */

export async function commitFeedback(userId: string, input: SubmitFeedbackPayload) {
  const [row] = await database
    .insert(reportsTable)
    .values({ userId, category: input.category, message: input.message })
    .returning({ id: reportsTable.id });
  return row;
}

export async function collectReports() {
  // LEFT JOIN so a report survives the reporter's account being deleted.
  return database
    .select({
      id: reportsTable.id,
      category: reportsTable.category,
      message: reportsTable.message,
      isRead: reportsTable.isRead,
      createdAt: reportsTable.createdAt,
      userId: reportsTable.userId,
      userName: accountsTable.name,
      userEmail: accountsTable.email,
    })
    .from(reportsTable)
    .leftJoin(accountsTable, eq(reportsTable.userId, accountsTable.id))
    .orderBy(desc(reportsTable.createdAt));
}

export async function flagReportSeen(id: string): Promise<void> {
  const updated = await database
    .update(reportsTable)
    .set({ isRead: true })
    .where(eq(reportsTable.id, id))
    .returning({ id: reportsTable.id });
  if (updated.length === 0) throw missing('Feedback not found');
}

export async function removeFeedback(id: string): Promise<void> {
  const deleted = await database
    .delete(reportsTable)
    .where(eq(reportsTable.id, id))
    .returning({ id: reportsTable.id });
  if (deleted.length === 0) throw missing('Feedback not found');
}
