import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/shared/store/auth';
import { joinSession, pollSession, type JoinResponse } from '@/features/live-exam/api/live-exam.api';
import { getApiError } from '@/shared/api/client';
import { CARD, H1, JoinCodePlate, PillButton, T } from '@/features/live-exam/ui';

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
    <div style={{
      minHeight: '100dvh', background: T.paper, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{ ...CARD, padding: '40px 34px', maxWidth: 440, width: '100%', textAlign: 'center' }}>
        {error ? (
          <>
            <h1 style={{ ...H1, fontSize: 30, marginBottom: 10 }}>Can't join</h1>
            <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.6, margin: '0 0 24px' }}>{error}</p>
            <PillButton variant="secondary" onClick={() => navigate('/student/live-exam')}>
              Try another code
            </PillButton>
          </>
        ) : joining ? (
          <p style={{ fontSize: 15, color: T.muted, margin: 0 }}>Joining…</p>
        ) : (
          <>
            <h1 style={{ ...H1, fontSize: 32, marginBottom: 10 }}>You're in</h1>
            <p style={{ fontSize: 14.5, color: T.muted, lineHeight: 1.6, margin: '0 0 26px' }}>
              Keep this page open. Your paper opens by itself the moment your teacher starts.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
              <JoinCodePlate code={(joinCode ?? '').toUpperCase()} size="small" />
            </div>

            {/* The one piece of motion in this feature: proof the page is still
                listening, on a screen where nothing else moves. */}
            <div
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7 }}
              role="status"
              aria-live="polite"
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="lobby-dot"
                  style={{ animationDelay: `${i * 0.22}s`, background: T.accent }}
                />
              ))}
              <span style={{ fontSize: 13, color: T.muted, marginLeft: 6 }}>Waiting for your teacher</span>
            </div>

            <p style={{ fontSize: 12.5, color: T.faint, margin: '26px 0 0' }}>Signed in as {user.name}</p>

            <style>{`
              .lobby-dot {
                width: 7px; height: 7px; border-radius: 9999px; display: inline-block;
                animation: lobby-pulse 1.4s ease-in-out infinite;
              }
              @keyframes lobby-pulse {
                0%, 100% { opacity: 0.25; transform: scale(1); }
                50%      { opacity: 1;    transform: scale(1.3); }
              }
              @media (prefers-reduced-motion: reduce) {
                .lobby-dot { animation: none; opacity: 0.6; }
              }
            `}</style>
          </>
        )}
      </div>
    </div>
  );
}
