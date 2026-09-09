import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { examAnswers, exams, questions } from '../../db/schema';

/**
 * Creating an exam, in one place.
 *
 * An exam is not just a row in `exams`: it is that row plus one blank
 * `exam_answers` row per question, and a `total_questions` count. Everything
 * downstream assumes all three exist — saving an answer only UPDATEs an
 * existing row, grading joins over those rows, and the reported percentage
 * divides by `total_questions`. An exam created without them silently accepts
 * no answers and scores zero out of zero.
 *
 * Both the practice/mock flow and live exams provision through here so that
 * invariant cannot be half-applied by whichever caller forgets a step.
 */

export type ExamType = 'individual' | 'mock_english' | 'mock_math';

/** Question ids of a set in presentation order. */
export async function findQuestionIdsForSet(setId: string): Promise<string[]> {
  const rows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(eq(questions.setId, setId))
    .orderBy(questions.orderIndex);
  return rows.map((row) => row.id);
}

export async function createExamWithAnswerSheet(input: {
  studentId: string;
  setId: string;
  type: ExamType;
  questionIds: string[];
}) {
  return db.transaction(async (tx) => {
    const [exam] = await tx
      .insert(exams)
      .values({
        studentId: input.studentId,
        setId: input.setId,
        type: input.type,
        totalQuestions: input.questionIds.length,
      })
      .returning();

    if (input.questionIds.length > 0) {
      await tx
        .insert(examAnswers)
        .values(input.questionIds.map((questionId) => ({ examId: exam.id, questionId })));
    }

    return exam;
  });
}

/** Provisions an exam for a set, looking the questions up first. */
export async function createExamForSet(input: {
  studentId: string;
  setId: string;
  type: ExamType;
}) {
  const questionIds = await findQuestionIdsForSet(input.setId);
  return createExamWithAnswerSheet({ ...input, questionIds });
}
