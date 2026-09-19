import { apiClient } from '@/shared/api/http';

/**
 * The onboarding survey. Admins author the questions; a new student answers
 * them once, before the rest of the app is reachable.
 */

export type SurveyQuestionType = 'single_choice' | 'multi_choice' | 'short_text' | 'scale';

/** A string for text and single choice, a string[] for multi choice, a number for scale. */
export type SurveyAnswer = string | string[] | number;

export const SCALE_MIN = 1;
export const SCALE_MAX = 5;

export interface SurveyQuestion {
  id: string;
  prompt: string;
  type: SurveyQuestionType;
  options: string[];
  isRequired: boolean;
}

export interface AdminSurveyQuestion extends SurveyQuestion {
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  /** How many students answered it — what a delete would take with it. */
  responseCount: number;
}

export interface SurveyState {
  completed: boolean;
  questions: SurveyQuestion[];
}

export interface SurveyRespondentAnswer {
  questionId: string;
  prompt: string;
  /** Carried so an answer renders correctly without re-joining the question list. */
  type: SurveyQuestionType;
  answer: SurveyAnswer;
}

export interface SurveyRespondent {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  submittedAt: string;
  answers: SurveyRespondentAnswer[];
}

export interface SurveyQuestionPayload {
  prompt: string;
  type: SurveyQuestionType;
  options: string[];
  isRequired: boolean;
  isActive: boolean;
}

// ── Student ──────────────────────────────────────────────────────────────────

export async function getSurvey(): Promise<SurveyState> {
  const { data } = await apiClient.get<SurveyState>('/student/survey');
  return data;
}

export async function submitSurvey(
  answers: { questionId: string; answer: SurveyAnswer }[],
): Promise<{ ok: boolean; answered: number }> {
  const { data } = await apiClient.post('/student/survey', { answers });
  return data;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function getSurveyQuestions(): Promise<AdminSurveyQuestion[]> {
  const { data } = await apiClient.get<AdminSurveyQuestion[]>('/admin/survey-questions');
  return data;
}

export async function createSurveyQuestion(payload: SurveyQuestionPayload): Promise<AdminSurveyQuestion> {
  const { data } = await apiClient.post<AdminSurveyQuestion>('/admin/survey-questions', payload);
  return data;
}

export async function updateSurveyQuestion(
  id: string,
  payload: Partial<SurveyQuestionPayload>,
): Promise<AdminSurveyQuestion> {
  const { data } = await apiClient.patch<AdminSurveyQuestion>(`/admin/survey-questions/${id}`, payload);
  return data;
}

export async function deleteSurveyQuestion(id: string): Promise<void> {
  await apiClient.delete(`/admin/survey-questions/${id}`);
}

/** Sends the whole list in its new order; the server stores the index. */
export async function reorderSurveyQuestions(ids: string[]): Promise<void> {
  await apiClient.put('/admin/survey-questions/reorder', { ids });
}

export async function getSurveyResponses(): Promise<SurveyRespondent[]> {
  const { data } = await apiClient.get<SurveyRespondent[]>('/admin/survey-responses');
  return data;
}
