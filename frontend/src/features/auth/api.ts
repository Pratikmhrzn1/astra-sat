import { apiTransport } from '@/shared/api/http';
import type { SessionAccount } from '@/features/auth/store';

export interface SignInReply {
  accessToken: string;
  user: SessionAccount;
}

export async function signIn(email: string, password: string): Promise<SignInReply> {
  const { data } = await apiTransport.post<SignInReply>('/auth/login', { email, password });
  return data;
}

export async function signUp(
  email: string,
  name: string,
  password: string,
  accessCode: string,
  phone?: string,
): Promise<SignInReply> {
  const { data } = await apiTransport.post<SignInReply>('/auth/register', {
    email,
    name,
    phone: phone || undefined,
    password,
    accessCode,
  });
  return data;
}

export async function fetchMe(): Promise<SessionAccount> {
  const { data } = await apiTransport.get<SessionAccount>('/auth/me');
  return data;
}

export async function signOut(): Promise<void> {
  await apiTransport.post('/auth/logout');
}

export async function changePassphrase(currentPassword: string, newPassword: string): Promise<void> {
  await apiTransport.post('/auth/change-password', { currentPassword, newPassword });
}

export async function editAccountDossier(name: string): Promise<SessionAccount> {
  const { data } = await apiTransport.patch<SessionAccount>('/auth/profile', { name });
  return data;
}

export async function forgotPassphrase(email: string): Promise<void> {
  await apiTransport.post('/auth/forgot-password', { email });
}

export async function resetPassphrase(token: string, password: string): Promise<void> {
  await apiTransport.post('/auth/reset-password', { token, password });
}
