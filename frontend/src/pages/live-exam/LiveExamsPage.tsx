import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import {
  getLiveSessions, createSession, getLiveExamSets,
  type LiveExamSession, type LiveExamSet,
} from '@/api/liveExam';
import { getApiError } from '@/api/http';
import { Modal } from '@/components/common';
import {
  EmptyState, ErrorNote, JoinCodePlate, LivePage, LoadingRows, PillButton, StatusPill,
  liveCardClass, liveRowClass, liveTitleClass,
} from '@/components/live-exam/ui';
import { cn } from '@/lib/utils';

/** Every live exam this teacher has run, newest first, and the form to start another. */
export default function LiveExams() {
  const navigate = useNavigate();
  const [loadError, setLoadError] = useState('');
  const [sessions, setSessions] = useState<LiveExamSession[]>([]);
  const [sets, setSets] = useState<LiveExamSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', englishSetId: '', mathSetId: '' });

  // A failed load used to fall through to "No sessions yet", telling a teacher
  // their history was gone when the network had only dropped.
  const loadAll = useCallback(() => {
    setLoading(true);
    setLoadError('');
    Promise.all([getLiveSessions(), getLiveExamSets()])
      .then(([s, availableSets]) => { setSessions(s); setSets(availableSets); })
      .catch((err) => setLoadError(getApiError(err)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(loadAll, [loadAll]);

  const openCreate = () => { setError(''); setShowCreate(true); };

  const englishSets = sets.filter((s) => s.subject === 'english');
  const mathSets = sets.filter((s) => s.subject === 'math');

  // A session needs one of each, so either side being empty blocks creation.
  const noSets = englishSets.length === 0 || mathSets.length === 0;
  const missingSubjects = [
    englishSets.length === 0 ? 'a Reading & Writing set' : null,
    mathSets.length === 0 ? 'a Math set' : null,
  ].filter(Boolean).join(' and ');

  async function submit() {
    if (!form.title.trim() || !form.englishSetId || !form.mathSetId) {
      setError('Give the session a name and pick both papers.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const session = await createSession({ ...form, title: form.title.trim() });
      setSessions((prev) => [session, ...prev]);
      setShowCreate(false);
      setForm({ title: '', englishSetId: '', mathSetId: '' });
      // Straight to the room: the next thing a teacher does is read out the code.
      navigate(`/teacher/live-exams/${session.id}`);
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setCreating(false);
    }
  }

  const fieldClass = 'w-full h-[42px] px-3 border border-border-strong rounded-[10px] bg-white text-ink text-sm';
  const labelClass = 'block text-[13px] font-semibold text-subtle mb-1.5';

  return (
    <LivePage>
      <div className="flex items-start sm:items-center justify-between gap-4 flex-wrap mb-2">
        <h1 className={cn(liveTitleClass, 'text-[32px] sm:text-[44px] leading-[1.1]')}>Live Exams</h1>
        <PillButton onClick={openCreate} className="h-[42px] pl-4">
          <Plus size={16} strokeWidth={2.25} aria-hidden />New session
        </PillButton>
      </div>
      <p className="text-sm sm:text-[15px] text-subtle mt-0 mb-6 max-w-[620px] leading-[1.6]">
        Sit a whole class at once. You control when it starts and when each student sees their result.
      </p>

      {loading ? (
        <LoadingRows />
      ) : loadError ? (
        <ErrorNote action={<PillButton variant="secondary" onClick={loadAll} className="h-8 text-[13px]">Try again</PillButton>}>
          Couldn't load your sessions: {loadError}
        </ErrorNote>
      ) : sessions.length === 0 ? (
        <EmptyState title="No sessions yet" action={<PillButton onClick={openCreate}><Plus size={16} strokeWidth={2.25} aria-hidden />Create your first session</PillButton>}>
          Create one, read the join code out to your class, and start when everyone is in the lobby.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2.5">
          {sessions.map((s) => {
            const when = s.startedAt ?? s.createdAt;
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/teacher/live-exams/${s.id}`)}
                data-press="soft"
                className={cn(
                  liveCardClass, liveRowClass,
                  'py-3.5 pl-4 pr-3.5 sm:py-4 sm:pl-5 sm:pr-[18px] flex items-center gap-2.5 sm:gap-4 cursor-pointer text-left text-inherit w-full',
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[15.5px] font-semibold text-ink mb-[7px] truncate">{s.title}</div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <StatusPill status={s.status} />
                    {when && (
                      <span className="text-[12.5px] text-subtle">
                        {s.startedAt ? 'Started' : 'Created'} {new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {s.status === 'waiting' && (
                      <span className="sm:hidden text-[12.5px] text-ink font-mono font-semibold tracking-[0.08em]">{s.joinCode}</span>
                    )}
                  </div>
                </div>
                {/* Reference size here; it is the hero only inside the session. */}
                {s.status === 'waiting' && <div className="hidden sm:block"><JoinCodePlate code={s.joinCode} size="small" /></div>}
                <ChevronRight size={18} className="text-muted shrink-0" aria-hidden />
              </button>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="New live exam"
        footer={
          <>
            <PillButton variant="secondary" onClick={() => setShowCreate(false)}>Cancel</PillButton>
            <PillButton onClick={submit} disabled={creating || noSets}>
              {creating ? 'Creating…' : 'Create session'}
            </PillButton>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {noSets && (
            <div className="bg-gold/[.08] border border-gold/25 rounded-xl px-[15px] py-3 text-[13px] text-gold-dark leading-[1.6]">
              <strong>No papers are marked for live exams yet.</strong> A session needs one Reading &amp;
              Writing set and one Math set, and only sets flagged as live-exam material can be used —
              so a class never sits a paper they have already practised.
              <br />
              In <strong>Content Manager</strong>, open a set and tick <strong>Live exam set</strong>.
              Existing sets can be converted; you do not have to write a new one.
              {missingSubjects && <><br />Still needed: <strong>{missingSubjects}</strong>.</>}
            </div>
          )}

          <div>
            <label htmlFor="session-title" className={labelClass}>Session name <span className="font-normal text-muted">· shown to the class</span></label>
            <input
              id="session-title"
              value={form.title}
              onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); setError(''); }}
              placeholder="Friday mock — Grade 11"
              autoFocus
              maxLength={120}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              className={fieldClass}
            />
          </div>

          {([
            ['Reading & Writing paper', 'englishSetId', englishSets],
            ['Math paper', 'mathSetId', mathSets],
          ] as const).map(([label, field, options]) => (
            <div key={field}>
              <label htmlFor={field} className={labelClass}>{label}</label>
              {options.length === 0 ? (
                <p className="text-[13px] text-muted m-0">None marked yet.</p>
              ) : (
                <select
                  id={field}
                  value={form[field]}
                  onChange={(e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); }}
                  className={cn(fieldClass, 'cursor-pointer')}
                >
                  <option value="">Choose a paper…</option>
                  {options.map((s) => (
                    <option key={s.id} value={s.id}>{s.title}{s.isDraft ? ' (draft)' : ''}</option>
                  ))}
                </select>
              )}
            </div>
          ))}

          {error && <ErrorNote>{error}</ErrorNote>}
        </div>
      </Modal>
    </LivePage>
  );
}
