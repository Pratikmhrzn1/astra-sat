import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import {
  getParticipantDetail, saveFeedback, releaseOne,
  type ParticipantDetail, type MarkableSection,
} from '@/features/live-exam/api/live-exam.api';
import { getApiError } from '@/shared/api/client';
import { formatExamScore, scoreColor, SECTION_MAX } from '@/shared/lib/score';
import { CARD, ErrorNote, H1, PillButton, T } from '@/features/live-exam/ui';

/**
 * Marking one student's live-exam paper: both sections, a note per question, a
 * note on the whole sitting, and the release that finally shows it to them.
 *
 * Nothing here reaches the student until Release — that is the point of a live
 * exam over a practice set, and the page says so rather than assuming the
 * teacher remembers.
 */

export default function LiveExamStudentResult() {
  const { sessionId, participantId } = useParams<{ sessionId: string; participantId: string }>();
  const navigate = useNavigate();
  const [participant, setParticipant] = useState<ParticipantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [globalFeedback, setGlobalFeedback] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [error, setError] = useState('');

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
        setParticipant(p);
        setGlobalFeedback(p.globalFeedback ?? '');
        setNotes(Object.fromEntries(p.questionFeedbacks.map((f) => [f.questionId, f.feedback])));
      } catch (err) {
        setError(getApiError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, [sessionId, participantId]);

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
      setSaveMsg('Saved. The student sees none of this until you release.');
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

  if (loading) {
    return <div style={{ padding: '64px 48px', textAlign: 'center', color: T.faint, fontSize: 14 }}>Loading…</div>;
  }
  if (!participant) {
    return <div style={{ padding: '36px 48px' }}><ErrorNote>{error || 'Student not found in this session.'}</ErrorNote></div>;
  }

  type Section = { label: string; accent: string; data: MarkableSection };
  const sections: Section[] = [
    { label: 'Reading & Writing', accent: T.english as string, data: participant.english },
    { label: 'Math', accent: T.math as string, data: participant.math },
  ].flatMap((s) => (s.data ? [{ ...s, data: s.data }] : []));

  return (
    <div className="screen-fade" style={{ padding: '36px 48px 64px', maxWidth: 820 }}>
      <button
        onClick={() => navigate(`/teacher/live-exams/${sessionId}`)}
        style={{ display: 'flex', alignItems: 'center', gap: 4, border: 'none', background: 'none', padding: 0, marginBottom: 18, fontSize: 13, fontWeight: 600, color: T.muted, cursor: 'pointer', fontFamily: 'inherit' }}
      ><ChevronLeft size={15} />Back to session</button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div>
          <h1 style={{ ...H1, fontSize: 38, marginBottom: 4 }}>{participant.name}</h1>
          <p style={{ fontSize: 13.5, color: T.muted, margin: 0 }}>{participant.email}</p>
        </div>
        {participant.resultReleased && (
          <span style={{ padding: '5px 13px', borderRadius: 9999, background: 'rgba(26,107,60,0.10)', color: T.green, fontSize: 12.5, fontWeight: 600 }}>
            Released
          </span>
        )}
      </div>

      {error && <div style={{ marginBottom: 20 }}><ErrorNote>{error}</ErrorNote></div>}

      {sections.length === 0 ? (
        <div style={{ ...CARD, padding: '32px 24px', textAlign: 'center', marginBottom: 22 }}>
          <p style={{ fontSize: 14.5, color: T.muted, margin: 0, lineHeight: 1.6 }}>
            This student hasn't submitted either paper yet.<br />
            You can still leave a note, but there is nothing to mark.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: sections.length > 1 ? '1fr 1fr' : '1fr', gap: 14, marginBottom: 22 }}>
          {sections.map(({ label, accent, data }) => {
            const { exam } = data;
            const correct = data.results.filter((r) => r.isCorrect).length;
            return (
              <div key={label} style={{ ...CARD, padding: '18px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 9999, background: accent }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ ...H1, fontSize: 38, color: scoreColor(exam.scaledScore, SECTION_MAX) }}>
                    {formatExamScore(exam.scaledScore, exam.score, exam.totalQuestions)}
                  </span>
                  <span style={{ fontSize: 13, color: T.muted }}>
                    {correct} of {data.results.length} correct
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sections.map(({ label, accent, data }) => (
        <div key={label} style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: 9999, background: accent }} />
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{label}</h2>
            <span style={{ fontSize: 12.5, color: T.faint }}>Add a note to any question</span>
          </div>

          <div style={{ ...CARD, overflow: 'hidden' }}>
            {data.results.map((row, i) => (
              <div key={row.questionId} style={{ padding: '13px 18px', borderBottom: i < data.results.length - 1 ? `1px solid ${T.lineSoft}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 9999, flexShrink: 0, marginTop: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 700,
                    background: row.isCorrect ? 'rgba(46,125,90,0.12)' : row.isCorrect === false ? 'rgba(192,57,43,0.10)' : T.lineSoft,
                    color: row.isCorrect ? T.english : row.isCorrect === false ? T.danger : '#8C8880',
                  }}>{row.isCorrect ? '✓' : row.isCorrect === false ? '✕' : '–'}</span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: T.ink, marginBottom: 6 }}>
                      <span style={{ color: T.faint, marginRight: 7 }}>{String(i + 1).padStart(2, '0')}</span>
                      {row.questionText}
                    </div>
                    <input
                      value={notes[row.questionId] ?? ''}
                      onChange={(e) => setNotes((prev) => ({ ...prev, [row.questionId]: e.target.value }))}
                      placeholder="Note for this question…"
                      style={{
                        width: '100%', height: 34, padding: '0 11px', fontSize: 13,
                        border: `1px solid ${notes[row.questionId] ? T.line : T.lineSoft}`,
                        borderRadius: 8, background: notes[row.questionId] ? '#fff' : T.wash,
                        color: T.ink, fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ ...CARD, padding: '20px 22px' }}>
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
            width: '100%', padding: '10px 12px', border: `1px solid ${T.line}`, borderRadius: 10,
            fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', color: T.ink,
            background: '#fff', outline: 'none', resize: 'vertical',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
          <PillButton variant="secondary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save notes'}
          </PillButton>
          <PillButton onClick={handleRelease} disabled={releasing}>
            {releasing ? 'Releasing…' : participant.resultReleased ? 'Save and re-release' : 'Release to student'}
          </PillButton>
          {saveMsg && <span style={{ fontSize: 13, color: T.green }}>{saveMsg}</span>}
        </div>
      </div>
    </div>
  );
}
