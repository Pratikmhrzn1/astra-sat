import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { forgotPassword } from '@/features/auth/api/auth.api';
import { getApiError } from '@/shared/api/client';
import { useMobile } from '@/shared/hooks/useMobile';

const schema = z.object({
  email: z.string().email('Invalid email address'),
});
type FormData = z.infer<typeof schema>;

const fieldStyle = (hasError: boolean): React.CSSProperties => ({
  width: '100%', height: 46, padding: '0 15px', border: `1px solid ${hasError ? '#ef4444' : '#C8C4BC'}`,
  borderRadius: 12, fontSize: 15, background: '#fff', outline: 'none', fontFamily: 'inherit',
});

export default function ForgotPassword() {
  const isMobile = useMobile();
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
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#FAF9F6', padding: isMobile ? '40px 24px' : 48 }}>
      <div style={{ width: '100%', maxWidth: 388 }}>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#E2562B', marginBottom: 8 }}>SAT Prep · NIEC</div>
          <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 32 : 38, margin: '0 0 8px', letterSpacing: '-0.02em' }}>Reset password</h2>
          <p style={{ margin: 0, color: 'rgba(11,11,14,0.55)', fontSize: 15, lineHeight: 1.55 }}>
            Enter your account email and we'll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div style={{ background: 'rgba(46,125,90,0.08)', border: '1px solid rgba(46,125,90,0.2)', borderRadius: 12, padding: '20px 24px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: '#2E7D5A' }}>Check your inbox</p>
            <p style={{ margin: 0, fontSize: 14, color: 'rgba(11,11,14,0.65)', lineHeight: 1.6 }}>
              If an account exists for that email, a reset link has been sent. It expires in 1 hour.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.7)', marginBottom: 7 }}>Email</label>
              <input type="email" autoComplete="email" placeholder="you@email.com" {...register('email')} style={fieldStyle(!!errors.email)} />
              {errors.email && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#ef4444' }}>{errors.email.message}</p>}
            </div>

            {apiError && (
              <div style={{ background: 'rgba(192,57,43,0.08)', color: '#C0392B', fontSize: 13, padding: '10px 14px', borderRadius: 10, marginBottom: 12 }}>
                {apiError}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              style={{ width: '100%', height: 48, background: isSubmitting ? '#e89070' : '#E2562B', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 15, fontWeight: 600, cursor: isSubmitting ? 'default' : 'pointer', boxShadow: '0 2px 10px rgba(226,86,43,0.28)', transition: 'background 0.15s', fontFamily: 'inherit' }}
            >
              {isSubmitting ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 14, color: 'rgba(11,11,14,0.55)' }}>
          <Link to="/login" style={{ color: '#E2562B', fontWeight: 600, textDecoration: 'none' }}>← Back to sign in</Link>
        </div>
      </div>
    </div>
  );
}
