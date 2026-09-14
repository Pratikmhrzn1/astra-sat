import { apiClient } from '@/shared/api/http';
import type { Exam } from '@/entities/exam';

/** Practice beyond a set: exams built by topic, and AI skill passages for weak areas. */

// ── Topic practice ───────────────────────────────────────────────────────────

/** An exam drawn across every published set for one domain or skill. */
export async function startTopicExam(payload: {
  subject: 'english' | 'math';
  skillCode: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  count?: number;
}): Promise<{ exam: Exam; questionCount: number; skill: { code: string; label: string } }> {
  const { data } = await apiClient.post('/student/exams/topic', payload);
  return data;
}

export interface WeakAreaPassage {
  subSkill: string;
  setId: string;
  generatedContentId: string;
}

export async function getAvailableSkillPassages(): Promise<WeakAreaPassage[]> {
  const { data } = await apiClient.get<WeakAreaPassage[]>('/student/skill-passages/available');
  return data;
}
