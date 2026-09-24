import { apiTransport } from '@/shared/api/http';
import type { SessionAccount } from '@/features/auth';

export interface ConsoleAccount extends SessionAccount {
  createdAt: string;
  teacherId: string | null;
}

export interface EnrolmentCode {
  id: string;
  code: string;
  role: 'student' | 'teacher' | 'admin';
  description: string;
  isActive: boolean;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
  createdBy: string | null;
}

export interface TaggingSpread {
  subject: 'english' | 'math';
  tagged: number;
  total: number;
  percentage: number;
}

export interface ConsoleMetrics {
  students: number;
  teachers: number;
  admins: number;
  exams: number;
  questions: number;
  questionSets: number;
  /**
   * Share of published questions carrying a skill code, per subject. Every
   * per-skill analytic is bounded by this, so it is worth watching: Math sat at
   * 0% for as long as the taxonomy could not express a Math tag.
   */
  taggingCoverage: TaggingSpread[];
}

export async function fetchStats(): Promise<ConsoleMetrics> {
  const { data } = await apiTransport.get<ConsoleMetrics>('/admin/stats');
  return data;
}

export async function fetchUsers(): Promise<ConsoleAccount[]> {
  const { data } = await apiTransport.get<ConsoleAccount[]>('/admin/users');
  return data;
}

export async function editAccount(
  userId: string,
  payload: { name?: string; password?: string; teacherId?: string | null }
): Promise<ConsoleAccount> {
  const { data } = await apiTransport.put<ConsoleAccount>(`/admin/users/${userId}`, payload);
  return data;
}

/**
 * Assigns many students to a teacher at once, or clears it with `teacherId: null`.
 *
 * A teacher only ever sees students whose `teacherId` is theirs, and nothing sets
 * that at signup — so without this an admin has to edit every student one at a
 * time, and a teacher's dashboard stays empty until they do.
 */
export async function assignLearnersToTeacher(payload: {
  studentIds: string[];
  teacherId: string | null;
}): Promise<{ ok: boolean; assigned: number }> {
  const { data } = await apiTransport.put('/admin/users/assign-teacher', payload);
  return data;
}

export async function removeUser(userId: string): Promise<void> {
  await apiTransport.delete(`/admin/users/${userId}`);
}

export async function fetchAccessCodes(): Promise<EnrolmentCode[]> {
  const { data } = await apiTransport.get<EnrolmentCode[]>('/admin/access-codes');
  return data;
}

export async function addAccessCode(payload: {
  code: string;
  role: 'student' | 'teacher' | 'admin';
  description: string;
  maxUses?: number | null;
}): Promise<EnrolmentCode> {
  const { data } = await apiTransport.post<EnrolmentCode>('/admin/access-codes', payload);
  return data;
}

export async function removeAccessCode(codeId: string): Promise<void> {
  await apiTransport.delete(`/admin/access-codes/${codeId}`);
}

export async function downloadSnapshot(): Promise<void> {
  const { data } = await apiTransport.get('/admin/backup', { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `sat-prep-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreSnapshot(jsonData: unknown): Promise<{ ok: boolean; message: string }> {
  const { data } = await apiTransport.post('/admin/restore', jsonData);
  return data;
}

export interface FillPass {
  examsFound: number;
  examsScored: number;
  examsTooShort: number;
  examsSkippedAsMockModule: number;
  mocksFound: number;
  mocksScored: number;
  mocksIncomplete: number;
}

/**
 * Scores exams and mocks that finished before scaled scoring existed.
 *
 * Safe to run repeatedly — it only fills columns that are still NULL. Until it
 * has run once, historical attempts have no scaled score and the student's
 * History page has nothing to plot.
 */
export async function backfillResults(): Promise<FillPass> {
  const { data } = await apiTransport.post<FillPass>('/admin/scoring/backfill');
  return data;
}

export async function runSchema(): Promise<{ ok: boolean; message: string }> {
  const { data } = await apiTransport.post('/admin/migrate');
  return data;
}

export async function runQuery(sqlText: string): Promise<{ ok: boolean; statements: number; rowsAffected: number; rows: Record<string, unknown>[] }> {
  const { data } = await apiTransport.post('/admin/run-sql', { sql: sqlText });
  return data;
}

/** One recorded admin action. Read-only; nothing in the app edits these. */
export interface TrailRecord {
  id: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
}

export async function fetchAuditLog(limit = 50): Promise<TrailRecord[]> {
  const { data } = await apiTransport.get<TrailRecord[]>('/admin/audit-log', { params: { limit } });
  return data;
}
