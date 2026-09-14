import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { resetPassword } from '@/api/auth';
import { getApiError } from '@/api/http';
import { fieldClass, labelClass, errorTextClass, alertClass } from '@/components/common';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type FormData = z.infer<typeof schema>;

const submitClass = (busy: boolean) => cn(
  'w-full h-12 text-white rounded-full text-[15px] font-semibold shadow-accent',
  busy ? 'bg-accent-disabled cursor-default' : 'bg-accent-text cursor-pointer',
);

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [apiError, setApiError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setApiError('');
    try {
      await resetPassword(token, data.password);
      setDone(true);
    } catch (err) {
      setApiError(getApiError(err));
    }
  };

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-paper p-12">
        <div className="text-center max-w-[360px]">
          <p className="text-[15px] text-danger mb-4">Invalid reset link — no token found.</p>
          <Link to="/forgot-password" className="text-accent-text font-semibold no-underline">Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-paper px-6 py-10 sm:p-12">
      <div className="w-full max-w-[388px]">
        <div className="mb-7">
          <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-2">SAT Prep · NIEC</div>
          <h2 className="font-display font-semibold text-[32px] sm:text-[38px] mt-0 mb-2 tracking-[-0.02em]">Choose a new password</h2>
          <p className="m-0 text-subtle text-[15px]">Must be at least 8 characters.</p>
        </div>

        {done ? (
          <div className="bg-green-sat/[.08] border border-green-sat/20 rounded-xl px-6 py-5 mb-6">
            <p className="mt-0 mb-1.5 text-[15px] font-semibold text-green-sat">Password updated!</p>
            <p className="m-0 text-sm text-subtle">You can now sign in with your new password.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-3.5">
              <label className={labelClass}>New password</label>
              <input type="password" autoComplete="new-password" placeholder="••••••••" {...register('password')} className={fieldClass(!!errors.password)} />
              {errors.password && <p className={errorTextClass}>{errors.password.message}</p>}
            </div>

            <div className="mb-4">
              <label className={labelClass}>Confirm password</label>
              <input type="password" autoComplete="new-password" placeholder="••••••••" {...register('confirmPassword')} className={fieldClass(!!errors.confirmPassword)} />
              {errors.confirmPassword && <p className={errorTextClass}>{errors.confirmPassword.message}</p>}
            </div>

            {apiError && (
              <div className={cn(alertClass, 'mb-3')}>
                {apiError}{' '}
                {apiError.includes('expired') || apiError.includes('invalid') ? (
                  <Link to="/forgot-password" className="text-danger font-semibold">Request a new link</Link>
                ) : null}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={submitClass(isSubmitting)}
            >
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <div className="text-center mt-6 text-sm text-subtle">
          <Link to="/login" className="text-accent-text font-semibold no-underline">← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
