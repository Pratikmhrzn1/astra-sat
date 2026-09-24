import { apiTransport } from '@/shared/api/http';

export interface ReportNote {
  id: string;
  category: 'bug' | 'suggestion' | 'other';
  message: string;
  isRead: boolean;
  createdAt: string;
  userId: string;
  userName: string | null;
  userEmail: string | null;
}

export async function commitFeedback(payload: {
  category: 'bug' | 'suggestion' | 'other';
  message: string;
}): Promise<{ id: string }> {
  const { data } = await apiTransport.post<{ id: string }>('/feedback', payload);
  return data;
}

export async function fetchAdminFeedback(): Promise<ReportNote[]> {
  const { data } = await apiTransport.get<ReportNote[]>('/feedback');
  return data;
}

export async function flagReportSeen(id: string): Promise<void> {
  await apiTransport.patch(`/feedback/${id}/read`);
}

export async function removeFeedback(id: string): Promise<void> {
  await apiTransport.delete(`/feedback/${id}`);
}
