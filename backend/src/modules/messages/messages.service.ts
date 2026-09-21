import { desc, eq } from 'drizzle-orm';
import { db } from '../../core/db';
import { feedback, users } from '../../core/db/schema';
import { assertOwnsStudent } from '../roster';
import type { SendFeedbackInput } from './messages.schemas';

/** Teacher → student messages, from the teacher's side. The student's inbox is inbox.service.ts. */

export async function sendFeedback(teacherId: string, input: SendFeedbackInput) {
  await assertOwnsStudent(teacherId, input.studentId, 'forbidden');

  const [created] = await db
    .insert(feedback)
    .values({
      teacherId,
      studentId: input.studentId,
      examId: input.examId || null,
      content: input.content,
    })
    .returning();
  return created;
}

export async function listSentFeedback(teacherId: string) {
  return db
    .select({
      id: feedback.id,
      content: feedback.content,
      isRead: feedback.isRead,
      createdAt: feedback.createdAt,
      examId: feedback.examId,
      studentName: users.name,
      studentEmail: users.email,
    })
    .from(feedback)
    .innerJoin(users, eq(feedback.studentId, users.id))
    .where(eq(feedback.teacherId, teacherId))
    .orderBy(desc(feedback.createdAt));
}
