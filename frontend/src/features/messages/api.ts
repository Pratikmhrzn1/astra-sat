import { apiClient } from '@/shared/api/http';

/** Teacher → student feedback: the student's inbox and the teacher's sent list. */

export interface FeedbackItem {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
  examId: string | null;
  teacherName: string;
  teacherEmail: string;
}

export async function getFeedback(): Promise<FeedbackItem[]> {
  const { data } = await apiClient.get<FeedbackItem[]>('/student/feedback');
  return data;
}

export async function markFeedbackRead(feedbackId: string): Promise<void> {
  await apiClient.put(`/student/feedback/${feedbackId}/read`);
}

export interface FeedbackSent {
  id: string;
  content: string;
  isRead: boolean;
  createdAt: string;
  examId: string | null;
  studentName: string;
  studentEmail: string;
}

export async function sendFeedback(studentId: string, content: string, examId?: string): Promise<void> {
  await apiClient.post('/teacher/feedback', { studentId, content, examId });
}

export async function getSentFeedback(): Promise<FeedbackSent[]> {
  const { data } = await apiClient.get<FeedbackSent[]>('/teacher/feedback');
  return data;
}
