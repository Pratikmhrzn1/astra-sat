import { desc, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { notesTable, accountsTable } from '../../core/db/schema';
import { ensureOwnsStudent } from '../roster';
import type { SendFeedbackPayload } from './messages.schemas';

/** Teacher → student messages, from the teacher's side. The student's inbox is inbox.service.ts. */

export async function dispatchFeedback(teacherId: string, input: SendFeedbackPayload) {
  await ensureOwnsStudent(teacherId, input.studentId, 'forbidden');

  const [created] = await database
    .insert(notesTable)
    .values({
      teacherId,
      studentId: input.studentId,
      examId: input.examId || null,
      content: input.content,
    })
    .returning();
  return created;
}

export async function collectSentFeedback(teacherId: string) {
  return database
    .select({
      id: notesTable.id,
      content: notesTable.content,
      isRead: notesTable.isRead,
      createdAt: notesTable.createdAt,
      examId: notesTable.examId,
      studentName: accountsTable.name,
      studentEmail: accountsTable.email,
    })
    .from(notesTable)
    .innerJoin(accountsTable, eq(notesTable.studentId, accountsTable.id))
    .where(eq(notesTable.teacherId, teacherId))
    .orderBy(desc(notesTable.createdAt));
}
