import { z } from 'zod';

/**
 * Public signup. Creates a trial or student account, which then waits on email
 * verification and admin approval. Teachers and admins are made by an admin
 * (`POST /admin/users`), never through this form. `role` defaults to student so
 * a client cached from before trials existed can still sign up.
 */
export const registerRules = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  phone: z.string().trim().min(3, 'Phone number is required').max(30),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['trial', 'student']).default('student'),
});
export type RegisterPayload = z.infer<typeof registerRules>;

export const verifyEmailRules = z.object({
  token: z.string().min(1, 'Token is required').max(200),
});
export type VerifyEmailPayload = z.infer<typeof verifyEmailRules>;

export const resendVerificationRules = z.object({
  email: z.string().trim().email('Invalid email address').toLowerCase(),
});
export type ResendVerificationPayload = z.infer<typeof resendVerificationRules>;

export const loginRules = z.object({
  email: z.string().trim().email().toLowerCase(),
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
  email: z.string().trim().email().toLowerCase(),
});
export type ForgotPasswordPayload = z.infer<typeof forgotPasswordRules>;

export const resetPasswordRules = z.object({
  token: z.string().min(1, 'Token is required').max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
});
export type ResetPasswordPayload = z.infer<typeof resetPasswordRules>;
