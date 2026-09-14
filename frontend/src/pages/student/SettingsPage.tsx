import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth';
import { useNavigate } from 'react-router-dom';
import { updateProfile } from '@/api/auth';
import {
  getProfile as getStudentProfile,
  updateProfile as updateStudentProfile,
} from '@/api/student';
import { getApiError } from '@/api/http';
import { PageHeader, Toggle, pageClass } from '@/components/common';
import { TOTAL_MAX, TOTAL_MIN, daysUntil } from '@/lib/score';
import { cn } from '@/lib/utils';
import {
  SettingsGroup, SettingsRow, settingsInputClass, settingsLabelClass,
} from '@/sections/student/settings/SettingsCard';
import { ChangePasswordModal } from '@/sections/student/settings/ChangePasswordModal';

// ── Main component ─────────────────────────────────────────────────────────────

export default function StudentSettings() {
  const { user, logout, setUser } = useAuthStore();
  const navigate = useNavigate();

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

  const pillBtn = 'h-[38px] rounded-full text-[13px] font-semibold cursor-pointer w-full sm:w-auto';

  return (
    <div className={cn(pageClass, 'max-w-[820px] mx-auto')}>
      <PageHeader title="Settings" subtitle="Manage your profile and how the platform behaves for you." className="mb-7" />

      <SettingsGroup title="Profile">
        {/* Avatar + name display */}
        <div className="flex items-center gap-3.5 px-5 py-[18px] border-b border-sunken">
          <div className="w-[42px] h-[42px] sm:w-[52px] sm:h-[52px] rounded-full bg-ink text-white flex items-center justify-center text-base sm:text-xl font-semibold shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] sm:text-base font-semibold truncate">{user?.name}</div>
            <div className="text-[13px] text-subtle truncate">{user?.email}</div>
          </div>
        </div>

        {/* Editable name */}
        <div className="px-5 py-[15px] border-b border-sunken">
          <label className={settingsLabelClass}>Display name</label>
          <div className="flex gap-2.5">
            <input
              value={editName}
              onChange={(e) => { setEditName(e.target.value); setNameError(''); setNameSaved(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
              className={cn('flex-1 h-[42px] px-3.5 border rounded-[10px] text-sm bg-white outline-none', nameError ? 'border-error-field' : 'border-field')}
              placeholder="Your full name"
            />
            <button
              onClick={handleSaveName}
              disabled={nameSaving || !nameChanged}
              className={cn(
                'h-[42px] px-[18px] rounded-[10px] text-[13.5px] font-semibold shrink-0 transition-colors duration-200',
                nameSaved ? 'bg-green-sat text-white' : (nameSaving || !nameChanged) ? 'bg-border text-stone' : 'bg-ink text-white',
                (nameSaving || !nameChanged) ? 'cursor-default' : 'cursor-pointer',
              )}
            >
              {nameSaving ? 'Saving…' : nameSaved ? '✓ Saved' : 'Save'}
            </button>
          </div>
          {nameError && <p className="mt-1.5 mb-0 text-[12.5px] text-danger">{nameError}</p>}
        </div>

        {/* Email — read only */}
        <div className="px-5 py-[15px]">
          <label className={settingsLabelClass}>Email address</label>
          <div className="h-[42px] px-3.5 border border-border rounded-[10px] text-sm bg-[#F8F6F2] text-subtle flex items-center">
            {user?.email}
          </div>
          <p className="mt-[5px] mb-0 text-xs text-muted">Email cannot be changed here. Contact your teacher or admin.</p>
        </div>
      </SettingsGroup>

      <SettingsGroup title="Your goal">
        <SettingsRow
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
              className={cn(settingsInputClass, 'w-full sm:w-[120px]')}
            />
          }
          stack
        />
        <SettingsRow
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
              className={cn(settingsInputClass, 'w-full sm:w-[170px]')}
            />
          }
          stack
        />
        <SettingsRow
          title="Save goal"
          desc={goalError || (goalSaved ? 'Saved.' : 'Leave the target empty to clear it.')}
          control={
            <button
              onClick={handleSaveGoal}
              disabled={goalMutation.isPending}
              className={cn(pillBtn, 'px-4 bg-accent-text text-white disabled:cursor-default disabled:opacity-60')}
            >
              {goalMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          }
          stack
        />
      </SettingsGroup>

      <SettingsGroup title="Test experience">
        <SettingsRow
          title="Practice timer on by default"
          desc="Start individual practice sets with the 20-minute countdown running."
          control={<Toggle on={timerOn} onClick={toggleTimer} label="Practice timer on by default" />}
        />
        <SettingsRow
          title="Larger question text"
          desc="Increases font size in the test player for easier reading."
          control={<Toggle on={largeFontOn} onClick={toggleLargeFont} label="Larger question text" />}
        />
      </SettingsGroup>

      <SettingsGroup title="Account" className="mb-0">
        <SettingsRow
          title="Password"
          desc="Change your account password."
          control={
            <button onClick={() => setShowPwModal(true)} className={cn(pillBtn, 'px-4 border border-field bg-white text-ink')}>
              Change password
            </button>
          }
          stack
        />
        <SettingsRow
          title="Sign out"
          desc="Sign out of your account on this device."
          control={
            <button onClick={handleSignOut} className={cn(pillBtn, 'px-[18px] bg-ink text-white')}>
              Sign out
            </button>
          }
          stack
        />
      </SettingsGroup>

      {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </div>
  );
}
