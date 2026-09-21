import { eq, sql } from 'drizzle-orm';
import { db } from '../../core/db';
import { skills } from '../../core/db/schema';
import { badRequest, notFound } from '../../core/errors';
import { createExamWithAnswerSheet } from '../exams';
import type { TopicExamInput } from './practice.schemas';

/**
 * Practice assembled by topic rather than by set.
 *
 * This is the other half of the diagnose-then-practise loop: analytics say which
 * domain a student is weakest in, and this turns that into an exam. It draws
 * across every published set, which is why the exam it creates has no `set_id` —
 * `exam_answers` is the authoritative question list.
 *
 * Only possible now that questions carry `skill_code`. Under the old five-value
 * `sub_skill` enum there was nothing to select Math questions by.
 */

/**
 * Below this, a "topic exam" is not practice, it is a handful of questions with
 * a grand name. The catalogue uses `/skills?withCounts=true` to disable topics
 * that cannot reach it, so hitting this should be rare rather than routine.
 */
const MIN_TOPIC_QUESTIONS = 5;

export async function startTopicExam(studentId: string, input: TopicExamInput) {
  const [skill] = await db
    .select({ code: skills.code, label: skills.label, subject: skills.subject })
    .from(skills)
    .where(eq(skills.code, input.skillCode))
    .limit(1);
  if (!skill) throw notFound(`Unknown topic: ${input.skillCode}`);

  if (skill.subject !== input.subject) {
    throw badRequest(`${skill.label} is a ${skill.subject} topic, not ${input.subject}`);
  }

  const questionIds = await pickQuestions(studentId, input);

  if (questionIds.length < MIN_TOPIC_QUESTIONS) {
    throw badRequest(
      `Not enough questions for ${skill.label} yet — ${questionIds.length} available, ` +
        `${MIN_TOPIC_QUESTIONS} needed.${input.difficulty ? ' Try removing the difficulty filter.' : ''}`,
    );
  }

  const exam = await createExamWithAnswerSheet({
    studentId,
    setId: null,
    label: `Topic: ${skill.label}`,
    type: 'individual',
    questionIds,
  });

  return { exam, questionCount: questionIds.length, skill };
}

/**
 * Eligible questions for a topic, unseen ones first.
 *
 * Tagging at domain level is legitimate — it is all the classifier assigns for
 * Math — so asking for a domain has to include questions tagged on the domain
 * itself *and* on any skill beneath it. Asking for a skill matches only that
 * skill.
 *
 * "Unseen first, then random" is one ORDER BY rather than two queries: the
 * EXISTS sorts questions this student has already met to the back, and RANDOM()
 * shuffles within each group. A student who has exhausted the topic still gets an
 * exam, made of repeats, instead of an error.
 *
 * Eligibility mirrors the catalogue exactly — published, not a live-exam set, not
 * archived, not retired — because a question that cannot be served in practice
 * must not be served here either.
 */
async function pickQuestions(studentId: string, input: TopicExamInput): Promise<string[]> {
  const result = await db.execute<{ id: string }>(sql`
    SELECT q.id
      FROM questions q
      JOIN question_sets s ON s.id = q.set_id
     WHERE s.subject = ${input.subject}
       AND s.is_draft = false
       AND s.is_live_exam = false
       AND s.archived_at IS NULL
       AND q.retired_at IS NULL
       AND (
         q.skill_code = ${input.skillCode}
         OR q.skill_code IN (SELECT code FROM skills WHERE parent_code = ${input.skillCode})
       )
       ${input.difficulty ? sql`AND q.difficulty = ${input.difficulty}` : sql``}
     ORDER BY
       EXISTS (
         SELECT 1
           FROM exam_answers ea
           JOIN exams e ON e.id = ea.exam_id
          WHERE ea.question_id = q.id AND e.student_id = ${studentId}
       ) ASC,
       RANDOM()
     LIMIT ${input.count}
  `);

  return (result.rows as { id: string }[]).map((row) => row.id);
}
