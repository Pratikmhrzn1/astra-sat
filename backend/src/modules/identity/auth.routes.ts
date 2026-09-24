import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { settings } from '../../core/config/env';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
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
  skip: () => !settings.isProduction,
});

authRouter.post(
  '/register',
  authLimiter,
  checkBody(registerSchema),
  wrapAsync(async (req, res) => {
    const { accessToken, refreshToken, user } = await service.register(validatedBody<RegisterInput>(req));
    tokens.setRefreshCookie(res, refreshToken);
    res.status(201).json({ accessToken, user });
  }),
);

authRouter.post(
  '/login',
  authLimiter,
  checkBody(loginSchema),
  wrapAsync(async (req, res) => {
    const { accessToken, refreshToken, user } = await service.login(validatedBody<LoginInput>(req));
    tokens.setRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  }),
);

/** Deliberately unauthenticated — the expired access token is why we're here. */
authRouter.post(
  '/refresh',
  wrapAsync(async (req, res) => {
    const { accessToken, rawToken } = await service.refresh(tokens.readRefreshCookie(req));
    tokens.setRefreshCookie(res, rawToken);
    res.json({ accessToken });
  }),
);

authRouter.post(
  '/logout',
  requireSession,
  wrapAsync(async (req, res) => {
    await service.logout(tokens.readRefreshCookie(req));
    tokens.clearRefreshCookie(res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireSession,
  wrapAsync(async (req, res) => {
    res.json(await service.getProfile(sessionUserId(req)));
  }),
);

authRouter.post(
  '/change-password',
  requireSession,
  checkBody(changePasswordSchema),
  wrapAsync(async (req, res) => {
    await service.changePassword(sessionUserId(req), validatedBody<ChangePasswordInput>(req));
    res.json({ ok: true });
  }),
);

authRouter.patch(
  '/profile',
  requireSession,
  checkBody(updateProfileSchema),
  wrapAsync(async (req, res) => {
    res.json(await service.updateProfile(sessionUserId(req), validatedBody<UpdateProfileInput>(req).name));
  }),
);

authRouter.post(
  '/forgot-password',
  authLimiter,
  checkBody(forgotPasswordSchema),
  wrapAsync(async (req, res) => {
    await service.requestPasswordReset(validatedBody<ForgotPasswordInput>(req));
    res.json({ ok: true });
  }),
);

authRouter.post(
  '/reset-password',
  checkBody(resetPasswordSchema),
  wrapAsync(async (req, res) => {
    await service.resetPassword(validatedBody<ResetPasswordInput>(req));
    res.json({ ok: true });
  }),
);
