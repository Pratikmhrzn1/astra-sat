import React, { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useNavigate } from 'react-router-dom';
import { useMobile } from '@/hooks/useMobile';
import { changePassword, updateProfile } from '@/api/auth';
import {
  getProfile as getStudentProfile,
  updateProfile as updateStudentProfile,
} from '@/api/student';
import { getApiError } from '@/api/http';
import { TOTAL_MAX, TOTAL_MIN, daysUntil } from '@/lib/score';

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: string }) {
  return <h3 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', margin: '0 0 10px' }}>{children}</h3>;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ width: 46, height: 27, borderRadius: 9999, border: 'none', cursor: 'pointer', background: on ? '#E2562B' : '#C8C4BC', position: 'relative', transition: 'background 0.2s', padding: 0, flexShrink: 0 }}
    >
      <span style={{ position: 'absolute', top: 3, left: on ? 22 : 3, width: 21, height: 21, borderRadius: 9999, background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.25)' }} />
    </button>
  );
}

function Row({ title, desc, control, last, stack }: { title: string; desc?: string; control: React.ReactNode; last?: boolean; stack?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: stack ? 'flex-start' : 'center',
      flexDirection: stack ? 'column' : 'row',
      gap: stack ? 10 : 20, padding: '15px 20px',
      borderBottom: last ? 'none' : '1px solid #F2F0EC',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</div>
        {desc && <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.64)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ width: stack ? '100%' : undefined }}>{control}</div>
    </div>
  );
}

const CARD: React.CSSProperties = {
  background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16,
  boxShadow: '0 1px 3px rgba(11,11,14,0.05)', overflow: 'hidden',
};

