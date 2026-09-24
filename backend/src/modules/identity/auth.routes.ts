import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { settings } from '../../core/config/env';
import { wrapAsync } from '../../core/http/async-handler';
import { sessionUserId, requireSession } from '../../core/http/middleware/auth';
import { validatedBody, checkBody } from '../../core/http/middleware/validate';
import * as service from './auth.service';
import * as tokens from './auth.tokens';
import {
  changePasswordRules,
  forgotPasswordRules,
  loginRules,
  registerRules,
  resetPasswordRules,
  editAccountProfileRules,
  type ChangePasswordPayload,
  type ForgotPasswordPayload,
  type LoginPayload,
  type RegisterPayload,
  type ResetPasswordPayload,
  type UpdateAccountProfilePayload,
} from './auth.schemas';

export const accountRoutes = Router();

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

accountRoutes.post(
  '/register',
  authLimiter,
  checkBody(registerRules),
  wrapAsync(async (req, res) => {
    const { accessToken, refreshToken, user } = await service.signUp(validatedBody<RegisterPayload>(req));
    tokens.writeRefreshCookie(res, refreshToken);
    res.status(201).json({ accessToken, user });
  }),
);

accountRoutes.post(
  '/login',
  authLimiter,
  checkBody(loginRules),
  wrapAsync(async (req, res) => {
    const { accessToken, refreshToken, user } = await service.signIn(validatedBody<LoginPayload>(req));
    tokens.writeRefreshCookie(res, refreshToken);
    res.json({ accessToken, user });
  }),
);

/** Deliberately unauthenticated — the expired access token is why we're here. */
accountRoutes.post(
  '/refresh',
  wrapAsync(async (req, res) => {
    const { accessToken, rawToken } = await service.renewSession(tokens.takeRefreshCookie(req));
    tokens.writeRefreshCookie(res, rawToken);
    res.json({ accessToken });
  }),
);

accountRoutes.post(
  '/logout',
  requireSession,
  wrapAsync(async (req, res) => {
    await service.signOut(tokens.takeRefreshCookie(req));
    tokens.dropRefreshCookie(res);
    res.json({ ok: true });
  }),
);

accountRoutes.get(
  '/me',
  requireSession,
  wrapAsync(async (req, res) => {
    res.json(await service.fetchAccountProfile(sessionUserId(req)));
  }),
);

accountRoutes.post(
  '/change-password',
  requireSession,
  checkBody(changePasswordRules),
  wrapAsync(async (req, res) => {
    await service.replacePassword(sessionUserId(req), validatedBody<ChangePasswordPayload>(req));
    res.json({ ok: true });
  }),
);

accountRoutes.patch(
  '/profile',
  requireSession,
  checkBody(editAccountProfileRules),
  wrapAsync(async (req, res) => {
    res.json(await service.editProfile(sessionUserId(req), validatedBody<UpdateAccountProfilePayload>(req).name));
  }),
);

accountRoutes.post(
  '/forgot-password',
  authLimiter,
  checkBody(forgotPasswordRules),
  wrapAsync(async (req, res) => {
    await service.beginPasswordReset(validatedBody<ForgotPasswordPayload>(req));
    res.json({ ok: true });
  }),
);

accountRoutes.post(
  '/reset-password',
  checkBody(resetPasswordRules),
  wrapAsync(async (req, res) => {
    await service.completePasswordReset(validatedBody<ResetPasswordPayload>(req));
    res.json({ ok: true });
  }),
);
