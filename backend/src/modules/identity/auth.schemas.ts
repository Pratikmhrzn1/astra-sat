import { z } from 'zod';

export const registerRules = z.object({
  email: z.string().email('Invalid email address').toLowerCase(),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().max(30).optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  accessCode: z.string().min(1, 'Access code is required'),
});
export type RegisterPayload = z.infer<typeof registerRules>;

export const loginRules = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1, 'Password is required'),
});
export type LoginPayload = z.infer<typeof loginRules>;

export const changePasswordRules = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});
export type ChangePasswordPayload = z.infer<typeof changePasswordRules>;

export const editAccountProfileRules = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim(),
});
export type UpdateAccountProfilePayload = z.infer<typeof editAccountProfileRules>;

export const forgotPasswordRules = z.object({
  email: z.string().email().toLowerCase(),
});
export type ForgotPasswordPayload = z.infer<typeof forgotPasswordRules>;

export const resetPasswordRules = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export type ResetPasswordPayload = z.infer<typeof resetPasswordRules>;
