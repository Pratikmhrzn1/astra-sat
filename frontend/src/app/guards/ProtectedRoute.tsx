import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore, type Role } from '@/shared/store/auth';
import { PageLoader } from '@/shared/ui/Spinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  role: Role;
}

export function ProtectedRoute({ children, role }: ProtectedRouteProps) {
  const { user, accessToken } = useAuthStore();

  if (!user || !accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== role) {
    const redirectMap: Record<Role, string> = {
      student: '/student/dashboard',
      teacher: '/teacher/dashboard',
      admin: '/admin/dashboard',
    };
    return <Navigate to={redirectMap[user.role]} replace />;
  }

  return <>{children}</>;
}
