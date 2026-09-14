import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { joinSession, pollSession, type JoinResponse } from '@/api/liveExam';
import { getApiError } from '@/api/http';
import { JoinCodePlate, PillButton, liveCardClass, liveKickerClass, liveTitleClass } from '@/components/live-exam/ui';
import { cn } from '@/lib/utils';

/**
 * The waiting room a student sits in between entering the code and the teacher
 * starting the paper.
 *
 * Full-bleed rather than inside the student shell: once you are here you are
 * about to sit an exam, and there is nowhere else to go.
 */

const POLL_MS = 3000;

export default function LiveExamLobby() {
  const { joinCode } = useParams<{ joinCode: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [joined, setJoined] = useState<JoinResponse | null>(null);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const launchedRef = useRef(false);

  useEffect(() => {
    if (!user) navigate(`/login?next=/live/${joinCode}`, { replace: true });
  }, [user, joinCode, navigate]);

  useEffect(() => {
    if (!user || !joinCode) return;
    setJoining(true);
    joinSession(joinCode)
      .then((resp) => {
        setJoined(resp);
        launch(resp);
      })
      .catch((err) => setError(getApiError(err)))
      .finally(() => setJoining(false));
  }, [user, joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Keeps polling until this student actually has a paper in front of them.
   *
   * The condition used to be `status === 'waiting'`, which stranded anyone whose
   * session was already running when they arrived: their status was `active`, so
   * no polling started, and they had no exam id, so nothing launched. Waiting on
   * the exam id instead covers both — a student in the lobby before the start,
   * and one who walked in late.
   */
  useEffect(() => {
    if (!joined || !joinCode || joined.englishExamId) return;

    pollRef.current = setInterval(async () => {
      try {
        const poll = await pollSession(joinCode);
        if (poll.englishExamId) {
          if (pollRef.current) clearInterval(pollRef.current);
          launch({ ...joined, ...poll });
        }
      } catch {
        // A dropped poll is not worth showing mid-lesson; the next one retries.
      }
    }, POLL_MS);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [joined, joinCode]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Guarded: a poll landing while navigation is in flight must not fire twice. */
  function launch(data: JoinResponse) {
    if (!data.englishExamId || launchedRef.current) return;
    launchedRef.current = true;
    navigate(`/student/exams/${data.englishExamId}`, {
      state: {
        liveExam: true,
        liveJoinCode: joinCode,
        sectionStartedAt: data.startedAt,
        englishDurationSeconds: data.englishDurationSeconds,
        mathExamId: data.mathExamId,
        mathDurationSeconds: data.mathDurationSeconds,
      },
    });
  }

  if (!user) return null;

  return (
    <div className="min-h-[100dvh] bg-paper flex flex-col items-center justify-center px-4 py-6">
      <div className={cn(liveCardClass, 'screen-fade px-[clamp(20px,5vw,36px)] py-[clamp(28px,6vw,40px)] max-w-[440px] w-full text-center')}>
        {error ? (
          <>
            <StateIcon tone="danger">!</StateIcon>
            <h1 className={cn(liveTitleClass, 'text-[28px] mb-2')}>Can't join</h1>
            <p className="text-[14.5px] text-subtle leading-[1.6] mt-0 mb-6">{error}</p>
            <div className="flex gap-2 justify-center flex-wrap">
              <PillButton variant="secondary" onClick={() => navigate('/student/dashboard')}>Dashboard</PillButton>
              <PillButton onClick={() => navigate('/student/live-exam')}>Try another code</PillButton>
            </div>
          </>
        ) : joining || !joined ? (
          <div role="status" aria-live="polite" className="flex flex-col items-center gap-3.5 py-3">
            <span aria-hidden className="block w-[26px] h-[26px] rounded-full border-[3px] border-sunken border-t-ember animate-spin-fast motion-reduce:animate-spin-slow" />
            <p className="text-[15px] text-subtle m-0">Joining the exam…</p>
          </div>
        ) : (
          <>
            <StateIcon tone="success">✓</StateIcon>
            <h1 className={cn(liveTitleClass, 'text-[30px] mb-2')}>You're in</h1>
            <p className="text-[14.5px] text-subtle leading-[1.6] mx-auto mt-0 mb-6 max-w-[320px]">
              Keep this page open. Your paper opens by itself the moment your teacher starts.
            </p>

            <div className="bg-[#FBFAF8] border border-sunken rounded-xl px-3 py-3.5 mb-[22px]">
              <div className={cn(liveKickerClass, 'mb-2')}>Session code</div>
              <div className="flex justify-center">
                <JoinCodePlate code={(joinCode ?? '').toUpperCase()} size="small" />
              </div>
            </div>

            {/* The one piece of motion in this feature: proof the page is still
                listening, on a screen where nothing else moves. */}
            <div className="flex justify-center items-center gap-[7px]" role="status" aria-live="polite">
              {['[animation-delay:0s]', '[animation-delay:0.22s]', '[animation-delay:0.44s]'].map((delay) => (
                <span
                  key={delay}
                  aria-hidden
                  className={cn('inline-block w-[7px] h-[7px] rounded-full bg-ember animate-lobby-pulse motion-reduce:animate-none motion-reduce:opacity-60', delay)}
                />
              ))}
              <span className="text-[13px] text-subtle ml-1.5">Waiting for your teacher to start</span>
            </div>

            <div className="border-t border-sunken mt-6 pt-4 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-[12.5px] text-muted min-w-0 truncate">Signed in as <strong className="text-subtle font-semibold">{user.name}</strong></span>
              <button
                onClick={() => navigate('/student/dashboard')}
                className="bg-transparent py-1 px-0 text-[12.5px] font-semibold text-subtle cursor-pointer underline underline-offset-2"
              >Leave lobby</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The round mark above the lobby heading: a tick once joined, "!" when joining failed. */
function StateIcon({ tone, children }: { tone: 'success' | 'danger'; children: React.ReactNode }) {
  return (
    <div
      aria-hidden
      className={cn(
        'w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center text-[22px] font-bold leading-none',
        tone === 'success' ? 'bg-green-dark/10 text-green-dark' : 'bg-danger/[.08] text-danger',
      )}
    >{children}</div>
  );
}
