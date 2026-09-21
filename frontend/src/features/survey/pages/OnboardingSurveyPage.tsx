import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth';
import { getSurvey, submitSurvey, type SurveyAnswer } from '@/features/survey/api';
import { QuestionField, isAnswered } from '@/features/survey/components/QuestionField';
import { Button, PageLoader, labelClass } from '@/shared/ui';
import { cn } from '@/shared/lib/utils';
import { getApiError } from '@/shared/api/http';

/**
 * The one-time survey a new student answers before the app opens up.
 *
 * Full-screen and outside the student layout, like the exam player: there is
 * deliberately no navigation to leave by, because `ProtectedRoute` would send
 * them straight back here anyway. Signing out is the one way off the page, and
 * it is offered explicitly — without it a student who cannot answer (a broken
 * question, the wrong account) has no move left but to close the tab.
 *
 * The question set is admin-authored, so it can legitimately be empty. That is
 * not a dead end — an empty survey submits itself and the student moves on.
 *
 * Every path off this page therefore has to be reachable, which is why loading,
 * request failure and the self-submitting empty survey each get a real state
 * rather than falling through to the spinner.
 */

const SURVEY_KEY = ['student', 'survey'] as const;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Full-screen message with a way forward, for the states that have no survey to show. */
function SurveyNotice({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-6 py-10">
      <div className="screen-fade w-full max-w-[420px] text-center">
        <h1 className="font-display font-semibold text-[26px] mt-0 mb-2 tracking-[-0.02em] text-ink">{title}</h1>
        <p className="text-sm text-subtle leading-[1.6] mt-0 mb-6">{message}</p>
        <div className="flex items-center justify-center gap-2.5">{children}</div>
      </div>
    </div>
  );
}

