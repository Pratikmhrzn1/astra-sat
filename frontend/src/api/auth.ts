import { apiClient } from './client';
import type { AuthUser } from '../store/auth';

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  return data;
}

export async function register(
  email: string,
  name: string,
  password: string,
  accessCode: string
): Promise<LoginResponse> {
  const { data } = await apiClient.post<LoginResponse>('/auth/register', {
    email,
    name,
    password,
    accessCode,
  });
  return data;
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>('/auth/me');
  return data;
}

export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/auth/change-password', { currentPassword, newPassword });
}

export async function updateProfile(name: string): Promise<AuthUser> {
  const { data } = await apiClient.patch<AuthUser>('/auth/profile', { name });
  return data;
}
