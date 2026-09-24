import React from 'react';
import { Navigate } from 'react-router-dom';
import { useSessionVault, type AccountRole } from '@/features/auth';
import { ScreenLoader } from '@/shared/ui';

interface ProtectedRouteProps {
  children: React.ReactNode;
  role: AccountRole;
  /** Set on the survey route itself, which would otherwise redirect to itself. */
  allowIncompleteSurvey?: boolean;
}

export function GuardedRoute({ children, role, allowIncompleteSurvey = false }: ProtectedRouteProps) {
  const { user, accessToken } = useSessionVault();

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== role) {
    const redirectMap: Record<AccountRole, string> = {
      student: '/student/dashboard',
      teacher: '/teacher/dashboard',
      admin: '/admin/dashboard',
    };
    return <Navigate to={redirectMap[user.role]} replace />;
  }

  // A student who has not taken the signup survey gets no further. `false` and
  // not just "falsy": a session persisted before the field existed belongs to
  // an account that predates the survey and is already marked complete server
  // side, so it must not be sent here.
  if (user.role === 'student' && user.surveyCompleted === false && !allowIncompleteSurvey) {
    return <Navigate to="/onboarding/survey" replace />;
  }

  return <>{children}</>;
}
