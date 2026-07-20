import { apiClient } from './client';

export interface LiveExamSession {
  id: string;
  title: string;
  teacherId: string;
  joinCode: string;
  englishSetId: string;
  mathSetId: string;
  status: 'waiting' | 'active' | 'completed';
  startedAt: string | null;
  englishDurationSeconds: number;
  mathDurationSeconds: number;
  createdAt: string;
}

export interface LiveExamParticipant {
  id: string;
  studentId: string;
  englishExamId: string | null;
  mathExamId: string | null;
  globalFeedback: string | null;
  resultReleased: boolean;
  joinedAt: string;
  name: string;
  email: string;
}

export interface SessionDetail extends LiveExamSession {
  participants: LiveExamParticipant[];
}

export interface LiveExamSet {
  id: string;
  title: string;
  subject: 'english' | 'math';
  isDraft: boolean;
}

export interface LiveExamResult {
  sessionId: string;
  sessionTitle: string;
  sessionStatus: string;
  startedAt: string | null;
  participantId: string;
  englishExamId: string | null;
  mathExamId: string | null;
  globalFeedback: string | null;
  resultReleased: boolean;
  joinedAt: string;
}

export interface LiveNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PollResponse {
  status: 'waiting' | 'active' | 'completed';
  startedAt: string | null;
  englishExamId: string | null;
  mathExamId: string | null;
  englishDurationSeconds: number;
  mathDurationSeconds: number;
}

export interface JoinResponse {
  sessionId: string;
  participantId: string;
  status: 'waiting' | 'active' | 'completed';
  startedAt: string | null;
  englishExamId: string | null;
  mathExamId: string | null;
  englishDurationSeconds: number;
  mathDurationSeconds: number;
}

export interface ParticipantDetail extends LiveExamParticipant {
  questionFeedbacks: { id: string; questionId: string; feedback: string }[];
}

// ── Teacher ───────────────────────────────────────────────────────────────────

export async function getLiveSessions(): Promise<LiveExamSession[]> {
  const { data } = await apiClient.get<LiveExamSession[]>('/api/teacher/live-exams');
  return data;
}

export async function getSessionDetail(sessionId: string): Promise<SessionDetail> {
  const { data } = await apiClient.get<SessionDetail>(`/api/teacher/live-exams/${sessionId}`);
  return data;
}

export async function createSession(body: {
  title: string;
  englishSetId: string;
  mathSetId: string;
}): Promise<LiveExamSession> {
  const { data } = await apiClient.post<LiveExamSession>('/api/teacher/live-exams', body);
  return data;
}

export async function startSession(sessionId: string): Promise<void> {
  await apiClient.post(`/api/teacher/live-exams/${sessionId}/start`);
}

export async function getParticipantDetail(
  sessionId: string,
  participantId: string
): Promise<ParticipantDetail> {
  const { data } = await apiClient.get<ParticipantDetail>(
    `/api/teacher/live-exams/${sessionId}/participants/${participantId}`
  );
  return data;
}

export async function saveFeedback(
  sessionId: string,
  participantId: string,
  body: {
    globalFeedback?: string;
    questionFeedbacks?: { questionId: string; feedback: string }[];
  }
): Promise<void> {
  await apiClient.post(
    `/api/teacher/live-exams/${sessionId}/participants/${participantId}/feedback`,
    body
  );
}

export async function releaseOne(sessionId: string, participantId: string): Promise<void> {
  await apiClient.post(
    `/api/teacher/live-exams/${sessionId}/participants/${participantId}/release`
  );
}

export async function releaseAll(sessionId: string): Promise<{ released: number }> {
  const { data } = await apiClient.post<{ released: number }>(
    `/api/teacher/live-exams/${sessionId}/release-all`
  );
  return data;
}

export async function getLiveExamSets(): Promise<LiveExamSet[]> {
  const { data } = await apiClient.get<LiveExamSet[]>('/api/teacher/live-exam-sets');
  return data;
}

// ── Student / Public ──────────────────────────────────────────────────────────

export async function checkSessionStatus(
  joinCode: string
): Promise<{ id: string; title: string; status: string }> {
  const { data } = await apiClient.get(`/api/live/${joinCode}/status`);
  return data;
}

export async function joinSession(joinCode: string): Promise<JoinResponse> {
  const { data } = await apiClient.post<JoinResponse>(`/api/live/${joinCode}/join`);
  return data;
}

export async function pollSession(joinCode: string): Promise<PollResponse> {
  const { data } = await apiClient.get<PollResponse>(`/api/live/${joinCode}/poll`);
  return data;
}

export async function getLiveExamResults(): Promise<LiveExamResult[]> {
  const { data } = await apiClient.get<LiveExamResult[]>('/api/student/live-exam-results');
  return data;
}

export async function getNotifications(): Promise<LiveNotification[]> {
  const { data } = await apiClient.get<LiveNotification[]>('/api/student/notifications');
  return data;
}

export async function markNotificationRead(id: string): Promise<void> {
  await apiClient.post(`/api/student/notifications/${id}/read`);
}