// ── Change Password Modal ──────────────────────────────────────────────────────

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const fieldStyle = (err: boolean): React.CSSProperties => ({
    width: '100%', height: 44, padding: '0 14px', border: `1px solid ${err ? '#ef4444' : '#C8C4BC'}`,
    borderRadius: 10, fontSize: 14, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  });

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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,11,14,0.35)' }} onClick={onClose} />
      <div className="pop" style={{ position: 'relative', background: '#fff', borderRadius: 20, padding: '28px 28px 24px', width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(11,11,14,0.18)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 26, margin: 0, letterSpacing: '-0.02em' }}>Change password</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6F6B64', fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
        </div>

        {done ? (
          <div style={{ textAlign: 'center', padding: '8px 0 4px' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Password updated</div>
            <div style={{ fontSize: 13.5, color: 'rgba(11,11,14,0.64)', marginBottom: 24 }}>Your password has been changed successfully.</div>
            <button onClick={onClose} style={{ height: 44, padding: '0 28px', background: '#0B0B0E', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6 }}>Current password</label>
                <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} style={fieldStyle(false)} placeholder="••••••••" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6 }}>New password</label>
                <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} style={fieldStyle(false)} placeholder="Min. 8 characters" />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6 }}>Confirm new password</label>
                <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={fieldStyle(confirm.length > 0 && confirm !== next)} placeholder="••••••••" />
              </div>
            </div>

            {error && (
              <div style={{ background: 'rgba(192,57,43,0.08)', color: '#C0392B', fontSize: 13, padding: '10px 14px', borderRadius: 10, marginTop: 14 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button type="button" onClick={onClose} style={{ flex: 1, height: 44, background: '#fff', color: '#0B0B0E', border: '1px solid #C8C4BC', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button type="submit" disabled={loading || !current || !next || !confirm} style={{ flex: 1, height: 44, background: (loading || !current || !next || !confirm) ? '#C8C4BC' : '#0B0B0E', color: '#fff', border: 'none', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: (loading || !current || !next || !confirm) ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'background 0.15s' }}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function StudentSettings() {
  const { user, logout, setUser } = useAuthStore();
  const navigate = useNavigate();
  const isMobile = useMobile();

  // Profile
  const [editName, setEditName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState('');
  const [nameSaved, setNameSaved] = useState(false);

  // Test preferences (localStorage)
  const [timerOn, setTimerOn] = useState(() => localStorage.getItem('sat-timer-pref') === 'true');
  const [largeFontOn, setLargeFontOn] = useState(() => localStorage.getItem('sat-font-pref') === 'true');

  // Password modal
  const [showPwModal, setShowPwModal] = useState(false);

  // Goal — the first student preference kept on the server rather than in
  // localStorage, because the dashboard and the teacher's view both read it.
  const queryClient = useQueryClient();
  const { data: goal } = useQuery({ queryKey: ['student', 'profile'], queryFn: getStudentProfile });
  const [targetInput, setTargetInput] = useState('');
  const [testDateInput, setTestDateInput] = useState('');
  const [goalError, setGoalError] = useState('');
  const [goalSaved, setGoalSaved] = useState(false);

  // Seeded from the server once it arrives, then left alone so a save in
  // progress cannot clobber what the student is typing.
  useEffect(() => {
    if (!goal) return;
    setTargetInput(goal.targetScore === null ? '' : String(goal.targetScore));
    setTestDateInput(goal.testDate ?? '');
  }, [goal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const goalMutation = useMutation({
    mutationFn: (payload: { targetScore: number | null; testDate: string | null }) =>
      updateStudentProfile(payload),
    onSuccess: (saved) => {
      setGoalError('');
      setGoalSaved(true);
      queryClient.setQueryData(['student', 'profile'], saved);
      setTimeout(() => setGoalSaved(false), 2000);
    },
    onError: (err) => { setGoalSaved(false); setGoalError(getApiError(err)); },
  });

  const handleSaveGoal = () => {
    const trimmed = targetInput.trim();
    if (trimmed === '') {
      goalMutation.mutate({ targetScore: null, testDate: testDateInput || null });
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < TOTAL_MIN || parsed > TOTAL_MAX) {
      setGoalError(`Target must be between ${TOTAL_MIN} and ${TOTAL_MAX}.`);
      return;
    }

    // Rounded here rather than rejected: SAT scores are reported in tens, and a
    // student typing 1447 means "about 1450", not "invalid input".
    const rounded = Math.round(parsed / 10) * 10;
    setTargetInput(String(rounded));
    goalMutation.mutate({ targetScore: rounded, testDate: testDateInput || null });
  };

  const goalDays = daysUntil(testDateInput || null);

  // Keep editName in sync if user changes (e.g. after save)
  useEffect(() => { setEditName(user?.name ?? ''); }, [user?.name]);

  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === user?.name) return;
    setNameError('');
    setNameSaving(true);
    setNameSaved(false);
    try {
      const updated = await updateProfile(editName.trim());
      setUser({ ...user!, name: updated.name });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch (err) {
      setNameError(getApiError(err));
    } finally {
      setNameSaving(false);
    }
  };

  const toggleTimer = () => {
    const next = !timerOn;
    setTimerOn(next);
    localStorage.setItem('sat-timer-pref', String(next));
  };

  const toggleLargeFont = () => {
    const next = !largeFontOn;
    setLargeFontOn(next);
    localStorage.setItem('sat-font-pref', String(next));
  };

  const handleSignOut = () => { logout(); navigate('/login', { replace: true }); };

  const initials = user?.name.split(' ').map((w) => w[0]).slice(0, 2).join('') ?? '?';
  const nameChanged = editName.trim() !== (user?.name ?? '');

  return (
    <div className="screen-fade" style={{ padding: isMobile ? '20px 16px 80px' : '36px 48px 64px', maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: isMobile ? 32 : 44, margin: '0 0 6px', letterSpacing: '-0.02em' }}>Settings</h1>
      <p style={{ fontSize: isMobile ? 14 : 15, color: 'rgba(11,11,14,0.64)', margin: '0 0 28px' }}>Manage your profile and how the platform behaves for you.</p>

      {/* ── Profile ── */}
      <div style={{ marginBottom: 26 }}>
        <SectionTitle>Profile</SectionTitle>
        <div style={CARD}>
          {/* Avatar + name display */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', borderBottom: '1px solid #F2F0EC' }}>
            <div style={{ width: isMobile ? 42 : 52, height: isMobile ? 42 : 52, borderRadius: 9999, background: '#0B0B0E', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 16 : 20, fontWeight: 600, flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: isMobile ? 15 : 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.name}</div>
              <div style={{ fontSize: 13, color: 'rgba(11,11,14,0.64)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
            </div>
          </div>

          {/* Editable name */}
          <div style={{ padding: '15px 20px', borderBottom: '1px solid #F2F0EC' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 7 }}>Display name</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input
                value={editName}
                onChange={(e) => { setEditName(e.target.value); setNameError(''); setNameSaved(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                style={{ flex: 1, height: 42, padding: '0 14px', border: `1px solid ${nameError ? '#ef4444' : '#C8C4BC'}`, borderRadius: 10, fontSize: 14, background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
                placeholder="Your full name"
              />
              <button
                onClick={handleSaveName}
                disabled={nameSaving || !nameChanged}
                style={{ height: 42, padding: '0 18px', border: 'none', borderRadius: 10, fontSize: 13.5, fontWeight: 600, cursor: (nameSaving || !nameChanged) ? 'default' : 'pointer', fontFamily: 'inherit', background: nameSaved ? '#2E7D5A' : (nameSaving || !nameChanged) ? '#E7E4DE' : '#0B0B0E', color: nameSaved ? '#fff' : (nameSaving || !nameChanged) ? '#6F6B64' : '#fff', transition: 'background 0.2s', flexShrink: 0 }}
              >
                {nameSaving ? 'Saving…' : nameSaved ? '✓ Saved' : 'Save'}
              </button>
            </div>
            {nameError && <p style={{ margin: '6px 0 0', fontSize: 12.5, color: '#C0392B' }}>{nameError}</p>}
          </div>

          {/* Email — read only */}
          <div style={{ padding: '15px 20px' }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 7 }}>Email address</label>
            <div style={{ height: 42, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 10, fontSize: 14, background: '#F8F6F2', color: 'rgba(11,11,14,0.64)', display: 'flex', alignItems: 'center' }}>
              {user?.email}
            </div>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: 'rgba(11,11,14,0.58)' }}>Email cannot be changed here. Contact your teacher or admin.</p>
          </div>
        </div>
      </div>

      {/* ── Your goal ── */}
      <div style={{ marginBottom: 26 }}>
        <SectionTitle>Your goal</SectionTitle>
        <div style={CARD}>
          <Row
            title="Target score"
            desc={`The total you're aiming for, ${TOTAL_MIN}–${TOTAL_MAX}. Your dashboard measures progress against this instead of a default.`}
            control={
              <input
                type="number"
                inputMode="numeric"
                min={TOTAL_MIN}
                max={TOTAL_MAX}
                step={10}
                value={targetInput}
                onChange={(e) => { setTargetInput(e.target.value); setGoalError(''); }}
                placeholder="Not set"
                style={{ height: 38, padding: '0 12px', border: '1px solid #C8C4BC', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', width: isMobile ? '100%' : 120 }}
              />
            }
            stack={isMobile}
          />
          <Row
            title="Test date"
            desc={
              goalDays === null
                ? 'The SAT sitting you are preparing for.'
                : goalDays >= 0
                  ? `${goalDays} ${goalDays === 1 ? 'day' : 'days'} away.`
                  : 'This date has passed.'
            }
            control={
              <input
                type="date"
                value={testDateInput}
                onChange={(e) => { setTestDateInput(e.target.value); setGoalError(''); }}
                style={{ height: 38, padding: '0 12px', border: '1px solid #C8C4BC', borderRadius: 10, fontSize: 14, fontFamily: 'inherit', width: isMobile ? '100%' : 170 }}
              />
            }
            stack={isMobile}
          />
          <Row
            title="Save goal"
            desc={goalError || (goalSaved ? 'Saved.' : 'Leave the target empty to clear it.')}
            control={
              <button
                onClick={handleSaveGoal}
                disabled={goalMutation.isPending}
                style={{ height: 38, padding: '0 16px', border: 'none', background: '#C4471F', color: '#fff', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: goalMutation.isPending ? 'default' : 'pointer', opacity: goalMutation.isPending ? 0.6 : 1, fontFamily: 'inherit', width: isMobile ? '100%' : undefined }}
              >
                {goalMutation.isPending ? 'Saving…' : 'Save'}
              </button>
            }
            stack={isMobile}
            last
          />
        </div>
      </div>

      {/* ── Test experience ── */}
      <div style={{ marginBottom: 26 }}>
        <SectionTitle>Test experience</SectionTitle>
        <div style={CARD}>
          <Row
            title="Practice timer on by default"
            desc="Start individual practice sets with the 20-minute countdown running."
            control={<Toggle on={timerOn} onClick={toggleTimer} />}
          />
          <Row
            title="Larger question text"
            desc="Increases font size in the test player for easier reading."
            control={<Toggle on={largeFontOn} onClick={toggleLargeFont} />}
            last
          />
        </div>
      </div>

      {/* ── Account ── */}
      <div>
        <SectionTitle>Account</SectionTitle>
        <div style={CARD}>
          <Row
            title="Password"
            desc="Change your account password."
            control={
              <button
                onClick={() => setShowPwModal(true)}
                style={{ height: 38, padding: '0 16px', border: '1px solid #C8C4BC', background: '#fff', color: '#0B0B0E', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: isMobile ? '100%' : undefined }}
              >
                Change password
              </button>
            }
            stack={isMobile}
          />
          <Row
            title="Sign out"
            desc="Sign out of your account on this device."
            control={
              <button
                onClick={handleSignOut}
                style={{ height: 38, padding: '0 18px', border: 'none', background: '#0B0B0E', color: '#fff', borderRadius: 9999, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: isMobile ? '100%' : undefined }}
              >
                Sign out
              </button>
            }
            stack={isMobile}
            last
          />
        </div>
      </div>

      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  );
}
