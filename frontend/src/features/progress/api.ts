import { apiTransport } from '@/shared/api/http';

/** A student's analytics and goal. Teachers read the same shapes through the roster. */

/** The goal a student is working towards. Null until they set one. */
export interface LearnerProfile {
  id: string;
  studentId: string;
  targetScore: number | null;
  testDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Profile ──────────────────────────────────────────────────────────────────

/** Null when the student has not set a goal — callers must prompt, not guess. */
export async function fetchProfile(): Promise<LearnerProfile | null> {
  const { data } = await apiTransport.get<LearnerProfile | null>('/student/profile');
  return data;
}

export async function editLearnerDossier(payload: {
  targetScore?: number | null;
  testDate?: string | null;
}): Promise<LearnerProfile> {
  const { data } = await apiTransport.put<LearnerProfile>('/student/profile', payload);
  return data;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface DomainHitRate {
  domainCode: string;
  domainLabel: string;
  subject: 'english' | 'math';
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface CompetencyAccuracy extends DomainHitRate {
  skillCode: string | null;
  skillLabel: string | null;
}

export interface SeriesPoint {
  at: string;
  kind: 'mock' | 'practice';
  label: string;
  total: number | null;
  rw: number | null;
  math: number | null;
}

export interface Preparedness {
  latestTotal: number | null;
  rollingAverage: number | null;
  mocksTaken: number;
  targetScore: number | null;
  gap: number | null;
  testDate: string | null;
  daysToTest: number | null;
  confidence: 'none' | 'low' | 'fair';
  /**
   * The one estimated score every surface shows. Latest scored mock, else the
   * latest scaled practice score per section; `source` says which, and a
   * practice-based estimate must be labelled as such.
   */
  estimate: {
    total: number | null;
    rw: number | null;
    math: number | null;
    source: 'mock' | 'practice' | null;
  };
}

export interface InsightsOverview {
  domains: DomainHitRate[];
  skills: CompetencyAccuracy[];
  trend: SeriesPoint[];
  readiness: Preparedness;
  /** Below this many attempts the server considers an accuracy unreportable. */
  minAttempts: number;
}

export async function fetchAnalytics(): Promise<InsightsOverview> {
  const { data } = await apiTransport.get<InsightsOverview>('/student/analytics/overview');
  return data;
}
