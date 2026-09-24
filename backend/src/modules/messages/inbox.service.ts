import { and, desc, eq } from 'drizzle-orm';
import { database } from '../../core/db';
import { feedback, users } from '../../core/db/schema';
import { missing } from '../../core/errors';

/** Teacher-written feedback addressed to this student. */
export async function listFeedback(studentId: string) {
  return database
    .select({
      id: feedback.id,
      content: feedback.content,
      isRead: feedback.isRead,
      createdAt: feedback.createdAt,
      readAt: feedback.readAt,
      examId: feedback.examId,
      teacherName: users.name,
      teacherEmail: users.email,
    })
    .from(feedback)
    .innerJoin(users, eq(feedback.teacherId, users.id))
    .where(eq(feedback.studentId, studentId))
    .orderBy(desc(feedback.createdAt));
}

export async function markFeedbackRead(studentId: string, feedbackId: string): Promise<void> {
  // Scoped to the student so one id cannot mark another student's mail read.
  const updated = await database
    .update(feedback)
    .set({ isRead: true, readAt: new Date() })
    .where(and(eq(feedback.id, feedbackId), eq(feedback.studentId, studentId)))
    .returning({ id: feedback.id });

  if (updated.length === 0) throw missing('Feedback not found');
}
