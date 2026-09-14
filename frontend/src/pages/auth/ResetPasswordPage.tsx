import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { resetPassword } from '@/api/auth';
import { getApiError } from '@/api/http';
import { useMobile } from '@/hooks/useMobile';

const schema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.password === d.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });

type FormData = z.infer<typeof schema>;

const fieldStyle = (hasError: boolean): React.CSSProperties => ({
  width: '100%', height: 46, padding: '0 15px', border: `1px solid ${hasError ? '#ef4444' : '#C8C4BC'}`,
  borderRadius: 12, fontSize: 15, background: '#fff', outline: 'none', fontFamily: 'inherit',
});

export default function ResetPassword() {
  const isMobile = useMobile();
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FAF9F6', padding: 48 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <p style={{ fontSize: 15, color: '#C0392B', marginBottom: 16 }}>Invalid reset link — no token found.</p>
          <Link to="/forgot-password" style={{ color: '#C4471F', fontWeight: 600, textDecoration: 'none' }}>Request a new link</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FAF9F6', padding: isMobile ? '40px 24px' : 48 }}>
      <div style={{ width: '100%', maxWidth: 388 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C4471F', marginBottom: 8 }}>SAT Prep · NIEC</div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 32 : 38, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Choose a new password</h2>
          <p style={{ margin: 0, color: 'rgba(11,11,14,0.64)', fontSize: 15 }}>Must be at least 8 characters.</p>
        </div>

        {done ? (
          <div style={{ background: 'rgba(46,125,90,0.08)', border: '1px solid rgba(46,125,90,0.2)', borderRadius: 12, padding: '20px 24px', marginBottom: 24 }}>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#2E7D5A' }}>Password updated!</p>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(11,11,14,0.65)' }}>You can now sign in with your new password.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.7)', marginBottom: 7 }}>New password</label>
              <input type="password" autoComplete="new-password" placeholder="••••••••" {...register('password')} style={fieldStyle(!!errors.password)} />
              {errors.password && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{errors.password.message}</p>}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.7)', marginBottom: 7 }}>Confirm password</label>
              <input type="password" autoComplete="new-password" placeholder="••••••••" {...register('confirmPassword')} style={fieldStyle(!!errors.confirmPassword)} />
              {errors.confirmPassword && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{errors.confirmPassword.message}</p>}
            </div>

            {apiError && (
              <div style={{ background: 'rgba(192,57,43,0.08)', color: '#C0392B', fontSize: 13, padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
                {apiError}{' '}
                {apiError.includes('expired') || apiError.includes('invalid') ? (
                  <Link to="/forgot-password" style={{ color: '#C0392B', fontWeight: 600 }}>Request a new link</Link>
                ) : null}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ width: '100%', height: 48, background: isSubmitting ? '#e89070' : '#C4471F', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: isSubmitting ? 'default' : 'pointer', boxShadow: '0 2px 10px rgba(226,86,43,0.28)', transition: 'background 0.15s', fontFamily: 'inherit' }}
            >
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'rgba(11,11,14,0.64)' }}>
          <Link to="/login" style={{ color: '#C4471F', fontWeight: 600, textDecoration: 'none' }}>← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
