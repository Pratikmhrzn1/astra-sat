import { apiClient } from '@/shared/api/client';
import type { AuthUser } from '@/shared/store/auth';

export interface AdminUser extends AuthUser {
  createdAt: string;
  teacherId: string | null;
}

export interface AccessCode {
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

export interface AdminStats {
  students: number;
  teachers: number;
  admins: number;
  exams: number;
  questions: number;
  questionSets: number;
}

export async function getStats(): Promise<AdminStats> {
  const { data } = await apiClient.get<AdminStats>('/admin/stats');
  return data;
}

export async function getUsers(): Promise<AdminUser[]> {
  const { data } = await apiClient.get<AdminUser[]>('/admin/users');
  return data;
}

export async function updateUser(
  userId: string,
  payload: { name?: string; password?: string; teacherId?: string | null }
): Promise<AdminUser> {
  const { data } = await apiClient.put<AdminUser>(`/admin/users/${userId}`, payload);
  return data;
}

export async function deleteUser(userId: string): Promise<void> {
  await apiClient.delete(`/admin/users/${userId}`);
}

export async function getAccessCodes(): Promise<AccessCode[]> {
  const { data } = await apiClient.get<AccessCode[]>('/admin/access-codes');
  return data;
}

export async function createAccessCode(payload: {
  code: string;
  role: 'student' | 'teacher' | 'admin';
  description: string;
  maxUses?: number | null;
}): Promise<AccessCode> {
  const { data } = await apiClient.post<AccessCode>('/admin/access-codes', payload);
  return data;
}

export async function deleteAccessCode(codeId: string): Promise<void> {
  await apiClient.delete(`/admin/access-codes/${codeId}`);
}

export async function downloadBackup(): Promise<void> {
  const { data } = await apiClient.get('/admin/backup', { responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `sat-prep-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function restoreBackup(jsonData: unknown): Promise<{ ok: boolean; message: string }> {
  const { data } = await apiClient.post('/admin/restore', jsonData);
  return data;
}

export async function runMigrations(): Promise<{ ok: boolean; message: string }> {
  const { data } = await apiClient.post('/admin/migrate');
  return data;
}

export async function runSql(sqlText: string): Promise<{ ok: boolean; statements: number; rowsAffected: number; rows: Record<string, unknown>[] }> {
  const { data } = await apiClient.post('/admin/run-sql', { sql: sqlText });
  return data;
}
