import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import {
  getLiveSessions, createSession, getLiveExamSets,
  type LiveExamSession, type LiveExamSet,
} from '@/features/live-exam/api/live-exam.api';
import { getApiError } from '@/shared/api/client';
import { Modal } from '@/shared/ui';
import {
  CARD, EmptyState, ErrorNote, H1, JoinCodePlate, PillButton, StatusPill, T,
} from '@/features/live-exam/ui';

/** Every live exam this teacher has run, newest first, and the form to start another. */
export default function LiveExams() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<LiveExamSession[]>([]);
  const [sets, setSets] = useState<LiveExamSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', englishSetId: '', mathSetId: '' });

  useEffect(() => {
    Promise.all([getLiveSessions(), getLiveExamSets()])
      .then(([s, availableSets]) => { setSessions(s); setSets(availableSets); })
      .finally(() => setLoading(false));
  }, []);

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
    width: '100%', height: 42, padding: '0 12px', border: `1px solid ${T.line}`,
    borderRadius: 10, background: '#fff', color: T.ink, fontSize: 14,
    fontFamily: 'inherit', outline: 'none',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.65)', marginBottom: 6,
  };

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 8 }}>
        <h1 style={{ ...H1, fontSize: 44 }}>Live Exams</h1>
        <PillButton onClick={() => { setError(''); setShowCreate(true); }} style={{ height: 42 }}>
          <Plus size={15} style={{ marginRight: 7, verticalAlign: '-2px' }} />New session
        </PillButton>
      </div>
      <p style={{ fontSize: 15, color: 'rgba(11,11,14,0.64)', margin: '0 0 28px', maxWidth: 620, lineHeight: 1.6 }}>
        Sit a whole class at once. You control when it starts and when each student sees their result.
      </p>

      {loading ? (
        <div style={{ padding: '64px 0', textAlign: 'center', color: T.faint, fontSize: 14 }}>Loading…</div>
      ) : sessions.length === 0 ? (
        <EmptyState title="No sessions yet">
          Create one, read the join code out to your class, and start when everyone is in the lobby.
        </EmptyState>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sessions.map((s) => (
            <button
              key={s.id}
              onClick={() => navigate(`/teacher/live-exams/${s.id}`)}
              style={{
                ...CARD, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16,
                cursor: 'pointer', textAlign: 'left', font: 'inherit', width: '100%',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: T.ink, marginBottom: 6 }}>{s.title}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <StatusPill status={s.status} />
                  {s.startedAt && (
                    <span style={{ fontSize: 12.5, color: T.muted }}>
                      Started {new Date(s.startedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>
              </div>
              {/* Reference size here; it is the hero only inside the session. */}
              {s.status === 'waiting' && <JoinCodePlate code={s.joinCode} size="small" />}
              <ChevronRight size={17} color={T.faint} style={{ flexShrink: 0 }} />
            </button>
          ))}
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
            <label htmlFor="session-title" style={labelStyle}>What the class will see</label>
            <input
              id="session-title"
              value={form.title}
              onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value })); setError(''); }}
              placeholder="Friday mock — Grade 11"
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
    </div>
  );
}
