import { apiClient } from '@/shared/api/http';

/** A student's analytics and goal. Teachers read the same shapes through the roster. */

/** The goal a student is working towards. Null until they set one. */
export interface StudentProfile {
  id: string;
  studentId: string;
  targetScore: number | null;
  testDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Profile ──────────────────────────────────────────────────────────────────

/** Null when the student has not set a goal — callers must prompt, not guess. */
export async function getProfile(): Promise<StudentProfile | null> {
  const { data } = await apiClient.get<StudentProfile | null>('/student/profile');
  return data;
}

export async function updateProfile(payload: {
  targetScore?: number | null;
  testDate?: string | null;
}): Promise<StudentProfile> {
  const { data } = await apiClient.put<StudentProfile>('/student/profile', payload);
  return data;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface DomainAccuracy {
  domainCode: string;
  domainLabel: string;
  subject: 'english' | 'math';
  attempted: number;
  correct: number;
  accuracy: number;
}

export interface SkillAccuracy extends DomainAccuracy {
  skillCode: string | null;
  skillLabel: string | null;
}

export interface TrendPoint {
  at: string;
  kind: 'mock' | 'practice';
  label: string;
  total: number | null;
  rw: number | null;
  math: number | null;
}

export interface Readiness {
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

export interface AnalyticsOverview {
  domains: DomainAccuracy[];
  skills: SkillAccuracy[];
  trend: TrendPoint[];
  readiness: Readiness;
  /** Below this many attempts the server considers an accuracy unreportable. */
  minAttempts: number;
}

export async function getAnalytics(): Promise<AnalyticsOverview> {
  const { data } = await apiClient.get<AnalyticsOverview>('/student/analytics/overview');
  return data;
}
