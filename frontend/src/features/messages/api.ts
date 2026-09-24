import { apiTransport } from '@/shared/api/http';

/** Teacher → student feedback: the student's inbox and the teacher's sent list. */

export interface CoachNote {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  examId: string | null;
  teacherName: string;
  teacherEmail: string;
}

export async function fetchFeedback(): Promise<CoachNote[]> {
  const { data } = await apiTransport.get<CoachNote[]>('/student/feedback');
  return data;
}

export async function flagCoachNoteSeen(feedbackId: string): Promise<void> {
  await apiTransport.put(`/student/feedback/${feedbackId}/read`);
}

export interface NoteSent {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  examId: string | null;
  studentName: string;
  studentEmail: string;
}

export async function dispatchFeedback(studentId: string, content: string, examId?: string): Promise<void> {
  await apiTransport.post('/teacher/feedback', { studentId, content, examId });
}

export async function fetchSentFeedback(): Promise<NoteSent[]> {
  const { data } = await apiTransport.get<NoteSent[]>('/teacher/feedback');
  return data;
}
