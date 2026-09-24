import { apiTransport } from '@/shared/api/http';
import type { LexiconDrillContent } from '@/features/vocab';

/** Reviewing a finished exam: AI guidance per question, the narrative, and the tutor chat. */

export type ReasoningTag =
  | 'correct_logic_correct_answer'
  | 'correct_logic_wrong_answer'
  | 'wrong_logic_correct_answer'
  | 'wrong_logic_wrong_answer';

export interface ReasoningCheckpointAuthoring {
  classification: ReasoningTag;
  explanation: string;
}

export interface GrammarDiagnosisAuthoring {
  grammarRule: string;
  grammarFix: string;
}

export interface TrapExplainerAuthoring {
  trap: string;
  explanation: string;
}

export interface CommandOfEvidenceAuthoring {
  supportingLine: string;
  whyCorrect: string;
  whyStudentWrong: string;
}

export interface TransitionsCoachAuthoring {
  logicalRelationship: string;
  whyCorrect: string;
  whyStudentWrong: string;
}

export interface AcknowledgeNotes {
  reasoning_checkpoint?: ReasoningCheckpointAuthoring | null;
  grammar_diagnosis?: GrammarDiagnosisAuthoring | null;
  trap_explainer?: TrapExplainerAuthoring | null;
  command_of_evidence?: CommandOfEvidenceAuthoring | null;
  transitions_coach?: TransitionsCoachAuthoring | null;
  vocab_drill?: LexiconDrillContent | null;
}

export async function acknowledgeAnswer(
  examId: string,
  questionId: string,
  payload: {
    selectedAnswer?: string | null;
    selectedAnswerText?: string | null;
    confidence: 'sure' | 'eliminated' | 'guessed';
    reasoning?: string;
  },
): Promise<{ isCorrect: boolean; feedbacks: AcknowledgeNotes; vocabTrackingId: string | null }> {
  const { data } = await apiTransport.post(
    `/student/exams/${examId}/questions/${questionId}/confirm`,
    payload,
  );
  return data;
}

export interface NarrativeSubCompetency {
  subSkill: string;
  wrong: number;
  total: number;
  flag: boolean;
}

export interface SummaryAuthoring {
  scoreRange: string | null;
  primaryGap: string;
  narrative: string;
  subSkillBreakdown: NarrativeSubCompetency[];
}

export interface TrialSummary {
  id: string;
  examId: string;
  content: SummaryAuthoring | null;
  modelUsed: string;
  latencyMs: number | null;
  costUsd: string | null;
  status: 'pending' | 'complete' | 'failed';
  createdAt: string;
}

export async function fetchMockNarrative(examId: string): Promise<TrialSummary> {
  const { data } = await apiTransport.get<TrialSummary>(`/student/exams/${examId}/narrative`);
  return data;
}

export async function retrySummary(examId: string): Promise<void> {
  await apiTransport.post(`/student/exams/${examId}/narrative/retry`);
}

export interface TutorNote {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export async function dispatchChatMessage(params: {
  sessionId?: string;
  userMessage: string;
  examId?: string;
  questionId?: string;
}): Promise<{ sessionId: string; assistantMessage: string }> {
  const { data } = await apiTransport.post('/student/chat', params);
  return data;
}

export async function fetchChatMessages(sessionId: string): Promise<TutorNote[]> {
  const { data } = await apiTransport.get<TutorNote[]>(`/student/chat/${sessionId}/messages`);
  return data;
}
