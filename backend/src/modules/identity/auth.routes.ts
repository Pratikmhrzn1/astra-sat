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
  verifyEmailRules,
  resendVerificationRules,
  type VerifyEmailPayload,
  type ResendVerificationPayload,
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

/** Creates a pending account and emails a verification link. No session is issued. */
accountRoutes.post(
  '/register',
  authLimiter,
  checkBody(registerRules),
  wrapAsync(async (req, res) => {
    await service.signUp(validatedBody<RegisterPayload>(req));
    res.status(201).json({
      message:
        'Account created. Verify your email address, then an administrator will review your account before you can sign in.',
    });
  }),
);

accountRoutes.post(
  '/verify-email',
  authLimiter,
  checkBody(verifyEmailRules),
  wrapAsync(async (req, res) => {
    await service.confirmEmail(validatedBody<VerifyEmailPayload>(req));
    res.json({ message: 'Email address verified.' });
  }),
);

/** The same answer whatever the address, so it can't be used to probe for accounts. */
accountRoutes.post(
  '/resend-verification',
  authLimiter,
  checkBody(resendVerificationRules),
  wrapAsync(async (req, res) => {
    await service.resendVerification(validatedBody<ResendVerificationPayload>(req));
    res.json({ message: 'If that address still needs verifying, a new link has been sent.' });
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
    await service.replacePassword(
      sessionUserId(req),
      validatedBody<ChangePasswordPayload>(req),
      tokens.takeRefreshCookie(req),
    );
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
  authLimiter,
  checkBody(resetPasswordRules),
  wrapAsync(async (req, res) => {
    await service.completePasswordReset(validatedBody<ResetPasswordPayload>(req));
    res.json({ ok: true });
  }),
);
