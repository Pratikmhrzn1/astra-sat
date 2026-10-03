import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { verifyEmail, resendVerification } from '@/features/auth/api';
import { fetchApiError, fetchApiErrorCode } from '@/shared/api/http';
import { fieldStyle, fieldCaptionStyle, errorTextStyle, alertStyle } from '@/shared/ui';
import { classes } from '@/shared/lib/utils';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});
type FormData = z.infer<typeof schema>;

const submitClass = (busy: boolean) => classes(
  'w-full h-12 text-white rounded-full text-[15px] font-semibold shadow-accent',
  busy ? 'bg-accent-disabled cursor-default' : 'bg-accent-text cursor-pointer',
);

type Status = 'verifying' | 'verified' | 'failed';

/**
 * The landing page for the link in the verification email (`/verify-email?token=…`).
 * Verifying is only the first gate: an admin still has to approve the account,
 * and the copy says so, so nobody expects to sign in straight away.
 */
export default function ConfirmEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [status, setStatus] = useState<Status>(token ? 'verifying' : 'failed');
  const [apiError, setApiError] = useState(token ? '' : 'Invalid verification link — no token found.');
  const [resent, setResent] = useState(false);
  // StrictMode runs effects twice in dev, and a token is single-use: the second
  // POST would answer "already used" over the first one's success.
  const submitted = useRef(false);

  useEffect(() => {
    if (!token || submitted.current) return;
    submitted.current = true;
    verifyEmail(token)
      .then(() => setStatus('verified'))
      .catch((err) => {
        setStatus('failed');
        setApiError(
          fetchApiErrorCode(err) === 'TOKEN_USED'
            ? 'This link has already been used — your email is verified. If your account has been approved, you can sign in.'
            : fetchApiError(err),
        );
      });
  }, [token]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onResend = async (data: FormData) => {
    try {
      await resendVerification(data.email);
      setResent(true);
    } catch (err) {
      setApiError(fetchApiError(err));
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-paper px-6 py-10 sm:p-12">
      <div className="w-full max-w-[388px]">
        <div className="mb-7">
          <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-2">SAT Prep · NIEC</div>
          <h2 className="font-display font-semibold text-[32px] sm:text-[38px] mt-0 mb-2 tracking-[-0.02em]">Verify your email</h2>
          <p className="m-0 text-subtle text-[15px] leading-[1.55]">
            {status === 'verifying' ? 'Confirming your address…' : 'Confirming your address lets an administrator review your account.'}
          </p>
        </div>

        {status === 'verified' && (
          <div className="bg-green-sat/[.08] border border-green-sat/20 rounded-xl px-6 py-5">
            <p className="mt-0 mb-1.5 text-[15px] font-semibold text-green-sat">Email verified!</p>
            <p className="m-0 text-sm text-subtle leading-[1.6]">
              An administrator will review your account next. We'll email you as soon as it's approved, and then you can sign in.
            </p>
          </div>
        )}

        {status === 'failed' && (
          <>
            <div className={classes(alertStyle, 'mb-5')}>{apiError}</div>

            {resent ? (
              <div className="bg-green-sat/[.08] border border-green-sat/20 rounded-xl px-6 py-5">
                <p className="mt-0 mb-1.5 text-[15px] font-semibold text-green-sat">Check your inbox</p>
                <p className="m-0 text-sm text-subtle leading-[1.6]">
                  If that address still needs verifying, a new link has been sent.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onResend)}>
                <p className="mt-0 mb-4 text-sm text-subtle leading-[1.6]">Need a new link? Enter the email you signed up with.</p>
                <div className="mb-4">
                  <label className={fieldCaptionStyle}>Email</label>
                  <input type="email" autoComplete="email" placeholder="you@email.com" {...register('email')} className={fieldStyle(!!errors.email)} />
                  {errors.email && <p className={errorTextStyle}>{errors.email.message}</p>}
                </div>
                <button type="submit" disabled={isSubmitting} className={submitClass(isSubmitting)}>
                  {isSubmitting ? 'Sending…' : 'Send a new link'}
                </button>
              </form>
            )}
          </>
        )}

        <div className="text-center mt-6 text-sm text-subtle">
          <Link to="/login" className="text-accent-text font-semibold no-underline">← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
