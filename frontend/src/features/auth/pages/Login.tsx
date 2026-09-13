import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { login } from '@/features/auth/api/auth.api';
import { useAuthStore } from '@/shared/store/auth';
import { getApiError } from '@/shared/api/client';
import { useMobile } from '@/shared/hooks/useMobile';

const schema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

const ROLE_ROUTES = { student: '/student/dashboard', teacher: '/teacher/dashboard', admin: '/admin/dashboard' } as const;

export default function Login() {
  const navigate = useNavigate();
  const { login: storeLogin, user } = useAuthStore();
  const [apiError, setApiError] = useState('');
  const isMobile = useMobile();

  React.useEffect(() => {
    if (user) navigate(ROLE_ROUTES[user.role], { replace: true });
  }, [user, navigate]);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setApiError('');
    try {
      const result = await login(data.email, data.password);
      storeLogin(result.user, result.accessToken);
      navigate(ROLE_ROUTES[result.user.role], { replace: true });
    } catch (err) {
      setApiError(getApiError(err));
    }
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.05fr 1fr', minHeight: '100vh', position: 'relative' }}>
      {/* IELTS ↔ SAT toggle */}
      <div style={{ position: 'absolute', top: 20, right: 24, zIndex: 100, background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(10px)', borderRadius: 9999, padding: 4, boxShadow: '0 2px 20px rgba(0,0,0,0.14)', display: 'flex' }}>
        <button onClick={() => { window.location.href = '/'; }} style={{ padding: '8px 26px', border: 'none', borderRadius: 9999, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.4)', cursor: 'pointer', background: 'transparent', fontFamily: 'inherit' }}>IELTS</button>
        <button style={{ padding: '8px 26px', border: 'none', borderRadius: 9999, fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#fff', cursor: 'default', background: '#C4471F', boxShadow: '0 2px 8px rgba(226,86,43,0.35)', fontFamily: 'inherit' }}>SAT</button>
      </div>
      {/* Left — dark panel (desktop only) */}
      {!isMobile && (
        <div style={{ background: '#0B0B0E', color: '#fff', padding: '64px 72px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: -120, top: -80, width: 360, height: 360, borderRadius: 9999, background: 'radial-gradient(circle, rgba(226,86,43,0.22), transparent 70%)' }} />
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
            Digital SAT · Practice Platform
          </div>
          <div style={{ position: 'relative' }}>
            <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 60, lineHeight: 1.05, letterSpacing: '-0.02em', margin: 0 }}>
              Your best<br />score starts<br />with the next<br />
              <span style={{ color: '#C4471F', fontStyle: 'italic' }}>practice test.</span>
            </h1>
            <p style={{ marginTop: 28, maxWidth: 380, fontSize: 16, lineHeight: 1.65, color: 'rgba(255,255,255,0.6)' }}>
              Full-length mocks, adaptive sections, and an honest estimate of where you stand — out of 1600.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 48 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34, color: '#fff' }}>1600</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>Top score, scaled</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 34, color: '#B8893E' }}>2h 14m</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>Real test length</div>
            </div>
          </div>
        </div>
      )}

      {/* Right — form */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '40px 24px' : 48, background: '#FAF9F6', minHeight: '100vh' }}>
        <div style={{ width: '100%', maxWidth: 388 }}>
          {/* Mobile brand header */}
          {isMobile && (
            <div style={{ textAlign: 'center', marginBottom: 36 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, background: '#E2562B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 9, height: 9, borderRadius: 2, background: '#fff' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: '#0B0B0E' }}>Score Studio</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)' }}>
                Digital SAT · Practice Platform
              </div>
            </div>
          )}

          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 34 : 40, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Welcome back</h2>
          <p style={{ margin: '0 0 32px', color: 'rgba(11,11,14,0.64)', fontSize: 15 }}>Sign in to continue your prep.</p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.7)', marginBottom: 7 }}>Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
                {...register('email')}
                style={{ width: '100%', height: 46, padding: '0 15px', border: `1px solid ${errors.email ? '#ef4444' : '#C8C4BC'}`, borderRadius: 12, fontSize: 15, background: '#fff', outline: 'none' }}
              />
              {errors.email && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{errors.email.message}</p>}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.7)', marginBottom: 7 }}>Password</label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                style={{ width: '100%', height: 46, padding: '0 15px', border: `1px solid ${errors.password ? '#ef4444' : '#C8C4BC'}`, borderRadius: 12, fontSize: 15, background: '#fff', outline: 'none' }}
              />
              {errors.password && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{errors.password.message}</p>}
            </div>

            {apiError && (
              <div style={{ background: 'rgba(192,57,43,0.08)', color: '#C0392B', fontSize: 13, padding: '10px 14px', borderRadius: 10, marginBottom: 16 }}>
                {apiError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ width: '100%', height: 48, marginTop: 22, background: isSubmitting ? '#e89070' : '#C4471F', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: isSubmitting ? 'default' : 'pointer', boxShadow: '0 2px 10px rgba(226,86,43,0.28)', transition: 'background 0.15s' }}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'rgba(11,11,14,0.64)' }}>
            New here?{' '}
            <Link to="/register" style={{ color: '#C4471F', fontWeight: 600, textDecoration: 'none' }}>Create an account</Link>
          </div>
          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 13, color: 'rgba(11,11,14,0.58)' }}>
            <Link to="/forgot-password" style={{ color: 'rgba(11,11,14,0.58)', textDecoration: 'none' }}
              onPointerEnter={(e) => { if (e.pointerType !== 'mouse') return; e.currentTarget.style.color = '#C4471F'; }}
              onPointerLeave={(e) => (e.currentTarget.style.color = 'rgba(11,11,14,0.58)')}
            >Forgot your password?</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
