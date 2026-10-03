import type { AccountRole } from './store';

/**
 * Trial and student accounts are both learners: they reach the same pages and
 * differ only in their expiry date and daily test limit.
 */
export function isLearnerRole(role: AccountRole | undefined): boolean {
  return role === 'trial' || role === 'student';
}

/** Where each role lands after sign-in, or when it opens a page meant for another role. */
export const HOME_ROUTES: Record<AccountRole, string> = {
  trial: '/student/dashboard',
  student: '/student/dashboard',
  teacher: '/teacher/dashboard',
  admin: '/admin/dashboard',
};
