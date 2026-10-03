import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccountRole = 'trial' | 'student' | 'teacher' | 'admin';

export type AccountStatus = 'pending' | 'active' | 'rejected' | 'deactivated';

export interface SessionAccount {
  id: string;
  name: string;
  email: string;
  role: AccountRole;
  teacherId?: string | null;
  /** Optional: sessions persisted before account gates existed don't carry these. */
  status?: AccountStatus;
  emailVerified?: boolean;
  /** ISO timestamp; null means no expiry. Optional for sessions persisted before expiry existed. */
  expiryDate?: string | null;
  /** Test starts allowed per day; null means unlimited. */
  dailyTestLimit?: number | null;
  /**
   * Whether the onboarding survey is behind them. Sent on every auth payload;
   * `ProtectedRoute` holds a student here until it is true. Optional because a
   * session persisted before this existed has no such field — and those
   * accounts predate the survey, so undefined must not gate them.
   */
  surveyCompleted?: boolean;
}

interface AuthState {
  user: SessionAccount | null;
  accessToken: string | null;
  login: (user: SessionAccount, accessToken: string) => void;
  logout: () => void;
  setAccessToken: (token: string) => void;
  setUser: (user: SessionAccount) => void;
}

export const useSessionVault = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      login: (user, accessToken) => set({ user, accessToken }),
      logout: () => set({ user: null, accessToken: null }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setUser: (user) => set({ user }),
    }),
    {
      name: 'sat-prep-auth',
    }
  )
);
