import { apiTransport } from '@/shared/api/http';
import type { Assessment, ItemWithAnswer } from '@/entities/exam';
import type { InsightsOverview, LearnerProfile } from '@/features/progress';

export interface Learner {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export async function fetchLearners(): Promise<Learner[]> {
  const { data } = await apiTransport.get<Learner[]>('/teacher/students');
  return data;
}

/**
 * The same analytics the student sees, for a student on this teacher's roster.
 * Same endpoint shape, so the two views cannot disagree about a percentage.
 */
export async function fetchLearnerAnalytics(studentId: string): Promise<InsightsOverview> {
  const { data } = await apiTransport.get<InsightsOverview>(`/teacher/students/${studentId}/analytics`);
  return data;
}

/** `profile` is null until the student sets a goal — show that, don't substitute one. */
export async function fetchLearnerDetail(studentId: string): Promise<{
  student: { id: string; name: string; email: string; role: string };
  profile: LearnerProfile | null;
}> {
  const { data } = await apiTransport.get(`/teacher/students/${studentId}`);
  return data;
}

/**
 * `setTitle` and `subject` are null for an exam that belongs to no set — topic
 * practice and mistake reviews are assembled across many sets. Those carry a
 * `label` of their own instead.
 */
export async function fetchLearnerAssessments(
  studentId: string,
): Promise<(Assessment & { setTitle: string | null; label: string | null; subject: string | null })[]> {
  const { data } = await apiTransport.get(`/teacher/students/${studentId}/exams`);
  return data;
}

/**
 * Note the row key: this endpoint returns `questionId`, not `id` — unlike the
 * student-facing results endpoint, which returns `id`. The type said `id` here,
 * so every row arrived with `id: undefined`; the teacher's results page was
 * keying its list on undefined.
 */
export async function fetchLearnerAssessmentResults(studentId: string, examId: string): Promise<{
  exam: Assessment;
  set: { title: string; subject: string } | null;
  student: Learner;
  results: (Omit<ItemWithAnswer, 'id'> & { questionId: string })[];
}> {
  const { data } = await apiTransport.get(`/teacher/students/${studentId}/exams/${examId}/results`);
  return data;
}
