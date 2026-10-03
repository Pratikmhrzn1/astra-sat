import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { signIn, resendVerification } from '@/features/auth/api';
import { useSessionVault } from '@/features/auth/store';
import { HOME_ROUTES } from '@/features/auth/roles';
import { fetchApiError, fetchApiErrorCode, fetchApiErrorMeta } from '@/shared/api/http';
import { fieldStyle, fieldCaptionStyle, errorTextStyle, alertStyle } from '@/shared/ui';
import { classes } from '@/shared/lib/utils';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;


/** Copy for the reasons a correct password still can't sign in, keyed by server code. */
const SIGN_IN_ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  EMAIL_NOT_VERIFIED: 'Please verify your email address first — check your inbox for the link we sent.',
  ACCOUNT_PENDING: 'Your account is awaiting administrator approval. We’ll email you once it’s approved.',
  ACCOUNT_REJECTED: 'This account was not approved. Contact your administrator if you think this is a mistake.',
  ACCOUNT_DEACTIVATED: 'This account has been deactivated. Contact your administrator.',
  ACCOUNT_EXPIRED: 'Your access has expired. Contact your administrator to renew it.',
};

function describeSignInError(err: unknown): string {
  const code = fetchApiErrorCode(err);
  if (code === 'ACCOUNT_LOCKED') {
    const minutes = fetchApiErrorMeta(err, 'minutesRemaining');
    return minutes
      ? `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      : 'Too many failed attempts. Try again later.';
  }
  return (code && SIGN_IN_ERRORS[code]) || fetchApiError(err);
}

const toggleBtn = 'px-[26px] py-2 rounded-full text-[13px] font-bold tracking-[0.05em] uppercase';

export default function SignIn() {
  const navigate = useNavigate();
  const { login: storeLogin, user } = useSessionVault();
  const [apiError, setApiError] = useState('');
  // Set when sign-in failed only because the address is unverified.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  React.useEffect(() => {
    if (user) navigate(HOME_ROUTES[user.role], { replace: true });
  }, [user, navigate]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setApiError('');
    setUnverifiedEmail(null);
    setResendState('idle');
    try {
      const result = await signIn(data.email, data.password);
      storeLogin(result.user, result.accessToken);
      navigate(HOME_ROUTES[result.user.role], { replace: true });
    } catch (err) {
      setApiError(describeSignInError(err));
      if (fetchApiErrorCode(err) === 'EMAIL_NOT_VERIFIED') setUnverifiedEmail(data.email);
    }
  };

  const onResend = async () => {
    if (!unverifiedEmail) return;
    setResendState('sending');
    try {
      await resendVerification(unverifiedEmail);
      setResendState('sent');
    } catch (err) {
      setResendState('idle');
      setApiError(fetchApiError(err));
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1.05fr_1fr] min-h-screen relative">
      {/* IELTS ↔ SAT toggle */}
      <div className="absolute top-5 right-6 z-[100] bg-white/85 backdrop-blur-[10px] rounded-full p-1 shadow-[0_2px_20px_rgba(0,0,0,0.14)] flex">
        <button onClick={() => { window.location.href = '/'; }} className={classes(toggleBtn, 'text-black/40 cursor-pointer bg-transparent')}>IELTS</button>
        <button className={classes(toggleBtn, 'text-white cursor-default bg-accent-text shadow-[0_2px_8px_rgba(226,86,43,0.35)]')}>SAT</button>
      </div>
      {/* Left — dark panel (desktop only) */}
      <div className="hidden sm:flex bg-ink text-white px-[72px] py-16 flex-col justify-between relative overflow-hidden">
        <div className="absolute -right-[120px] -top-20 w-[360px] h-[360px] rounded-full bg-[radial-gradient(circle,rgba(226,86,43,0.22),transparent_70%)]" />
        <div className="text-xs font-bold tracking-[0.14em] uppercase text-white/45">
          Digital SAT · Practice Platform
        </div>
        <div className="relative">
          <h1 className="font-display font-semibold text-[60px] leading-[1.05] tracking-[-0.02em] m-0">
            Your best<br />score starts<br />with the next<br />
            <span className="text-accent-text italic">practice test.</span>
          </h1>
          <p className="mt-7 max-w-[380px] text-base leading-[1.65] text-white/60">
            Full-length mocks, adaptive sections, and an honest estimate of where you stand — out of 1600.
          </p>
        </div>
        <div className="flex gap-12">
          <div>
            <div className="font-display font-semibold text-[34px] text-white">1600</div>
            <div className="text-xs text-white/45 tracking-[0.04em]">Top score, scaled</div>
          </div>
          <div>
            <div className="font-display font-semibold text-[34px] text-gold">2h 14m</div>
            <div className="text-xs text-white/45 tracking-[0.04em]">Real test length</div>
          </div>
        </div>
      </div>

      {/* Right — form */}
      <div className="flex items-center justify-center px-6 py-10 sm:p-12 bg-paper min-h-screen">
        <div className="w-full max-w-[388px]">
          {/* Mobile brand header */}
          <div className="sm:hidden text-center mb-9">
            <div className="inline-flex items-center gap-2.5 mb-2">
              <div className="w-[22px] h-[22px] rounded-[7px] bg-ember flex items-center justify-center">
                <div className="w-[9px] h-[9px] rounded-sm bg-white" />
              </div>
              <span className="font-display font-semibold text-xl text-ink">Score Studio</span>
            </div>
            <div className="text-xs font-bold tracking-[0.12em] uppercase text-muted">
              Digital SAT · Practice Platform
            </div>
          </div>

          <h2 className="font-display font-semibold text-[34px] sm:text-[40px] mb-1.5 mt-0 tracking-[-0.02em]">Welcome back</h2>
          <p className="mb-8 mt-0 text-subtle text-[15px]">Sign in to continue your prep.</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-[18px]">
              <label className={fieldCaptionStyle}>Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                {...register('email')}
                className={fieldStyle(!!errors.email)}
              />
              {errors.email && <p className={errorTextStyle}>{errors.email.message}</p>}
            </div>

            <div className="mb-2.5">
              <label className={fieldCaptionStyle}>Password</label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                className={fieldStyle(!!errors.password)}
              />
              {errors.password && <p className={errorTextStyle}>{errors.password.message}</p>}
            </div>

            {apiError && (
              <div className={classes(alertStyle, 'mb-4')}>
                {apiError}
                {unverifiedEmail && (
                  <div className="mt-1.5">
                    {resendState === 'sent' ? (
                      <span className="font-semibold">A new link is on its way.</span>
                    ) : (
                      <button
                        type="button"
                        onClick={onResend}
                        disabled={resendState === 'sending'}
                        className="p-0 bg-transparent border-0 text-danger font-semibold underline cursor-pointer"
                      >
                        {resendState === 'sending' ? 'Sending…' : 'Resend verification email'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={classes(
                'w-full h-12 mt-[22px] text-white rounded-full text-[15px] font-semibold shadow-accent',
                isSubmitting ? 'bg-accent-disabled cursor-default' : 'bg-accent-text cursor-pointer',
              )}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-subtle">
            New here?{' '}
            <Link to="/register" className="text-accent-text font-semibold no-underline">Create an account</Link>
          </div>
          <div className="text-center mt-2.5 text-[13px] text-muted">
            <Link to="/forgot-password" className="text-muted no-underline hover:text-accent-text">
              Forgot your password?
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
