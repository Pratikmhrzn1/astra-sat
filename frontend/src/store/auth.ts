import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'student' | 'teacher' | 'admin';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  teacherId?: string | null;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  login: (user: AuthUser, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setUser: (user: AuthUser) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      login: (user, accessToken, refreshToken) =>
        set({ user, accessToken, refreshToken }),
      logout: () =>
        set({ user: null, accessToken: null, refreshToken: null }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'sat-prep-auth',
    }
  )
);
