import { apiTransport } from '@/shared/api/http';
import type { Assessment } from '@/entities/exam';

/** Practice beyond a set: exams built by topic, and AI skill passages for weak areas. */

// ── Topic practice ───────────────────────────────────────────────────────────

/** An exam drawn across every published set for one domain or skill. */
export async function openTopicAssessment(payload: {
  subject: 'english' | 'math';
  skillCode: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
}): Promise<{ exam: Assessment; questionCount: number; skill: { code: string; label: string } }> {
  const { data } = await apiTransport.post('/student/exams/topic', payload);
  return data;
}

export interface WeakAreaExtract {
  subSkill: string;
  setId: string;
  generatedContentId: string;
}

export async function fetchAvailableCompetencyPassages(): Promise<WeakAreaExtract[]> {
  const { data } = await apiTransport.get<WeakAreaExtract[]>('/student/skill-passages/available');
  return data;
}
