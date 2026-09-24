import { apiTransport } from '@/shared/api/http';

/**
 * The onboarding survey. Admins author the questions; a new student answers
 * them once, before the rest of the app is reachable.
 */

export type IntakeQuestionType = 'single_choice' | 'multi_choice' | 'short_text' | 'scale';

/** A string for text and single choice, a string[] for multi choice, a number for scale. */
export type IntakeAnswer = string | string[] | number;

export const SCALE_FLOOR = 1;
export const SCALE_CEILING = 5;

export interface IntakeQuestion {
  id: string;
  prompt: string;
  type: IntakeQuestionType;
  options: string[];
  isRequired: boolean;
}

export interface AdminIntakeQuestion extends IntakeQuestion {
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  /** How many students answered it — what a delete would take with it. */
  responseCount: number;
}

export interface IntakeState {
  completed: boolean;
  questions: IntakeQuestion[];
}

export interface IntakeRespondentAnswer {
  questionId: string;
  prompt: string;
  /** Carried so an answer renders correctly without re-joining the question list. */
  type: IntakeQuestionType;
  answer: IntakeAnswer;
}

export interface IntakeRespondent {
  userId: string;
  userName: string | null;
  userEmail: string | null;
  submittedAt: string;
  answers: IntakeRespondentAnswer[];
}

export interface IntakeQuestionPayload {
  prompt: string;
  type: IntakeQuestionType;
  options: string[];
  isRequired: boolean;
  isActive: boolean;
}

// ── Student ──────────────────────────────────────────────────────────────────

export async function fetchIntake(): Promise<IntakeState> {
  const { data } = await apiTransport.get<IntakeState>('/student/survey');
  return data;
}

export async function commitIntake(
  answers: { questionId: string; answer: IntakeAnswer }[],
): Promise<{ ok: boolean; answered: number }> {
  const { data } = await apiTransport.post('/student/survey', { answers });
  return data;
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function fetchIntakeQuestions(): Promise<AdminIntakeQuestion[]> {
  const { data } = await apiTransport.get<AdminIntakeQuestion[]>('/admin/survey-questions');
  return data;
}

export async function addIntakeQuestion(payload: IntakeQuestionPayload): Promise<AdminIntakeQuestion> {
  const { data } = await apiTransport.post<AdminIntakeQuestion>('/admin/survey-questions', payload);
  return data;
}

export async function editIntakeQuestion(
  id: string,
  payload: Partial<IntakeQuestionPayload>,
): Promise<AdminIntakeQuestion> {
  const { data } = await apiTransport.patch<AdminIntakeQuestion>(`/admin/survey-questions/${id}`, payload);
  return data;
}

export async function removeIntakeQuestion(id: string): Promise<void> {
  await apiTransport.delete(`/admin/survey-questions/${id}`);
}

/** Sends the whole list in its new order; the server stores the index. */
export async function reorderIntakeQuestions(ids: string[]): Promise<void> {
  await apiTransport.put('/admin/survey-questions/reorder', { ids });
}

export async function fetchIntakeResponses(): Promise<IntakeRespondent[]> {
  const { data } = await apiTransport.get<IntakeRespondent[]>('/admin/survey-responses');
  return data;
}
