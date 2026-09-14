import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getParticipantDetail, saveFeedback, releaseOne,
  type ParticipantDetail, type MarkableSection, type MarkableAnswer,
} from '@/api/liveExam';
import { getApiError } from '@/api/http';
import { formatExamScore, scoreColor, SECTION_MAX } from '@/lib/score';
import { useMobile } from '@/hooks/useMobile';
import {
  BackLink, CARD, EmptyState, ErrorNote, H1, KICKER, LivePage, LoadingRows, PillButton, T, plainText,
} from '@/components/live-exam/ui';

/**
 * Marking one student's live-exam paper: both sections, a note per question, a
 * note on the whole sitting, and the release that finally shows it to them.
 *
 * Nothing here reaches the student until Release — that is the point of a live
 * exam over a practice set, and the page says so rather than assuming the
 * teacher remembers.
 */

type Filter = 'all' | 'wrong';

export default function LiveExamStudentResult() {
  const { sessionId, participantId } = useParams<{ sessionId: string; participantId: string }>();
  const navigate = useNavigate();
  const isMobile = useMobile();
  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalFeedback, setGlobalFeedback] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  // What the server last held, to tell the teacher when there are unsaved notes.
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    if (!sessionId || !participantId) return;

    (async () => {
      try {
        // Both papers arrive with the participant. They used to be fetched
        // separately from the teacher module, through a hand-written
        // "/api/teacher/…" path that double-prefixed the client's own /api base
        // — and even corrected, that endpoint authorises on roster assignment,
        // which a live exam does not use. Every failure was swallowed by a bare
        // catch, so the page simply showed nothing.
        const p = await getParticipantDetail(sessionId, participantId);
        const initialNotes = Object.fromEntries(p.questionFeedbacks.map((f) => [f.questionId, f.feedback]));
        setParticipant(p);
        setGlobalFeedback(p.globalFeedback ?? '');
        setNotes(initialNotes);
        setSavedSnapshot(snapshot(p.globalFeedback ?? '', initialNotes));
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, participantId]);

  const dirty = participant !== null && snapshot(globalFeedback, notes) !== savedSnapshot;

  // Leaving with unsaved notes loses them; the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function collectNotes() {
    return Object.entries(notes)
      .filter(([, feedback]) => feedback.trim())
      .map(([questionId, feedback]) => ({ questionId, feedback: feedback.trim() }));
  }

  async function handleSave() {
    if (!sessionId || !participantId) return;
    setSaving(true);
    setSaveMsg('');
    setError('');
    try {
      await saveFeedback(sessionId, participantId, { globalFeedback, questionFeedbacks: collectNotes() });
      setSavedSnapshot(snapshot(globalFeedback, notes));
      setSaveMsg(participant?.resultReleased ? 'Saved. The student sees the updated notes.' : 'Saved. The student sees none of this until you release.');
    } catch (err) {
      setError(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRelease() {
    if (!sessionId || !participantId) return;
    setReleasing(true);
    setError('');
    try {
      await saveFeedback(sessionId, participantId, { globalFeedback, questionFeedbacks: collectNotes() });
      await releaseOne(sessionId, participantId);
      navigate(`/teacher/live-exams/${sessionId}`);
    } catch (err) {
      setError(getApiError(err));
      setReleasing(false);
    }
  }

  type Section = { label: string; accent: string; data: MarkableSection };
  const sections: Section[] = useMemo(() => participant ? [
    { label: 'Reading & Writing', accent: T.english as string, data: participant.english },
    { label: 'Math', accent: T.math as string, data: participant.math },
  ].flatMap((s) => (s.data ? [{ ...s, data: s.data }] : [])) : [], [participant]);

  const back = () => {
    if (dirty && !window.confirm('You have unsaved notes. Leave without saving?')) return;
    navigate(`/teacher/live-exams/${sessionId}`);
  };

  if (loading) {
    return (
      <LivePage>
        <div style={{ height: 40, width: 240, borderRadius: 10, background: T.lineSoft, marginBottom: 24 }} />
        <LoadingRows rows={4} height={84} />
      </LivePage>
    );
  }
  if (!participant) {
    return (
      <LivePage>
        <BackLink onClick={() => navigate(`/teacher/live-exams/${sessionId}`)}>Back to session</BackLink>
        <ErrorNote>{error || 'Student not found in this session.'}</ErrorNote>
      </LivePage>
    );
  }

  const noteCount = collectNotes().length;
  const wrongTotal = sections.reduce((n, s) => n + s.data.results.filter((r) => r.isCorrect !== true).length, 0);

  return (
    <LivePage>
      <BackLink onClick={back}>Back to session</BackLink>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ ...H1, fontSize: isMobile ? 30 : 38, lineHeight: 1.12, marginBottom: 4, overflowWrap: 'anywhere' }}>{participant.name}</h1>
          <p style={{ fontSize: 13.5, color: T.muted, margin: 0, overflowWrap: 'anywhere' }}>{participant.email}</p>
        </div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, height: 26, padding: '0 12px', borderRadius: 9999, fontSize: 12.5, fontWeight: 600,
          background: participant.resultReleased ? 'rgba(26,107,60,0.10)' : 'rgba(184,137,62,0.12)',
          color: participant.resultReleased ? T.green : '#8A6020',
        }}>
          <span aria-hidden style={{ width: 6, height: 6, borderRadius: 9999, background: 'currentColor' }} />
          {participant.resultReleased ? 'Released' : 'Not released yet'}
        </span>
      </div>

      {error && <div style={{ marginBottom: 18 }}><ErrorNote>{error}</ErrorNote></div>}

      {sections.length === 0 ? (
        <div style={{ marginBottom: 22 }}>
          <EmptyState title="Nothing to mark yet">
            This student hasn't submitted either paper. You can still leave a note below.
          </EmptyState>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: sections.length > 1 && !isMobile ? 'repeat(2, minmax(0, 1fr))' : '1fr', gap: 12, marginBottom: 26 }}>
          {sections.map(({ label, accent, data }) => {
            const { exam } = data;
            const correct = data.results.filter((r) => r.isCorrect).length;
            const pct = data.results.length ? (correct / data.results.length) * 100 : 0;
            return (
              <div key={label} style={{ ...CARD, padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 9999, background: accent }} />
                  <span style={{ ...KICKER, color: T.muted }}>{label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...H1, fontSize: 36, lineHeight: 1, color: scoreColor(exam.scaledScore, SECTION_MAX), fontVariantNumeric: 'tabular-nums' }}>
                    {formatExamScore(exam.scaledScore, exam.score, exam.totalQuestions)}
                  </span>
                  <span style={{ fontSize: 13, color: T.muted, fontVariantNumeric: 'tabular-nums' }}>
                    {correct} of {data.results.length} correct
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 9999, background: T.lineSoft, overflow: 'hidden', marginTop: 12 }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: accent, borderRadius: 9999 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sections.length > 0 && (
        <div role="tablist" aria-label="Filter questions" style={{ display: 'inline-flex', gap: 4, padding: 4, background: '#F0EDE7', borderRadius: 12, marginBottom: 16 }}>
          {([['all', 'All questions'], ['wrong', `Missed (${wrongTotal})`]] as const).map(([value, text]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              style={{
                height: 32, padding: '0 14px', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                background: filter === value ? '#fff' : 'transparent', color: filter === value ? T.ink : T.muted,
                boxShadow: filter === value ? '0 1px 2px rgba(11,11,14,0.08)' : 'none',
              }}
            >{text}</button>
          ))}
        </div>
      )}

      {sections.map(({ label, accent, data }) => {
        const rows = data.results
          .map((row, i) => ({ row, number: i + 1 }))
          .filter(({ row }) => filter === 'all' || row.isCorrect !== true);
        return (
          <section key={label} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: 9999, background: accent, alignSelf: 'center' }} />
              <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{label}</h2>
              <span style={{ fontSize: 12.5, color: T.faint }}>Add a note to any question</span>
            </div>

            {rows.length === 0 ? (
              <div style={{ ...CARD, padding: '18px 20px', fontSize: 13.5, color: T.muted }}>No missed questions in this section.</div>
            ) : (
              <div style={{ ...CARD, overflow: 'hidden' }}>
                {rows.map(({ row, number }, i) => (
                  <QuestionRow
                    key={row.questionId}
                    row={row}
                    number={number}
                    section={label}
                    isLast={i === rows.length - 1}
                    note={notes[row.questionId] ?? ''}
                    onNote={(value) => { setNotes((prev) => ({ ...prev, [row.questionId]: value })); setSaveMsg(''); }}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div style={{ ...CARD, padding: isMobile ? '16px' : '20px 22px' }}>
        <label htmlFor="global-feedback" style={{ display: 'block', fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
          Note on the whole paper
        </label>
        <p style={{ fontSize: 12.5, color: T.muted, margin: '0 0 10px' }}>
          Shown at the top of the student's report.
        </p>
        <textarea
          id="global-feedback"
          value={globalFeedback}
          onChange={(e) => { setGlobalFeedback(e.target.value); setSaveMsg(''); }}
          rows={4}
          placeholder="Strong on algebra. Slow down on the evidence questions — you changed three correct answers."
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #D8D4CC', borderRadius: 10,
            fontSize: 14, lineHeight: 1.6, fontFamily: 'inherit', color: T.ink,
            background: '#fff', resize: 'vertical', boxSizing: 'border-box', display: 'block',
          }}
        />
      </div>

      {/* Sticky, so Save and Release are reachable from question 40 without scrolling back down. */}
      <div style={{
        position: 'sticky', bottom: isMobile ? 'calc(var(--tabbar-h, 64px) + var(--safe-bottom, 0px) + 10px)' : 16, zIndex: 5, marginTop: 16,
        ...CARD, boxShadow: 'var(--shadow-md)', padding: isMobile ? '10px 12px' : '10px 12px 10px 20px',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <span aria-live="polite" style={{ flex: 1, minWidth: 160, fontSize: 13, color: saveMsg ? T.green : dirty ? '#8A6020' : T.muted }}>
          {saveMsg || (dirty ? 'Unsaved changes' : `${noteCount} question note${noteCount === 1 ? '' : 's'}${globalFeedback.trim() ? ' · paper note added' : ''}`)}
        </span>
        <div style={{ display: 'flex', gap: 8, flex: isMobile ? '1 1 100%' : undefined }}>
          <PillButton variant="secondary" onClick={handleSave} disabled={saving || releasing || !dirty} style={{ flex: isMobile ? 1 : undefined }}>
            {saving ? 'Saving…' : 'Save notes'}
          </PillButton>
          <PillButton onClick={handleRelease} disabled={releasing || saving} style={{ flex: isMobile ? 1 : undefined }}>
            {releasing ? 'Releasing…' : participant.resultReleased ? 'Save & re-release' : 'Release to student'}
          </PillButton>
        </div>
      </div>
    </LivePage>
  );
}

function snapshot(global: string, notes: Record<string, string>): string {
  const cleaned = Object.entries(notes).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]).sort();
  return JSON.stringify([global.trim(), cleaned]);
}

function QuestionRow({ row, number, section, isLast, note, onNote }: {
  row: MarkableAnswer;
  number: number;
  section: string;
  isLast: boolean;
  note: string;
  onNote: (value: string) => void;
}) {
  const isSPR = !row.optionA && !row.optionB && row.correctAnswerText !== null;
  const picked = isSPR ? (row.selectedAnswerText?.trim() || null) : row.selectedAnswer;
  const correct = isSPR ? row.correctAnswerText : row.correctAnswer;
  const show = (v: string | null) => (v === null ? '—' : isSPR ? v : v.toUpperCase());
  const outcome = picked === null ? 'skipped' : row.isCorrect ? 'right' : 'wrong';
  const tone = {
    right: { bg: 'rgba(46,125,90,0.12)', fg: T.english, mark: '✓', label: 'Correct' },
    wrong: { bg: 'rgba(192,57,43,0.10)', fg: T.danger, mark: '✕', label: 'Incorrect' },
    skipped: { bg: T.lineSoft, fg: '#6F6B64', mark: '–', label: 'Not answered' },
  }[outcome];
  const text = plainText(row.questionText);

  return (
    <div style={{ padding: '14px 18px', borderBottom: isLast ? 'none' : `1px solid ${T.lineSoft}` }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          role="img"
          aria-label={tone.label}
          style={{
            width: 26, height: 26, borderRadius: 9999, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 700, background: tone.bg, color: tone.fg,
          }}
        >{tone.mark}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, fontSize: 13.5, color: T.ink, lineHeight: 1.5, marginBottom: 8 }}>
            <span style={{ color: T.faint, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{String(number).padStart(2, '0')}</span>
            <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }} title={text}>{text}</span>
          </div>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, marginBottom: 8 }}>
            <span style={{ color: T.muted }}>Picked <strong style={{ color: tone.fg }}>{picked === null ? 'nothing' : show(picked)}</strong></span>
            {outcome !== 'right' && <span style={{ color: T.muted }}>Correct <strong style={{ color: T.green }}>{show(correct)}</strong></span>}
          </div>
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Note for this question…"
            aria-label={`${section} question ${number} note`}
            maxLength={1000}
            style={{
              width: '100%', height: 36, padding: '0 12px', fontSize: 13.5, boxSizing: 'border-box',
              border: `1px solid ${note ? '#D8D4CC' : T.line}`,
              borderRadius: 8, background: note ? '#fff' : T.wash,
              color: T.ink, fontFamily: 'inherit',
            }}
          />
        </div>
      </div>
    </div>
  );
}
