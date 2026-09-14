import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { forgotPassword } from '@/features/auth/api';
import { getApiError } from '@/shared/api/http';
import { fieldClass, labelClass, errorTextClass, alertClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});
type FormData = z.infer<typeof schema>;

const submitClass = (busy: boolean) => cn(
  'w-full h-12 text-white rounded-full text-[15px] font-semibold shadow-accent',
  busy ? 'bg-accent-disabled cursor-default' : 'bg-accent-text cursor-pointer',
);

export default function ForgotPassword() {
  const [sent, setSent] = useState(false);
  const [apiError, setApiError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setApiError('');
    try {
      await forgotPassword(data.email);
      setSent(true);
    } catch (err) {
      setApiError(getApiError(err));
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-paper px-6 py-10 sm:p-12">
      <div className="w-full max-w-[388px]">
        <div className="mb-7">
          <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-2">SAT Prep · NIEC</div>
          <h2 className="font-display font-semibold text-[32px] sm:text-[38px] mt-0 mb-2 tracking-[-0.02em]">Reset password</h2>
          <p className="m-0 text-subtle text-[15px] leading-[1.55]">
            Enter your account email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="bg-green-sat/[.08] border border-green-sat/20 rounded-xl px-6 py-5">
            <p className="mt-0 mb-1.5 text-[15px] font-semibold text-green-sat">Check your inbox</p>
            <p className="m-0 text-sm text-subtle leading-[1.6]">
              If an account exists for that email, a reset link has been sent. It expires in 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-4">
              <label className={labelClass}>Email</label>
              <input type="email" autoComplete="email" placeholder="you@email.com" {...register('email')} className={fieldClass(!!errors.email)} />
              {errors.email && <p className={errorTextClass}>{errors.email.message}</p>}
            </div>

            {apiError && <div className={cn(alertClass, 'mb-3')}>{apiError}</div>}

            <button
              type="submit"
              disabled={isSubmitting}
              className={submitClass(isSubmitting)}
            >
              {isSubmitting ? 'Sending…' : 'Send reset link'}
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
