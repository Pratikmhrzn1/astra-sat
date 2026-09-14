import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import {
  getLiveSessions, createSession, getLiveExamSets,
  type LiveExamSession, type LiveExamSet,
} from '@/features/live-exam/api/live-exam.api';
import { getApiError } from '@/shared/api/client';
import { Modal } from '@/shared/ui';
import { useMobile } from '@/shared/hooks/useMobile';
import {
  CARD, EmptyState, ErrorNote, H1, HOVER_CSS, JoinCodePlate, LivePage, LoadingRows, PillButton, StatusPill, T,
} from '@/features/live-exam/ui';

/** Every live exam this teacher has run, newest first, and the form to start another. */
export default function LiveExams() {
  const navigate = useNavigate();
  const isMobile = useMobile();
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

  const fieldStyle: React.CSSProperties = {
    width: '100%', height: 42, padding: '0 12px', border: '1px solid #D8D4CC',
    borderRadius: 10, background: '#fff', color: T.ink, fontSize: 14,
    fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6,
  };

  return (
    <LivePage>
      <style>{HOVER_CSS}</style>
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <h1 style={{ ...H1, fontSize: isMobile ? 32 : 44, lineHeight: 1.1 }}>Live Exams</h1>
        <PillButton onClick={openCreate} style={{ height: 42, paddingLeft: 16 }}>
          <Plus size={16} strokeWidth={2.25} aria-hidden />New session
        </PillButton>
      </div>
      <p style={{ fontSize: isMobile ? 14 : 15, color: T.muted, margin: '0 0 24px', maxWidth: 620, lineHeight: 1.6 }}>
        Sit a whole class at once. You control when it starts and when each student sees their result.
      </p>

      {loading ? (
        <LoadingRows />
      ) : loadError ? (
        <ErrorNote action={<PillButton variant="secondary" onClick={loadAll} style={{ height: 32, fontSize: 13 }}>Try again</PillButton>}>
          Couldn't load your sessions: {loadError}
        </ErrorNote>
      ) : sessions.length === 0 ? (
        <EmptyState title="No sessions yet" action={<PillButton onClick={openCreate}><Plus size={16} strokeWidth={2.25} aria-hidden />Create your first session</PillButton>}>
          Create one, read the join code out to your class, and start when everyone is in the lobby.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessions.map((s) => {
            const when = s.startedAt ?? s.createdAt;
            return (
              <button
                key={s.id}
                className="live-row"
                onClick={() => navigate(`/teacher/live-exams/${s.id}`)}
                data-press="soft"
                style={{
                  ...CARD, padding: isMobile ? '14px 14px 14px 16px' : '16px 18px 16px 20px',
                  display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16,
                  cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit', width: '100%', boxSizing: 'border-box',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15.5, fontWeight: 600, color: T.ink, marginBottom: 7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <StatusPill status={s.status} />
                    {when && (
                      <span style={{ fontSize: 12.5, color: T.muted }}>
                        {s.startedAt ? 'Started' : 'Created'} {new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {isMobile && s.status === 'waiting' && (
                      <span style={{ fontSize: 12.5, color: T.ink, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.08em' }}>{s.joinCode}</span>
                    )}
                  </div>
                </div>
                {/* Reference size here; it is the hero only inside the session. */}
                {!isMobile && s.status === 'waiting' && <JoinCodePlate code={s.joinCode} size="small" />}
                <ChevronRight size={18} color={T.faint} style={{ flexShrink: 0 }} aria-hidden />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {noSets && (
            <div style={{ background: 'rgba(184,137,62,0.08)', border: '1px solid rgba(184,137,62,0.25)', borderRadius: 12, padding: '12px 15px', fontSize: 13, color: '#8A6020', lineHeight: 1.6 }}>
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
            <label htmlFor="session-title" style={labelStyle}>Session name <span style={{ fontWeight: 400, color: T.faint }}>· shown to the class</span></label>
            <input
              id="session-title"
              value={form.title}
              onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); setError(''); }}
              placeholder="Friday mock — Grade 11"
              autoFocus
              maxLength={120}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
              style={fieldStyle}
            />
          </div>

          {([
            ['Reading & Writing paper', 'englishSetId', englishSets],
            ['Math paper', 'mathSetId', mathSets],
          ] as const).map(([label, field, options]) => (
            <div key={field}>
              <label htmlFor={field} style={labelStyle}>{label}</label>
              {options.length === 0 ? (
                <p style={{ fontSize: 13, color: T.faint, margin: 0 }}>None marked yet.</p>
              ) : (
                <select
                  id={field}
                  value={form[field]}
                  onChange={(e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setError(''); }}
                  style={{ ...fieldStyle, cursor: 'pointer' }}
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
