import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { register as apiRegister } from '../../api/auth';
import { useAuthStore } from '../../store/auth';
import { getApiError } from '../../api/client';
import { useMobile } from '../../hooks/useMobile';

const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    accessCode: z.string().min(1, 'Access code is required'),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type FormData = z.infer<typeof schema>;

const ROLE_ROUTES = { student: '/student/dashboard', teacher: '/teacher/dashboard', admin: '/admin/dashboard' } as const;

const fieldStyle = (hasError: boolean): React.CSSProperties => ({
  width: '100%', height: 46, padding: '0 15px', border: `1px solid ${hasError ? '#ef4444' : '#C8C4BC'}`,
  borderRadius: 12, fontSize: 15, background: '#fff', outline: 'none', fontFamily: 'inherit',
});

export default function Register() {
  const navigate = useNavigate();
  const { login: storeLogin } = useAuthStore();
  const [apiError, setApiError] = useState('');
  const isMobile = useMobile();

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setApiError('');
    try {
      const result = await apiRegister(data.email, data.name, data.password, data.accessCode);
      storeLogin(result.user, result.accessToken);
      navigate(ROLE_ROUTES[result.user.role], { replace: true });
    } catch (err) {
      setApiError(getApiError(err));
    }
  };

  const label = (text: string) => (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.7)', marginBottom: 7 }}>{text}</label>
  );
  const err = (msg?: string) => msg ? <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{msg}</p> : null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.05fr 1fr', minHeight: '100vh' }}>
      {/* Left — dark panel (desktop only) */}
      {!isMobile && (
        <div style={{ background: '#0B0B0E', color: '#fff', padding: '64px 72px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -120, bottom: -100, width: 380, height: 380, borderRadius: 9999, background: 'radial-gradient(circle, rgba(184,137,62,0.20), transparent 70%)' }} />
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
            Digital SAT · Practice Platform
          </div>
          <div style={{ position: 'relative' }}>
            <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 60, lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0 }}>
              Know exactly<br />where you<br />stand — and<br />
              <span style={{ color: '#E2562B', fontStyle: 'italic' }}>how to climb.</span>
            </h1>
            <p style={{ marginTop: 28, maxWidth: 380, fontSize: 16, lineHeight: 1.65, color: 'rgba(255,255,255,0.6)' }}>
              Create a free account to start tracking your section scores, accuracy, and estimated SAT total over time.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {['Full-length mocks', 'Per-topic analysis', 'Score trends'].map((f) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: '#E2562B' }}>✓</span> {f}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Right — form */}
      <div className="scrollarea" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '40px 24px' : 48, overflowY: 'auto', background: '#FAF9F6', minHeight: '100vh' }}>
        <div style={{ width: '100%', maxWidth: 388 }}>
          {/* Mobile brand header */}
          {isMobile && (
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: '#E2562B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: '#fff' }} />
                </div>
                <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 20, color: '#0B0B0E' }}>Score Studio</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)' }}>
                Digital SAT · Practice Platform
              </div>
            </div>
          )}

          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 34 : 40, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Create your account</h2>
          <p style={{ margin: '0 0 28px', color: 'rgba(11,11,14,0.55)', fontSize: 15 }}>It takes less than a minute.</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ marginBottom: 16 }}>
              {label('Full name')}
              <input type="text" autoComplete="name" placeholder="Aarav Sharma" {...register('name')} style={fieldStyle(!!errors.name)} />
              {err(errors.name?.message)}
            </div>

            <div style={{ marginBottom: 16 }}>
              {label('Email')}
              <input type="email" autoComplete="email" placeholder="you@email.com" {...register('email')} style={fieldStyle(!!errors.email)} />
              {err(errors.email?.message)}
            </div>

            {/* Password fields — side by side on desktop, stacked on mobile */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                {label('Password')}
                <input type="password" autoComplete="new-password" placeholder="••••••••" {...register('password')} style={fieldStyle(!!errors.password)} />
                {err(errors.password?.message)}
              </div>
              <div>
                {label('Confirm')}
                <input type="password" autoComplete="new-password" placeholder="••••••••" {...register('confirmPassword')} style={fieldStyle(!!errors.confirmPassword)} />
                {err(errors.confirmPassword?.message)}
              </div>
            </div>

            <div style={{ marginBottom: 10 }}>
              {label('Access code')}
              <input type="text" placeholder="Enter your access code" {...register('accessCode')} style={fieldStyle(!!errors.accessCode)} />
              {err(errors.accessCode?.message)}
              {!errors.accessCode && <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(11,11,14,0.4)' }}>Determines your role — student, teacher, or admin.</p>}
            </div>

            {apiError && (
              <div style={{ background: 'rgba(192,57,43,0.08)', color: '#C0392B', fontSize: 13, padding: '10px 14px', borderRadius: 10, margin: '8px 0 0' }}>
                {apiError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ width: '100%', height: 48, marginTop: 20, background: isSubmitting ? '#e89070' : '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: isSubmitting ? 'default' : 'pointer', boxShadow: '0 2px 10px rgba(226,86,43,0.28)', transition: 'background 0.15s', fontFamily: 'inherit' }}
            >
              {isSubmitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'rgba(11,11,14,0.55)' }}>
            Already registered?{' '}
            <Link to="/login" style={{ color: '#E2562B', fontWeight: 600, textDecoration: 'none' }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
