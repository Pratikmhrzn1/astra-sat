import { apiClient } from '@/shared/api/client';

export interface FeedbackItem {
  id: string;
  category: 'bug' | 'suggestion' | 'other';
  message: string;
  isRead: boolean;
  createdAt: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
}

export async function submitFeedback(payload: {
  category: 'bug' | 'suggestion' | 'other';
  message: string;
}): Promise<{ id: string }> {
  const { data } = await apiClient.post<{ id: string }>('/feedback', payload);
  return data;
}

export async function getAdminFeedback(): Promise<FeedbackItem[]> {
  const { data } = await apiClient.get<FeedbackItem[]>('/feedback');
  return data;
}

export async function markFeedbackRead(id: string): Promise<void> {
  await apiClient.patch(`/feedback/${id}/read`);
}

export async function deleteFeedback(id: string): Promise<void> {
  await apiClient.delete(`/feedback/${id}`);
}
