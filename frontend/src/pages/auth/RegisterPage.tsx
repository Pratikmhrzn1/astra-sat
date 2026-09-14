import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { register as apiRegister } from '@/api/auth';
import { useAuthStore } from '@/store/auth';
import { getApiError } from '@/api/http';
import { fieldClass, labelClass, errorTextClass, alertClass, hintTextClass } from '@/components/common';
import { cn } from '@/lib/utils';

const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    phone: z.string().max(30).optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    accessCode: z.string().min(1, 'Access code is required'),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type FormData = z.infer<typeof schema>;

const ROLE_ROUTES = { student: '/student/dashboard', teacher: '/teacher/dashboard', admin: '/admin/dashboard' } as const;

const toggleBtn = 'px-[26px] py-2 rounded-full text-[13px] font-bold tracking-[0.05em] uppercase';

export default function Register() {
  const navigate = useNavigate();
  const { login: storeLogin } = useAuthStore();
  const [apiError, setApiError] = useState('');

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setApiError('');
    try {
      const result = await apiRegister(data.email, data.name, data.password, data.accessCode, data.phone);
      storeLogin(result.user, result.accessToken);
      navigate(ROLE_ROUTES[result.user.role], { replace: true });
    } catch (err) {
      setApiError(getApiError(err));
    }
  };

  const label = (text: string) => (
    <label className={labelClass}>{text}</label>
  );
  const err = (msg?: string) => msg ? <p className={errorTextClass}>{msg}</p> : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[1.05fr_1fr] min-h-screen relative">
      {/* IELTS ↔ SAT toggle */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-[100] bg-white/85 backdrop-blur-[10px] rounded-full p-1 shadow-[0_2px_20px_rgba(0,0,0,0.14)] flex">
        <button onClick={() => { window.location.href = '/'; }} className={cn(toggleBtn, 'text-black/40 cursor-pointer bg-transparent')}>IELTS</button>
        <button className={cn(toggleBtn, 'text-white cursor-default bg-accent-text shadow-[0_2px_8px_rgba(226,86,43,0.35)]')}>SAT</button>
      </div>
      {/* Left — dark panel (desktop only) */}
      <div className="hidden sm:flex bg-ink text-white px-[72px] py-16 flex-col justify-between relative overflow-hidden">
        <div className="absolute -right-[120px] -bottom-[100px] w-[380px] h-[380px] rounded-full bg-[radial-gradient(circle,rgba(184,137,62,0.20),transparent_70%)]" />
        <div className="text-xs font-bold tracking-[0.14em] uppercase text-white/45">
          Digital SAT · Practice Platform
        </div>
        <div className="relative">
          <h1 className="font-display font-semibold text-[60px] leading-[1.05] tracking-[-0.02em] m-0">
            Know exactly<br />where you<br />stand — and<br />
            <span className="text-accent-text italic">how to climb.</span>
          </h1>
          <p className="mt-7 max-w-[380px] text-base leading-[1.65] text-white/60">
            Create a free account to start tracking your section scores, accuracy, and estimated SAT total over time.
          </p>
        </div>
        <div className="flex gap-3.5 flex-wrap">
          {['Full-length mocks', 'Per-topic analysis', 'Score trends'].map((f) => (
            <div key={f} className="flex items-center gap-[9px] text-sm text-white/70">
              <span className="text-accent-text">✓</span> {f}
            </div>
          ))}
        </div>
      </div>

      {/* Right — form */}
      <div className="scrollarea flex items-center justify-center px-6 py-10 sm:p-12 overflow-y-auto bg-paper min-h-screen">
        <div className="w-full max-w-[388px]">
          {/* Mobile brand header */}
          <div className="sm:hidden text-center mb-8">
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

          <h2 className="font-display font-semibold text-[34px] sm:text-[40px] mb-1.5 mt-0 tracking-[-0.02em]">Create your account</h2>
          <p className="mb-7 mt-0 text-subtle text-[15px]">It takes less than a minute.</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-4">
              {label('Full name')}
              <input type="text" autoComplete="name" placeholder="Aarav Sharma" {...register('name')} className={fieldClass(!!errors.name)} />
              {err(errors.name?.message)}
            </div>

            <div className="mb-4">
              {label('Email')}
              <input type="email" autoComplete="email" placeholder="you@email.com" {...register('email')} className={fieldClass(!!errors.email)} />
              {err(errors.email?.message)}
            </div>

            <div className="mb-4">
              {label('Phone number')}
              <input type="tel" autoComplete="tel" placeholder="+977 98XXXXXXXX" {...register('phone')} className={fieldClass(!!errors.phone)} />
              {err(errors.phone?.message)}
              {!errors.phone && <p className={hintTextClass}>Required for student accounts.</p>}
            </div>

            {/* Password fields — side by side on desktop, stacked on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div>
                {label('Password')}
                <input type="password" autoComplete="new-password" placeholder="••••••••" {...register('password')} className={fieldClass(!!errors.password)} />
                {err(errors.password?.message)}
              </div>
              <div>
                {label('Confirm')}
                <input type="password" autoComplete="new-password" placeholder="••••••••" {...register('confirmPassword')} className={fieldClass(!!errors.confirmPassword)} />
                {err(errors.confirmPassword?.message)}
              </div>
            </div>

            <div className="mb-2.5">
              {label('Access code')}
              <input type="text" placeholder="Enter your access code" {...register('accessCode')} className={fieldClass(!!errors.accessCode)} />
              {err(errors.accessCode?.message)}
              {!errors.accessCode && <p className={hintTextClass}>Determines your role — student, teacher, or admin.</p>}
            </div>

            {apiError && (
              <div className={cn(alertClass, 'mt-2')}>
                {apiError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={cn(
                'w-full h-12 mt-5 text-white rounded-full text-[15px] font-semibold shadow-accent',
                isSubmitting ? 'bg-accent-disabled cursor-default' : 'bg-accent-text cursor-pointer',
              )}
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div className="text-center mt-6 text-sm text-subtle">
            Already registered?{' '}
            <Link to="/login" className="text-accent-text font-semibold no-underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
