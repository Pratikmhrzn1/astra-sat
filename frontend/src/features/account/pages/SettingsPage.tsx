import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { editAccountDossier, useSessionVault } from '@/features/auth';
import { fetchProfile as getStudentProfile, editLearnerDossier as updateStudentProfile } from '@/features/progress';
import { fetchApiError } from '@/shared/api/http';
import { ScreenMasthead, Switch, screenStyle } from '@/shared/ui';
import { COMPOSITE_CEILING, COMPOSITE_FLOOR, daysRemaining } from '@/entities/score';
import { classes } from '@/shared/lib/utils';
import {
  PreferencesCluster, PreferencesRow, settingsFieldClass, settingsCaptionClass,
} from '@/features/account/components/SettingsCard';
import { ChangePassphraseDialog } from '@/features/account/components/ChangePasswordModal';

// ── Main component ─────────────────────────────────────────────────────────────

export default function LearnerSettings() {
  const { user, logout, setUser } = useSessionVault();
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
    onError: (err) => { setGoalSaved(false); setGoalError(fetchApiError(err)); },
  });

  const handleSaveGoal = () => {
    const trimmed = targetInput.trim();
    if (trimmed === '') {
      goalMutation.mutate({ targetScore: null, testDate: testDateInput || null });
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < COMPOSITE_FLOOR || parsed > COMPOSITE_CEILING) {
      setGoalError(`Target must be between ${COMPOSITE_FLOOR} and ${COMPOSITE_CEILING}.`);
      return;
    }

    // Rounded here rather than rejected: SAT scores are reported in tens, and a
    // student typing 1447 means "about 1450", not "invalid input".
    const rounded = Math.round(parsed / 10) * 10;
    setTargetInput(String(rounded));
    goalMutation.mutate({ targetScore: rounded, testDate: testDateInput || null });
  };

  const goalDays = daysRemaining(testDateInput || null);

  // Keep editName in sync if user changes (e.g. after save)
  useEffect(() => { setEditName(user?.name ?? ''); }, [user?.name]);

  const handleSaveName = async () => {
    if (!editName.trim() || editName.trim() === user?.name) return;
    setNameError('');
    setNameSaving(true);
    setNameSaved(false);
    try {
      const updated = await editAccountDossier(editName.trim());
      setUser({ ...user!, name: updated.name });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2500);
    } catch (err) {
      setNameError(fetchApiError(err));
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
    <div className={classes(screenStyle, 'max-w-[820px] mx-auto')}>
      <ScreenMasthead title="Settings" subtitle="Manage your profile and how the platform behaves for you." className="mb-7" />

      <PreferencesCluster title="Profile">
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
          <label className={settingsCaptionClass}>Display name</label>
          <div className="flex gap-2.5">
            <input
              value={editName}
              onChange={(e) => { setEditName(e.target.value); setNameError(''); setNameSaved(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
              className={classes('flex-1 h-[42px] px-3.5 border rounded-[10px] text-sm bg-white outline-none', nameError ? 'border-error-field' : 'border-field')}
              placeholder="Your full name"
            />
            <button
              onClick={handleSaveName}
              disabled={nameSaving || !nameChanged}
              className={classes(
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
          <label className={settingsCaptionClass}>Email address</label>
          <div className="h-[42px] px-3.5 border border-border rounded-[10px] text-sm bg-[#F8F6F2] text-subtle flex items-center">
            {user?.email}
          </div>
          <p className="mt-[5px] mb-0 text-xs text-muted">Email cannot be changed here. Contact your teacher or admin.</p>
        </div>
      </PreferencesCluster>

      <PreferencesCluster title="Your goal">
        <PreferencesRow
          title="Target score"
          desc={`The total you're aiming for, ${COMPOSITE_FLOOR}–${COMPOSITE_CEILING}. Your dashboard measures progress against this instead of a default.`}
          control={
            <input
              type="number"
              inputMode="numeric"
              min={COMPOSITE_FLOOR}
              max={COMPOSITE_CEILING}
              step={10}
              value={targetInput}
              onChange={(e) => { setTargetInput(e.target.value); setGoalError(''); }}
              placeholder="Not set"
              className={classes(settingsFieldClass, 'w-full sm:w-[120px]')}
            />
          }
          stack
        />
        <PreferencesRow
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
              className={classes(settingsFieldClass, 'w-full sm:w-[170px]')}
            />
          }
          stack
        />
        <PreferencesRow
          title="Save goal"
          desc={goalError || (goalSaved ? 'Saved.' : 'Leave the target empty to clear it.')}
          control={
            <button
              onClick={handleSaveGoal}
              disabled={goalMutation.isPending}
              className={classes(pillBtn, 'px-4 bg-accent-text text-white disabled:cursor-default disabled:opacity-60')}
            >
              {goalMutation.isPending ? 'Saving…' : 'Save'}
            </button>
          }
          stack
        />
      </PreferencesCluster>

      <PreferencesCluster title="Test experience">
        <PreferencesRow
          title="Practice timer on by default"
          desc="Start individual practice sets with the 20-minute countdown running."
          control={<Switch on={timerOn} onClick={toggleTimer} label="Practice timer on by default" />}
        />
        <PreferencesRow
          title="Larger question text"
          desc="Increases font size in the test player for easier reading."
          control={<Switch on={largeFontOn} onClick={toggleLargeFont} label="Larger question text" />}
        />
      </PreferencesCluster>

      <PreferencesCluster title="Account" className="mb-0">
        <PreferencesRow
          title="Password"
          desc="Change your account password."
          control={
            <button onClick={() => setShowPwModal(true)} className={classes(pillBtn, 'px-4 border border-field bg-white text-ink')}>
              Change password
            </button>
          }
          stack
        />
        <PreferencesRow
          title="Sign out"
          desc="Sign out of your account on this device."
          control={
            <button onClick={handleSignOut} className={classes(pillBtn, 'px-[18px] bg-ink text-white')}>
              Sign out
            </button>
          }
          stack
        />
      </PreferencesCluster>

      {showPwModal && <ChangePassphraseDialog onClose={() => setShowPwModal(false)} />}
    </div>
  );
}