export default function OnboardingSurvey() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, setUser, logout } = useAuthStore();
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({});
  const [error, setError] = useState('');
  /** The question a failed "Continue" jumped to, outlined until it is answered. */
  const [highlightId, setHighlightId] = useState<string | null>(null);

  // This page owns its failure state: the global query-error toast would leave
  // a spinner behind it with nothing to press.
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: SURVEY_KEY,
    queryFn: getSurvey,
    meta: { handlesError: true },
  });

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const finish = useCallback(() => {
    // Both halves matter: the store is what `ProtectedRoute` reads on the next
    // render, and the cache is what this page would read if it were reopened
    // inside the 30s `staleTime` — without the second one, a student who came
    // back here would be handed the form again.
    if (user) setUser({ ...user, surveyCompleted: true });
    queryClient.setQueryData(SURVEY_KEY, (prev: typeof data) => (prev ? { ...prev, completed: true } : prev));
    navigate('/student/dashboard', { replace: true });
  }, [navigate, queryClient, setUser, user]);

  const submitMutation = useMutation({
    mutationFn: () => submitSurvey(Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }))),
    onSuccess: finish,
    onError: (err) => setError(getApiError(err)),
  });

  // An already-complete account, or a survey with no questions, must not be
  // held here. The ref keeps the auto-finish to one attempt per mount, so a
  // failed empty-survey submit shows its error instead of retrying forever.
  const autoFinished = useRef(false);
  useEffect(() => {
    if (!data || autoFinished.current) return;
    if (data.completed) {
      autoFinished.current = true;
      finish();
      return;
    }
    if (data.questions.length === 0) {
      autoFinished.current = true;
      submitMutation.mutate();
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (questionId: string, next: SurveyAnswer) => {
    setError('');
    setHighlightId((current) => (current === questionId ? null : current));
    setAnswers((prev) => ({ ...prev, [questionId]: next }));
  };

  const unanswered = questions.filter((q) => q.isRequired && !isAnswered(answers[q.id]));
  const requiredCount = questions.filter((q) => q.isRequired).length;
  const answeredCount = requiredCount - unanswered.length;

  const handleContinue = () => {
    const first = unanswered[0];
    if (!first) {
      submitMutation.mutate();
      return;
    }
    // A disabled button is a dead end on a long form: the student is told
    // something is missing but not where. Jump to it and mark it instead.
    setHighlightId(first.id);
    cardRefs.current.get(first.id)?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'center',
    });
  };

  if (isError) {
    return (
      <SurveyNotice
        title="We couldn't load your questions"
        message="Something went wrong reaching the server. Try again, or sign out and come back later."
      >
        <Button onClick={() => refetch()} loading={isFetching}>Try again</Button>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </SurveyNotice>
    );
  }

  // The empty survey submits itself; if that submit failed there is nothing on
  // screen to retry with, so say so rather than spinning.
  if (data && !data.completed && questions.length === 0 && submitMutation.isError) {
    return (
      <SurveyNotice
        title="We couldn't finish setting up"
        message={error || 'Something went wrong. Try again, or sign out and come back later.'}
      >
        <Button onClick={() => submitMutation.mutate()} loading={submitMutation.isPending}>Try again</Button>
        <Button variant="secondary" onClick={signOut}>Sign out</Button>
      </SurveyNotice>
    );
  }

  if (isLoading || !data || data.completed || questions.length === 0) return <PageLoader />;

  return (
    <div className="min-h-screen bg-paper px-6 py-10 sm:py-14">
      {/*
        A staged entrance, in three chunks 100ms apart: who this is for, what is
        being asked, then the way out. Worth the attention here because the page
        is seen once; every other screen just uses `pageClass`'s single fade.
        Each chunk wears `screen-fade` — the project's fade-up recipe — rather
        than `animate-fade-up` directly, because the reduced-motion block in
        index.css overrides that class to a short cross-fade with no travel.
        The animation fills backwards, so the delay holds the start state.
      */}
      <div className="w-full max-w-[640px] mx-auto">
        <div className="screen-fade">
          <div className="text-[11px] font-bold tracking-[0.12em] uppercase text-accent-text mb-1.5">
            Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </div>
          <h1 className="font-display font-semibold text-[32px] sm:text-[40px] mt-0 mb-1.5 tracking-[-0.02em] text-ink">
            A few quick questions
          </h1>
          <p className="text-[15px] text-subtle mt-0 mb-6">
            Your answers help us tailor your practice. This takes about a minute, and you only do it once.
          </p>

          {requiredCount > 0 && (
            <div className="mb-8">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-[12.5px] font-semibold text-body">
                  {answeredCount} of {requiredCount} answered
                </span>
                {unanswered.length === 0 && (
                  <span className="text-[12.5px] font-semibold text-green-sat">Ready to continue</span>
                )}
              </div>
              {/* Width is the only thing that moves, so it is the only thing transitioned. */}
              <div className="h-1.5 rounded-full bg-ink/[.07] overflow-hidden" role="presentation">
                <div
                  className="h-full rounded-full bg-accent-text transition-[width] duration-move ease-spring"
                  style={{ width: `${requiredCount ? (answeredCount / requiredCount) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-6 screen-fade" style={{ animationDelay: '100ms' }}>
          {questions.map((question, index) => {
            const flagged = highlightId === question.id;
            return (
              <div
                key={question.id}
                ref={(node) => {
                  if (node) cardRefs.current.set(question.id, node);
                  else cardRefs.current.delete(question.id);
                }}
                // scroll-mt keeps the jumped-to card clear of the viewport edge.
                className={cn(
                  'scroll-mt-8 bg-white rounded-2xl p-5 border transition-[border-color,box-shadow] duration-quick ease-ui',
                  flagged ? 'border-ember shadow-[0_0_0_3px_rgba(226,86,43,0.12)]' : 'border-border-soft',
                )}
              >
                <div className={cn(labelClass, 'flex gap-2 mb-3.5')}>
                  <span className="text-muted font-bold">{index + 1}.</span>
                  <span className="flex-1">
                    {question.prompt}
                    {!question.isRequired && <span className="ml-2 font-normal text-muted">(optional)</span>}
                  </span>
                </div>
                <QuestionField
                  question={question}
                  value={answers[question.id]}
                  onChange={(next) => answer(question.id, next)}
                  highlighted={flagged}
                />
                {flagged && (
                  <p role="alert" className="text-[12.5px] text-accent-text font-semibold mt-2.5 mb-0">
                    This one is required.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="screen-fade" style={{ animationDelay: '200ms' }}>
          {error && (
            <div role="alert" className="bg-danger/[.08] text-danger text-[13px] px-3.5 py-2.5 rounded-[10px] mt-5">
              {error}
            </div>
          )}

          {/*
            Enabled even while answers are missing: pressing it jumps to the
            first one instead of doing nothing. The accent glow is still the
            "ready" cue — it arrives only once nothing is outstanding — and the
            line below always says what is left, so the state never depends on
            the shadow alone.
          */}
          <button
            type="button"
            onClick={handleContinue}
            disabled={submitMutation.isPending}
            className={cn(
              'w-full h-12 mt-6 bg-accent-text text-white rounded-full text-[15px] font-semibold cursor-pointer',
              'disabled:opacity-60 disabled:cursor-not-allowed',
              unanswered.length === 0 && 'shadow-accent',
            )}
          >
            {submitMutation.isPending ? 'Saving…' : 'Continue to dashboard'}
          </button>

          {/* Fixed height: the line swaps text rather than appearing, so the
              sign-out link under it never shifts as answers come in. */}
          <p className="h-4 text-center text-xs text-muted mt-2.5 mb-0">
            {unanswered.length > 0
              ? `${unanswered.length} required question${unanswered.length === 1 ? '' : 's'} left to answer.`
              : 'All set — this only takes a moment to save.'}
          </p>

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={signOut}
              className="px-2 py-1 rounded-lg bg-transparent border-0 text-[13px] text-muted hover:text-ink cursor-pointer"
            >
              Not you? Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
