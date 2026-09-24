import { apiTransport } from '@/shared/api/http';

export interface LiveAssessmentSession {
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

export interface LiveAssessmentParticipant {
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

export interface SessionBreakdown extends LiveAssessmentSession {
  participants: LiveAssessmentParticipant[];
}

export interface LiveAssessmentSet {
  id: string;
  title: string;
  subject: 'english' | 'math';
  isDraft: boolean;
}

export interface LiveAssessmentResult {
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

export interface SessionAlert {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface PollReply {
  status: 'waiting' | 'active' | 'completed';
  startedAt: string | null;
  englishExamId: string | null;
  mathExamId: string | null;
  englishDurationSeconds: number;
  mathDurationSeconds: number;
}

export interface JoinReply {
  sessionId: string;
  participantId: string;
  status: 'waiting' | 'active' | 'completed';
  startedAt: string | null;
  englishExamId: string | null;
  mathExamId: string | null;
  englishDurationSeconds: number;
  mathDurationSeconds: number;
}

/** One question as the teacher marks it. Keyed on `questionId`, like the server sends. */
export interface GlyphableAnswer {
  questionId: string;
  /** Restored alongside the passage: a grid-in used to be marked as if it were multiple choice. */
  questionType: 'multiple_choice' | 'student_produced_response';
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  imageUrl: string | null;
  passageId: string | null;
  passageText: string | null;
  passageTitle: string | null;
  correctAnswer: 'a' | 'b' | 'c' | 'd' | null;
  correctAnswerText: string | null;
  explanation: string | null;
  selectedAnswer: string | null;
  selectedAnswerText: string | null;
  isCorrect: boolean | null;
  orderIndex: number;
}

export interface GlyphableSegment {
  exam: { id: string; score: number | null; scaledScore: number | null; totalQuestions: number };
  results: GlyphableAnswer[];
}

export interface ParticipantBreakdown extends LiveAssessmentParticipant {
  questionFeedbacks: { id: string; questionId: string; feedback: string }[];
  /**
   * Both papers, served with the participant rather than fetched separately.
   * Authorised by session ownership — a live exam is joined with a code, so the
   * student need not be on this teacher's roster.
   */
  english: GlyphableSegment | null;
  math: GlyphableSegment | null;
}

// ── Teacher ───────────────────────────────────────────────────────────────────

export async function fetchLiveSessions(): Promise<LiveAssessmentSession[]> {
  const { data } = await apiTransport.get<LiveAssessmentSession[]>('/teacher/live-exams');
  return data;
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionBreakdown> {
  const { data } = await apiTransport.get<SessionBreakdown>(`/teacher/live-exams/${sessionId}`);
  return data;
}

export async function addSession(body: {
  title: string;
  englishSetId: string;
  mathSetId: string;
}): Promise<LiveAssessmentSession> {
  const { data } = await apiTransport.post<LiveAssessmentSession>('/teacher/live-exams', body);
  return data;
}

export async function openSession(sessionId: string): Promise<void> {
  await apiTransport.post(`/teacher/live-exams/${sessionId}/start`);
}

export async function fetchParticipantDetail(
  sessionId: string,
  participantId: string
): Promise<ParticipantBreakdown> {
  const { data } = await apiTransport.get<ParticipantBreakdown>(
    `/teacher/live-exams/${sessionId}/participants/${participantId}`
  );
  return data;
}

export async function storeFeedback(
  sessionId: string,
  participantId: string,
  body: {
    globalFeedback?: string;
    questionFeedbacks?: { questionId: string; feedback: string }[];
  }
): Promise<void> {
  await apiTransport.post(
    `/teacher/live-exams/${sessionId}/participants/${participantId}/feedback`,
    body
  );
}

export async function publishOne(sessionId: string, participantId: string): Promise<void> {
  await apiTransport.post(
    `/teacher/live-exams/${sessionId}/participants/${participantId}/release`
  );
}

export async function publishAll(sessionId: string): Promise<{ released: number }> {
  const { data } = await apiTransport.post<{ released: number }>(
    `/teacher/live-exams/${sessionId}/release-all`
  );
  return data;
}

export async function fetchLiveAssessmentSets(): Promise<LiveAssessmentSet[]> {
  const { data } = await apiTransport.get<LiveAssessmentSet[]>('/teacher/live-exam-sets');
  return data;
}

// ── Student / Public ──────────────────────────────────────────────────────────

export async function peekSessionStatus(
  joinCode: string
): Promise<{ id: string; title: string; status: string }> {
  const { data } = await apiTransport.get(`/live/${joinCode}/status`);
  return data;
}

export async function enterSession(joinCode: string): Promise<JoinReply> {
  const { data } = await apiTransport.post<JoinReply>(`/live/${joinCode}/join`);
  return data;
}

export async function checkSession(joinCode: string): Promise<PollReply> {
  const { data } = await apiTransport.get<PollReply>(`/live/${joinCode}/poll`);
  return data;
}

export async function fetchLiveAssessmentResults(): Promise<LiveAssessmentResult[]> {
  const { data } = await apiTransport.get<LiveAssessmentResult[]>('/student/live-exam-results');
  return data;
}

export async function fetchNotifications(): Promise<SessionAlert[]> {
  const { data } = await apiTransport.get<SessionAlert[]>('/student/notifications');
  return data;
}

export async function markAlertRead(id: string): Promise<void> {
  await apiTransport.post(`/student/notifications/${id}/read`);
}
