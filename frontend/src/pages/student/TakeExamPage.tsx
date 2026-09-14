import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { getExam, saveAnswers, submitExamIfOpen, nextModule, type MockSection } from '@/api/student';
import { getApiError } from '@/api/http';
import { saveExamProgress, loadExamProgress, clearExamProgress } from '@/lib/offline';
import { useMobile } from '@/hooks/useMobile';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';

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
    mockTestId?: string;
    mockSection?: 'english_m1' | 'english_m2' | 'math_m1' | 'math_m2';
    mathM1ExamId?: string;
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Shown when a submit or section transition fails, so the student is never
  // left on a spinner with no way forward.
  const [actionError, setActionError] = useState<string | null>(null);
  const examTitle = locationState?.examTitle;
  const isLiveExam = !!(locationState?.liveExam);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef<number>(0);           // seconds elapsed this session
  const savedTimeSpentRef = useRef<number>(0);     // seconds from a previous session (IDB)
  const timerEnabledRef = useRef<boolean>(locationState?.timerEnabled ?? false);
  const timeLeftRef = useRef<number>(20 * 60);
  const mathExamIdRef = useRef<string | null>(null);
  const transitioningRef = useRef(false);
  // Where this exam sits in an adaptive mock. Router state supplies these on a
  // normal start; the server fills them in when the module was reopened without
  // it (resume banner, reload in a new tab).
  const mockSectionRef = useRef<MockSection | undefined>(locationState?.mockSection);
  const mockTestIdRef = useRef<string | undefined>(locationState?.mockTestId);
  const mathM1ExamIdRef = useRef<string | undefined>(locationState?.mathM1ExamId);
  const [mockSection, setMockSection] = useState<MockSection | undefined>(locationState?.mockSection);
  // Server deadline (epoch ms) and device-clock correction. When a deadline is
  // known the countdown is recomputed from it every tick, so a reload, a
  // throttled background tab or a changed device clock cannot stretch it.
  const deadlineRef = useRef<number | null>(null);
  const clockOffsetRef = useRef(0);
  // Answers are initialised once per exam, so the refetch that follows a
  // pre-fetched section cannot overwrite what the student has already picked.
  const answersInitForRef = useRef<string | null>(null);
  const closedHandledRef = useRef<string | null>(null);
  // Always-current answers for use inside timer/IDB closures
  const answersRef = useRef<Record<string, string | null>>({});
  const dataRef = useRef<{ exam: import('@/api/student').Exam; questions: import('@/api/student').Question[]; answers: { questionId: string; selectedAnswer: string | null; selectedAnswerText: string | null }[]; mockTestId: string | null; mathExamId: string | null } | undefined>(undefined);
  // Each question opens at its top; otherwise "Next" lands mid-passage on phones.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }); }, [index]);

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
    // B10: the section changes with the exam, so the ref must follow it too.
    mockSectionRef.current = locationState?.mockSection;
    mockTestIdRef.current = locationState?.mockTestId;
    mathM1ExamIdRef.current = locationState?.mathM1ExamId;
    setMockSection(locationState?.mockSection);
    deadlineRef.current = null;
    answersInitForRef.current = null;
    setConfirmOpen(false);
    setActionError(null);
    setSectionBanner(!!(locationState?.fromMockSection1));
  }, [examId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ['student', 'exam', examId],
    // The player opening the exam is what starts a timed module's clock.
    queryFn: () => getExam(examId!, { open: true }),
    enabled: !!examId,
    meta: { handlesError: true },
  });

  // Capture where the Math section starts; pre-fetch it so the English→Math
  // transition is instant; also clear any overlay once new exam data has arrived
  // (for the regular submit path).
  useEffect(() => {
    if (!data) return;
    // A cached read of the previous exam can land before the new one's; ignore it.
    if (data.exam.id !== examId) return;
    dataRef.current = data;

    if (data.mockSection) {
      mockSectionRef.current ??= data.mockSection;
      mockTestIdRef.current ??= data.mockTestId ?? undefined;
      mathM1ExamIdRef.current ??= data.mathExamId ?? undefined;
      setMockSection(mockSectionRef.current);
    }

    // The English → Math chain of a live exam or a legacy non-adaptive mock. Only
    // an English section chains: the lobby's `mathExamId` stays in router state
    // on the Math section too, and used to make its last button and its timeout
    // reopen the same Math exam instead of submitting it.
    const chainTarget = data.mathExamId ?? locationState?.mathExamId ?? null;
    mathExamIdRef.current =
      !mockSectionRef.current && data.exam.type === 'mock_english' && chainTarget !== examId ? chainTarget : null;
    if (data.mathExamId && data.mathExamId !== examId) {
      queryClient.prefetchQuery({
        queryKey: ['student', 'exam', data.mathExamId],
        queryFn: () => getExam(data.mathExamId!),
        // A failed warm-up is harmless: the section loads normally when opened.
        meta: { handlesError: true },
      });
    }
    if (transitioningRef.current) {
      transitioningRef.current = false;
      setTransitioning(false);
    }
  }, [data, queryClient]);

  // After data loads: set up the clock, then restore answers once per exam.
  useEffect(() => {
    if (!data) return;

    if (data.deadlineAt) {
      // Server-authoritative: count down to the deadline the server holds.
      deadlineRef.current = new Date(data.deadlineAt).getTime();
      clockOffsetRef.current = new Date(data.serverNow).getTime() - Date.now();
      const remaining = Math.max(0, Math.ceil((deadlineRef.current - (Date.now() + clockOffsetRef.current)) / 1000));
      setTimeLeft(remaining);
      timeLeftRef.current = remaining;
      setTimerEnabled(true);
      timerEnabledRef.current = true;
    } else if (data.exam.type !== 'individual') {
      // Timed section whose deadline is not known yet (a pre-fetched read); the
      // refetch that opens it supplies one. Live exams without one fall back to
      // the session start the lobby passed along.
      setTimerEnabled(true);
      timerEnabledRef.current = true;
      if (isLiveExam && locationState?.sectionStartedAt) {
        const elapsed = Math.floor((Date.now() - new Date(locationState.sectionStartedAt).getTime()) / 1000);
        const duration = data.exam.type === 'mock_math'
          ? (locationState?.mathDurationSeconds ?? 4200)
          : (locationState?.englishDurationSeconds ?? 3840);
        const remaining = Math.max(0, duration - elapsed);
        setTimeLeft(remaining);
        timeLeftRef.current = remaining;
      }
    }

    if (answersInitForRef.current === examId) return;
    answersInitForRef.current = examId ?? null;

    // Restore progress for every kind of exam. Mock and live sections used to
    // skip this, so reloading one showed a blank paper even though autosave had
    // the answers on the server.
    const fromServer = () => {
      const init: Record<string, string | null> = {};
      data.answers.forEach((a) => { init[a.questionId] = a.selectedAnswerText ?? a.selectedAnswer; });
      return init;
    };
    loadExamProgress(examId!).then((saved) => {
      if (saved) {
        // Merged, local picks first: this device's copy is the freshest for what
        // it holds, but it can be empty or partial (another device, or the empty
        // write the player makes before data arrives), and the server fills in.
        const local = Object.fromEntries(Object.entries(saved.answers).filter(([, v]) => v !== null && v !== ''));
        setAnswers({ ...fromServer(), ...local });
        savedTimeSpentRef.current = saved.timeSpentSeconds;
        // Only self-study practice lets the student's own timer choice persist.
        if (data.exam.type === 'individual' && !data.deadlineAt) {
          setTimerEnabled(saved.timerEnabled);
          timerEnabledRef.current = saved.timerEnabled;
          if (saved.timerEnabled) {
            const remaining = Math.max(0, 20 * 60 - saved.timeSpentSeconds);
            setTimeLeft(remaining);
            timeLeftRef.current = remaining;
          }
        }
      } else {
        setAnswers(fromServer());
        savedTimeSpentRef.current = 0;
      }
    }).catch(() => setAnswers(fromServer()));
  }, [data, examId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Time-spent helper — reads refs to avoid stale closure issues in callbacks
  const getTimeSpent = useCallback((): number => {
    // Timed by the server: it computes the real figure and ignores this one.
    if (deadlineRef.current !== null) return savedTimeSpentRef.current + elapsedRef.current;
    if (timerEnabledRef.current) return 20 * 60 - timeLeftRef.current;
    return savedTimeSpentRef.current + elapsedRef.current;
  }, []);

  // The current picks in the shape the server stores. Reads refs, so it is safe
  // inside the timer and transition callbacks.
  const formatAnswers = useCallback(() => {
    const currentData = dataRef.current;
    return Object.entries(answersRef.current).map(([questionId, value]) => {
      const q = currentData?.questions.find((qq) => qq.id === questionId);
      const isSPR = q?.questionType === 'student_produced_response';
      return {
        questionId,
        selectedAnswer: isSPR ? null : (value as 'a' | 'b' | 'c' | 'd' | null),
        selectedAnswerText: isSPR ? value : null,
      };
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: ({ time }: { time: number }) => saveAnswers(examId!, formatAnswers(), time),
    onError: (err) => {
      // 409: the server closed this section because its time ran out (e.g. the
      // tab slept through the deadline). Refetch so the closed-exam handler below
      // moves the student on, rather than letting them keep answering into a void.
      if (isAxiosError(err) && err.response?.status === 409) {
        queryClient.invalidateQueries({ queryKey: ['student', 'exam', examId] });
      }
    },
  });

  // Final submit (Math section or individual exam) — shows overlay while waiting for server
  const submitMutation = useMutation({
    // Final picks travel with the submit. Without them the server graded only what
    // the last 30-second autosave had stored, so recent picks were lost.
    mutationFn: () => submitExamIfOpen(examId!, getTimeSpent(), formatAnswers()),
    onError: (err) => {
      transitioningRef.current = false;
      setTransitioning(false);
      setActionError(`Couldn't submit: ${getApiError(err)}. Your answers are saved on this device — try again.`);
    },
    onSuccess: async () => {
      if (examId) await clearExamProgress(examId).catch(() => {});
      // Stale lists would otherwise still show this exam as in progress.
      queryClient.invalidateQueries({ queryKey: ['student'] });
      transitioningRef.current = false;
      setTransitioning(false);
      if (isLiveExam) {
        navigate('/student/dashboard', { replace: true });
        return;
      }
      // Adaptive: English M2 done → start Math M1
      if (mockSectionRef.current === 'english_m2' && mathM1ExamIdRef.current) {
        navigate(`/student/exams/${mathM1ExamIdRef.current}`, {
          replace: true,
          state: {
            mockTestId: mockTestIdRef.current,
            mockSection: 'math_m1',
            fromMockSection1: false,
            timerEnabled: true,
            examTitle: 'Module 1 · Math',
          },
        });
        return;
      }
      // No query parameter: the results endpoint reports the mock this exam
      // belongs to, so the page no longer depends on the player having carried
      // a sibling id across the section transition.
      navigate(`/student/results/${examId}`, { replace: true });
    },
  });

  const handleSubmit = () => {
    if (transitioningRef.current) return;
    transitioningRef.current = true;
    setTransitioning(true);
    setActionError(null);
    submitMutation.mutate();
  };

  // Mock English → Math: navigate instantly (Math data is pre-fetched), submit Section 1 in background.
  // Uses refs so this is safe to call from inside timer callbacks.
  const handleNextSection = useCallback(() => {
    const mathId = mathExamIdRef.current;
    if (!mathId) return;
    const currentExamId = examId!;
    const timeSpent = getTimeSpent();
    const formattedAnswers = formatAnswers();
    const nextState = isLiveExam
      ? { ...locationState, fromMockSection1: true }
      : { fromMockSection1: true };
    navigate(`/student/exams/${mathId}`, { replace: true, state: nextState });
    // Submit (carrying the final answers) → clear IDB, in the background.
    submitExamIfOpen(currentExamId, timeSpent, formattedAnswers)
      .then(() => clearExamProgress(currentExamId))
      .catch(() => {});
  }, [examId, navigate, getTimeSpent, formatAnswers, isLiveExam, locationState]);

  // Adaptive M1→M2 transition: submit M1, call next-module API, navigate to M2
  const handleAdaptiveNextSection = useCallback(async () => {
    const mt = mockTestIdRef.current;
    const ms = mockSectionRef.current;
    if (!mt || !ms) return;

    transitioningRef.current = true;
    setTransitioning(true);
    setActionError(null);

    const currentExamId = examId!;

    try {
      // The submit saves the final answers first; past the deadline the server
      // grades its own copy and reports the exam as done.
      await submitExamIfOpen(currentExamId, getTimeSpent(), formatAnswers());
      await clearExamProgress(currentExamId).catch(() => {});
      const { m2ExamId } = await nextModule(mt, currentExamId);

      const isMathM1 = ms === 'math_m1';
      navigate(`/student/exams/${m2ExamId}`, {
        replace: true,
        state: {
          mockTestId: mt,
          mockSection: isMathM1 ? 'math_m2' : 'english_m2',
          mathM1ExamId: mathM1ExamIdRef.current,
          fromMockSection1: true,
          timerEnabled: true,
          examTitle: isMathM1 ? 'Module 2 · Math' : 'Module 2 · Reading & Writing',
        },
      });
    } catch (err) {
      transitioningRef.current = false;
      setTransitioning(false);
      setActionError(`Couldn't start the next module: ${getApiError(err)}. Try again.`);
    }
  }, [examId, navigate, getTimeSpent, formatAnswers]);

  /**
   * Ends the current section the way its position demands: into Module 2, into
   * the Math section, or a final submit. Every "finish" control and the timeout
   * go through here — the top-bar "Submit test" used to always do a plain
   * submit, which stranded an adaptive mock after Module 1.
   */
  const finishSection = () => {
    if (transitioningRef.current) return;
    setConfirmOpen(false);
    const ms = mockSectionRef.current;
    if (ms === 'english_m1' || ms === 'math_m1') {
      handleAdaptiveNextSection().catch(() => {});
    } else if (mathExamIdRef.current) {
      handleNextSection();
    } else {
      handleSubmit();
    }
  };

  // The interval below is created once per exam; it calls through this ref so it
  // always reaches the current render's handlers rather than the first one's.
  const finishSectionRef = useRef(finishSection);
  finishSectionRef.current = finishSection;

  // Opened an exam the server has already closed — its time ran out while the
  // student was away. Carry on exactly as a timeout here would have: into the
  // next module or section, or to the results.
  useEffect(() => {
    if (!data || data.exam.status !== 'completed' || closedHandledRef.current === examId) return;
    closedHandledRef.current = examId ?? null;
    if (examId) clearExamProgress(examId).catch(() => {});

    const ms = mockSectionRef.current;
    if (isLiveExam) {
      if (data.exam.type === 'mock_english' && mathExamIdRef.current) handleNextSection();
      else navigate('/student/dashboard', { replace: true });
      return;
    }
    if (ms === 'english_m1' || ms === 'math_m1') {
      handleAdaptiveNextSection().catch(() => {});
      return;
    }
    if (ms === 'english_m2' && mathM1ExamIdRef.current) {
      navigate(`/student/exams/${mathM1ExamIdRef.current}`, {
        replace: true,
        state: { mockTestId: mockTestIdRef.current, mockSection: 'math_m1', fromMockSection1: false, timerEnabled: true, examTitle: 'Module 1 · Math' },
      });
      return;
    }
    if (!ms && data.exam.type === 'mock_english' && mathExamIdRef.current) {
      handleNextSection();
      return;
    }
    navigate(`/student/results/${examId}`, { replace: true });
  }, [data, examId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Countdown timer — only when timerEnabled. Restarted per exam: after a
  // timeout the interval is cleared, and a section transition keeps
  // `timerEnabled` true, so keying on it alone left the next module's clock
  // frozen with no auto-submit.
  useEffect(() => {
    if (!timerEnabled) return;
    let fired = false;
    timerRef.current = setInterval(() => {
      const next = deadlineRef.current !== null
        ? Math.max(0, Math.ceil((deadlineRef.current - (Date.now() + clockOffsetRef.current)) / 1000))
        : Math.max(0, timeLeftRef.current - 1);
      timeLeftRef.current = next;
      setTimeLeft(next);
      // Wait for this exam's data: until then the countdown is a placeholder. An
      // exam the server already closed is handled by the effect above instead.
      const current = dataRef.current;
      if (next > 0 || fired || !current || current.exam.id !== examId || current.exam.status === 'completed') return;
      fired = true;
      clearInterval(timerRef.current!);
      finishSectionRef.current();
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [timerEnabled, examId]);

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

  // Reads refs only, so the autosave interval can stay stable. It used to depend
  // on `answers`, which tore the 30-second interval down on every pick — a
  // student answering faster than that never autosaved at all.
  const syncAnswers = useCallback(() => {
    const current = dataRef.current;
    if (!navigator.onLine || !examId || transitioningRef.current) return;
    if (!current || current.exam.id !== examId || current.exam.status !== 'in_progress') return;
    if (answersInitForRef.current !== examId || Object.keys(answersRef.current).length === 0) return;
    saveMutation.mutate({ time: getTimeSpent() });
  }, [examId, getTimeSpent]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save to IDB on every answer change
  useEffect(() => {
    if (examId) saveExamProgress(examId, answers, getTimeSpent(), timerEnabledRef.current, examTitle);
  }, [answers, timerEnabled]);

  useEffect(() => {
    syncRef.current = setInterval(syncAnswers, 30000);
    // Leaving the tab (or the page) is the moment a phone may kill it: flush then.
    const onHide = () => { if (document.visibilityState === 'hidden') syncAnswers(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      clearInterval(syncRef.current!);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [syncAnswers]);

  useEffect(() => {
    if (isOnline) syncAnswers();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ← / → move between questions, unless the student is typing a grid-in answer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirmOpen || transitioningRef.current || e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const count = dataRef.current?.questions.length ?? 0;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(Math.max(0, count - 1), i + 1));
      else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmOpen]);

  const handleExit = () => {
    // Best-effort flush so leaving never costs the last half-minute of picks.
    syncAnswers();
    navigate(-1);
  };

  if (isError && !data) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, textAlign: 'center', background: '#FAF9F6' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, color: '#0B0B0E' }}>Couldn't open this exam</div>
        <p style={{ fontSize: 14.5, color: 'rgba(11,11,14,0.64)', margin: 0, maxWidth: 420 }}>{getApiError(loadError)}</p>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="secondary" onClick={() => navigate('/student/dashboard', { replace: true })}>Back to dashboard</Button>
          <Button onClick={() => refetch()}>Try again</Button>
        </div>
      </div>
    );
  }

  if (isLoading || !data || data.exam.id !== examId) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FAF9F6' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24, color: 'rgba(11,11,14,0.58)' }}>Loading exam…</div>
      </div>
    );
  }

  const { exam, questions } = data;
  if (questions.length === 0) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24, background: '#FAF9F6' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 24 }}>This exam has no questions</div>
        <Button variant="secondary" onClick={() => navigate('/student/dashboard', { replace: true })}>Back to dashboard</Button>
      </div>
    );
  }
  const isPractice = exam.type === 'individual';
  const isActuallyMath = exam.type === 'mock_math';
  const total = questions.length;
  const q = questions[Math.min(index, total - 1)];
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

  const answeredCount = questions.filter((qq) => { const v = answers[qq.id]; return v !== null && v !== undefined && v !== ''; }).length;
  const unansweredCount = total - answeredCount;
  const flaggedCount = Object.values(flags).filter(Boolean).length;
  const isModuleOne = mockSection === 'english_m1' || mockSection === 'math_m1';
  const isNextSection = !mockSection && !!mathExamIdRef.current;
  const finishLabel = isModuleOne ? 'Finish module' : isNextSection ? 'Finish section' : 'Submit test';
  const requestFinish = () => { if (!transitioningRef.current) setConfirmOpen(true); };

  const renderBottomAction = () => {
    const btnStyle: React.CSSProperties = {
      height: isMobile ? 40 : 42,
      padding: isMobile ? '0 14px' : '0 22px',
      borderRadius: 9999,
      fontSize: isMobile ? 13 : 14,
      fontWeight: 600,
      cursor: 'pointer',
      fontFamily: 'inherit',
      whiteSpace: 'nowrap',
    };
    if (isLast) {
      // Adaptive: M1 sections go to M2
      if (mockSection === 'english_m1' || mockSection === 'math_m1') {
        return (
          <button
            onClick={requestFinish}
            disabled={transitioning}
            style={{ ...btnStyle, border: 'none', background: '#2563A8', color: '#fff', cursor: transitioning ? 'default' : 'pointer' }}
          >{transitioning ? 'Loading…' : 'Next Module →'}</button>
        );
      }
      // Live exam: English → Math directly
      return (
        <button
          onClick={requestFinish}
          disabled={transitioning}
          style={{ ...btnStyle, border: 'none', background: isNextSection ? '#2563A8' : '#C4471F', color: '#fff', cursor: transitioning ? 'default' : 'pointer' }}
        >{isNextSection ? 'Next Section →' : transitioning ? 'Submitting…' : 'Submit test'}</button>
      );
    }
    return (
      <button
        onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
        style={{ ...btnStyle, border: selected ? 'none' : '1px solid #C8C4BC', background: selected ? '#C4471F' : '#fff', color: selected ? '#fff' : '#6F6B64' }}
      >{selected ? 'Next →' : 'Skip →'}</button>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', background: '#FAF9F6', zIndex: 50 }}>
      {/* Top bar */}
      {isMobile ? (
        <div style={{ height: 56, flexShrink: 0, background: '#fff', borderBottom: '1px solid #E7E4DE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', gap: 8 }}>
          <button
            onClick={handleExit}
            aria-label="Exit test"
            style={{ border: '1px solid #C8C4BC', background: '#fff', borderRadius: 9999, padding: '7px 12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit', flexShrink: 0, lineHeight: 1 }}
          >←</button>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)' }}>
              {isActuallyMath ? 'Math' : 'R&W'}{isPractice && ' · Practice'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Q {index + 1} / {total}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {timerEnabled ? (
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 22, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: low ? '#C0392B' : '#0B0B0E' }}>{mins}:{secs}</div>
            ) : isPractice ? (
              <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(11,11,14,0.58)', letterSpacing: '0.04em' }}>Untimed</span>
            ) : null}
            {!isOnline && (
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#B8893E" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
            )}
            <button
              onClick={() => setFlags((f) => ({ ...f, [index]: !f[index] }))}
              aria-label={flagged ? 'Remove flag' : 'Flag for review'}
              aria-pressed={flagged}
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
              onClick={handleExit}
              style={{ display: 'flex', alignItems: 'center', gap: 7, border: '1px solid #C8C4BC', background: '#fff', borderRadius: 9999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit' }}
            >← Exit</button>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)' }}>
                {isActuallyMath ? 'Math' : 'Reading & Writing'}
                {isPractice && <span style={{ marginLeft: 8, color: '#2563A8' }}>· Practice</span>}
              </div>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>Question {index + 1} of {total}</div>
            </div>
          </div>

          {timerEnabled ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 30, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: low ? '#C0392B' : '#0B0B0E' }}>{mins}:{secs}</div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)' }}>Time left</div>
            </div>
          ) : isPractice ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(11,11,14,0.58)', letterSpacing: '0.04em' }}>Untimed</div>
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
              aria-label={flagged ? 'Remove flag' : 'Flag for review'}
              aria-pressed={flagged}
              style={{ display: 'flex', alignItems: 'center', gap: 7, border: flagged ? '1px solid #E2562B' : '1px solid #C8C4BC', background: flagged ? 'rgba(226,86,43,0.07)' : '#fff', color: flagged ? '#C4471F' : '#0B0B0E', borderRadius: 9999, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill={flagged ? '#E2562B' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>
              </svg>
              {flagged ? 'Flagged' : 'Flag'}
            </button>
            <button
              onClick={requestFinish}
              disabled={transitioning}
              style={{ border: '1px solid #0B0B0E', background: '#0B0B0E', color: '#fff', borderRadius: 9999, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: transitioning ? 'default' : 'pointer', fontFamily: 'inherit' }}
            >{finishLabel}</button>
          </div>
        </div>
      )}

      {/* Section transition banner */}
      {sectionBanner && (
        <div style={{ flexShrink: 0, background: 'rgba(37,99,168,0.07)', borderBottom: '1px solid rgba(37,99,168,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '10px 14px' : '10px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2563A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1D4ED8' }}>
              {mockSection === 'english_m2'
                ? (isMobile ? 'R&W Module 1 done — Module 2 starts' : 'Reading & Writing Module 1 complete — now on Module 2')
                : mockSection === 'math_m2'
                ? (isMobile ? 'Math Module 1 done — Module 2 starts' : 'Math Module 1 complete — now on Module 2')
                : (isMobile ? 'Section 1 done — now on Section 2: Math' : "Section 1 (Reading & Writing) complete — you're now on Section 2: Math")}
            </span>
          </div>
          <button onClick={() => setSectionBanner(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 18, lineHeight: 1, padding: '0 4px', fontFamily: 'inherit' }}>×</button>
        </div>
      )}

      {/* Failed submit / transition */}
      {actionError && (
        <div role="alert" style={{ flexShrink: 0, background: 'rgba(192,57,43,0.07)', borderBottom: '1px solid rgba(192,57,43,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: isMobile ? '10px 14px' : '10px 24px' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#A93226' }}>{actionError}</span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button onClick={finishSection} style={{ border: 'none', background: '#C0392B', color: '#fff', borderRadius: 9999, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
            <button onClick={() => setActionError(null)} aria-label="Dismiss" style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#6B7280', fontSize: 18, lineHeight: 1, padding: '0 4px', fontFamily: 'inherit' }}>×</button>
          </div>
        </div>
      )}

      {/* Content */}
      <div ref={contentRef} className="scrollarea" style={{ flex: 1, overflowY: 'auto', background: '#FAF9F6' }}>
        <div style={{ maxWidth: q.passageText ? (isMobile ? '100%' : 1100) : 760, margin: '0 auto', padding: isMobile ? '20px 16px 60px' : '40px 40px 60px', display: q.passageText && !isMobile ? 'grid' : 'block', gridTemplateColumns: '1fr 1fr', gap: 48 }}>
          {/* Passage */}
          {q.passageText && (
            <div style={{ paddingRight: isMobile ? 0 : 40, borderRight: isMobile ? 'none' : '1px solid #EAE7E1', paddingBottom: isMobile ? 20 : 0, borderBottom: isMobile ? '1px solid #EAE7E1' : 'none', marginBottom: isMobile ? 24 : 0 }}>
              {q.passageTitle && <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(11,11,14,0.58)', marginBottom: 10 }}>{q.passageTitle}</div>}
              <p style={{ fontFamily: 'var(--font-reading)', fontSize: isMobile ? 17 : 19, lineHeight: 1.65, color: '#0B0B0E', margin: 0, whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: q.passageText }} />
            </div>
          )}

          {/* Question */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span style={{ width: 26, height: 26, borderRadius: 7, background: '#0B0B0E', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{index + 1}</span>
              {isSPR && <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6, background: 'rgba(226,86,43,0.08)', color: '#C4471F' }}>Grid-in</span>}
            </div>
            <p style={{ fontSize: largeFontSize ? 20 : 16.5, lineHeight: 1.55, fontWeight: 500, color: '#0B0B0E', margin: '0 0 22px' }} dangerouslySetInnerHTML={{ __html: q.questionText }} />
            {q.imageUrl && (
              <div style={{ marginBottom: 22 }}>
                <img src={q.imageUrl} alt="Question diagram" style={{ maxWidth: '100%', maxHeight: 400, borderRadius: 10, border: '1px solid #E7E4DE', objectFit: 'contain', display: 'block' }} />
              </div>
            )}

            {/* SPR input */}
            {isSPR && (
              <div>
                <input
                  type="text"
                  value={selected ?? ''}
                  onChange={(e) => selectAnswer(e.target.value)}
                  placeholder="Enter your answer…"
                  style={{ width: '100%', maxWidth: 280, height: 52, padding: '0 16px', border: selected ? '1.5px solid #E2562B' : '1px solid #C8C4BC', borderRadius: 12, fontSize: 18, fontFamily: 'var(--font-mono)', background: '#fff', color: '#0B0B0E', outline: 'none', boxSizing: 'border-box' }}
                />
                <p style={{ fontSize: 12, color: 'rgba(11,11,14,0.58)', marginTop: 8 }}>Accepted formats: whole number, decimal (1.5), or fraction (3/4)</p>
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
                        data-press="soft"
                        aria-pressed={isSelected}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '15px 18px', borderRadius: 12, cursor: 'pointer', background: isSelected ? 'rgba(226,86,43,0.06)' : '#fff', border: isSelected ? '1.5px solid #E2562B' : '1px solid #C8C4BC', opacity: isElim ? 0.4 : 1, transition: 'background-color 150ms ease, border-color 150ms ease, opacity 150ms ease, transform 100ms ease-out', fontFamily: 'inherit' }}
                      >
                        <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 9999, border: isSelected ? '1.5px solid #E2562B' : '1.5px solid #C8C4BC', background: isSelected ? '#C4471F' : 'transparent', color: isSelected ? '#fff' : '#6F6B64', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{LETTER[oi]}</span>
                        <span style={{ fontSize: largeFontSize ? 18 : 15, color: '#0B0B0E', lineHeight: 1.5, textDecoration: isElim ? 'line-through' : 'none' }}>{optTexts[oi]}</span>
                      </button>
                      <button
                        title="Cross out"
                        aria-label={`Cross out ${LETTER[oi]}`}
                        aria-pressed={isElim}
                        onClick={() => toggleElim(key)}
                        style={{ width: 44, flexShrink: 0, borderRadius: 10, border: '1px solid #E7E4DE', background: isElim ? 'rgba(11,11,14,0.04)' : '#fff', color: isElim ? '#C4471F' : '#6F6B64', cursor: 'pointer', fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', textDecoration: 'line-through', fontFamily: 'inherit' }}
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
        <div className="nav-pop" role="dialog" aria-label="Question navigator" style={{ position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: isMobile ? 78 : 84, width: isMobile ? 'calc(100vw - 28px)' : 'min(560px, 90vw)', background: '#fff', border: '1px solid #E7E4DE', borderRadius: 16, boxShadow: '0 16px 48px rgba(11,11,14,0.18)', padding: isMobile ? 14 : 20, zIndex: 45, maxHeight: isMobile ? '60vh' : '70vh', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Navigator</span>
            <div style={{ display: 'flex', gap: isMobile ? 8 : 14, fontSize: 10, color: 'rgba(11,11,14,0.64)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#0B0B0E', display: 'inline-block', flexShrink: 0 }} />Done</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#fff', border: '1px solid #C8C4BC', display: 'inline-block', flexShrink: 0 }} />Unseen</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: '#E2562B', display: 'inline-block', flexShrink: 0 }} />Flagged</span>
            </div>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(6, 1fr)' : 'repeat(auto-fill, minmax(44px, 1fr))', gap: isMobile ? 6 : 8 }}>
              {questions.map((qq, qi) => {
                const ans = !!answers[qq.id], fl = !!flags[qi], cur = qi === index;
                const bg = fl ? '#E2562B' : ans ? '#0B0B0E' : '#fff';
                const col = (fl || ans) ? '#fff' : '#8C8880';
                return <button key={qi} onClick={() => { setIndex(qi); setNavOpen(false); }} style={{ height: isMobile ? 36 : 44, borderRadius: 8, border: cur ? '2px solid #E2562B' : '1px solid #C8C4BC', background: bg, color: col, fontWeight: 600, fontSize: isMobile ? 12 : 14, cursor: 'pointer', fontFamily: 'inherit' }}>{qi + 1}</button>;
              })}
            </div>
          </div>
          {isMobile && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #F0ECE4', flexShrink: 0 }}>
              <button
                onClick={() => { setNavOpen(false); requestFinish(); }}
                disabled={transitioning}
                style={{ width: '100%', height: 42, borderRadius: 9999, border: 'none', background: '#0B0B0E', color: '#fff', fontSize: 14, fontWeight: 600, cursor: transitioning ? 'default' : 'pointer', fontFamily: 'inherit' }}
              >{finishLabel}</button>
            </div>
          )}
        </div>
      )}

      {/* Bottom bar */}
      <div style={{ height: isMobile ? 64 : 70, flexShrink: 0, background: '#fff', borderTop: '1px solid #E7E4DE', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: isMobile ? '0 12px' : '0 24px', gap: 8 }}>
        <button
          onClick={() => setNavOpen((n) => !n)}
          aria-expanded={navOpen}
          style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #C8C4BC', background: navOpen ? '#F2F0EC' : '#fff', borderRadius: 10, padding: isMobile ? '0 10px' : '9px 16px', fontSize: isMobile ? 12 : 13.5, fontWeight: 600, cursor: 'pointer', color: '#0B0B0E', fontFamily: 'inherit', whiteSpace: 'nowrap', height: isMobile ? 40 : 42, flexShrink: 0 }}
        >
          <svg viewBox="0 0 24 24" width={isMobile ? 14 : 16} height={isMobile ? 14 : 16} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
            <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
          </svg>
          {isMobile ? `Q ${index + 1}/${total}` : `Question ${index + 1} of ${total}`}
        </button>

        <div style={{ display: 'flex', gap: isMobile ? 7 : 10 }}>
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            style={{ height: isMobile ? 40 : 42, padding: isMobile ? '0 14px' : '0 22px', borderRadius: 9999, border: '1px solid #C8C4BC', background: index === 0 ? '#EDEAE4' : '#fff', color: index === 0 ? '#B0ACA4' : '#0B0B0E', fontSize: isMobile ? 13 : 14, fontWeight: 600, cursor: index === 0 ? 'default' : 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >{isMobile ? '←' : '← Back'}</button>
          {renderBottomAction()}
        </div>
      </div>

      {/* Finish confirmation — ending a section cannot be undone */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={isModuleOne ? 'Finish this module?' : isNextSection ? 'Finish this section?' : 'Submit your test?'}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)}>Keep working</Button>
            <Button onClick={finishSection} loading={transitioning}>{finishLabel}</Button>
          </>
        }
      >
        <p style={{ margin: '0 0 12px', color: 'rgba(11,11,14,0.7)' }}>
          {isModuleOne || isNextSection
            ? "You won't be able to come back to these questions once the next part starts."
            : "You won't be able to change your answers after submitting."}
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
          <span style={{ padding: '5px 10px', borderRadius: 9999, background: '#F2F0EC' }}><strong>{answeredCount}</strong> of {total} answered</span>
          {unansweredCount > 0 && <span style={{ padding: '5px 10px', borderRadius: 9999, background: 'rgba(192,57,43,0.08)', color: '#A93226' }}><strong>{unansweredCount}</strong> unanswered</span>}
          {flaggedCount > 0 && <span style={{ padding: '5px 10px', borderRadius: 9999, background: 'rgba(226,86,43,0.08)', color: '#C4471F' }}><strong>{flaggedCount}</strong> flagged</span>}
        </div>
        {(unansweredCount > 0 || flaggedCount > 0) && (
          <button
            onClick={() => {
              const target = questions.findIndex((qq, qi) => !answers[qq.id] || flags[qi]);
              if (target >= 0) setIndex(target);
              setConfirmOpen(false);
            }}
            style={{ marginTop: 12, border: 'none', background: 'none', padding: 0, color: '#2563A8', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >Review {unansweredCount > 0 ? 'unanswered' : 'flagged'} questions →</button>
        )}
      </Modal>

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
