import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  getParticipantDetail, saveFeedback, releaseOne,
  type ParticipantDetail, type MarkableSection, type MarkableAnswer,
} from '@/features/live-exam/api';
import { getApiError } from '@/shared/api/http';
import { formatExamScore, scoreColor, SECTION_MAX } from '@/entities/score';
import { BackLink, ErrorNote, LivePage, LoadingRows, plainText, liveTitleClass } from '@/features/live-exam/components/ui';
import { EmptyState, Button, surfaceClass, kickerClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';

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
    { label: 'Reading & Writing', accent: 'bg-green-sat', data: participant.english },
    { label: 'Math', accent: 'bg-blue-sat', data: participant.math },
  ].flatMap((s) => (s.data ? [{ ...s, data: s.data }] : [])) : [], [participant]);

  const back = () => {
    if (dirty && !window.confirm('You have unsaved notes. Leave without saving?')) return;
    navigate(`/teacher/live-exams/${sessionId}`);
  };

  if (loading) {
    return (
      <LivePage>
        <div className="h-10 w-60 rounded-[10px] bg-sunken mb-6" />
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

      <div className="flex items-start justify-between gap-3 flex-wrap mb-[22px]">
        <div className="min-w-0">
          <h1 className={cn(liveTitleClass, 'text-[30px] sm:text-[38px] leading-[1.12] mb-1 [overflow-wrap:anywhere]')}>{participant.name}</h1>
          <p className="text-[13.5px] text-subtle m-0 [overflow-wrap:anywhere]">{participant.email}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 h-[26px] px-3 rounded-full text-[12.5px] font-semibold',
            participant.resultReleased ? 'bg-green-dark/10 text-green-dark' : 'bg-gold/[.12] text-gold-dark',
          )}
        >
          <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-current" />
          {participant.resultReleased ? 'Released' : 'Not released yet'}
        </span>
      </div>

      {error && <div className="mb-[18px]"><ErrorNote>{error}</ErrorNote></div>}

      {sections.length === 0 ? (
        <div className="mb-[22px]">
          <EmptyState className="py-11" titleClassName="text-2xl text-ink/[.72]" title="Nothing to mark yet">
            This student hasn't submitted either paper. You can still leave a note below.
          </EmptyState>
        </div>
      ) : (
        <div className={cn('grid grid-cols-1 gap-3 mb-[26px]', sections.length > 1 && 'sm:grid-cols-2')}>
          {sections.map(({ label, accent, data }) => {
            const { exam } = data;
            const correct = data.results.filter((r) => r.isCorrect).length;
            const pct = data.results.length ? (correct / data.results.length) * 100 : 0;
            return (
              <div key={label} className={cn(surfaceClass, 'px-5 py-4')}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span aria-hidden className={cn('w-2 h-2 rounded-full', accent)} />
                  <span className={cn(kickerClass, 'text-subtle')}>{label}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2.5 flex-wrap">
                  <span className={cn(liveTitleClass, 'text-4xl leading-none tnum')} style={{ color: scoreColor(exam.scaledScore, SECTION_MAX) }}>
                    {formatExamScore(exam.scaledScore, exam.score, exam.totalQuestions)}
                  </span>
                  <span className="text-[13px] text-subtle tnum">
                    {correct} of {data.results.length} correct
                  </span>
                </div>
                <div className="h-1 rounded-full bg-sunken overflow-hidden mt-3">
                  <div className={cn('h-full rounded-full', accent)} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sections.length > 0 && (
        <div role="tablist" aria-label="Filter questions" className="inline-flex gap-1 p-1 bg-sunken-2 rounded-xl mb-4">
          {([['all', 'All questions'], ['wrong', `Missed (${wrongTotal})`]] as const).map(([value, text]) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'h-8 px-3.5 rounded-lg text-[13px] font-semibold cursor-pointer',
                filter === value ? 'bg-white text-ink shadow-[0_1px_2px_rgba(11,11,14,0.08)]' : 'bg-transparent text-subtle',
              )}
            >{text}</button>
          ))}
        </div>
      )}

      {sections.map(({ label, accent, data }) => {
        const rows = data.results
          .map((row, i) => ({ row, number: i + 1 }))
          .filter(({ row }) => filter === 'all' || row.isCorrect !== true);
        return (
          <section key={label} className="mb-6">
            <div className="flex items-baseline gap-2.5 mb-2.5 flex-wrap">
              <span aria-hidden className={cn('w-2 h-2 rounded-full self-center', accent)} />
              <h2 className="text-[15px] font-semibold m-0">{label}</h2>
              <span className="text-[12.5px] text-muted">Add a note to any question</span>
            </div>

            {rows.length === 0 ? (
              <div className={cn(surfaceClass, 'px-5 py-[18px] text-[13.5px] text-subtle')}>No missed questions in this section.</div>
            ) : (
              <div className={cn(surfaceClass, 'overflow-hidden')}>
                {rows.map(({ row, number }) => (
                  <QuestionRow
                    key={row.questionId}
                    row={row}
                    number={number}
                    section={label}
                    note={notes[row.questionId] ?? ''}
                    onNote={(value) => { setNotes((prev) => ({ ...prev, [row.questionId]: value })); setSaveMsg(''); }}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}

      <div className={cn(surfaceClass, 'p-4 sm:px-[22px] sm:py-5')}>
        <label htmlFor="global-feedback" className="block text-sm font-semibold mb-1">
          Note on the whole paper
        </label>
        <p className="text-[12.5px] text-subtle mt-0 mb-2.5">
          Shown at the top of the student's report.
        </p>
        <textarea
          id="global-feedback"
          value={globalFeedback}
          onChange={(e) => { setGlobalFeedback(e.target.value); setSaveMsg(''); }}
          rows={4}
          placeholder="Strong on algebra. Slow down on the evidence questions — you changed three correct answers."
          className="block w-full px-3 py-2.5 border border-border-strong rounded-[10px] text-sm leading-[1.6] text-ink bg-white resize-y"
        />
      </div>

      {/* Sticky, so Save and Release are reachable from question 40 without scrolling back down. */}
      <div
        className={cn(
          surfaceClass,
          'sticky z-[5] mt-4 shadow-md flex items-center gap-2.5 flex-wrap px-3 py-2.5 sm:pl-5',
          'bottom-[calc(var(--tabbar-h,64px)+var(--safe-bottom,0px)+10px)] sm:bottom-4',
        )}
      >
        <span aria-live="polite" className={cn('flex-1 min-w-[160px] text-[13px]', saveMsg ? 'text-green-dark' : dirty ? 'text-gold-dark' : 'text-subtle')}>
          {saveMsg || (dirty ? 'Unsaved changes' : `${noteCount} question note${noteCount === 1 ? '' : 's'}${globalFeedback.trim() ? ' · paper note added' : ''}`)}
        </span>
        <div className="flex gap-2 basis-full sm:basis-auto">
          <Button type="button" variant="secondary" onClick={handleSave} disabled={saving || releasing || !dirty} className="flex-1 sm:flex-none">
            {saving ? 'Saving…' : 'Save notes'}
          </Button>
          <Button type="button" onClick={handleRelease} disabled={releasing || saving} className="flex-1 sm:flex-none">
            {releasing ? 'Releasing…' : participant.resultReleased ? 'Save & re-release' : 'Release to student'}
          </Button>
        </div>
      </div>
    </LivePage>
  );
}

function snapshot(global: string, notes: Record<string, string>): string {
  const cleaned = Object.entries(notes).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]).sort();
  return JSON.stringify([global.trim(), cleaned]);
}

function QuestionRow({ row, number, section, note, onNote }: {
  row: MarkableAnswer;
  number: number;
  section: string;
  note: string;
  onNote: (value: string) => void;
}) {
  const [showPassage, setShowPassage] = useState(false);
  // The question's own type, now that the marking payload carries it. This was
  // inferred from "no options and a text answer", which mislabels a grid-in
  // whose options were simply never authored.
  const isSPR = row.questionType === 'student_produced_response';
  const picked = isSPR ? (row.selectedAnswerText?.trim() || null) : row.selectedAnswer;
  const correct = isSPR ? row.correctAnswerText : row.correctAnswer;
  const show = (v: string | null) => (v === null ? '—' : isSPR ? v : v.toUpperCase());
  const outcome = picked === null ? 'skipped' : row.isCorrect ? 'right' : 'wrong';
  const tone = {
    right: { badge: 'bg-green-sat/[.12] text-green-sat', fg: 'text-green-sat', mark: '✓', label: 'Correct' },
    wrong: { badge: 'bg-danger/10 text-danger', fg: 'text-danger', mark: '✕', label: 'Incorrect' },
    skipped: { badge: 'bg-sunken text-stone', fg: 'text-stone', mark: '–', label: 'Not answered' },
  }[outcome];
  const text = plainText(row.questionText);

  return (
    <div className="px-[18px] py-3.5 border-b border-sunken last:border-b-0">
      <div className="flex items-start gap-3">
        <span
          role="img"
          aria-label={tone.label}
          className={cn('w-[26px] h-[26px] rounded-full shrink-0 flex items-center justify-center text-[13px] font-bold', tone.badge)}
        >{tone.mark}</span>

        <div className="flex-1 min-w-0">
          <div className="flex gap-2 text-[13.5px] text-ink leading-normal mb-2">
            <span className="text-muted tnum shrink-0">{String(number).padStart(2, '0')}</span>
            <span className="line-clamp-3" title={text}>{text}</span>
          </div>
          {/*
            On demand, not always open: this list is for scanning and annotating
            a whole paper, and a passage on every row would bury the answers
            being marked. But a passage question cannot be judged without it, so
            it has to be one click away rather than absent.
          */}
          {row.passageText && (
            <div className="mb-2">
              <button
                onClick={() => setShowPassage((v) => !v)}
                aria-expanded={showPassage}
                className="px-2 py-1 -ml-2 rounded-lg bg-transparent border-0 text-[12.5px] font-semibold text-accent-text cursor-pointer hover:bg-ember/[.08]"
              >
                {showPassage ? 'Hide passage' : 'Show passage'}
              </button>
              {showPassage && (
                <p className="font-serif text-[14px] leading-[1.65] text-ink bg-[#FBFAF8] border border-border-soft rounded-[10px] px-3.5 py-3 mt-1.5 mb-0 whitespace-pre-wrap">
                  {plainText(row.passageText)}
                </p>
              )}
            </div>
          )}
          <div className="flex gap-3.5 flex-wrap text-[12.5px] mb-2">
            <span className="text-subtle">Picked <strong className={tone.fg}>{picked === null ? 'nothing' : show(picked)}</strong></span>
            {outcome !== 'right' && <span className="text-subtle">Correct <strong className="text-green-dark">{show(correct)}</strong></span>}
          </div>
          <input
            value={note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Note for this question…"
            aria-label={`${section} question ${number} note`}
            maxLength={1000}
            className={cn(
              'w-full h-9 px-3 text-[13.5px] border rounded-lg text-ink',
              note ? 'border-border-strong bg-white' : 'border-border bg-[#FBFAF8]',
            )}
          />
        </div>
      </div>
    </div>
  );
}
