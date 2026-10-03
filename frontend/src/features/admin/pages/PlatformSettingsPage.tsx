import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPlatformSettings, savePlatformSettings, type PlatformSettings } from '@/features/admin/api';
import { Control, ErrorNotice, Field, InlineSpinner, ScreenMasthead, screenStyle, surfaceStyle } from '@/shared/ui';
import { classes, renderDateTime } from '@/shared/lib/utils';
import { fetchApiError } from '@/shared/api/http';

type Editable = Omit<PlatformSettings, 'updatedAt'>;
type FormState = Record<keyof Editable, string>;

const FIELDS: { key: keyof Editable; label: string; hint: string; max: number }[] = [
  { key: 'trialDurationDays', label: 'Trial length (days)', hint: 'How long a new trial account has access, counted from signup.', max: 3650 },
  { key: 'trialDailyTestLimit', label: 'Trial tests per day', hint: 'Practice and mock starts a trial can make each day (Nepal time).', max: 1000 },
  { key: 'studentDurationDays', label: 'Student length (days)', hint: 'Access for a new student, and for a trial converted to student, counted from signup.', max: 3650 },
];

function toForm(s: PlatformSettings): FormState {
  return {
    trialDurationDays: String(s.trialDurationDays),
    trialDailyTestLimit: String(s.trialDailyTestLimit),
    studentDurationDays: String(s.studentDurationDays),
  };
}

/** The defaults applied to new signups. Existing accounts keep the dates they already have. */
export default function PlatformSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'platform-settings'], queryFn: fetchPlatformSettings });
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data && !form) setForm(toForm(data));
  }, [data, form]);

  const saveMutation = useMutation({
    mutationFn: (patch: Editable) => savePlatformSettings(patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(['admin', 'platform-settings'], updated);
      setForm(toForm(updated));
      setSaved(true);
    },
    onError: (err) => setError(fetchApiError(err)),
  });

  const save = () => {
    if (!form) return;
    setError('');
    setSaved(false);
    const patch = {} as Editable;
    for (const { key, label, max } of FIELDS) {
      const value = Number(form[key]);
      if (!Number.isInteger(value) || value < 1 || value > max) {
        setError(`${label} must be a whole number between 1 and ${max}.`);
        return;
      }
      patch[key] = value;
    }
    saveMutation.mutate(patch);
  };

  return (
    <div className={screenStyle}>
      <ScreenMasthead
        title="Platform settings"
        subtitle="Defaults for new trial and student signups. Changing them doesn't alter existing accounts; edit those from User Management."
      />

      {isLoading || !form ? (
        <InlineSpinner />
      ) : (
        <div className={classes(surfaceStyle, 'p-6 max-w-[640px]')}>
          <div className="flex flex-col gap-5">
            {FIELDS.map(({ key, label, hint, max }) => (
              <Field
                key={key}
                label={label}
                type="number"
                min={1}
                max={max}
                value={form[key]}
                onChange={(e) => { setSaved(false); setForm((f) => (f ? { ...f, [key]: e.target.value } : f)); }}
                hint={hint}
              />
            ))}
          </div>

          {error && <ErrorNotice className="mt-5 mb-0">{error}</ErrorNotice>}

          <div className="flex items-center gap-3 mt-6 flex-wrap">
            <Control onClick={save} loading={saveMutation.isPending}>Save settings</Control>
            {saved && <span className="text-[13px] text-green-dark">Saved.</span>}
            {data && !saved && (
              <span className="text-xs text-muted">Last changed {renderDateTime(data.updatedAt)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
