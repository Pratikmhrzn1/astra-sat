import { apiClient } from '@/shared/api/http';
import type { Exam, QuestionWithAnswer } from '@/entities/exam';
import type { AnalyticsOverview, StudentProfile } from '@/features/progress';

export interface Student {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export async function getStudents(): Promise<Student[]> {
  const { data } = await apiClient.get<Student[]>('/teacher/students');
  return data;
}

/**
 * The same analytics the student sees, for a student on this teacher's roster.
 * Same endpoint shape, so the two views cannot disagree about a percentage.
 */
export async function getStudentAnalytics(studentId: string): Promise<AnalyticsOverview> {
  const { data } = await apiClient.get<AnalyticsOverview>(`/teacher/students/${studentId}/analytics`);
  return data;
}

/** `profile` is null until the student sets a goal — show that, don't substitute one. */
export async function getStudentDetail(studentId: string): Promise<{
  student: { id: string; name: string; email: string; role: string };
  profile: StudentProfile | null;
}> {
  const { data } = await apiClient.get(`/teacher/students/${studentId}`);
  return data;
}

/**
 * `setTitle` and `subject` are null for an exam that belongs to no set — topic
 * practice and mistake reviews are assembled across many sets. Those carry a
 * `label` of their own instead.
 */
export async function getStudentExams(
  studentId: string,
): Promise<(Exam & { setTitle: string | null; label: string | null; subject: string | null })[]> {
  const { data } = await apiClient.get(`/teacher/students/${studentId}/exams`);
  return data;
}

/**
 * Note the row key: this endpoint returns `questionId`, not `id` — unlike the
 * student-facing results endpoint, which returns `id`. The type said `id` here,
 * so every row arrived with `id: undefined`; the teacher's results page was
 * keying its list on undefined.
 */
export async function getStudentExamResults(studentId: string, examId: string): Promise<{
  exam: Exam;
  set: { title: string; subject: string } | null;
  student: Student;
  results: (Omit<QuestionWithAnswer, 'id'> & { questionId: string })[];
}> {
  const { data } = await apiClient.get(`/teacher/students/${studentId}/exams/${examId}/results`);
  return data;
}
