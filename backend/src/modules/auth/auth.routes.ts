import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../core/config/env';
import { asyncHandler } from '../../core/http/async-handler';
import { currentUserId, requireAuth } from '../../core/http/middleware/auth';
import { body, validateBody } from '../../core/http/middleware/validate';
import * as service from './auth.service';
import * as tokens from './auth.tokens';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type UpdateProfileInput,
} from './auth.schemas';

export const authRouter = Router();

/**
 * Volume guard on the unauthenticated endpoints. Disabled outside production
 * so a dev reloading the login page repeatedly is never locked out; the
 * per-account lockout in the service still applies everywhere.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => !env.isProduction,
});

authRouter.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, user } = await service.register(body<RegisterInput>(req));
    tokens.setRefreshCookie(res, refreshToken);
    res.status(201).json({ accessToken, user });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { accessToken, refreshToken, user } = await service.login(body<LoginInput>(req));
    tokens.setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  }),
);

/** Deliberately unauthenticated — the expired access token is why we're here. */
authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { accessToken, rawToken } = await service.refresh(tokens.readRefreshCookie(req));
    tokens.setRefreshCookie(res, rawToken);
    res.json({ accessToken });
  }),
);

authRouter.post(
  '/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await service.logout(tokens.readRefreshCookie(req));
    tokens.clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json(await service.getProfile(currentUserId(req)));
  }),
);

authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    await service.changePassword(currentUserId(req), body<ChangePasswordInput>(req));
    res.json({ ok: true });
  }),
);

authRouter.patch(
  '/profile',
  requireAuth,
  validateBody(updateProfileSchema),
  asyncHandler(async (req, res) => {
    res.json(await service.updateProfile(currentUserId(req), body<UpdateProfileInput>(req).name));
  }),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    await service.requestPasswordReset(body<ForgotPasswordInput>(req));
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/reset-password',
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    await service.resetPassword(body<ResetPasswordInput>(req));
    res.json({ ok: true });
  }),
);
