import React from 'react';
import { Navigate } from 'react-router-dom';
import { HOME_ROUTES, isLearnerRole, useSessionVault, type AccountRole } from '@/features/auth';
import { ScreenLoader } from '@/shared/ui';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** `student` admits every learner role (trial and student alike). */
  role: AccountRole;
  /** Set on the survey route itself, which would otherwise redirect to itself. */
  allowIncompleteSurvey?: boolean;
}

export function GuardedRoute({ children, role, allowIncompleteSurvey = false }: ProtectedRouteProps) {
  const { user, accessToken } = useSessionVault();

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />;
  }

  const admitted = role === 'student' ? isLearnerRole(user.role) : user.role === role;
  if (!admitted) {
    return <Navigate to={HOME_ROUTES[user.role]} replace />;
  }

  // A student who has not taken the signup survey gets no further. `false` and
  // not just "falsy": a session persisted before the field existed belongs to
  // an account that predates the survey and is already marked complete server
  // side, so it must not be sent here.
  if (isLearnerRole(user.role) && user.surveyCompleted === false && !allowIncompleteSurvey) {
    return <Navigate to="/onboarding/survey" replace />;
  }

  return <>{children}</>;
}
