import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getExam, saveAnswers, submitExam } from '../../api/student';
import { saveExamProgress, loadExamProgress, clearExamProgress } from '../../lib/offline';
import { useMobile } from '../../hooks/useMobile';

export default function TakeExam() {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const locationState = location.state as {
    timerEnabled?: boolean;
    examTitle?: string;
    fromMockSection1?: boolean;
    liveExam?: boolean;
    liveJoinCode?: string;
    sectionStartedAt?: string;
    englishDurationSeconds?: number;
    mathExamId?: string;
    mathDurationSeconds?: number;
  } | null;

  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [flags, setFlags] = useState<Record<number, boolean>>({});
  const [elim, setElim] = useState<Record<number, Record<string, boolean>>>({});
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(20 * 60);
  const [navOpen, setNavOpen] = useState(false);
  const largeFontSize = localStorage.getItem('sat-font-pref') === 'true';
  const isMobile = useMobile();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [timerEnabled, setTimerEnabled] = useState<boolean>(locationState?.timerEnabled ?? false);
  const [sectionBanner, setSectionBanner] = useState<boolean>(locationState?.fromMockSection1 ?? false);
  const [transitioning, setTransitioning] = useState(false);
  const examTitle = locationState?.examTitle;

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<number>(0);           // seconds elapsed this session
  const savedTimeSpentRef = useRef<number>(0);     // seconds from a previous session (IDB)
  const timerEnabledRef = useRef<boolean>(locationState?.timerEnabled ?? false);
  const timeLeftRef = useRef<number>(20 * 60);
  const mathExamIdRef = useRef<string | null>(null);
  const englishExamIdRef = useRef<string | null>(null);
  const transitioningRef = useRef(false);
  // Always-current answers for use inside timer/IDB closures
  const answersRef = useRef<Record<string, string | null>>({});
  const dataRef = useRef<{ exam: import('../../api/student').Exam; questions: import('../../api/student').Question[]; answers: { questionId: string; selectedAnswer: string | null; selectedAnswerText: string | null }[]; mathExamId: string | null; englishExamId: string | null } | undefined>(undefined);

  // Keep refs in sync with state/query
  useEffect(() => { timerEnabledRef.current = timerEnabled; }, [timerEnabled]);
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Reset all exam-specific state when examId changes (English → Math transition, same component instance)
  useEffect(() => {
    setAnswers({});
    setFlags({});
    setElim({});
    setIndex(0);
    elapsedRef.current = 0;
    savedTimeSpentRef.current = 0;
    timeLeftRef.current = 20 * 60;
    setTimeLeft(20 * 60);
    mathExamIdRef.current = null;
    englishExamIdRef.current = null;
    setSectionBanner(!!(locationState?.fromMockSection1));
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading } = useQuery({
    queryKey: ['student', 'exam', examId],
    queryFn: () => getExam(examId!),
    enabled: !!examId,
  });

  // Capture sibling exam IDs; pre-fetch Math exam so English→Math transition is instant;
  // also clear any overlay once new exam data has arrived (for regular submit path).
  useEffect(() => {
    if (!data) return;
    dataRef.current = data;
    // For live exams, math/english exam IDs come from location state (set by lobby)
    mathExamIdRef.current = data.mathExamId ?? locationState?.mathExamId ?? null;
    englishExamIdRef.current = data.englishExamId ?? null;
    if (data.mathExamId) {
      queryClient.prefetchQuery({
        queryKey: ['student', 'exam', data.mathExamId],
        queryFn: () => getExam(data.mathExamId!),
      });
    }
    if (transitioningRef.current) {
      transitioningRef.current = false;
      setTransitioning(false);
    }
  }, [data, queryClient]);

  // After data loads: non-individual exams always use the timer
  useEffect(() => {
    if (!data) return;
    if (data.exam.type !== 'individual') {
      setTimerEnabled(true);
      timerEnabledRef.current = true;
      // Live exam: compute remaining time from server-anchored start
      if (isLiveExam && locationState?.sectionStartedAt) {
        const elapsed = Math.floor((Date.now() - new Date(locationState.sectionStartedAt).getTime()) / 1000);
        const duration = data.exam.type === 'mock_math'
          ? (locationState?.mathDurationSeconds ?? 4200)
          : (locationState?.englishDurationSeconds ?? 3840);
        const remaining = Math.max(0, duration - elapsed);
        setTimeLeft(remaining);
        timeLeftRef.current = remaining;
      }
      return;
    }
    // Individual: load saved progress and override timerEnabled from IDB (resume path)
    loadExamProgress(examId!).then((saved) => {
      if (saved) {
        setAnswers(saved.answers);
        savedTimeSpentRef.current = saved.timeSpentSeconds;
        setTimerEnabled(saved.timerEnabled);
        timerEnabledRef.current = saved.timerEnabled;
        if (saved.timerEnabled) {
          const remaining = Math.max(0, 20 * 60 - saved.timeSpentSeconds);
          setTimeLeft(remaining);
          timeLeftRef.current = remaining;
        }
      } else {
        const init: Record<string, string | null> = {};
        data.answers.forEach((a) => { init[a.questionId] = a.selectedAnswerText ?? a.selectedAnswer; });
        setAnswers(init);
        savedTimeSpentRef.current = 0;
      }
    });
  }, [data, examId]);

  // Time-spent helper — reads refs to avoid stale closure issues in callbacks
  const getTimeSpent = useCallback((): number => {
    if (timerEnabledRef.current) return 20 * 60 - timeLeftRef.current;
    return savedTimeSpentRef.current + elapsedRef.current;
  }, []);

  const saveMutation = useMutation({
    mutationFn: ({ ans, time }: { ans: typeof answers; time: number }) =>
      saveAnswers(examId!, Object.entries(ans).map(([questionId, value]) => {
        const q = data?.questions.find((qq) => qq.id === questionId);
        const isSPR = q?.questionType === 'student_produced_response';
        return { questionId, selectedAnswer: isSPR ? null : (value as 'a' | 'b' | 'c' | 'd' | null), selectedAnswerText: isSPR ? value : null };
      }), time),
  });

  const isLiveExam = !!(locationState?.liveExam);

  // Final submit (Math section or individual exam) — shows overlay while waiting for server
  const submitMutation = useMutation({
    mutationFn: () => submitExam(examId!, getTimeSpent()),
    onSuccess: async () => {
      if (examId) await clearExamProgress(examId);
      transitioningRef.current = false;
      setTransitioning(false);
      if (isLiveExam) {
        navigate('/student/dashboard', { replace: true });
        return;
      }
      const suffix = englishExamIdRef.current ? `?englishExamId=${englishExamIdRef.current}` : '';
      navigate(`/student/results/${examId}${suffix}`, { replace: true });
    },
  });

  const handleSubmit = () => {
    transitioningRef.current = true;
    setTransitioning(true);
    submitMutation.mutate();
  };

  // Mock English → Math: navigate instantly (Math data is pre-fetched), submit Section 1 in background.
  // Uses refs so this is safe to call from inside timer callbacks.
  const handleNextSection = useCallback(() => {
    const mathId = mathExamIdRef.current!;
    const currentExamId = examId!;
    const timeSpent = getTimeSpent();
    const currentData = dataRef.current!;
    const formattedAnswers = Object.entries(answersRef.current).map(([questionId, value]) => {
      const q = currentData.questions.find((qq) => qq.id === questionId);
      const isSPR = q?.questionType === 'student_produced_response';
      return {
        questionId,
        selectedAnswer: isSPR ? null : (value as 'a' | 'b' | 'c' | 'd' | null),
        selectedAnswerText: isSPR ? value : null,
      };
    });
    const nextState = isLiveExam
      ? { ...locationState, fromMockSection1: true }
      : { fromMockSection1: true };
    navigate(`/student/exams/${mathId}`, { replace: true, state: nextState });
    // Save latest answers → submit → clear IDB, all in background
    saveAnswers(currentExamId, formattedAnswers, timeSpent)
      .then(() => submitExam(currentExamId, timeSpent))
      .then(() => clearExamProgress(currentExamId))
      .catch(() => {});
  }, [examId, navigate, getTimeSpent]);

  // Countdown timer — only when timerEnabled
  useEffect(() => {
    if (!timerEnabled) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        const next = Math.max(0, t - 1);
        timeLeftRef.current = next;
        if (next <= 0) {
          clearInterval(timerRef.current!);
          if (mathExamIdRef.current) {
            handleNextSection();
          } else {
            transitioningRef.current = true;
            setTransitioning(true);
            submitMutation.mutate();
          }
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [timerEnabled]);

  // Always count elapsed seconds (used for untimed time-spent tracking)
  useEffect(() => {
    const tick = setInterval(() => { elapsedRef.current += 1; }, 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  const syncAnswers = useCallback(() => {
    if (isOnline && examId) saveMutation.mutate({ ans: answers, time: getTimeSpent() });
  }, [answers, isOnline, examId, getTimeSpent]);

  // Save to IDB on every answer change
  useEffect(() => {
    if (examId) saveExamProgress(examId, answers, getTimeSpent(), timerEnabledRef.current, examTitle);
  }, [answers, timerEnabled]);

  useEffect(() => {
    syncRef.current = setInterval(syncAnswers, 30000);
    return () => clearInterval(syncRef.current!);
  }, [syncAnswers]);

  useEffect(() => {
    if (isOnline) syncAnswers();
  }, [isOnline]);

  if (isLoading || !data) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF9F6' }}>
        <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 24, color: 'rgba(11,11,14,0.4)' }}>Loading exam…</div>
      </div>
    );
  }

  const { exam, questions } = data;
  const isPractice = exam.type === 'individual';
  const isActuallyMath = exam.type === 'mock_math';
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
  const LETTER = ['A', 'B', 'C', 'D'];
  const optKeys = ['a', 'b', 'c', 'd'];
  const optTexts = [q.optionA, q.optionB, q.optionC, q.optionD];

  const selectAnswer = (opt: string) => setAnswers((a) => ({ ...a, [q.id]: opt }));

  const toggleElim = (opt: string) => {
    setElim((e) => {
      const row = { ...(e[index] ?? {}) };
      row[opt] = !row[opt];
      return { ...e, [index]: row };
    });
  };

  const renderBottomAction = () => {
    if (isLast) {
      const isNextSection = !!mathExamIdRef.current;
      return (
        <button
          onClick={isNextSection ? handleNextSection : handleSubmit}
          disabled={transitioning}
          style={{ height: 42, padding: isMobile ? '0 14px' : '0 22px', borderRadius: 9999, border: 'none', background: isNextSection ? '#2563A8' : '#E2562B', color: '#fff', fontSize: 14, fontWeight: 600, cursor: transitioning ? 'default' : 'pointer', fontFamily: 'inherit' }}
        >{isNextSection ? 'Next Section →' : 'Submit test'}</button>
      );
    }
    return (
      <button
        onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
        style={{
          height: 42, padding: isMobile ? '0 14px' : '0 22px', borderRadius: 9999, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          border: selected ? 'none' : '1px solid #C8C4BC',
          background: selected ? '#E2562B' : '#fff',
          color: selected ? '#fff' : '#8C8880',
        }}
      >{selected ? 'Next →' : 'Skip →'}</button>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#FAF9F6', zIndex: 50 }}>
      {/* Top bar */}
      {isMobile ? (
        <div style={{ height: 56, flexShrink: 0, background: '#fff', borderBottom: '1px solid #E7E4DE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', gap: 8 }}>
          <button
            onClick={() => navigate(-1)}
            style={{ border: '1px solid #C8C4BC', background: '#fff', borderRadius: 9999, padding: '7px 12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit', flexShrink: 0, lineHeight: 1 }}
          >←</button>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)' }}>
              {isActuallyMath ? 'Math' : 'R&W'}{isPractice && ' · Practice'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Q {index + 1} / {total}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {timerEnabled ? (
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em', color: low ? '#C0392B' : '#0B0B0E' }}>{mins}:{secs}</div>
            ) : isPractice ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(11,11,14,0.3)', letterSpacing: '0.04em' }}>Untimed</span>
            ) : null}
            {!isOnline && (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#B8893E" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
            )}
            <button
              onClick={() => setFlags((f) => ({ ...f, [index]: !f[index] }))}
              style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', border: flagged ? '1px solid #E2562B' : '1px solid #C8C4BC', background: flagged ? 'rgba(226,86,43,0.07)' : '#fff', borderRadius: 9999, cursor: 'pointer', padding: 0 }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill={flagged ? '#E2562B' : 'none'} stroke={flagged ? '#E2562B' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div style={{ height: 62, flexShrink: 0, background: '#fff', borderBottom: '1px solid #E7E4DE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <button
              onClick={() => navigate(-1)}
              style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #C8C4BC', background: '#fff', borderRadius: 9999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit' }}
            >← Exit</button>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)' }}>
                {isActuallyMath ? 'Math' : 'Reading & Writing'}
                {isPractice && <span style={{ marginLeft: 8, color: '#2563A8' }}>· Practice</span>}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>Question {index + 1} of {total}</div>
            </div>
          </div>

          {timerEnabled ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: 30, lineHeight: 1, letterSpacing: '-0.02em', color: low ? '#C0392B' : '#0B0B0E' }}>{mins}:{secs}</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)' }}>Time left</div>
            </div>
          ) : isPractice ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.3)', letterSpacing: '0.04em' }}>Untimed</div>
            </div>
          ) : null}

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
            <button
              onClick={handleSubmit}
              disabled={transitioning}
              style={{ border: '1px solid #0B0B0E', background: '#0B0B0E', color: '#fff', borderRadius: 9999, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: transitioning ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >Submit test</button>
          </div>
        </div>
      )}

      {/* Section transition banner */}
      {sectionBanner && (
        <div style={{ flexShrink: 0, background: 'rgba(37,99,168,0.07)', borderBottom: '1px solid rgba(37,99,168,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 14px' : '10px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2563A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>{isMobile ? 'Section 1 done — now on Section 2: Math' : "Section 1 (Reading & Writing) complete — you're now on Section 2: Math"}</span>
          </div>
          <button onClick={() => setSectionBanner(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 18, lineHeight: 1, padding: '0 4px', fontFamily: 'inherit' }}>×</button>
        </div>
      )}

      {/* Content */}
      <div className="scrollarea" style={{ flex: 1, overflowY: 'auto', background: '#FAF9F6' }}>
        <div style={{ maxWidth: q.passageText ? (isMobile ? '100%' : 1100) : 760, margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '40px 40px 60px', display: q.passageText && !isMobile ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
          {/* Passage */}
          {q.passageText && (
            <div style={{ paddingRight: isMobile ? 0 : 40, borderRight: isMobile ? 'none' : '1px solid #EAE7E1', paddingBottom: isMobile ? 20 : 0, borderBottom: isMobile ? '1px solid #EAE7E1' : 'none', marginBottom: isMobile ? 24 : 0 }}>
              {q.passageTitle && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.4)', marginBottom: 10 }}>{q.passageTitle}</div>}
              <p style={{ fontFamily: "'Instrument Serif', serif", fontSize: isMobile ? 16 : 19, lineHeight: 1.7, color: '#0B0B0E', margin: 0, whiteSpace: 'pre-wrap' }}>{q.passageText}</p>
            </div>
          )}

          {/* Question */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: '#0B0B0E', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{index + 1}</span>
              {isSPR && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'rgba(226,86,43,0.08)', color: '#E2562B' }}>Grid-in</span>}
            </div>
            <p style={{ fontSize: largeFontSize ? 20 : 16.5, lineHeight: 1.55, fontWeight: 500, color: '#0B0B0E', margin: '0 0 22px' }}>{q.questionText}</p>

            {/* SPR input */}
            {isSPR && (
              <div>
                <input
                  type="text"
                  value={selected ?? ''}
                  onChange={(e) => selectAnswer(e.target.value)}
                  placeholder="Enter your answer…"
                  style={{ width: '100%', maxWidth: 280, height: 52, padding: '0 16px', border: selected ? '1.5px solid #E2562B' : '1px solid #C8C4BC', borderRadius: 12, fontSize: 18, fontFamily: "'JetBrains Mono', monospace", background: '#fff', color: '#0B0B0E', outline: 'none', boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: 12, color: 'rgba(11,11,14,0.4)', marginTop: 8 }}>Accepted formats: whole number, decimal (1.5), or fraction (3/4)</p>
              </div>
            )}

            {/* MC options */}
            {!isSPR && (
              <div>
                {optKeys.map((key, oi) => {
                  if (!optTexts[oi]) return null;
                  const isSelected = selected === key;
                  const isElim = !!qElim[key];
                  return (
                    <div key={key} style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                      <button
                        onClick={() => selectAnswer(key)}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '15px 18px', borderRadius: 12, cursor: 'pointer', background: isSelected ? 'rgba(226,86,43,0.06)' : '#fff', border: isSelected ? '1.5px solid #E2562B' : '1px solid #C8C4BC', opacity: isElim ? 0.4 : 1, transition: 'all 0.15s', fontFamily: 'inherit' }}
                      >
                        <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9999, border: isSelected ? '1.5px solid #E2562B' : '1.5px solid #C8C4BC', background: isSelected ? '#E2562B' : 'transparent', color: isSelected ? '#fff' : '#8C8880', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{LETTER[oi]}</span>
                        <span style={{ fontSize: largeFontSize ? 18 : 15, color: '#0B0B0E', lineHeight: 1.5, textDecoration: isElim ? 'line-through' : 'none' }}>{optTexts[oi]}</span>
                      </button>
                      <button
                        title="Cross out"
                        onClick={() => toggleElim(key)}
                        style={{ width: 44, flexShrink: 0, borderRadius: 10, border: '1px solid #E7E4DE', background: isElim ? 'rgba(11,11,14,0.04)' : '#fff', color: isElim ? '#E2562B' : '#A8A49C', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', textDecoration: 'line-through', fontFamily: 'inherit' }}
                      >ABC</button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

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
          {isMobile && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #F0ECE4' }}>
              <button
                onClick={() => { setNavOpen(false); handleSubmit(); }}
                disabled={transitioning}
                style={{ width: '100%', height: 44, borderRadius: 9999, border: 'none', background: '#0B0B0E', color: '#fff', fontSize: 14, fontWeight: 600, cursor: transitioning ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >Submit test</button>
            </div>
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ height: 70, flexShrink: 0, background: '#fff', borderTop: '1px solid #E7E4DE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '0 14px' : '0 24px' }}>
        <button
          onClick={() => setNavOpen((n) => !n)}
          style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 7 : 9, border: '1px solid #C8C4BC', background: navOpen ? '#F2F0EC' : '#fff', borderRadius: 10, padding: isMobile ? '8px 12px' : '9px 16px', fontSize: isMobile ? 13 : 13.5, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit' }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
          {isMobile ? `Q ${index + 1} / ${total}` : `Question ${index + 1} of ${total}`}
        </button>

        <div style={{ display: 'flex', gap: isMobile ? 8 : 10 }}>
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            style={{ height: 42, padding: isMobile ? '0 16px' : '0 22px', borderRadius: 9999, border: '1px solid #C8C4BC', background: index === 0 ? '#EDEAE4' : '#fff', color: index === 0 ? '#B0ACA4' : '#0B0B0E', fontSize: 14, fontWeight: 600, cursor: index === 0 ? 'default' : 'pointer', fontFamily: 'inherit' }}
          >← Back</button>
          {renderBottomAction()}
        </div>
      </div>

      {/* Full-screen overlay during section submit / transition */}
      {transitioning && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#FAF9F6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14 }}>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid #E2562B', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0B0B0E' }}>Completing section…</div>
        </div>
      )}
    </div>
  );
}
