import { apiClient } from '@/shared/api/http';
import type { VocabDrillContent } from '@/features/vocab';

/** Reviewing a finished exam: AI guidance per question, the narrative, and the tutor chat. */

export type ReasoningClassification =
  | 'correct_logic_correct_answer'
  | 'correct_logic_wrong_answer'
  | 'wrong_logic_correct_answer'
  | 'wrong_logic_wrong_answer';

export interface ReasoningCheckpointContent {
  classification: ReasoningClassification;
  explanation: string;
}

export interface GrammarDiagnosisContent {
  grammarRule: string;
  grammarFix: string;
}

export interface TrapExplainerContent {
  trap: string;
  explanation: string;
}

export interface CommandOfEvidenceContent {
  supportingLine: string;
  whyCorrect: string;
  whyStudentWrong: string;
}

export interface TransitionsCoachContent {
  logicalRelationship: string;
  whyCorrect: string;
  whyStudentWrong: string;
}

export interface ConfirmFeedbacks {
  reasoning_checkpoint?: ReasoningCheckpointContent | null;
  grammar_diagnosis?: GrammarDiagnosisContent | null;
  trap_explainer?: TrapExplainerContent | null;
  command_of_evidence?: CommandOfEvidenceContent | null;
  transitions_coach?: TransitionsCoachContent | null;
  vocab_drill?: VocabDrillContent | null;
}

export async function confirmAnswer(
  examId: string,
  questionId: string,
  payload: {
    selectedAnswer?: string | null;
    selectedAnswerText?: string | null;
    confidence: 'sure' | 'eliminated' | 'guessed';
    reasoning?: string;
  },
): Promise<{ isCorrect: boolean; feedbacks: ConfirmFeedbacks; vocabTrackingId: string | null }> {
  const { data } = await apiClient.post(
    `/student/exams/${examId}/questions/${questionId}/confirm`,
    payload,
  );
  return data;
}

export interface NarrativeSubSkill {
  subSkill: string;
  wrong: number;
  total: number;
  flag: boolean;
}

export interface NarrativeContent {
  scoreRange: string | null;
  primaryGap: string;
  narrative: string;
  subSkillBreakdown: NarrativeSubSkill[];
}

export interface MockNarrative {
  id: string;
  examId: string;
  content: NarrativeContent | null;
  modelUsed: string;
  latencyMs: number | null;
  costUsd: string | null;
  status: 'pending' | 'complete' | 'failed';
  createdAt: string;
}

export async function getMockNarrative(examId: string): Promise<MockNarrative> {
  const { data } = await apiClient.get<MockNarrative>(`/student/exams/${examId}/narrative`);
  return data;
}

export async function retryNarrative(examId: string): Promise<void> {
  await apiClient.post(`/student/exams/${examId}/narrative/retry`);
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export async function sendChatMessage(params: {
  sessionId?: string;
  userMessage: string;
  examId?: string;
  questionId?: string;
}): Promise<{ sessionId: string; assistantMessage: string }> {
  const { data } = await apiClient.post('/student/chat', params);
  return data;
}

export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await apiClient.get<ChatMessage[]>(`/student/chat/${sessionId}/messages`);
  return data;
}
