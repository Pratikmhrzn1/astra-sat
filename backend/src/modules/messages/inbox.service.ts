import { and, desc, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { notesTable, accountsTable } from '../../core/db/schema';
import { missing } from '../../core/errors';

/** Teacher-written feedback addressed to this student. */
export async function collectFeedback(studentId: string) {
  return database
    .select({
      id: notesTable.id,
      content: notesTable.content,
      isRead: notesTable.isRead,
      createdAt: notesTable.createdAt,
      readAt: notesTable.readAt,
      examId: notesTable.examId,
      teacherName: accountsTable.name,
      teacherEmail: accountsTable.email,
    })
    .from(notesTable)
    .innerJoin(accountsTable, eq(notesTable.teacherId, accountsTable.id))
    .where(eq(notesTable.studentId, studentId))
    .orderBy(desc(notesTable.createdAt));
}

export async function flagNoteSeen(studentId: string, feedbackId: string): Promise<void> {
  // Scoped to the student so one id cannot mark another student's mail read.
  const updated = await database
    .update(notesTable)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(notesTable.id, feedbackId), eq(notesTable.studentId, studentId)))
    .returning({ id: notesTable.id });

  if (updated.length === 0) throw missing('Feedback not found');
}
