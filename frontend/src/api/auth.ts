import { apiClient } from './client';
import type { AuthUser, Role } from '../store/auth';

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
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
