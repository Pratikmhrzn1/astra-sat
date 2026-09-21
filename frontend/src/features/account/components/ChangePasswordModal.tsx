import { useState } from 'react';
import { changePassword } from '@/features/auth';
import { getApiError } from '@/shared/api/http';
import { alertClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

const fieldClass = (err: boolean) => cn(
  'w-full h-11 px-3.5 border rounded-[10px] text-sm bg-white outline-none',
  err ? 'border-error-field' : 'border-field',
);
const labelClass = 'block text-[13px] font-semibold text-subtle mb-1.5';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 8) { setError('New password must be at least 8 characters.'); return; }
    if (next !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await changePassword(current, next);
      setDone(true);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const incomplete = loading || !current || !next || !confirm;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/[.35]" onClick={onClose} />
      <div className="pop relative bg-white rounded-[20px] px-7 pt-7 pb-6 w-full max-w-[420px] shadow-[0_24px_64px_rgba(11,11,14,0.18)]">
        <div className="flex justify-between items-center mb-5">
          <h2 className="font-display font-semibold text-[26px] m-0 tracking-[-0.02em]">Change password</h2>
          <button onClick={onClose} className="bg-transparent cursor-pointer text-stone text-[22px] leading-none p-0">×</button>
        </div>

        {done ? (
          <div className="text-center pt-2 pb-1">
            <div className="text-4xl mb-3">✅</div>
            <div className="text-[15px] font-semibold mb-1.5">Password updated</div>
            <div className="text-[13.5px] text-subtle mb-6">Your password has been changed successfully.</div>
            <button onClick={onClose} className="h-11 px-7 bg-ink text-white rounded-full text-sm font-semibold cursor-pointer">Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3.5">
              <div>
                <label className={labelClass}>Current password</label>
                <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} className={fieldClass(false)} placeholder="••••••••" />
              </div>
              <div>
                <label className={labelClass}>New password</label>
                <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} className={fieldClass(false)} placeholder="Min. 8 characters" />
              </div>
              <div>
                <label className={labelClass}>Confirm new password</label>
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={fieldClass(confirm.length > 0 && confirm !== next)} placeholder="••••••••" />
              </div>
            </div>

            {error && <div className={cn(alertClass, 'mt-3.5')}>{error}</div>}

            <div className="flex gap-2.5 mt-[22px]">
              <button type="button" onClick={onClose} className="flex-1 h-11 bg-white text-ink border border-field rounded-full text-sm font-semibold cursor-pointer">Cancel</button>
              <button
                type="submit"
                disabled={incomplete}
                className={cn('flex-1 h-11 text-white rounded-full text-sm font-semibold transition-colors duration-150', incomplete ? 'bg-field cursor-default' : 'bg-ink cursor-pointer')}
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
