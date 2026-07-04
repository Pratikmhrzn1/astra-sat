import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getExam,
  saveAnswers,
  submitExam,
  confirmAnswer,
  reviewVocab,
  type ConfirmFeedbacks,
  type ReasoningClassification,
  type CommandOfEvidenceContent,
  type TransitionsCoachContent,
  type VocabDrillContent,
} from '../../api/student';
import { saveExamProgress, loadExamProgress, clearExamProgress } from '../../lib/offline';

// ── Reasoning feedback helpers ────────────────────────────────────────────────

const CLASSIFICATION_META: Record<
  ReasoningClassification,
  { label: string; color: string; bg: string; border: string }
> = {
  correct_logic_correct_answer: {
    label: 'Strong reasoning',
    color: '#1A6B3C',
    bg: 'rgba(46,125,90,0.07)',
    border: 'rgba(46,125,90,0.25)',
  },
  correct_logic_wrong_answer: {
    label: 'Sound logic — likely a misread',
    color: '#B8893E',
    bg: 'rgba(184,137,62,0.07)',
    border: 'rgba(184,137,62,0.3)',
  },
  wrong_logic_correct_answer: {
    label: 'Right answer — review your reasoning',
    color: '#B8893E',
    bg: 'rgba(184,137,62,0.07)',
    border: 'rgba(184,137,62,0.3)',
  },
  wrong_logic_wrong_answer: {
    label: 'Comprehension gap identified',
    color: '#C0392B',
    bg: 'rgba(192,57,43,0.07)',
    border: 'rgba(192,57,43,0.2)',
  },
};

