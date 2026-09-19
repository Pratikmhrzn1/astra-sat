import { apiClient } from '@/shared/api/http';
import type { Exam } from '@/entities/exam';

// ── Mistake bank ─────────────────────────────────────────────────────────────

/**
 * One question the student has got wrong, with everything needed to learn from
 * it. The correct answer and explanation are included because these come from
 * exams they have already completed and reviewed.
 */
export interface Mistake {
  questionId: string;
  questionType: 'multiple_choice' | 'student_produced_response';
  questionText: string;
  optionA: string | null;
  optionB: string | null;
  optionC: string | null;
  optionD: string | null;
  correctAnswer: 'a' | 'b' | 'c' | 'd' | null;
  correctAnswerText: string | null;
  explanation: string | null;
  /**
   * What was picked on the attempt that most recently got this wrong. Null when
   * the question was left blank — a blank counts as a miss — and also null when
   * the originating answer row is gone, so a caller that needs to tell "skipped"
   * from "unknown" has to check both this and `selectedAnswerText`.
   */
  selectedAnswer: 'a' | 'b' | 'c' | 'd' | null;
  selectedAnswerText: string | null;
  skillCode: string | null;
  skillLabel: string | null;
  /** The domain the skill sits under, or the code itself when it is a domain. */
  domainCode: string | null;
  subject: 'english' | 'math';
  difficulty: 'easy' | 'medium' | 'hard' | null;
  missCount: number;
  firstMissedAt: string;
  lastMissedAt: string;
  /** Set when a later correct answer cleared it. Null while it is still open. */
  resolvedAt: string | null;
}

export interface MistakeSummaryRow {
  domainCode: string | null;
  subject: 'english' | 'math';
  openCount: number;
}

export async function getMistakes(filters: {
  subject?: 'english' | 'math';
  skillCode?: string;
  status?: 'open' | 'resolved';
} = {}): Promise<Mistake[]> {
  const { data } = await apiClient.get<Mistake[]>('/student/mistakes', { params: filters });
  return data;
}

export async function getMistakeSummary(): Promise<MistakeSummaryRow[]> {
  const { data } = await apiClient.get<MistakeSummaryRow[]>('/student/mistakes/summary');
  return data;
}

/** Builds a review exam from open mistakes. Resolution happens on submit. */
export async function startMistakePractice(payload: {
  subject?: 'english' | 'math';
  skillCode?: string;
  limit?: number;
}): Promise<{ exam: Exam; questionCount: number }> {
  const { data } = await apiClient.post('/student/mistakes/practice', payload);
  return data;
}
