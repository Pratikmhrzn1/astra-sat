import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { getExam, saveAnswers, submitExamIfOpen, nextModule, type MockSection } from '@/entities/exam';
import { getApiError } from '@/shared/api/http';
import { saveExamProgress, loadExamProgress, clearExamProgress } from '@/shared/lib/offline';
import { FinishConfirmModal } from '@/features/exam-player/components/FinishConfirmModal';
import { NavigatorPopup } from '@/features/exam-player/components/NavigatorPopup';
import { ActionErrorBanner, SectionBanner } from '@/features/exam-player/components/PlayerBanners';
import { PlayerBottomBar, type BottomAction } from '@/features/exam-player/components/PlayerBottomBar';
import { PlayerEmpty, PlayerLoadError, PlayerLoading, TransitionOverlay } from '@/features/exam-player/components/PlayerStates';
import { PlayerTopBar } from '@/features/exam-player/components/PlayerTopBar';
import { QuestionPane } from '@/features/exam-player/components/QuestionPane';

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
  const dataRef = useRef<{ exam: import('@/entities/exam').Exam; questions: import('@/entities/exam').Question[]; answers: { questionId: string; selectedAnswer: string | null; selectedAnswerText: string | null }[]; mockTestId: string | null; mathExamId: string | null } | undefined>(undefined);
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
      <PlayerLoadError
        message={getApiError(loadError)}
        onBack={() => navigate('/student/dashboard', { replace: true })}
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || !data || data.exam.id !== examId) {
    return <PlayerLoading />;
  }

  const { exam, questions } = data;
  if (questions.length === 0) {
    return <PlayerEmpty onBack={() => navigate('/student/dashboard', { replace: true })} />;
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

  // On the last question the primary button finishes the section; before it, it advances.
  const bottomAction: BottomAction = !isLast
    ? { kind: 'next', answered: !!selected, onClick: () => setIndex((i) => Math.min(total - 1, i + 1)) }
    : isModuleOne
      // Adaptive: M1 sections go to M2
      ? { kind: 'finish', tone: 'blue', label: transitioning ? 'Loading…' : 'Next Module →', onClick: requestFinish, disabled: transitioning }
      // Live exam / legacy mock: English → Math directly; otherwise a submit
      : {
          kind: 'finish',
          tone: isNextSection ? 'blue' : 'accent',
          label: isNextSection ? 'Next Section →' : transitioning ? 'Submitting…' : 'Submit test',
          onClick: requestFinish,
          disabled: transitioning,
        };

  return (
    <div className="fixed inset-0 flex flex-col bg-paper z-50">
      <PlayerTopBar
        isMath={isActuallyMath}
        isPractice={isPractice}
        index={index}
        total={total}
        timerEnabled={timerEnabled}
        clock={`${mins}:${secs}`}
        lowTime={low}
        isOnline={isOnline}
        flagged={!!flagged}
        onToggleFlag={() => setFlags((f) => ({ ...f, [index]: !f[index] }))}
        onExit={handleExit}
        finishLabel={finishLabel}
        onFinish={requestFinish}
        transitioning={transitioning}
      />

      {sectionBanner && <SectionBanner mockSection={mockSection} onDismiss={() => setSectionBanner(false)} />}

      {actionError && (
        <ActionErrorBanner message={actionError} onRetry={finishSection} onDismiss={() => setActionError(null)} />
      )}

      <QuestionPane
        ref={contentRef}
        q={q}
        index={index}
        selected={selected}
        eliminated={qElim}
        largeFont={largeFontSize}
        onSelect={selectAnswer}
        onToggleElim={toggleElim}
      />

      {navOpen && (
        <NavigatorPopup
          questions={questions}
          answers={answers}
          flags={flags}
          index={index}
          onJump={(qi) => { setIndex(qi); setNavOpen(false); }}
          finishLabel={finishLabel}
          onFinish={() => { setNavOpen(false); requestFinish(); }}
          transitioning={transitioning}
        />
      )}

      <PlayerBottomBar
        index={index}
        total={total}
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((n) => !n)}
        onBack={() => setIndex((i) => Math.max(0, i - 1))}
        action={bottomAction}
      />

      <FinishConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={isModuleOne ? 'Finish this module?' : isNextSection ? 'Finish this section?' : 'Submit your test?'}
        finishLabel={finishLabel}
        onFinish={finishSection}
        loading={transitioning}
        movesOn={isModuleOne || isNextSection}
        total={total}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        flaggedCount={flaggedCount}
        onReview={() => {
          const target = questions.findIndex((qq, qi) => !answers[qq.id] || flags[qi]);
          if (target >= 0) setIndex(target);
          setConfirmOpen(false);
        }}
      />

      {transitioning && <TransitionOverlay />}
    </div>
  );
}