const CONFIDENCE_CHIPS: { value: 'sure' | 'eliminated' | 'guessed'; label: string }[] = [
  { value: 'sure', label: 'I was sure' },
  { value: 'eliminated', label: 'Eliminated the wrong ones' },
  { value: 'guessed', label: 'Guessed' },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function TakeExam() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();

  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [flags, setFlags] = useState<Record<number, boolean>>({});
  const [elim, setElim] = useState<Record<number, Record<string, boolean>>>({});
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20 * 60);
  const [navOpen, setNavOpen] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcExpr, setCalcExpr] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Practice-mode confirm state
  const [confirmedMap, setConfirmedMap] = useState<
    Record<string, { isCorrect: boolean; feedbacks: ConfirmFeedbacks; vocabTrackingId: string | null }>
  >({});
  const [pendingConfidence, setPendingConfidence] = useState<'sure' | 'eliminated' | 'guessed' | null>(null);
  const [pendingReasoning, setPendingReasoning] = useState('');

  // Vocab mini-quiz state: keyed by questionId
  const [vocabPick, setVocabPick] = useState<Record<string, string>>({}); // selected option letter
  const [vocabSubmitted, setVocabSubmitted] = useState<Record<string, boolean>>({}); // whether checked

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['student', 'exam', examId],
    queryFn: () => getExam(examId!),
    enabled: !!examId,
  });

  useEffect(() => {
    if (!data || !examId) return;
    loadExamProgress(examId).then((saved) => {
      if (saved) {
        setAnswers(saved.answers);
        setTimeLeft(Math.max(0, 20 * 60 - saved.timeSpentSeconds));
      } else {
        const init: Record<string, string | null> = {};
        data.answers.forEach((a) => { init[a.questionId] = a.selectedAnswerText ?? a.selectedAnswer; });
        setAnswers(init);
      }
    });
  }, [data, examId]);

  // Reset confidence chip when navigating to a different question
  useEffect(() => {
    setPendingConfidence(null);
    setPendingReasoning('');
  }, [index]);

  const saveMutation = useMutation({
    mutationFn: ({ ans, time }: { ans: typeof answers; time: number }) =>
      saveAnswers(examId!, Object.entries(ans).map(([questionId, value]) => {
        const q = data?.questions.find((qq) => qq.id === questionId);
        const isSPR = q?.questionType === 'student_produced_response';
        return { questionId, selectedAnswer: isSPR ? null : (value as 'a' | 'b' | 'c' | 'd' | null), selectedAnswerText: isSPR ? value : null };
      }), time),
  });

  const submitMutation = useMutation({
    mutationFn: () => submitExam(examId!, 20 * 60 - timeLeft),
    onSuccess: async () => {
      if (examId) await clearExamProgress(examId);
      navigate(`/student/results/${examId}`, { replace: true });
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (payload: {
      questionId: string;
      selectedAnswer: string | null;
      confidence: 'sure' | 'eliminated' | 'guessed';
      reasoning?: string;
      isSPR: boolean;
    }) =>
      confirmAnswer(examId!, payload.questionId, {
        selectedAnswer: payload.isSPR ? null : (payload.selectedAnswer as 'a' | 'b' | 'c' | 'd' | null),
        selectedAnswerText: payload.isSPR ? payload.selectedAnswer : null,
        confidence: payload.confidence,
        reasoning: payload.reasoning || undefined,
      }),
    onSuccess: (result, variables) => {
      setConfirmedMap((m) => ({
        ...m,
        [variables.questionId]: { isCorrect: result.isCorrect, feedbacks: result.feedbacks, vocabTrackingId: result.vocabTrackingId },
      }));
      setPendingConfidence(null);
      setPendingReasoning('');
    },
  });

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(timerRef.current!); submitMutation.mutate(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const syncAnswers = useCallback(() => {
    if (isOnline && examId) saveMutation.mutate({ ans: answers, time: 20 * 60 - timeLeft });
  }, [answers, timeLeft, isOnline, examId]);

  useEffect(() => {
    if (examId) saveExamProgress(examId, answers, 20 * 60 - timeLeft);
  }, [answers]);

  useEffect(() => {
    syncRef.current = setInterval(syncAnswers, 30000);
    return () => clearInterval(syncRef.current!);
  }, [syncAnswers]);

  useEffect(() => {
    if (isOnline) syncAnswers();
  }, [isOnline]);

  if (isLoading || !data) {
    return (
      <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF9F6' }}>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: 'rgba(11,11,14,0.4)' }}>Loading exam…</div>
      </div>
    );
  }

  const { exam, questions } = data;
  const isPractice = exam.type === 'individual';
  const isMath = exam.type === 'mock_math';
  const q = questions[index];
  const total = questions.length;
  const mins = String(Math.floor(timeLeft / 60)).padStart(2, '0');
  const secs = String(timeLeft % 60).padStart(2, '0');
  const low = timeLeft < 300;
  const selected = answers[q.id];
  const flagged = flags[index];
  const isLast = index === total - 1;
  const qElim = elim[index] ?? {};
  const isSPR = q.questionType === 'student_produced_response';
  const confirmed = confirmedMap[q.id];
  const LETTER = ['A', 'B', 'C', 'D'];
  const optKeys = ['a', 'b', 'c', 'd'];
  const optTexts = [q.optionA, q.optionB, q.optionC, q.optionD];

  const selectAnswer = (opt: string) => {
    if (isPractice && confirmed) return; // locked after confirm
    setAnswers((a) => ({ ...a, [q.id]: opt }));
  };

  const toggleElim = (opt: string) => {
    if (isPractice && confirmed) return;
    setElim((e) => {
      const row = { ...(e[index] ?? {}) };
      row[opt] = !row[opt];
      return { ...e, [index]: row };
    });
  };

  const handleConfirm = () => {
    if (!pendingConfidence || !selected || confirmMutation.isPending) return;
    confirmMutation.mutate({
      questionId: q.id,
      selectedAnswer: selected,
      confidence: pendingConfidence,
      reasoning: pendingReasoning,
      isSPR,
    });
  };

  const calcPress = (k: string) => {
    setCalcExpr((e) => {
      if (k === 'C') return '';
      if (k === '⌫') return e.slice(0, -1);
      if (k === '=') {
        try { return String(Math.round(Function('"use strict";return (' + e.replace(/[^0-9+\-*/().%\s]/g, '') + ')')() * 10000) / 10000); }
        catch { return 'Error'; }
      }
      return (e === 'Error' ? '' : e) + k;
    });
  };

  // ── Bottom bar button logic ───────────────────────────────────────────────
  // Practice: locked after confirm → Continue / Submit; answer selected → Confirm & Continue; no answer → Skip
  // Mock: unchanged Next / Submit

  const renderBottomAction = () => {
    if (isPractice) {
      if (confirmed) {
        if (isLast) {
          return (
            <button
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending}
              style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#E2562B', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >Submit test</button>
          );
        }
        return (
          <button
            onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#E2562B', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >Continue →</button>
        );
      }
      if (selected) {
        const canConfirm = !!pendingConfidence && !confirmMutation.isPending;
        return (
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: canConfirm ? '#0B0B0E' : '#C8C4BC', color: '#fff', fontSize: 14, fontWeight: 600, cursor: canConfirm ? 'pointer' : 'default', fontFamily: 'inherit' }}
          >
            {confirmMutation.isPending ? 'Checking…' : 'Confirm & Continue'}
          </button>
        );
      }
      // No answer selected — allow skipping
      if (isLast) {
        return (
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#E2562B', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >Submit test</button>
        );
      }
      return (
        <button
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
          style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: '1px solid #C8C4BC', background: '#fff', color: '#8C8880', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >Skip →</button>
      );
    }

    // Mock mode — unchanged
    if (isLast) {
      return (
        <button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#E2562B', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >Submit test</button>
      );
    }
    return (
      <button
        onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
        style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: 'none', background: '#E2562B', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
      >Next →</button>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#FAF9F6', zIndex: 30 }}>
      {/* Top bar */}
      <div style={{ height: 62, flexShrink: 0, background: '#fff', borderBottom: '1px solid #E7E4DE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #C8C4BC', background: '#fff', borderRadius: 9999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit' }}
          >← Exit</button>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)' }}>
              {isMath ? 'Math' : 'Reading & Writing'}
              {isPractice && <span style={{ marginLeft: 8, color: '#2563A8' }}>· Practice</span>}
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Question {index + 1} of {total}</div>
          </div>
        </div>

        {/* Timer */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 30, lineHeight: 1, letterSpacing: '-0.02em', color: low ? '#C0392B' : '#0B0B0E' }}>{mins}:{secs}</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)' }}>Time left</div>
        </div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!isOnline && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#B8893E', background: 'rgba(184,137,62,0.1)', padding: '5px 10px', borderRadius: 9999, border: '1px solid rgba(184,137,62,0.3)' }}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
              Offline
            </div>
          )}
          <button
            onClick={() => setFlags((f) => ({ ...f, [index]: !f[index] }))}
            style={{ display: 'flex', alignItems: 'center', gap: 7, border: flagged ? '1px solid #E2562B' : '1px solid #C8C4BC', background: flagged ? 'rgba(226,86,43,0.07)' : '#fff', color: flagged ? '#E2562B' : '#0B0B0E', borderRadius: 9999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill={flagged ? '#E2562B' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
            </svg>
            {flagged ? 'Flagged' : 'Flag'}
          </button>
          {isMath && (
            <button
              onClick={() => setCalcOpen((c) => !c)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, border: calcOpen ? '1px solid #E2562B' : '1px solid #C8C4BC', background: calcOpen ? 'rgba(226,86,43,0.07)' : '#fff', color: calcOpen ? '#E2562B' : '#0B0B0E', borderRadius: 9999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/>
              </svg>
              Calculator
            </button>
          )}
          <button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending}
            style={{ border: '1px solid #0B0B0E', background: '#0B0B0E', color: '#fff', borderRadius: 9999, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >Submit test</button>
        </div>
      </div>

      {/* Content */}
      <div className="scrollarea" style={{ flex: 1, overflowY: 'auto', background: '#FAF9F6' }}>
        <div style={{ maxWidth: q.passageText ? 1100 : 760, margin: '0 auto', padding: '40px 40px 60px', display: q.passageText ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
          {/* Passage (left side) */}
          {q.passageText && (
            <div style={{ paddingRight: 40, borderRight: '1px solid #EAE7E1' }}>
              {q.passageTitle && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 10 }}>{q.passageTitle}</div>}
              <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: 19, lineHeight: 1.7, color: '#0B0B0E', margin: 0, whiteSpace: 'pre-wrap' }}>{q.passageText}</p>
            </div>
          )}

          {/* Question */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: '#0B0B0E', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{index + 1}</span>
              {isSPR && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'rgba(226,86,43,0.08)', color: '#E2562B' }}>Grid-in</span>}
              {isPractice && confirmed && (
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: confirmed.isCorrect ? 'rgba(46,125,90,0.08)' : 'rgba(192,57,43,0.08)', color: confirmed.isCorrect ? '#2E7D5A' : '#C0392B' }}>
                  {confirmed.isCorrect ? '✓ Correct' : '✗ Incorrect'}
                </span>
              )}
            </div>
            <p style={{ fontSize: 16.5, lineHeight: 1.55, fontWeight: 500, color: '#0B0B0E', margin: '0 0 22px' }}>{q.questionText}</p>

            {/* SPR: text input */}
            {isSPR && (
              <div>
                <input
                  type="text"
                  value={selected ?? ''}
                  onChange={(e) => selectAnswer(e.target.value)}
                  disabled={isPractice && !!confirmed}
                  placeholder="Enter your answer…"
                  style={{ width: '100%', maxWidth: 280, height: 52, padding: '0 16px', border: selected ? '1.5px solid #E2562B' : '1px solid #C8C4BC', borderRadius: 12, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", background: isPractice && confirmed ? '#F2F0EC' : '#fff', color: '#0B0B0E', outline: 'none', boxSizing: 'border-box', opacity: isPractice && confirmed ? 0.7 : 1 }}
                />
                <p style={{ fontSize: 12, color: 'rgba(11,11,14,0.4)', marginTop: 8 }}>Accepted formats: whole number, decimal (1.5), or fraction (3/4)</p>
              </div>
            )}

            {/* MC: option buttons */}
            {!isSPR && (
              <div>
                {optKeys.map((key, oi) => {
                  if (!optTexts[oi]) return null;
                  const isSelected = selected === key;
                  const isElim = !!qElim[key];
                  const isLocked = isPractice && !!confirmed;
                  return (
                    <div key={key} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <button
                        onClick={() => selectAnswer(key)}
                        disabled={isLocked}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '15px 18px', borderRadius: 12, cursor: isLocked ? 'default' : 'pointer', background: isSelected ? 'rgba(226,86,43,0.06)' : '#fff', border: isSelected ? '1.5px solid #E2562B' : '1px solid #C8C4BC', opacity: isElim ? 0.4 : 1, transition: 'all 0.15s', fontFamily: 'inherit' }}
                      >
                        <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9999, border: isSelected ? '1.5px solid #E2562B' : '1.5px solid #C8C4BC', background: isSelected ? '#E2562B' : 'transparent', color: isSelected ? '#fff' : '#8C8880', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{LETTER[oi]}</span>
                        <span style={{ fontSize: 15, color: '#0B0B0E', lineHeight: 1.5, textDecoration: isElim ? 'line-through' : 'none' }}>{optTexts[oi]}</span>
                      </button>
                      {!isLocked && (
                        <button
                          title="Cross out"
                          onClick={() => toggleElim(key)}
                          style={{ width: 44, flexShrink: 0, borderRadius: 10, border: '1px solid #E7E4DE', background: isElim ? 'rgba(11,11,14,0.04)' : '#fff', color: isElim ? '#E2562B' : '#A8A49C', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', textDecoration: 'line-through', fontFamily: 'inherit' }}
                        >ABC</button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Practice mode: confidence chips (shown when answer selected, not yet confirmed) */}
            {isPractice && !confirmed && selected && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #EEEBE5' }}>
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 12 }}>
                  How did you approach this?
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                  {CONFIDENCE_CHIPS.map((chip) => {
                    const active = pendingConfidence === chip.value;
                    return (
                      <button
                        key={chip.value}
                        onClick={() => setPendingConfidence(chip.value)}
                        style={{ padding: '8px 16px', borderRadius: 9999, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', border: active ? '1.5px solid #0B0B0E' : '1px solid #C8C4BC', background: active ? '#0B0B0E' : '#fff', color: active ? '#fff' : '#8C8880', transition: 'all 0.15s' }}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={pendingReasoning}
                  onChange={(e) => setPendingReasoning(e.target.value)}
                  placeholder="Anything else? (optional)"
                  style={{ width: '100%', height: 40, padding: '0 14px', border: '1px solid #E7E4DE', borderRadius: 10, fontSize: 13.5, fontFamily: 'inherit', background: '#fff', color: '#0B0B0E', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            )}

            {/* Practice mode: AI feedback panel (shown after confirm) */}
            {isPractice && confirmed && (
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* Reasoning checkpoint — always fires; omit block silently if call failed */}
                {confirmed.feedbacks.reasoning_checkpoint && (() => {
                  const rc = confirmed.feedbacks.reasoning_checkpoint!;
                  const meta = CLASSIFICATION_META[rc.classification as ReasoningClassification] ?? CLASSIFICATION_META.correct_logic_correct_answer;
                  return (
                    <div style={{ padding: '16px 18px', borderRadius: 12, background: meta.bg, border: `1px solid ${meta.border}` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: meta.color, marginBottom: 8 }}>
                        {meta.label}
                      </div>
                      <p style={{ fontSize: 14, lineHeight: 1.6, color: '#0B0B0E', margin: 0 }}>{rc.explanation}</p>
                    </div>
                  );
                })()}

                {/* Grammar diagnosis — only present when subSkill=grammar AND wrong */}
                {confirmed.feedbacks.grammar_diagnosis && (
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: '#F0ECE4', border: '1px solid rgba(184,137,62,0.25)' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8A6020', marginBottom: 5 }}>
                      Grammar rule: {confirmed.feedbacks.grammar_diagnosis.grammarRule}
                    </div>
                    <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: 0 }}>
                      {confirmed.feedbacks.grammar_diagnosis.grammarFix}
                    </p>
                  </div>
                )}

                {/* Trap explainer — only present when English MC AND wrong */}
                {confirmed.feedbacks.trap_explainer && (
                  <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(11,11,14,0.03)', border: '1px solid #E7E4DE' }}>
                    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.45)', marginBottom: 5 }}>
                      Trap: {confirmed.feedbacks.trap_explainer.trap}
                    </div>
                    <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: 0 }}>
                      {confirmed.feedbacks.trap_explainer.explanation}
                    </p>
                  </div>
                )}

                {/* Command of evidence — only present when subSkill=command_of_evidence AND English MC AND wrong */}
                {confirmed.feedbacks.command_of_evidence && (() => {
                  const coe = confirmed.feedbacks.command_of_evidence as CommandOfEvidenceContent;
                  return (
                    <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.2)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1D4ED8', marginBottom: 8 }}>
                        Supporting evidence
                      </div>
                      <blockquote style={{ fontFamily: "'Instrument Serif', serif", fontSize: 14.5, lineHeight: 1.6, color: '#0B0B0E', margin: '0 0 10px', paddingLeft: 12, borderLeft: '2px solid rgba(37,99,235,0.35)', fontStyle: 'italic' }}>
                        "{coe.supportingLine}"
                      </blockquote>
                      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 4px' }}>{coe.whyCorrect}</p>
                      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: 0 }}>{coe.whyStudentWrong}</p>
                    </div>
                  );
                })()}

                {/* Transitions coach — only present when subSkill=transitions AND wrong */}
                {confirmed.feedbacks.transitions_coach && (() => {
                  const tc = confirmed.feedbacks.transitions_coach as TransitionsCoachContent;
                  return (
                    <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(124,58,237,0.04)', border: '1px solid rgba(124,58,237,0.2)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6D28D9', marginBottom: 8 }}>
                        Transition logic
                      </div>
                      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 6px' }}>{tc.logicalRelationship}</p>
                      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: '#0B0B0E', margin: '0 0 4px' }}>{tc.whyCorrect}</p>
                      <p style={{ fontSize: 13.5, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: 0 }}>{tc.whyStudentWrong}</p>
                    </div>
                  );
                })()}

                {/* Vocab drill — interactive mini-quiz, distinct from the Continue button */}
                {confirmed.feedbacks.vocab_drill && (() => {
                  const vd = confirmed.feedbacks.vocab_drill as VocabDrillContent;
                  const optLetters = ['A', 'B', 'C', 'D'];
                  const picked = vocabPick[q.id];
                  const isSubmitted = !!vocabSubmitted[q.id];
                  const isPickCorrect = picked === vd.correctOption;

                  const handleVocabSubmit = () => {
                    if (!picked || isSubmitted) return;
                    setVocabSubmitted((s) => ({ ...s, [q.id]: true }));
                    if (confirmed.vocabTrackingId) {
                      reviewVocab(confirmed.vocabTrackingId, picked === vd.correctOption).catch(console.error);
                    }
                  };

                  return (
                    <div style={{ padding: '14px 16px', borderRadius: 12, background: 'rgba(0,128,128,0.04)', border: '2px solid rgba(0,128,128,0.18)' }}>
                      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0D7377', marginBottom: 6 }}>
                        Vocab drill — "{vd.word}"
                      </div>
                      <p style={{ fontSize: 13, lineHeight: 1.55, color: 'rgba(11,11,14,0.6)', margin: '0 0 10px', fontStyle: 'italic' }}>
                        "{vd.sentenceContext}"
                      </p>
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: '#0B0B0E', margin: '0 0 10px' }}>{vd.followUpQuestion}</p>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                        {vd.options.map((opt, oi) => {
                          const letter = optLetters[oi];
                          const isPicked = picked === letter;
                          const isCorrectOpt = letter === vd.correctOption;
                          let bg = '#fff';
                          let border = '1px solid #C8C4BC';
                          let color = '#0B0B0E';
                          if (isSubmitted) {
                            if (isCorrectOpt) { bg = 'rgba(46,125,90,0.1)'; border = '1.5px solid #2E7D5A'; color = '#1A5C38'; }
                            else if (isPicked && !isCorrectOpt) { bg = 'rgba(192,57,43,0.08)'; border = '1.5px solid #C0392B'; color = '#8B1A10'; }
                          } else if (isPicked) {
                            bg = 'rgba(0,128,128,0.07)'; border = '1.5px solid #0D7377';
                          }
                          return (
                            <button
                              key={letter}
                              onClick={() => { if (!isSubmitted) setVocabPick((p) => ({ ...p, [q.id]: letter })); }}
                              disabled={isSubmitted}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 9, border, background: bg, color, fontSize: 13, textAlign: 'left', cursor: isSubmitted ? 'default' : 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}
                            >
                              <span style={{ width: 22, height: 22, borderRadius: 9999, border, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{letter}</span>
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      {isSubmitted ? (
                        <div style={{ padding: '10px 12px', borderRadius: 8, background: isPickCorrect ? 'rgba(46,125,90,0.08)' : 'rgba(192,57,43,0.07)', marginTop: 4 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 700, color: isPickCorrect ? '#1A5C38' : '#8B1A10', marginBottom: 4 }}>
                            {isPickCorrect ? '✓ Correct' : '✗ Incorrect — correct answer: ' + vd.correctOption}
                          </div>
                          <p style={{ fontSize: 13, lineHeight: 1.5, color: '#0B0B0E', margin: 0 }}>{vd.explanation}</p>
                        </div>
                      ) : (
                        <button
                          onClick={handleVocabSubmit}
                          disabled={!picked}
                          style={{ height: 36, padding: '0 18px', borderRadius: 9999, border: 'none', background: picked ? '#0D7377' : '#C8C4BC', color: '#fff', fontSize: 13, fontWeight: 700, cursor: picked ? 'pointer' : 'default', fontFamily: 'inherit', letterSpacing: '0.02em' }}
                        >
                          Check answer
                        </button>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Calculator popup */}
      {isMath && calcOpen && (
        <div style={{ position: 'fixed', right: 24, bottom: 92, width: 248, background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 16px 48px rgba(11,11,14,0.18)', padding: 14, zIndex: 45 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)' }}>Calculator</span>
            <button onClick={() => setCalcOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#8C8880', fontSize: 18, lineHeight: 1, fontFamily: 'inherit' }}>×</button>
          </div>
          <div style={{ background: '#0B0B0E', color: '#fff', borderRadius: 10, padding: '12px 14px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 18, minHeight: 24, overflow: 'hidden', marginBottom: 10, whiteSpace: 'nowrap' }}>
            {calcExpr || '0'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <button onClick={() => calcPress('C')} style={{ gridColumn: 'span 2', height: 40, borderRadius: 9, border: '1px solid #E7E4DE', background: '#F2F0EC', color: '#C0392B', fontWeight: 600, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>Clear</button>
            <button onClick={() => calcPress('⌫')} style={{ gridColumn: 'span 2', height: 40, borderRadius: 9, border: '1px solid #E7E4DE', background: '#F2F0EC', color: '#0B0B0E', fontWeight: 600, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>⌫</button>
            {['7','8','9','/','4','5','6','*','1','2','3','-','0','.','%','+'].map((k) => {
              const isOp = '/*-+%'.includes(k);
              return <button key={k} onClick={() => calcPress(k)} style={{ height: 40, borderRadius: 9, border: '1px solid #E7E4DE', background: isOp ? '#FBEEE9' : '#fff', color: isOp ? '#E2562B' : '#0B0B0E', fontWeight: 600, cursor: 'pointer', fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }}>{k}</button>;
            })}
            <button onClick={() => calcPress('=')} style={{ gridColumn: 'span 4', height: 42, borderRadius: 9, border: 'none', background: '#E2562B', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 16, fontFamily: 'inherit' }}>=</button>
          </div>
        </div>
      )}

      {/* Question navigator popup */}
      {navOpen && (
        <div style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 84, width: 'min(560px, 90vw)', background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 16px 48px rgba(11,11,14,0.18)', padding: 20, zIndex: 45 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Question navigator</span>
            <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'rgba(11,11,14,0.5)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#0B0B0E', display: 'inline-block' }} />Answered</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#fff', border: '1px solid #C8C4BC', display: 'inline-block' }} />Unseen</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#E2562B', display: 'inline-block' }} />Flagged</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))', gap: 8 }}>
            {questions.map((qq, qi) => {
              const ans = !!answers[qq.id], fl = !!flags[qi], cur = qi === index;
              const bg = fl ? '#E2562B' : ans ? '#0B0B0E' : '#fff';
              const col = (fl || ans) ? '#fff' : '#8C8880';
              return <button key={qi} onClick={() => { setIndex(qi); setNavOpen(false); }} style={{ height: 44, borderRadius: 9, border: cur ? '2px solid #E2562B' : '1px solid #C8C4BC', background: bg, color: col, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>{qi + 1}</button>;
            })}
          </div>
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ height: 70, flexShrink: 0, background: '#fff', borderTop: '1px solid #E7E4DE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <button
          onClick={() => setNavOpen((n) => !n)}
          style={{ display: 'flex', alignItems: 'center', gap: 9, border: '1px solid #C8C4BC', background: navOpen ? '#F2F0EC' : '#fff', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit' }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
          Question {index + 1} of {total}
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            style={{ height: 42, padding: '0 22px', borderRadius: 9999, border: '1px solid #C8C4BC', background: index === 0 ? '#EDEAE4' : '#fff', color: index === 0 ? '#B0ACA4' : '#0B0B0E', fontSize: 14, fontWeight: 600, cursor: index === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}
          >← Back</button>
          {renderBottomAction()}
        </div>
      </div>
    </div>
  );
}
