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

/** Today's test starts against the account's daily limit. `limit: null` means unlimited. */
export interface DailyUsage {
  limit: number | null;
  used: number;
  remaining: number | null;
  /** When today's count resets (midnight, Nepal time). */
  resetsAt: string;
}

export async function fetchDailyUsage(): Promise<DailyUsage> {
  const { data } = await apiTransport.get<DailyUsage>('/student/daily-usage');
  return data;
}
